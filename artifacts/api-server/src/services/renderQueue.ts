import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { renderCapsule } from "./renderService";
import { sendTransactionNotification } from "./telegramService";
import { logger } from "../lib/logger";

// ── Render Queue ───────────────────────────────────────────────────────────────
// Limits concurrent AI renders so slow HuggingFace requests (up to 120s each)
// don't pile up and starve other API handlers.
//
// Design: simple in-process FIFO queue with a configurable concurrency cap.
// The DB capsule status (pending_render → rendered / draft) is the durable
// state; this queue is the execution gatekeeper only.

const MAX_CONCURRENT_RENDERS = parseInt(
  process.env["MAX_CONCURRENT_RENDERS"] ?? "2",
  10
);

interface RenderJob {
  jobId: string;
  slotId: number;
  citizenId: number;
  capsuleSeedText: string | null;
}

let activeCount = 0;
const queue: Array<() => void> = [];

/** Jobs indexed by jobId for status look-up. */
const jobStatus = new Map<
  string,
  { slotId: number; status: "queued" | "running" | "done" | "failed" }
>();

function drainQueue(): void {
  while (activeCount < MAX_CONCURRENT_RENDERS && queue.length > 0) {
    const next = queue.shift();
    next?.();
  }
}

/**
 * Enqueue a render job.
 * Returns a jobId immediately. The job will run when a concurrency slot opens.
 */
export function enqueueRender(job: RenderJob): string {
  const { jobId, slotId, citizenId, capsuleSeedText } = job;

  jobStatus.set(jobId, { slotId, status: "queued" });

  const run = () => {
    activeCount++;
    const entry = jobStatus.get(jobId);
    if (entry) entry.status = "running";

    const renderLog = logger.child({ slotId, citizenId, jobId });
    renderLog.info({ queueDepth: queue.length, active: activeCount }, "Render job started");

    void (async () => {
      try {
        const result = await renderCapsule(slotId);

        if (result.mediaUrl) {
          await db
            .update(tvSlotsTable)
            .set({ status: "broadcast" })
            .where(eq(tvSlotsTable.id, slotId));
          await db
            .update(tvCapsulesTable)
            .set({ status: "broadcast", renderProgress: "done", updatedAt: new Date() })
            .where(eq(tvCapsulesTable.slotId, slotId));
          renderLog.info("Capsule auto-published to broadcast");
        }

        const entry2 = jobStatus.get(jobId);
        if (entry2) entry2.status = "done";

        const tgMessage =
          `📡 *Капсула готова к эфиру!*\n\n` +
          `Слот #${slotId} отрендерен.\n` +
          (result.mediaUrl
            ? `🎬 Видео доступно в приложении TimeNation TV.`
            : `⚠️ Видео не сгенерировано.`);
        sendTransactionNotification(citizenId, tgMessage).catch((err) => {
          renderLog.warn({ err }, "Telegram notification failed after render");
        });
      } catch (err) {
        renderLog.error({ err }, "Render job failed");

        const entry3 = jobStatus.get(jobId);
        if (entry3) entry3.status = "failed";

        await db
          .update(tvCapsulesTable)
          .set({ status: "draft", renderProgress: null, updatedAt: new Date() })
          .where(eq(tvCapsulesTable.slotId, slotId))
          .catch(() => {});
      } finally {
        activeCount--;
        renderLog.info(
          { remaining: queue.length, active: activeCount },
          "Render job finished — draining queue"
        );
        drainQueue();

        // Evict completed job status after 1 hour to prevent unbounded growth
        setTimeout(() => jobStatus.delete(jobId), 60 * 60 * 1000);
      }
    })();
  };

  if (activeCount < MAX_CONCURRENT_RENDERS) {
    run();
  } else {
    logger.info(
      { slotId, jobId, queueDepth: queue.length, active: activeCount },
      "Render job queued — concurrency cap reached"
    );
    queue.push(run);
  }

  return jobId;
}

/** Queue depth and active count for health/debug endpoints. */
export function getRenderQueueStats(): {
  active: number;
  queued: number;
  maxConcurrent: number;
} {
  return { active: activeCount, queued: queue.length, maxConcurrent: MAX_CONCURRENT_RENDERS };
}

/** Look up a job's current status. Returns null if unknown/evicted. */
export function getRenderJobStatus(jobId: string): {
  slotId: number;
  status: "queued" | "running" | "done" | "failed";
} | null {
  return jobStatus.get(jobId) ?? null;
}

/**
 * On server startup, re-queue any capsules stuck in `pending_render`.
 * These are jobs that were lost when the server crashed or was restarted.
 * The tvCapsulesTable.status column is the durable source of truth.
 */
export async function rehydrateRenderQueue(): Promise<void> {
  const stuck = await db
    .select({
      slotId: tvCapsulesTable.slotId,
      citizenId: tvCapsulesTable.citizenId,
      seedText: tvCapsulesTable.seedText,
    })
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.status, "pending_render"));

  if (stuck.length === 0) {
    logger.info("Render queue rehydration: no stuck jobs found");
    return;
  }

  logger.info(
    { count: stuck.length },
    "Render queue rehydration: re-queuing capsules stuck in pending_render"
  );

  for (const capsule of stuck) {
    const jobId = randomUUID();
    enqueueRender({
      jobId,
      slotId: capsule.slotId,
      citizenId: capsule.citizenId,
      capsuleSeedText: capsule.seedText,
    });
  }
}
