import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { eq, lt, or, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTransactionNotification } from "./telegramService";

// ── Single Source of Truth for ranks ─────────────────────────────────────────

export const RANKS = [
  { threshold: 0,    name: "Гражданин" },
  { threshold: 100,  name: "Оператор времени" },
  { threshold: 500,  name: "Хранитель времени" },
  { threshold: 1000, name: "Архитектор потока" },
  { threshold: 2500, name: "Мастер хронологии" },
  { threshold: 5000, name: "Синхронизатор вечности" },
] as const;

export type RankName = (typeof RANKS)[number]["name"];

/**
 * Calculates the rank for a given merit score.
 * Iterates from highest threshold downward and returns the first match.
 */
export function calculateRank(meritScore: number): RankName {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (meritScore >= RANKS[i]!.threshold) return RANKS[i]!.name;
  }
  return RANKS[0]!.name;
}

/** @deprecated Use calculateRank() */
export const getUserRank = calculateRank;

export function getRankIndex(rankName: string): number {
  return RANKS.findIndex((r) => r.name === rankName);
}

// ── Merit gain formula ────────────────────────────────────────────────────────

interface MeritGainParams {
  minutesTransferred: number;
  dailyMinutesTotal: number;
  daysSinceRegistration: number;
}

export function calculateMeritGain(params: MeritGainParams): number {
  const { minutesTransferred, dailyMinutesTotal, daysSinceRegistration } = params;

  let merit = 1;
  merit += Math.floor(minutesTransferred / 10) * 0.1;
  if (dailyMinutesTotal > 60) merit += 5;
  const loyaltyCoeff = 1 + daysSinceRegistration / 100;
  merit = merit * loyaltyCoeff;

  return Math.round(merit * 100) / 100;
}

// ── Apply merit after a TiMETR session ────────────────────────────────────────

export async function applyMeritAfterSession(
  citizenId: number,
  minutesTransferred: number
): Promise<{ oldRank: string; newRank: string; meritGained: number; newScore: number }> {
  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) throw new Error(`Citizen ${citizenId} not found`);

  const now = new Date();
  const daysSinceRegistration = Math.floor(
    (now.getTime() - citizen.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const meritGained = calculateMeritGain({
    minutesTransferred,
    dailyMinutesTotal: citizen.totalGiven,
    daysSinceRegistration,
  });

  const oldRank = citizen.rank;
  const newScore = Math.round((citizen.meritScore + meritGained) * 100) / 100;
  const newRank = calculateRank(newScore);

  await db
    .update(citizensTable)
    .set({ meritScore: newScore, rank: newRank, lastActivity: now })
    .where(eq(citizensTable.id, citizenId));

  logger.info(
    { citizenId, oldRank, newRank, meritGained, newScore },
    "Merit applied after session"
  );

  return { oldRank, newRank, meritGained, newScore };
}

// ── Weekly entropy (−0.5 merit for inactive citizens) ─────────────────────────

export async function applyEntropy(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const inactiveCitizens = await db
    .select()
    .from(citizensTable)
    .where(
      or(
        isNull(citizensTable.lastActivity),
        lt(citizensTable.lastActivity, sevenDaysAgo)
      )
    );

  logger.info({ count: inactiveCitizens.length }, "Applying entropy to inactive citizens");

  for (const citizen of inactiveCitizens) {
    if (citizen.meritScore <= 0) continue;

    const oldRank = citizen.rank;
    const newScore = Math.max(0, Math.round((citizen.meritScore - 0.5) * 100) / 100);
    const newRank = calculateRank(newScore);

    await db
      .update(citizensTable)
      .set({ meritScore: newScore, rank: newRank })
      .where(eq(citizensTable.id, citizen.id));

    if (newRank !== oldRank && getRankIndex(newRank) < getRankIndex(oldRank)) {
      await sendTransactionNotification(
        citizen.id,
        `⚠️ *Казначейство TimeNation*\n\n` +
        `Внимание! Энтропия затронула ваш профиль.\n` +
        `Ваш статус понижен до *${newRank}*.\n\n` +
        `Проведите TiMETR-сессию, чтобы вернуть влияние.`
      ).catch(() => {});

      logger.info(
        { citizenId: citizen.id, oldRank, newRank },
        "Entropy rank downgrade"
      );
    }
  }
}
