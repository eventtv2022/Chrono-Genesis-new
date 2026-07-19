import { Router } from "express";
import { db } from "@workspace/db";
import { citizensTable, sessionsTable, transactionsTable, auctionsTable, emissionLogsTable } from "@workspace/db";
import { eq, desc, count, sum } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// All admin routes require auth + admin role
router.use("/api/admin", requireAuth, requireAdmin);

// GET /api/admin/stats — system overview
router.get("/api/admin/stats", async (req, res) => {
  const [citizenStats] = await db
    .select({
      total: count(),
      totalBalance: sum(citizensTable.balanceMinutes),
    })
    .from(citizensTable);

  const [sessionStats] = await db
    .select({ total: count() })
    .from(sessionsTable);

  const [txStats] = await db
    .select({
      total: count(),
      totalVolume: sum(transactionsTable.minutesTransferred),
    })
    .from(transactionsTable);

  const [auctionStats] = await db
    .select({ total: count() })
    .from(auctionsTable);

  res.json({
    citizens: {
      total: citizenStats?.total ?? 0,
      totalBalance: citizenStats?.totalBalance ?? 0,
    },
    sessions: { total: sessionStats?.total ?? 0 },
    transactions: {
      total: txStats?.total ?? 0,
      totalVolume: txStats?.totalVolume ?? 0,
    },
    auctions: { total: auctionStats?.total ?? 0 },
  });
});

// GET /api/admin/citizens — full citizen list with details
router.get("/api/admin/citizens", async (req, res) => {
  const citizens = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      phone: citizensTable.phone,
      rank: citizensTable.rank,
      meritScore: citizensTable.meritScore,
      balanceMinutes: citizensTable.balanceMinutes,
      totalGiven: citizensTable.totalGiven,
      totalReceived: citizensTable.totalReceived,
      status: citizensTable.status,
      govRole: citizensTable.govRole,
      isAdmin: citizensTable.isAdmin,
      registrationStatus: citizensTable.registrationStatus,
      createdAt: citizensTable.createdAt,
      lastActivity: citizensTable.lastActivity,
      telegramId: citizensTable.telegramId,
      citizenNumber: citizensTable.citizenNumber,
    })
    .from(citizensTable)
    .orderBy(citizensTable.id);

  res.json(citizens);
});

// PATCH /api/admin/citizens/:id — update status or isAdmin flag
router.patch("/api/admin/citizens/:id", async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }

  const { status, isAdmin, rank, meritScore } = req.body as {
    status?: string;
    isAdmin?: number;
    rank?: string;
    meritScore?: number;
  };

  const updates: Partial<typeof citizensTable.$inferInsert> = {};
  if (status !== undefined) updates.status = status;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;
  if (rank !== undefined) updates.rank = rank;
  if (meritScore !== undefined) updates.meritScore = meritScore;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Нет полей для обновления" });
    return;
  }

  const [updated] = await db
    .update(citizensTable)
    .set(updates)
    .where(eq(citizensTable.id, id))
    .returning({ id: citizensTable.id, name: citizensTable.name });

  if (!updated) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  req.log.info({ adminId: req.citizen!.id, targetId: id, updates }, "admin citizen update");
  res.json({ ok: true, citizen: updated });
});

// GET /api/admin/transactions — recent transactions
router.get("/api/admin/transactions", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
  const txs = await db
    .select({
      id: transactionsTable.id,
      fromCitizenId: transactionsTable.fromCitizenId,
      toCitizenId: transactionsTable.toCitizenId,
      fromCitizenName: transactionsTable.fromCitizenName,
      toCitizenName: transactionsTable.toCitizenName,
      minutesTransferred: transactionsTable.minutesTransferred,
      durationSeconds: transactionsTable.durationSeconds,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);

  res.json(txs);
});

// POST /api/admin/emit — manual Darmin emission to a citizen
router.post("/api/admin/emit", async (req, res) => {
  const { citizenId, amount, description } = req.body as {
    citizenId?: number;
    amount?: number;
    description?: string;
  };

  if (!citizenId || !amount || amount <= 0) {
    res.status(400).json({ error: "Требуются citizenId и amount > 0" });
    return;
  }

  const [citizen] = await db
    .select({ id: citizensTable.id, balanceMinutes: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  const newBalance = citizen.balanceMinutes + amount;

  await db.transaction(async (tx) => {
    await tx
      .update(citizensTable)
      .set({ balanceMinutes: newBalance })
      .where(eq(citizensTable.id, citizenId));

    await tx.insert(emissionLogsTable).values({
      citizenId,
      amount,
      reason: description ?? `Административная эмиссия от #${req.citizen!.id}`,
      dailyTotal: amount,
      isApproved: true,
    });
  });

  req.log.info({ adminId: req.citizen!.id, citizenId, amount }, "admin manual emit");
  res.json({ ok: true, newBalance });
});

export default router;
