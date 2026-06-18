import { db } from "@workspace/db";
import { timeBankLoansTable, citizensTable, transactionsTable } from "@workspace/db";
import { eq, sum, count, and } from "drizzle-orm";
import { logger } from "../lib/logger";

export const MAX_DEBT_CAP_MINUTES = 480; // 8 часов — абсолютный потолок

/**
 * Лестница доверия:
 * 0 услуг → 60 мин
 * 1+ услуга, <1 ч total → 120 мин
 * 2 ч total → 180 мин, 3 ч → 240 мин … 7 ч → 480 мин (cap)
 */
export function calculateMaxCreditLimit(
  completedServicesCount: number,
  totalMinutesWorked: number
): number {
  if (completedServicesCount === 0) return 60;
  const hoursWorked = Math.floor(totalMinutesWorked / 60);
  const step = Math.max(2, hoursWorked + 1); // минимум шаг 2 (120 мин) при 1+ услуге
  return Math.min(step * 60, MAX_DEBT_CAP_MINUTES);
}

/** Уровень, необходимый для следующего шага */
export function nextLevelRequirement(
  completedServicesCount: number,
  totalMinutesWorked: number
): { label: string; currentMinutes: number; targetMinutes: number } | null {
  const currentLimit = calculateMaxCreditLimit(completedServicesCount, totalMinutesWorked);
  if (currentLimit >= MAX_DEBT_CAP_MINUTES) return null; // уже потолок
  if (completedServicesCount === 0) {
    return { label: "Выполните первую услугу", currentMinutes: 0, targetMinutes: 0 };
  }
  const hoursWorked = Math.floor(totalMinutesWorked / 60);
  const nextHours = Math.max(2, hoursWorked + 1);
  return {
    label: `Отработайте ${nextHours} ч для лимита ${(nextHours + 1) * 60} мин`,
    currentMinutes: totalMinutesWorked,
    targetMinutes: nextHours * 60,
  };
}

/** Суммарный активный долг гражданина (Д) */
export async function getActiveDebt(citizenId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(timeBankLoansTable.remainingDebt) })
    .from(timeBankLoansTable)
    .where(
      and(
        eq(timeBankLoansTable.citizenId, citizenId),
        eq(timeBankLoansTable.status, "active")
      )
    );
  return Number(row?.total ?? 0);
}

/** Статус Банка Времени для гражданина */
export async function getTimeBankStatus(citizenId: number) {
  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) throw new Error("Гражданин не найден");

  const [svcRow] = await db
    .select({ cnt: count() })
    .from(transactionsTable)
    .where(eq(transactionsTable.toCitizenId, citizenId));

  const completedServicesCount = Number(svcRow?.cnt ?? 0);
  const totalMinutesWorked = citizen.totalReceived;

  const creditLimit = calculateMaxCreditLimit(completedServicesCount, totalMinutesWorked);
  const activeDebt = await getActiveDebt(citizenId);
  const availableCredit = Math.max(0, creditLimit - activeDebt);

  const nextLevel = nextLevelRequirement(completedServicesCount, totalMinutesWorked);
  const atCap = creditLimit >= MAX_DEBT_CAP_MINUTES;

  const loans = await db
    .select()
    .from(timeBankLoansTable)
    .where(eq(timeBankLoansTable.citizenId, citizenId));

  return {
    citizenId,
    creditLimit,
    activeDebt,
    availableCredit,
    maxDebtCap: MAX_DEBT_CAP_MINUTES,
    atCap,
    completedServicesCount,
    totalMinutesWorked,
    nextLevel,
    statusLabel: atCap
      ? "Достигнут максимальный предел доверия Банка Времени (8 часов)"
      : `Лимит доверия: ${creditLimit} мин`,
    loans: loans.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      repaidAt: l.repaidAt?.toISOString() ?? null,
    })),
  };
}

/** Взять кредит в Банке Времени */
export async function borrowFromBank(citizenId: number, amount: number): Promise<void> {
  if (amount <= 0) throw new Error("Сумма кредита должна быть положительной");

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) throw new Error("Гражданин не найден");

  const [svcRow] = await db
    .select({ cnt: count() })
    .from(transactionsTable)
    .where(eq(transactionsTable.toCitizenId, citizenId));

  const completedServicesCount = Number(svcRow?.cnt ?? 0);
  const creditLimit = calculateMaxCreditLimit(completedServicesCount, citizen.totalReceived);
  const activeDebt = await getActiveDebt(citizenId);

  if (activeDebt + amount > creditLimit) {
    const available = Math.max(0, creditLimit - activeDebt);
    if (available === 0 && creditLimit >= MAX_DEBT_CAP_MINUTES) {
      throw new Error(
        "Достигнут максимальный предел доверия Банка Времени (8 часов). Погасите долг для дальнейшего кредитования."
      );
    }
    throw new Error(
      `Превышен кредитный лимит. Доступно: ${available} мин (лимит ${creditLimit} мин). ` +
      `Выполните больше услуг для повышения лимита.`
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(timeBankLoansTable).values({
      citizenId,
      amount,
      remainingDebt: amount,
      status: "active",
    });
    await tx
      .update(citizensTable)
      .set({ balanceMinutes: citizen.balanceMinutes + amount })
      .where(eq(citizensTable.id, citizenId));
  });

  logger.info({ citizenId, amount, creditLimit }, "Банк Времени: выдан кредит");
}

/** Погасить долг */
export async function repayLoan(citizenId: number, loanId: number, amount: number): Promise<void> {
  if (amount <= 0) throw new Error("Сумма погашения должна быть положительной");

  const [loan] = await db
    .select()
    .from(timeBankLoansTable)
    .where(
      and(
        eq(timeBankLoansTable.id, loanId),
        eq(timeBankLoansTable.citizenId, citizenId),
        eq(timeBankLoansTable.status, "active")
      )
    )
    .limit(1);

  if (!loan) throw new Error("Кредит не найден или уже погашен");

  const repayAmount = Math.min(amount, loan.remainingDebt);

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) throw new Error("Гражданин не найден");

  const transferable = citizen.balanceMinutes - 1; // родовая минута не трогается
  if (transferable < repayAmount) {
    throw new Error(`Недостаточно Дарминов для погашения. Доступно: ${transferable} Д`);
  }

  await db.transaction(async (tx) => {
    const newRemaining = loan.remainingDebt - repayAmount;
    await tx
      .update(timeBankLoansTable)
      .set({
        remainingDebt: newRemaining,
        status: newRemaining === 0 ? "repaid" : "active",
        repaidAt: newRemaining === 0 ? new Date() : undefined,
      })
      .where(eq(timeBankLoansTable.id, loanId));

    await tx
      .update(citizensTable)
      .set({ balanceMinutes: citizen.balanceMinutes - repayAmount })
      .where(eq(citizensTable.id, citizenId));
  });

  logger.info({ citizenId, loanId, repayAmount }, "Банк Времени: погашение долга");
}
