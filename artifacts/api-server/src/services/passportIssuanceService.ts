import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import {
  db,
  citizensTable,
  passportReadyNotificationsTable,
  timeBankLedgerTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { logCitizenIssuedToSheets } from "../lib/googleSheets";
import {
  deliverPassportReadyNotification,
  notifyAdminPassportLifecycle,
} from "./telegramService";
import { decrypt } from "./encryptionService";
import { sendPassportEmail } from "./emailService";

export const PASSPORT_WAIT_MS = 60 * 60 * 1000;
export const SIMULATOR_DURATION_MS = PASSPORT_WAIT_MS - 60 * 1000;
export const PASSPORT_BACKLOG_WARNING_AGE_MS = 5 * 60 * 1000;
const PASSPORT_BACKLOG_WARNING_INTERVAL_MS = 5 * 60 * 1000;
const PASSPORT_NOTIFICATION_RETRY_BASE_MS = 30 * 1000;
const PASSPORT_NOTIFICATION_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const PASSPORT_NOTIFICATION_PROCESSING_LEASE_MS = 5 * 60 * 1000;

let lastPassportBacklogWarningAt: number | null = null;
let passportNotificationWorkerRunning = false;

export type PassportIssuanceResult = {
  citizen: typeof citizensTable.$inferSelect;
  ancestralMinuteGranted: boolean;
};

/**
 * Atomically issue an eligible pending passport. The pending→issued transition
 * is the idempotency gate, so concurrent pollers and scheduler instances can
 * only grant one ancestral minute.
 */
export async function issueEligiblePassport(
  citizenId: number,
  now = new Date(),
): Promise<PassportIssuanceResult | null> {
  const result = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ citizenNumber: citizensTable.citizenNumber })
      .from(citizensTable)
      .where(eq(citizensTable.id, citizenId))
      .limit(1);

    if (!candidate) return null;

    const [transitioned] = await tx
      .update(citizensTable)
      .set({
        registrationStatus: "issued",
        idCardUrl: candidate.citizenNumber
          ? `/api/citizens/number/${candidate.citizenNumber}/id-card`
          : null,
        status: "active",
        onboardingCompleted: true,
      })
      .where(
        and(
          eq(citizensTable.id, citizenId),
          eq(citizensTable.registrationStatus, "pending"),
          lte(citizensTable.availableAt, now),
          sql`btrim(${citizensTable.signatureBase64}) <> ''`,
        ),
      )
      .returning();

    if (!transitioned) return null;

    let issuance: PassportIssuanceResult;
    if (!transitioned.ancestralMinuteGranted) {
      const [credited] = await tx
        .update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} + 1`,
          ancestralMinuteGranted: true,
        })
        .where(eq(citizensTable.id, citizenId))
        .returning();

      await tx.insert(timeBankLedgerTable).values({
        citizenId,
        type: "ancestral_minute_granted",
        amount: 1,
        note: "Родовая минута начислена при выдаче паспорта",
      });

      issuance = { citizen: credited!, ancestralMinuteGranted: true };
    } else {
      issuance = { citizen: transitioned, ancestralMinuteGranted: false };
    }

    const { citizen } = issuance;
    if (citizen.telegramId && citizen.tgNotifyState) {
      await tx
        .insert(passportReadyNotificationsTable)
        .values({
          citizenId,
          message:
            `🎉 *Ваш паспорт гражданина TimeNation готов!*\n\n` +
            `👤 *${citizen.name}*\n` +
            `🪪 Гражданин №${citizen.citizenNumber ?? citizen.id}\n` +
            `📜 Ранг: ${citizen.rank}\n` +
            `${issuance.ancestralMinuteGranted ? "⏳ Родовая минута начислена: 1 Д\n\n" : "\n"}` +
            "Откройте приложение TimeNation, чтобы просмотреть удостоверение личности.",
          status: "pending",
          nextAttemptAt: now,
        });
    }

    return issuance;
  });

  if (!result) return null;

  const { citizen } = result;
  logger.info(
    {
      citizenId: citizen.id,
      citizenNumber: citizen.citizenNumber,
      ancestralMinuteGranted: result.ancestralMinuteGranted,
      balanceMinutes: citizen.balanceMinutes,
    },
    "Passport issued at eligibility",
  );

  if (citizen.telegramId && citizen.tgNotifyState) {
    void retryPendingPassportReadyNotifications(1).catch((err) =>
      logger.warn({ err, citizenId }, "Passport issued, but Telegram notification delivery was deferred"),
    );
  }
  void notifyAdminPassportLifecycle({
    event: "passport_issued",
    citizenId: citizen.id,
    citizenName: citizen.name,
    citizenNumber: citizen.citizenNumber,
    ancestralMinuteGranted: result.ancestralMinuteGranted,
  });

  const email = citizen.email?.startsWith("v1:")
    ? decrypt(citizen.email)
    : citizen.email;
  void sendPassportEmail({
    name: citizen.name,
    citizenNumber: citizen.citizenNumber ?? String(citizen.id),
    rank: citizen.rank,
    email: email ?? null,
  }).catch((err) =>
    logger.warn({ citizenId }, "Passport issued, but email notification failed"),
  );

  if (citizen.citizenNumber) {
    void logCitizenIssuedToSheets({
      citizenNumber: citizen.citizenNumber,
      citizenId: citizen.id,
      name: citizen.name,
      phone: citizen.phone,
      rank: citizen.rank,
      balanceMinutes: citizen.balanceMinutes,
      meritScore: citizen.meritScore,
      registrationStatus: "issued",
      issuedAt: now.toISOString(),
    }).catch((err) => logger.warn({ err, citizenId }, "Sheets citizen log failed (non-critical)"));
  }

  return result;
}

/**
 * Deliver due passport-ready outbox rows. The DB claim prevents concurrent
 * server instances from sending the same message at the same time.
 */
export async function retryPendingPassportReadyNotifications(batchSize = 100): Promise<number> {
  if (passportNotificationWorkerRunning) return 0;
  passportNotificationWorkerRunning = true;
  let delivered = 0;
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - PASSPORT_NOTIFICATION_PROCESSING_LEASE_MS);

  try {
    const due = await db
      .select({
        id: passportReadyNotificationsTable.id,
        citizenId: passportReadyNotificationsTable.citizenId,
      })
      .from(passportReadyNotificationsTable)
      .where(
        and(
          lte(passportReadyNotificationsTable.nextAttemptAt, now),
          or(
            eq(passportReadyNotificationsTable.status, "pending"),
            and(
              eq(passportReadyNotificationsTable.status, "processing"),
              lte(passportReadyNotificationsTable.updatedAt, staleProcessingBefore),
            ),
          ),
        ),
      )
      .orderBy(asc(passportReadyNotificationsTable.nextAttemptAt))
      .limit(batchSize);

    for (const candidate of due) {
      const [claimed] = await db
        .update(passportReadyNotificationsTable)
        .set({ status: "processing", updatedAt: now })
        .where(
          and(
            eq(passportReadyNotificationsTable.id, candidate.id),
            lte(passportReadyNotificationsTable.nextAttemptAt, now),
            or(
              eq(passportReadyNotificationsTable.status, "pending"),
              and(
                eq(passportReadyNotificationsTable.status, "processing"),
                lte(passportReadyNotificationsTable.updatedAt, staleProcessingBefore),
              ),
            ),
          ),
        )
        .returning();

      if (!claimed) continue;

      let delivery: Awaited<ReturnType<typeof deliverPassportReadyNotification>>;
      try {
        delivery = await deliverPassportReadyNotification(claimed.citizenId, claimed.message);
      } catch (err) {
        delivery = {
          status: "retryable" as const,
          error: err instanceof Error ? err.message.slice(0, 500) : "Telegram delivery failed",
          errorCode: null,
        };
      }

      if (delivery.status === "delivered") {
        await db
          .delete(passportReadyNotificationsTable)
          .where(
            and(
              eq(passportReadyNotificationsTable.id, claimed.id),
              eq(passportReadyNotificationsTable.status, "processing"),
            ),
          );
        delivered += 1;
        continue;
      }

      if (delivery.status === "permanent") {
        await db
          .update(passportReadyNotificationsTable)
          .set({
            status: "permanent_failure",
            lastError: delivery.error,
            lastErrorCode: delivery.errorCode,
            updatedAt: new Date(),
          })
          .where(eq(passportReadyNotificationsTable.id, claimed.id));
        logger.warn(
          { citizenId: claimed.citizenId, errorCode: delivery.errorCode },
          "Passport-ready Telegram notification failed permanently",
        );
        continue;
      }

      const attemptCount = claimed.attemptCount + 1;
      const retryDelay = Math.min(
        PASSPORT_NOTIFICATION_RETRY_BASE_MS * 2 ** Math.min(attemptCount - 1, 20),
        PASSPORT_NOTIFICATION_RETRY_MAX_MS,
      );
      await db
        .update(passportReadyNotificationsTable)
        .set({
          status: "pending",
          attemptCount,
          nextAttemptAt: new Date(Date.now() + retryDelay),
          lastError: delivery.error,
          lastErrorCode: delivery.errorCode,
          updatedAt: new Date(),
        })
        .where(eq(passportReadyNotificationsTable.id, claimed.id));
      logger.warn(
        { citizenId: claimed.citizenId, attemptCount, retryDelayMs: retryDelay, errorCode: delivery.errorCode },
        "Passport-ready Telegram notification retry scheduled",
      );
    }
  } finally {
    passportNotificationWorkerRunning = false;
  }

  return delivered;
}

/** Best-effort worker; request-driven issuance remains the fallback on wake-up. */
export async function issueDuePassports(batchSize = 100): Promise<number> {
  const dueCitizens = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(
      and(
        eq(citizensTable.registrationStatus, "pending"),
        lte(citizensTable.availableAt, new Date()),
      ),
    )
    .limit(batchSize);

  let issuedCount = 0;
  for (const citizen of dueCitizens) {
    try {
      if (await issueEligiblePassport(citizen.id)) issuedCount += 1;
    } catch (err) {
      logger.error(
        { err, citizenId: citizen.id },
        "Passport issuance failed; continuing with remaining eligible citizens",
      );
    }
  }
  return issuedCount;
}

/**
 * Emit a rate-limited aggregate warning when eligible passports have waited
 * too long. Applicant data is deliberately excluded from this operational log.
 */
export async function warnIfEligiblePassportBacklog(now = new Date()): Promise<void> {
  const [backlog] = await db
    .select({
      pendingEligibleCount: sql<number>`count(*)::int`,
      oldestAvailableAt: sql<Date | null>`min(${citizensTable.availableAt})`,
    })
    .from(citizensTable)
    .where(
      and(
        eq(citizensTable.registrationStatus, "pending"),
        lte(citizensTable.availableAt, now),
        sql`btrim(${citizensTable.signatureBase64}) <> ''`,
      ),
    );

  const pendingEligibleCount = Number(backlog?.pendingEligibleCount ?? 0);
  const oldestAvailableAt = backlog?.oldestAvailableAt
    ? new Date(backlog.oldestAvailableAt)
    : null;
  const oldestPendingAgeMs = oldestAvailableAt
    ? now.getTime() - oldestAvailableAt.getTime()
    : 0;

  if (
    pendingEligibleCount === 0 ||
    !Number.isFinite(oldestPendingAgeMs) ||
    oldestPendingAgeMs <= PASSPORT_BACKLOG_WARNING_AGE_MS
  ) {
    lastPassportBacklogWarningAt = null;
    return;
  }

  const nowMs = now.getTime();
  if (
    lastPassportBacklogWarningAt !== null &&
    nowMs - lastPassportBacklogWarningAt < PASSPORT_BACKLOG_WARNING_INTERVAL_MS
  ) {
    return;
  }

  lastPassportBacklogWarningAt = nowMs;
  logger.warn(
    {
      pendingEligibleCount,
      oldestPendingAgeMs,
      warningAgeThresholdMs: PASSPORT_BACKLOG_WARNING_AGE_MS,
    },
    "Eligible passport issuance backlog exceeded age threshold",
  );
}
