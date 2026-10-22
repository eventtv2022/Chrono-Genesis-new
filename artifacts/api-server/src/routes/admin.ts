import { Router } from "express";
import { db } from "@workspace/db";
import {
  citizensTable,
  sessionsTable,
  transactionsTable,
  auctionsTable,
  emissionLogsTable,
  stateTaxLogsTable,
  auctionLogsTable,
} from "@workspace/db";
import { eq, desc, count, sum, gte, sql, and, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { applyMeritAfterSession } from "../services/meritocracyService";
import { sendTransactionNotification, sendDirectMessage } from "../services/telegramService";
import {
  MakeAdminPersonalTransferBody,
  MakeAdminPersonalTransferResponse,
} from "@workspace/api-zod";

const router = Router();

// ── OTP store (in-memory, TTL 5 min) ─────────────────────────────────────────
interface OtpRecord {
  otp: string;
  expiresAt: number;
  pendingAmount: number;
  pendingCitizenId: number;
  pendingDescription: string;
}
const otpStore = new Map<number, OtpRecord>();

// ── Telegram OTP delivery ─────────────────────────────────────────────────────
async function sendOtpViaTelegram(
  adminTelegramId: string,
  otp: string,
  amount: number
): Promise<boolean> {
  const msg =
    `🔐 *TimeNation — Подтверждение эмиссии*\n\n` +
    `Сумма: *${amount} Д*\n\n` +
    `Ваш код (действует 5 минут):\n` +
    `\`${otp}\`\n\n` +
    `_Если вы не запрашивали этот код — проигнорируйте._`;
  const sent = await sendDirectMessage(adminTelegramId, msg);
  if (!sent) {
    // Fallback: log so admin can find it in Replit workflow logs
    console.warn(`[Admin OTP] Telegram unavailable. CODE=${otp} AMOUNT=${amount}Д`);
  }
  return sent;
}

// ── Daily emission cap ────────────────────────────────────────────────────────
export const ADMIN_DAILY_EMISSION_CAP = 1440;

async function getAdminDailyEmitted(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: sum(emissionLogsTable.amount) })
    .from(emissionLogsTable)
    .where(
      and(
        eq(emissionLogsTable.isApproved, true),
        gte(emissionLogsTable.createdAt, since)
      )
    );
  return Number(row?.total ?? 0);
}

// ── Public endpoint ───────────────────────────────────────────────────────────

// ── GET /admin/treasury/stats ─────────────────────────────────────────────────

router.get("/admin/treasury/stats", async (_req, res) => {
  const since24h = new Date(Date.now() - 86_400_000);

  const [totalRow, todayRow, bySource, recentLogs] = await Promise.all([
    // All-time total
    db.select({ total: sum(stateTaxLogsTable.amount) }).from(stateTaxLogsTable),

    // Last 24h
    db.select({ total: sum(stateTaxLogsTable.amount) })
      .from(stateTaxLogsTable)
      .where(gte(stateTaxLogsTable.createdAt, since24h)),

    // By source type
    db.execute(sql`
      SELECT source_type AS "sourceType", COALESCE(SUM(amount), 0) AS total
      FROM state_tax_logs
      GROUP BY source_type
      ORDER BY total DESC
    `),

    // Recent 50 entries
    db.select({
      id:            stateTaxLogsTable.id,
      sourceType:    stateTaxLogsTable.sourceType,
      amount:        stateTaxLogsTable.amount,
      fromCitizenId: stateTaxLogsTable.fromCitizenId,
      referenceId:   stateTaxLogsTable.referenceId,
      createdAt:     stateTaxLogsTable.createdAt,
    })
    .from(stateTaxLogsTable)
    .orderBy(desc(stateTaxLogsTable.createdAt))
    .limit(50),
  ]);

  // Also pull auction taxes from auction_logs for completeness
  const [auctionTaxRow] = await db
    .select({ total: sum(auctionLogsTable.tax2pct) })
    .from(auctionLogsTable);

  res.json({
    totalTaxCollected:  Number(totalRow[0]?.total ?? 0) + Number(auctionTaxRow?.total ?? 0),
    todayTaxCollected:  Number(todayRow[0]?.total ?? 0),
    taxBySource:        bySource.rows as { sourceType: string; total: number }[],
    recentLogs,
  });
});

// ── GET /supply — total circulating supply (public, for Treasury page) ────────
router.get("/supply", async (_req, res) => {
  const [row] = await db
    .select({ total: sum(citizensTable.balanceMinutes) })
    .from(citizensTable);
  const emitted24h = await getAdminDailyEmitted();
  res.json({
    totalSupply: Number(row?.total ?? 0),
    emitted24h,
    remainingCap: Math.max(0, ADMIN_DAILY_EMISSION_CAP - emitted24h),
    dailyCap: ADMIN_DAILY_EMISSION_CAP,
  });
});

// ── All routes below require auth + admin ─────────────────────────────────────
router.use("/admin", requireAuth, requireAdmin);

// GET /admin/stats
router.get("/admin/stats", async (req, res) => {
  const [citizenStats] = await db
    .select({ total: count(), totalBalance: sum(citizensTable.balanceMinutes) })
    .from(citizensTable);

  const [sessionStats] = await db
    .select({ total: count() })
    .from(sessionsTable);

  const [txStats] = await db
    .select({ total: count(), totalVolume: sum(transactionsTable.minutesTransferred) })
    .from(transactionsTable);

  const [auctionStats] = await db
    .select({ total: count() })
    .from(auctionsTable);

  const emitted24h = await getAdminDailyEmitted();

  res.json({
    citizens: { total: citizenStats?.total ?? 0, totalBalance: citizenStats?.totalBalance ?? 0 },
    sessions: { total: sessionStats?.total ?? 0 },
    transactions: { total: txStats?.total ?? 0, totalVolume: txStats?.totalVolume ?? 0 },
    auctions: { total: auctionStats?.total ?? 0 },
    emission: {
      emitted24h,
      remainingCap: Math.max(0, ADMIN_DAILY_EMISSION_CAP - emitted24h),
      dailyCap: ADMIN_DAILY_EMISSION_CAP,
    },
  });
});

// GET /admin/citizens
router.get("/admin/citizens", async (req, res) => {
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

// PATCH /admin/citizens/:id
router.patch("/admin/citizens/:id", async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Неверный ID" }); return; }

  const { status, isAdmin, rank, meritScore } = req.body as {
    status?: string; isAdmin?: number; rank?: string; meritScore?: number;
  };
  const updates: Partial<typeof citizensTable.$inferInsert> = {};
  if (status !== undefined) updates.status = status;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;
  if (rank !== undefined) updates.rank = rank;
  if (meritScore !== undefined) updates.meritScore = meritScore;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Нет полей для обновления" }); return;
  }

  const [updated] = await db
    .update(citizensTable)
    .set(updates)
    .where(eq(citizensTable.id, id))
    .returning({ id: citizensTable.id, name: citizensTable.name });

  if (!updated) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  req.log.info({ adminId: req.citizen!.id, targetId: id, updates }, "admin citizen update");
  res.json({ ok: true, citizen: updated });
});

// GET /admin/transactions
router.get("/admin/transactions", async (req, res) => {
  const rawLimit = parseInt(String(req.query["limit"] ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const citizenNumber = String(req.query["citizenNumber"] ?? "").trim();
  if (citizenNumber && !/^\d{9}$/.test(citizenNumber)) {
    res.status(400).json({ error: "Номер паспорта должен содержать ровно 9 цифр" });
    return;
  }
  let citizenId: number | undefined;
  if (citizenNumber) {
    const [citizen] = await db
      .select({ id: citizensTable.id })
      .from(citizensTable)
      .where(eq(citizensTable.citizenNumber, citizenNumber))
      .limit(1);
    if (!citizen) {
      res.json([]);
      return;
    }
    citizenId = citizen.id;
  }
  const fromAlias = alias(citizensTable, "admin_tx_from");
  const toAlias = alias(citizensTable, "admin_tx_to");
  const txs = await db
    .select({
      id: transactionsTable.id,
      fromCitizenId: transactionsTable.fromCitizenId,
      toCitizenId: transactionsTable.toCitizenId,
      fromCitizenName: transactionsTable.fromCitizenName,
      toCitizenName: transactionsTable.toCitizenName,
      fromCitizenNumber: fromAlias.citizenNumber,
      toCitizenNumber: toAlias.citizenNumber,
      minutesTransferred: transactionsTable.minutesTransferred,
      durationSeconds: transactionsTable.durationSeconds,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .leftJoin(fromAlias, eq(transactionsTable.fromCitizenId, fromAlias.id))
    .leftJoin(toAlias, eq(transactionsTable.toCitizenId, toAlias.id))
    .where(citizenId ? or(
      eq(transactionsTable.fromCitizenId, citizenId),
      eq(transactionsTable.toCitizenId, citizenId),
    ) : undefined)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);
  res.json(txs.map((tx) => ({ ...tx, createdAt: tx.createdAt.toISOString() })));
});

// POST /admin/emit/request-otp — step 1: generate OTP and email it
router.post("/admin/emit/request-otp", async (req, res) => {
  const { citizenId, amount, description } = req.body as {
    citizenId?: number; amount?: number; description?: string;
  };

  if (!citizenId || !amount || amount <= 0) {
    res.status(400).json({ error: "Требуются citizenId и amount > 0" }); return;
  }

  // Check daily cap
  const emitted24h = await getAdminDailyEmitted();
  const remaining = ADMIN_DAILY_EMISSION_CAP - emitted24h;
  if (amount > remaining) {
    res.status(400).json({
      error: `Превышен суточный лимит эмиссии (Макс: 1440 Д). Осталось: ${remaining.toFixed(2)} Д`,
    });
    return;
  }

  // Check recipient exists
  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);
  if (!recipient) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  // Look up admin's Telegram ID from DB
  const [adminRow] = await db
    .select({ telegramId: citizensTable.telegramId })
    .from(citizensTable)
    .where(eq(citizensTable.id, req.citizen!.id))
    .limit(1);

  const adminTelegramId = adminRow?.telegramId ?? "";

  // Generate 6-digit OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

  otpStore.set(req.citizen!.id, {
    otp,
    expiresAt,
    pendingAmount: amount,
    pendingCitizenId: citizenId,
    pendingDescription: description ?? "",
  });

  const tgSent = await sendOtpViaTelegram(adminTelegramId, otp, amount);

  req.log.info({ adminId: req.citizen!.id, citizenId, amount, tgSent }, "emit OTP requested");

  res.json({
    ok: true,
    tgSent,
    hasTelegram: !!adminTelegramId,
    message: tgSent
      ? "Код отправлен в Telegram"
      : adminTelegramId
        ? "Ошибка отправки в Telegram (проверьте логи сервера). Код записан в лог."
        : "Telegram не привязан. Код записан в логи сервера (workflow logs).",
    recipient: recipient.name,
  });
});

// POST /admin/emit — step 2: verify OTP and execute emission
router.post("/admin/emit", async (req, res) => {
  const { otp } = req.body as { otp?: string };
  if (!otp) { res.status(400).json({ error: "Требуется код подтверждения" }); return; }

  const record = otpStore.get(req.citizen!.id);
  if (!record) {
    res.status(400).json({ error: "Нет активного запроса OTP. Запросите код заново." }); return;
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(req.citizen!.id);
    res.status(400).json({ error: "Код истёк. Запросите новый." }); return;
  }
  if (record.otp !== otp.trim()) {
    res.status(400).json({ error: "Неверный код подтверждения." }); return;
  }

  // Re-check daily cap (time may have passed)
  const emitted24h = await getAdminDailyEmitted();
  const remaining = ADMIN_DAILY_EMISSION_CAP - emitted24h;
  if (record.pendingAmount > remaining) {
    otpStore.delete(req.citizen!.id);
    res.status(400).json({
      error: `Превышен суточный лимит эмиссии (Макс: 1440 Д). Осталось: ${remaining.toFixed(2)} Д`,
    });
    return;
  }

  const [citizen] = await db
    .select({ id: citizensTable.id, balanceMinutes: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, record.pendingCitizenId))
    .limit(1);
  if (!citizen) {
    otpStore.delete(req.citizen!.id);
    res.status(404).json({ error: "Гражданин-получатель не найден" }); return;
  }

  const newBalance = citizen.balanceMinutes + record.pendingAmount;

  await db.transaction(async (tx) => {
    await tx
      .update(citizensTable)
      .set({ balanceMinutes: newBalance })
      .where(eq(citizensTable.id, record.pendingCitizenId));
    await tx.insert(emissionLogsTable).values({
      citizenId: record.pendingCitizenId,
      amount: record.pendingAmount,
      reason: record.pendingDescription || `Административная эмиссия от #${req.citizen!.id}`,
      dailyTotal: emitted24h + record.pendingAmount,
      isApproved: true,
    });
  });

  otpStore.delete(req.citizen!.id);

  req.log.info(
    { adminId: req.citizen!.id, citizenId: record.pendingCitizenId, amount: record.pendingAmount },
    "admin emission executed"
  );

  res.json({ ok: true, newBalance, amount: record.pendingAmount });
});

// POST /admin/transfer — direct personal transfer from admin's balance
router.post("/admin/transfer", async (req, res) => {
  const input = MakeAdminPersonalTransferBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.issues[0]?.message ?? "Некорректные данные перевода" });
    return;
  }
  const { citizenNumber, amount, description } = input.data;

  const adminId = req.citizen!.id;

  // Re-fetch admin's current balance
  const [admin] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, adminId))
    .limit(1);

  if (!admin) { res.status(404).json({ error: "Администратор не найден" }); return; }

  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes, totalReceived: citizensTable.totalReceived })
    .from(citizensTable)
    .where(eq(citizensTable.citizenNumber, citizenNumber))
    .limit(1);

  if (!recipient) { res.status(404).json({ error: "Гражданин с таким номером паспорта не найден" }); return; }
  if (recipient.id === adminId) {
    res.status(400).json({ error: "Нельзя перевести самому себе" });
    return;
  }

  // Keep 1 Д rodovaya minuta
  const transferable = admin.balanceMinutes - 1;
  if (amount > transferable) {
    res.status(400).json({
      error: `Недостаточно Дарминов. Доступно к переводу: ${transferable.toFixed(2)} Д (1 Д — родовая минута)`,
    });
    return;
  }

  // Admin direct transfer: no treasury tax (admin IS the treasury)
  await db.transaction(async (tx) => {
    await tx
      .update(citizensTable)
      .set({
        balanceMinutes: admin.balanceMinutes - amount,
        totalGiven: sql`${citizensTable.totalGiven} + ${amount}`,
      })
      .where(eq(citizensTable.id, adminId));

    await tx
      .update(citizensTable)
      .set({
        balanceMinutes: recipient.balanceMinutes + amount,
        totalReceived: sql`${citizensTable.totalReceived} + ${amount}`,
      })
      .where(eq(citizensTable.id, recipient.id));

    await tx.insert(transactionsTable).values({
      sessionId: 0,
      fromCitizenId: adminId,
      toCitizenId: recipient.id,
      fromCitizenName: admin.name,
      toCitizenName: recipient.name,
      minutesTransferred: amount,
      durationSeconds: 0,
    });
  });

  // Apply merit to admin
  await applyMeritAfterSession(adminId, amount).catch(() => null);

  // Telegram notifications
  const desc = description ? ` · ${description}` : "";
  await Promise.all([
    sendTransactionNotification(
      adminId,
      `🏛 *Казначейство TimeNation*\n\nЛичный перевод *${amount.toFixed(2)} Д* → *${recipient.name}*${desc}`
    ),
    sendTransactionNotification(
      recipient.id,
      `🏛 *Казначейство TimeNation*\n\nПолучено *${amount.toFixed(2)} Д* от *${admin.name}* (Администратор)${desc}\n\n💰 Ваш баланс: *${(recipient.balanceMinutes + amount).toFixed(2)} Д*`
    ),
  ]).catch(() => null);

  req.log.info({ adminId, recipientId: recipient.id, citizenNumber, amount }, "admin direct transfer");
  res.json(MakeAdminPersonalTransferResponse.parse({
    ok: true,
    recipientName: recipient.name,
    newAdminBalance: admin.balanceMinutes - amount,
  }));
});

export default router;
