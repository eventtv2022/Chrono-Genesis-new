import { randomInt } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, count, eq, gt, sql, sum } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  citizenActivityDaysTable,
  citizensTable,
  hourglassDailyInventoryTable,
  hourglassPrizeTiersTable,
  hourglassSettingsTable,
  hourglassSpinsTable,
} from "@workspace/db/schema";
import { UpdateAdminHourglassBody } from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const DEFAULT_TIERS = [
  { rewardAmount: 1, dailyQuantity: 48 },
  { rewardAmount: 3, dailyQuantity: 6 },
  { rewardAmount: 5, dailyQuantity: 3 },
  { rewardAmount: 10, dailyQuantity: 2 },
  { rewardAmount: 60, dailyQuantity: 1 },
] as const;
const MAX_DAILY_PRIZES = 10_000;

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcReset(prizeDate: string): string {
  const [year, month, day] = prizeDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString();
}

async function ensureDefaults(): Promise<void> {
  await db.insert(hourglassSettingsTable).values({ id: 1, enabled: true }).onConflictDoNothing();
  await db.insert(hourglassPrizeTiersTable).values([...DEFAULT_TIERS]).onConflictDoNothing();
}

async function ensureDailyInventory(prizeDate: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ id: hourglassSettingsTable.id }).from(hourglassSettingsTable)
      .where(eq(hourglassSettingsTable.id, 1)).for("update").limit(1);
    const configured = await tx.select().from(hourglassPrizeTiersTable);
    await tx.insert(hourglassDailyInventoryTable).values(configured.map((tier) => ({
      prizeDate,
      rewardAmount: tier.rewardAmount,
      initialQuantity: tier.dailyQuantity,
      remainingQuantity: tier.dailyQuantity,
    }))).onConflictDoNothing();
  });
}

async function getStatus(citizenId: number) {
  const prizeDate = utcDate();
  await ensureDefaults();
  await ensureDailyInventory(prizeDate);
  const [[settings], configured, inventory, [spin], [citizen]] = await Promise.all([
    db.select().from(hourglassSettingsTable).where(eq(hourglassSettingsTable.id, 1)).limit(1),
    db.select().from(hourglassPrizeTiersTable).orderBy(hourglassPrizeTiersTable.rewardAmount),
    db.select().from(hourglassDailyInventoryTable).where(eq(hourglassDailyInventoryTable.prizeDate, prizeDate)),
    db.select({ id: hourglassSpinsTable.id }).from(hourglassSpinsTable).where(and(
      eq(hourglassSpinsTable.citizenId, citizenId),
      eq(hourglassSpinsTable.prizeDate, prizeDate),
    )).limit(1),
    db.select({ balanceMinutes: citizensTable.balanceMinutes }).from(citizensTable).where(eq(citizensTable.id, citizenId)).limit(1),
  ]);
  const [activity] = await db.select({ id: citizenActivityDaysTable.id }).from(citizenActivityDaysTable)
    .where(and(
      eq(citizenActivityDaysTable.citizenId, citizenId),
      eq(citizenActivityDaysTable.activityDate, prizeDate),
    )).limit(1);
  const inventoryByReward = new Map(inventory.map((row) => [row.rewardAmount, row]));
  const remainingTotal = inventory.reduce((total, row) => total + row.remainingQuantity, 0);
  return {
    prizeDate,
    enabled: settings?.enabled ?? false,
    alreadySpun: Boolean(spin),
    hasActivityToday: Boolean(activity),
    nextResetAt: nextUtcReset(prizeDate),
    balanceMinutes: citizen?.balanceMinutes ?? 0,
    tiers: configured.map((tier) => ({
      rewardAmount: tier.rewardAmount,
      dailyQuantity: inventoryByReward.get(tier.rewardAmount)?.initialQuantity ?? tier.dailyQuantity,
      remainingQuantity: inventoryByReward.get(tier.rewardAmount)?.remainingQuantity ?? 0,
      probabilityPercent: remainingTotal
        ? Number((((inventoryByReward.get(tier.rewardAmount)?.remainingQuantity ?? 0) / remainingTotal) * 100).toFixed(2))
        : 0,
    })),
  };
}

async function getAdminData() {
  const prizeDate = utcDate();
  await ensureDefaults();
  await ensureDailyInventory(prizeDate);
  const [[settings], configured, inventory, [stats]] = await Promise.all([
    db.select().from(hourglassSettingsTable).where(eq(hourglassSettingsTable.id, 1)).limit(1),
    db.select().from(hourglassPrizeTiersTable).orderBy(hourglassPrizeTiersTable.rewardAmount),
    db.select().from(hourglassDailyInventoryTable).where(eq(hourglassDailyInventoryTable.prizeDate, prizeDate)),
    db.select({ totalSpins: count(), totalDistributed: sum(hourglassSpinsTable.rewardAmount) })
      .from(hourglassSpinsTable).where(eq(hourglassSpinsTable.prizeDate, prizeDate)),
  ]);
  const inventoryByReward = new Map(inventory.map((row) => [row.rewardAmount, row]));
  const remainingTotal = inventory.reduce((total, row) => total + row.remainingQuantity, 0);
  return {
    prizeDate,
    enabled: settings?.enabled ?? false,
    totalSpinsToday: Number(stats?.totalSpins ?? 0),
    totalDarminsDistributed: Number(stats?.totalDistributed ?? 0),
    remainingPrizes: remainingTotal,
    tiers: configured.map((tier) => ({
      rewardAmount: tier.rewardAmount,
      dailyQuantity: tier.dailyQuantity,
      remainingQuantity: inventoryByReward.get(tier.rewardAmount)?.remainingQuantity ?? 0,
      probabilityPercent: remainingTotal
        ? Number((((inventoryByReward.get(tier.rewardAmount)?.remainingQuantity ?? 0) / remainingTotal) * 100).toFixed(2))
        : 0,
    })),
  };
}

router.get("/hourglass", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await getStatus(req.citizen!.id));
  } catch (error) {
    req.log.error({ err: error }, "hourglass status failed");
    res.status(500).json({ error: "Не удалось загрузить статус рулетки." });
  }
});

router.post("/hourglass/spin", requireAuth, async (req, res): Promise<void> => {
  await ensureDefaults();
  const prizeDate = utcDate();
  try {
    const result = await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(hourglassSettingsTable)
        .where(eq(hourglassSettingsTable.id, 1)).for("update").limit(1);
      if (!settings?.enabled) return { error: "Рулетка временно отключена.", status: 409 as const };
      const [activity] = await tx.select({ id: citizenActivityDaysTable.id })
        .from(citizenActivityDaysTable)
        .where(and(
          eq(citizenActivityDaysTable.citizenId, req.citizen!.id),
          eq(citizenActivityDaysTable.activityDate, prizeDate),
        )).limit(1);
      if (!activity) return { error: "Сначала выполните любое действие в TimeNation, чтобы открыть ежедневный запуск.", status: 403 as const };

      const [existingSpin] = await tx.select({ id: hourglassSpinsTable.id })
        .from(hourglassSpinsTable)
        .where(and(
          eq(hourglassSpinsTable.citizenId, req.citizen!.id),
          eq(hourglassSpinsTable.prizeDate, prizeDate),
        )).limit(1);
      if (existingSpin) return { error: "Вы уже запускали рулетку сегодня.", status: 409 as const };

      const configured = await tx.select().from(hourglassPrizeTiersTable);
      await tx.insert(hourglassDailyInventoryTable).values(configured.map((tier) => ({
        prizeDate,
        rewardAmount: tier.rewardAmount,
        initialQuantity: tier.dailyQuantity,
        remainingQuantity: tier.dailyQuantity,
      }))).onConflictDoNothing();
      const inventory = await tx.select().from(hourglassDailyInventoryTable)
        .where(eq(hourglassDailyInventoryTable.prizeDate, prizeDate))
        .for("update");
      const remainingTotal = inventory.reduce((total, row) => total + row.remainingQuantity, 0);
      if (remainingTotal < 1) return { error: "Призы на сегодня закончились.", status: 409 as const };

      let pick = randomInt(remainingTotal);
      const chosen = inventory.find((row) => {
        pick -= row.remainingQuantity;
        return pick < 0;
      });
      if (!chosen) throw new Error("Unable to select an available Hourglass prize");

      const [stock] = await tx.update(hourglassDailyInventoryTable)
        .set({ remainingQuantity: sql`${hourglassDailyInventoryTable.remainingQuantity} - 1` })
        .where(and(
          eq(hourglassDailyInventoryTable.id, chosen.id),
          gt(hourglassDailyInventoryTable.remainingQuantity, 0),
        )).returning();
      if (!stock) return { error: "Этот приз только что закончился. Попробуйте ещё раз.", status: 409 as const };

      const [spin] = await tx.insert(hourglassSpinsTable).values({
        citizenId: req.citizen!.id,
        prizeDate,
        rewardAmount: chosen.rewardAmount,
      }).returning();
      const [citizen] = await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${chosen.rewardAmount}` })
        .where(eq(citizensTable.id, req.citizen!.id))
        .returning({ balanceMinutes: citizensTable.balanceMinutes });
      if (!citizen) throw new Error("Citizen balance could not be updated");
      return { rewardAmount: chosen.rewardAmount, spunAt: spin.spunAt.toISOString(), balanceMinutes: citizen.balanceMinutes };
    });
    if ("error" in result) {
      res.status(result.status ?? 409).json({ error: result.error });
      return;
    }
    res.json({ ...result, status: await getStatus(req.citizen!.id) });
  } catch (error) {
    req.log.error({ err: error }, "hourglass spin failed");
    res.status(500).json({ error: "Не удалось завершить запуск рулетки." });
  }
});

router.get("/admin/hourglass", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await getAdminData());
  } catch (error) {
    _req.log.error({ err: error }, "admin hourglass status failed");
    res.status(500).json({ error: "Не удалось загрузить настройки рулетки." });
  }
});

router.put("/admin/hourglass", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminHourglassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректные настройки призового фонда." });
    return;
  }
  const amounts = parsed.data.tiers.map((tier) => tier.rewardAmount);
  const total = parsed.data.tiers.reduce((sumValue, tier) => sumValue + tier.dailyQuantity, 0);
  if (
    amounts.length !== DEFAULT_TIERS.length ||
    new Set(amounts).size !== DEFAULT_TIERS.length ||
    !DEFAULT_TIERS.every((tier) => amounts.includes(tier.rewardAmount)) ||
    total < 1 ||
    total > MAX_DAILY_PRIZES
  ) {
    res.status(400).json({ error: "Укажите каждый из пяти номиналов один раз и от 1 до 10 000 призов всего." });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(hourglassSettingsTable).set({
        enabled: parsed.data.enabled,
        updatedBy: req.citizen!.id,
        updatedAt: new Date(),
      }).where(eq(hourglassSettingsTable.id, 1));
      for (const tier of parsed.data.tiers) {
        await tx.update(hourglassPrizeTiersTable)
          .set({ dailyQuantity: tier.dailyQuantity })
          .where(eq(hourglassPrizeTiersTable.rewardAmount, tier.rewardAmount));
      }
    });
    res.json(await getAdminData());
  } catch (error) {
    req.log.error({ err: error }, "admin hourglass config update failed");
    res.status(500).json({ error: "Не удалось сохранить настройки." });
  }
});

router.post("/admin/hourglass/refill", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const prizeDate = utcDate();
  try {
    await db.transaction(async (tx) => {
      await tx.select({ id: hourglassSettingsTable.id }).from(hourglassSettingsTable)
        .where(eq(hourglassSettingsTable.id, 1)).for("update").limit(1);
      const configured = await tx.select().from(hourglassPrizeTiersTable);
      await tx.delete(hourglassDailyInventoryTable).where(eq(hourglassDailyInventoryTable.prizeDate, prizeDate));
      await tx.insert(hourglassDailyInventoryTable).values(configured.map((tier) => ({
        prizeDate,
        rewardAmount: tier.rewardAmount,
        initialQuantity: tier.dailyQuantity,
        remainingQuantity: tier.dailyQuantity,
      }))).onConflictDoNothing();
    });
    res.json(await getAdminData());
  } catch (error) {
    req.log.error({ err: error }, "admin hourglass refill failed");
    res.status(500).json({ error: "Не удалось пополнить призовой фонд." });
  }
});

export default router;
