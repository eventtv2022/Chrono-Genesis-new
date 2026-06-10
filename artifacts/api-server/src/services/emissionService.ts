import { db } from "@workspace/db";
import { emissionLogsTable } from "@workspace/db";
import { eq, gte, lte, sum, and, isNotNull, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";

// Суточный лимит эмиссии Дарминов по всей сети
export const DAILY_EMISSION_LIMIT = 350;

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tomorrowUTC(): Date {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Суммарная одобренная эмиссия за сегодня (UTC) */
export async function getDailyApprovedTotal(): Promise<number> {
  const [row] = await db
    .select({ total: sum(emissionLogsTable.amount) })
    .from(emissionLogsTable)
    .where(
      and(
        eq(emissionLogsTable.isApproved, true),
        gte(emissionLogsTable.createdAt, todayUTC()),
      )
    );
  return Number(row?.total ?? 0);
}

/** Размер FIFO-очереди (записи, ожидающие следующего дня) */
export async function getQueueSize(): Promise<number> {
  const rows = await db
    .select({ id: emissionLogsTable.id })
    .from(emissionLogsTable)
    .where(
      and(
        eq(emissionLogsTable.isApproved, false),
        isNotNull(emissionLogsTable.scheduledFor),
      )
    );
  return rows.length;
}

/**
 * Запросить эмиссию Дарминов для гражданина.
 * Если дневной лимит исчерпан — записывает в FIFO-очередь (isApproved=false, scheduledFor=следующий 00:00 UTC).
 * Возвращает { approved: true } если зачислено немедленно, { approved: false, scheduledFor } если встало в очередь.
 */
export async function requestEmission(
  citizenId: number,
  amount: number,
  reason: string
): Promise<{ approved: boolean; scheduledFor?: Date }> {
  const currentTotal = await getDailyApprovedTotal();

  if (currentTotal + amount <= DAILY_EMISSION_LIMIT) {
    await db.insert(emissionLogsTable).values({
      citizenId,
      amount,
      reason,
      dailyTotal: currentTotal + amount,
      isApproved: true,
      scheduledFor: null,
    });
    logger.info({ citizenId, amount, reason, dailyTotal: currentTotal + amount }, "Emission approved");
    return { approved: true };
  }

  const scheduledFor = tomorrowUTC();
  await db.insert(emissionLogsTable).values({
    citizenId,
    amount,
    reason,
    dailyTotal: currentTotal,
    isApproved: false,
    scheduledFor,
  });
  logger.warn(
    { citizenId, amount, reason, currentTotal, scheduledFor },
    "Emission queued (daily limit reached)"
  );
  return { approved: false, scheduledFor };
}

/**
 * Cron-задача 00:00 UTC — дрейнировать FIFO-очередь.
 * Одобряет pending-записи, пока не упрётся в лимит нового дня.
 * Возвращает количество обработанных записей.
 */
export async function drainEmissionQueue(): Promise<number> {
  const pending = await db
    .select()
    .from(emissionLogsTable)
    .where(
      and(
        eq(emissionLogsTable.isApproved, false),
        isNotNull(emissionLogsTable.scheduledFor),
        lte(emissionLogsTable.scheduledFor!, new Date()),
      )
    )
    .orderBy(emissionLogsTable.scheduledFor);

  if (pending.length === 0) return 0;

  let processed = 0;
  let runningTotal = 0;

  for (const entry of pending) {
    if (runningTotal + entry.amount > DAILY_EMISSION_LIMIT) break;

    await db
      .update(emissionLogsTable)
      .set({ isApproved: true, dailyTotal: runningTotal + entry.amount })
      .where(eq(emissionLogsTable.id, entry.id));

    runningTotal += entry.amount;
    processed++;
  }

  logger.info({ processed, newDailyTotal: runningTotal }, "Emission queue drained");
  return processed;
}
