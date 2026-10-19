import { Router, type IRouter } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, citizensTable, referralsTable, referralBonusLedgerTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/referrals/me", requireAuth, async (req, res): Promise<void> => {
  const citizenId = req.citizen!.id;
  const [citizen] = await db
    .select({
      id: citizensTable.id,
      referralBonusMinutes: citizensTable.referralBonusMinutes,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);
  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  const referrals = await db
    .select({
      id: referralsTable.id,
      name: citizensTable.name,
      status: referralsTable.status,
      rewardedAt: referralsTable.rewardedAt,
      bonusMinutes: sql<number>`CASE WHEN ${referralsTable.status} = 'rewarded' THEN 15 ELSE 0 END`,
    })
    .from(referralsTable)
    .innerJoin(citizensTable, eq(referralsTable.referredCitizenId, citizensTable.id))
    .where(and(
      eq(referralsTable.referrerId, citizenId),
      or(eq(referralsTable.status, "pending"), eq(referralsTable.status, "rewarded")),
    ))
    .orderBy(desc(referralsTable.createdAt));
  const [earned] = await db
    .select({ total: sql<number>`COALESCE(SUM(${referralBonusLedgerTable.amount}), 0)` })
    .from(referralBonusLedgerTable)
    .where(and(
      eq(referralBonusLedgerTable.citizenId, citizenId),
      eq(referralBonusLedgerTable.type, "earned"),
    ));

  res.json({
    referralUrl: `https://chrono-genesis.replit.app/mobile/register?ref=${citizen.id}`,
    referralCount: referrals.length,
    earnedBonusMinutes: Number(earned?.total ?? 0),
    bonusBalanceMinutes: citizen.referralBonusMinutes,
    referrals: referrals.map((row) => ({
      ...row,
      rewardedAt: row.rewardedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
