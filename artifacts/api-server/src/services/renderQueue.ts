import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { renderCapsule, renderLightVideo } from "./renderService";
import { sendTransactionNotification } from "./telegramService";
import {
  publishVideoToTelegram,
  buildTVCaption,
  getThreadIdForSlotType,
  resolvePublicVideoUrl,
} from "./tvPublishService";
import { citizensTable } from "@workspace/db";
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

/**
 * Per-job wall-clock timeout. If a render job exceeds this, it is abandoned
 * and an immediate solid-color fallback is produced so the queue keeps moving.
 * Default: 180 s. Override with RENDER_JOB_TIMEOUT_MS env var (generic fallback).
 */
const RENDER_JOB_TIMEOUT_MS = parseInt(
  process.env["RENDER_JOB_TIMEOUT_MS"] ?? "180000",
  10
);

/**
 * Timeout for light-path renders (citizen 1-minute slots).
 * Default: 120 s. Override with RENDER_JOB_TIMEOUT_LIGHT_MS env var.
 */
export const RENDER_JOB_TIMEOUT_LIGHT_MS = parseInt(
  process.env["RENDER_JOB_TIMEOUT_LIGHT_MS"] ?? "120000",
  10
);

/**
 * Timeout for heavy-path renders (Quarter / Half / Apex premium slots).
 * Default: 300 s. Override with RENDER_JOB_TIMEOUT_HEAVY_MS env var.
 */
export const RENDER_JOB_TIMEOUT_HEAVY_MS = parseInt(
  process.env["RENDER_JOB_TIMEOUT_HEAVY_MS"] ?? "300000",
  10
);

/** Sentinel error thrown by the per-job deadline race. */
class RenderTimeoutError extends Error {
  readonly elapsed: number;
  constructor(slotId: number, elapsed: number) {
    super(`Render timed out after ${elapsed}ms for slotId=${slotId}`);
    this.name = "RenderTimeoutError";
    this.elapsed = elapsed;
  }
}

interface RenderJob {
  jobId: string;
  slotId: number;
  citizenId: number;
  capsuleSeedText: string | null;
  /** Per-job timeout override in ms. Defaults to RENDER_JOB_TIMEOUT_MS when omitted. */
  timeoutMs?: number;
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
  const effectiveTimeoutMs = job.timeoutMs ?? RENDER_JOB_TIMEOUT_MS;

  jobStatus.set(jobId, { slotId, status: "queued" });

  const run = () => {
    activeCount++;
    const entry = jobStatus.get(jobId);
    if (entry) entry.status = "running";

    const renderLog = logger.child({ slotId, citizenId, jobId });
    renderLog.info({ queueDepth: queue.length, active: activeCount, timeoutMs: effectiveTimeoutMs }, "Render job started");

    void (async () => {
      const startTime = Date.now();

      // AbortController shared with the render job — aborted when the deadline fires
      const abortController = new AbortController();

      // Build a deadline promise that rejects once effectiveTimeoutMs elapses
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          abortController.abort();
          reject(new RenderTimeoutError(slotId, elapsed));
        }, effectiveTimeoutMs);
      });

      try {
        const result = await Promise.race([renderCapsule(slotId, abortController.signal), deadline]);

        clearTimeout(deadlineTimer);

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

          // ── Auto-publish to Telegram TV group ────────────────────────────
          // Admin alerts use ADMIN_BOT_TOKEN (broadcast/notification bot).
          if (process.env["TELEGRAM_CHAT_ID"] && (process.env["ADMIN_BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"])) {
            void (async () => {
              try {
                // Load slot + capsule + citizen for caption
                const [slot] = await db
                  .select()
                  .from(tvSlotsTable)
                  .where(eq(tvSlotsTable.id, slotId))
                  .limit(1);
                const [capsule] = await db
                  .select()
                  .from(tvCapsulesTable)
                  .where(eq(tvCapsulesTable.slotId, slotId))
                  .limit(1);
                const [citizen] = await db
                  .select({ name: citizensTable.name })
                  .from(citizensTable)
                  .where(eq(citizensTable.id, citizenId))
                  .limit(1);

                if (!slot || !capsule?.mediaUrl) return;

                // Resolve to an absolute public URL Telegram servers can fetch
                const videoUrl = resolvePublicVideoUrl(capsule.mediaUrl, capsule.catcastUrl);
                if (!videoUrl) {
                  renderLog.warn({ slotId }, "Telegram TV auto-publish skipped: no public URL available");
                  return;
                }

                const caption = buildTVCaption({
                  slotDate:     slot.date,
                  slotTime:     `${String(Math.floor(slot.minuteIndex / 60)).padStart(2, "0")}:${String(slot.minuteIndex % 60).padStart(2, "0")}`,
                  citizenName:  citizen?.name ?? `#${citizenId}`,
                  slotType:     slot.slotType,
                  seedText:     capsule.seedText,
                  sovereignUrl: capsule.hasSovereignLink ? capsule.catcastUrl : null,
                });

                const threadId = getThreadIdForSlotType(slot.slotType);
                renderLog.info({ slotId, videoUrl, threadId }, "Sending video to Telegram TV");
                const tgResult = await publishVideoToTelegram(
                  { videoUrl, caption, threadId },
                );

                if (tgResult.ok) {
                  renderLog.info(
                    { messageId: tgResult.messageId, threadId },
                    "Capsule auto-published to Telegram TV",
                  );
                } else {
                  renderLog.warn(
                    { errorCode: tgResult.errorCode, description: tgResult.description },
                    "Telegram TV auto-publish failed",
                  );
                }
              } catch (tgErr) {
                renderLog.warn({ tgErr }, "Telegram TV auto-publish threw");
              }
            })();
          }
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
        clearTimeout(deadlineTimer);

        const isAbortError =
          err !== null && typeof err === "object" &&
          "name" in err && err.name === "AbortError";
        if (err instanceof RenderTimeoutError || isAbortError) {
          // Aborting the renderer can win the race against the deadline rejection.
          // Both outcomes must fill the slot with the same solid-color fallback.
          const elapsed = err instanceof RenderTimeoutError
            ? err.elapsed
            : Date.now() - startTime;
          renderLog.warn(
            { slotId, jobId, elapsed, timeoutMs: effectiveTimeoutMs },
            isAbortError
              ? "Render deadline race won by AbortError — falling back to solid-color render"
              : "Render job exceeded wall-clock timeout — falling back to solid-color render"
          );

          try {
            const [capsule] = await db
              .select({
                seedText: tvCapsulesTable.seedText,
                visualStyle: tvCapsulesTable.visualStyle,
              })
              .from(tvCapsulesTable)
              .where(eq(tvCapsulesTable.slotId, slotId))
              .limit(1);

            const manifestoText =
              capsule?.seedText ?? "TimeNation — суверенное государство времени.";

            const mediaUrl = await renderLightVideo(
              null,
              manifestoText,
              slotId,
              capsule?.visualStyle ?? null
            );

            await db
              .update(tvCapsulesTable)
              .set({ status: "rendered", renderProgress: "done", updatedAt: new Date() })
              .where(eq(tvCapsulesTable.slotId, slotId));
            await db
              .update(tvSlotsTable)
              .set({ status: "broadcast" })
              .where(eq(tvSlotsTable.id, slotId));

            renderLog.info(
              { slotId, jobId, elapsed, mediaUrl },
              "Solid-color fallback render complete after timeout"
            );

            const entry3 = jobStatus.get(jobId);
            if (entry3) entry3.status = "done";

            sendTransactionNotification(
              citizenId,
              `⏱ *Слот #${slotId} отрендерен* (упрощённый режим — AI-генерация превысила лимит времени)`
            ).catch((tgErr) => {
              renderLog.warn({ tgErr }, "Telegram notification failed after timeout fallback");
            });
          } catch (fallbackErr) {
            renderLog.error(
              { fallbackErr, slotId, jobId, elapsed },
              "Solid-color fallback render also failed after timeout"
            );

            const entry4 = jobStatus.get(jobId);
            if (entry4) entry4.status = "failed";

            await db
              .update(tvCapsulesTable)
              .set({ status: "draft", renderProgress: null, updatedAt: new Date() })
              .where(eq(tvCapsulesTable.slotId, slotId))
              .catch(() => {});
          }
        } else {
          // ── Normal error path ─────────────────────────────────────────────
          renderLog.error({ err }, "Render job failed");

          const entry5 = jobStatus.get(jobId);
          if (entry5) entry5.status = "failed";

          await db
            .update(tvCapsulesTable)
            .set({ status: "draft", renderProgress: null, updatedAt: new Date() })
            .where(eq(tvCapsulesTable.slotId, slotId))
            .catch(() => {});
        }
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
      renderPath: tvCapsulesTable.renderPath,
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
    const timeoutMs =
      capsule.renderPath === "heavy"
        ? RENDER_JOB_TIMEOUT_HEAVY_MS
        : RENDER_JOB_TIMEOUT_LIGHT_MS;
    enqueueRender({
      jobId,
      slotId: capsule.slotId,
      citizenId: capsule.citizenId,
      capsuleSeedText: capsule.seedText,
      timeoutMs,
    });
  }
}
