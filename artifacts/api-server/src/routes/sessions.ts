import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, sessionsTable, transactionsTable } from "@workspace/db";
import { StartSessionBody } from "@workspace/api-zod";
import { logTransactionToSheets } from "../lib/googleSheets";
import { sendTransactionNotification } from "../services/telegramService";
import { applyMeritAfterSession } from "../services/meritocracyService";
import { calcTreasuryTax, TREASURY_CITIZEN_ID } from "../services/videoStorage";
import { autoRepayFromService } from "../services/timeBankService";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fromCitizenId, toCitizenId } = parsed.data;

  if (fromCitizenId === toCitizenId) {
    res.status(400).json({ error: "Cannot transfer time to yourself" });
    return;
  }

  const [fromCitizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, fromCitizenId))
    .limit(1);

  if (!fromCitizen) {
    res.status(404).json({ error: "Sender citizen not found" });
    return;
  }

  const [toCitizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, toCitizenId))
    .limit(1);

  if (!toCitizen) {
    res.status(404).json({ error: "Recipient citizen not found" });
    return;
  }

  if (fromCitizen.balanceMinutes <= 1) {
    res.status(400).json({
      error: "Недостаточно минут. Родовая Минута гражданства не может быть передана.",
    });
    return;
  }

  const activeSession = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.fromCitizenId, fromCitizenId),
        eq(sessionsTable.status, "active")
      )
    )
    .limit(1);

  if (activeSession.length > 0) {
    res.status(400).json({ error: "Citizen already has an active session" });
    return;
  }

  const [session] = await db
    .insert(sessionsTable)
    .values({ fromCitizenId, toCitizenId, status: "active" })
    .returning();

  req.log.info(
    { sessionId: session.id, fromCitizenId, toCitizenId },
    "TiMETR session started"
  );

  res.status(201).json({
    ...session,
    startedAt: session.startedAt.toISOString(),
    stoppedAt: null,
    durationSeconds: null,
    minutesTransferred: null,
  });
});

router.post("/sessions/:id/stop", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, id))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.status !== "active") {
    res.status(400).json({ error: "Session is already stopped" });
    return;
  }

  const stoppedAt = new Date();
  const durationSeconds = Math.floor(
    (stoppedAt.getTime() - session.startedAt.getTime()) / 1000
  );

  const minutesTransferred = Math.max(1, Math.ceil(durationSeconds / 60));

  const [fromCitizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, session.fromCitizenId))
    .limit(1);

  const [toCitizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, session.toCitizenId))
    .limit(1);

  if (!fromCitizen || !toCitizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  const actualMinutes = Math.min(minutesTransferred, fromCitizen.balanceMinutes - 1);
  // 2% казначейский налог. Точная дробь (например 1 Д → 0.02 Д).
  const treasuryTax = actualMinutes > 0 ? calcTreasuryTax(actualMinutes) : 0;
  const toReceives = Math.max(0, actualMinutes - treasuryTax);

  const [updatedSession] = await db
    .update(sessionsTable)
    .set({
      stoppedAt,
      durationSeconds,
      minutesTransferred: actualMinutes,
      status: "completed",
    })
    .where(eq(sessionsTable.id, id))
    .returning();

  await db
    .update(citizensTable)
    .set({
      balanceMinutes: fromCitizen.balanceMinutes - actualMinutes,
      totalGiven: fromCitizen.totalGiven + actualMinutes,
    })
    .where(eq(citizensTable.id, session.fromCitizenId));

  // Автопогашение долга в Банке Времени: если у получателя есть активный долг,
  // направляем заработанные минуты на погашение (остаток идёт на личный баланс).
  const autoRepaid = await autoRepayFromService(session.toCitizenId, toReceives).catch(() => 0);
  const netToReceives = toReceives - autoRepaid;

  await db
    .update(citizensTable)
    .set({
      balanceMinutes: toCitizen.balanceMinutes + netToReceives,
      totalReceived: toCitizen.totalReceived + toReceives, // totalReceived = полная сумма, без вычета долга
    })
    .where(eq(citizensTable.id, session.toCitizenId));

  // Зачислить налог Казначейству (id=1)
  if (treasuryTax > 0 && TREASURY_CITIZEN_ID !== session.fromCitizenId && TREASURY_CITIZEN_ID !== session.toCitizenId) {
    try {
      await db.execute(
        sql`UPDATE citizens SET balance_minutes = balance_minutes + ${treasuryTax} WHERE id = ${TREASURY_CITIZEN_ID}`
      );
    } catch { /* казначейство необязательно в dev */ }
  }

  const [transaction] = await db
    .insert(transactionsTable)
    .values({
      sessionId: id,
      fromCitizenId: session.fromCitizenId,
      toCitizenId: session.toCitizenId,
      fromCitizenName: fromCitizen.name,
      toCitizenName: toCitizen.name,
      minutesTransferred: actualMinutes,
      durationSeconds,
    })
    .returning();

  req.log.info(
    {
      sessionId: id,
      fromCitizenName: fromCitizen.name,
      toCitizenName: toCitizen.name,
      minutesTransferred: actualMinutes,
      durationSeconds,
    },
    "TiMETR session completed"
  );

  const sheetsLogged = await logTransactionToSheets({
    sessionId: transaction.id,
    fromCitizenId: transaction.fromCitizenId,
    toCitizenId: transaction.toCitizenId,
    fromCitizenName: transaction.fromCitizenName,
    toCitizenName: transaction.toCitizenName,
    minutesTransferred: transaction.minutesTransferred,
    durationSeconds: transaction.durationSeconds,
    createdAt: transaction.createdAt.toISOString(),
  });

  const registryStatus = sheetsLogged
    ? "✅ Закреплено в Казначействе"
    : "⚠️ Реестр временно недоступен";

  const taxNote = treasuryTax > 0 ? `\n🏦 Налог Казначейства: *${treasuryTax.toFixed(2)} Д* (2%)` : "";

  const notifyFrom =
    `🏛 *Казначейство TimeNation*\n\n` +
    `Транзакция завершена: *${actualMinutes.toFixed(2)} Д* → *${toCitizen.name}*.${taxNote}\n\n` +
    `${registryStatus}`;

  const notifyTo =
    `🏛 *Казначейство TimeNation*\n\n` +
    `Получено *${toReceives.toFixed(2)} Д* от *${fromCitizen.name}*.${taxNote}\n\n` +
    `💰 Ваш новый баланс: *${(toCitizen.balanceMinutes + toReceives).toFixed(2)} Д*\n\n` +
    `${registryStatus}`;

  const meritResult = await applyMeritAfterSession(session.fromCitizenId, actualMinutes).catch((err) => {
    req.log.error({ err }, "Merit calculation failed");
    return null;
  });

  let rankMessage = "";
  if (meritResult) {
    const { oldRank, newRank, meritGained, newScore } = meritResult;
    if (newRank !== oldRank) {
      rankMessage = `\n\n📜 *Статус изменён!* Вы теперь *${newRank}*. Ваше влияние в TimeNation растёт.`;
    } else {
      rankMessage = `\n\nВес +${meritGained.toFixed(2)}. Текущий ранг: *${newRank}* (${newScore} Merit)`;
    }
  }

  await Promise.all([
    sendTransactionNotification(session.fromCitizenId, notifyFrom + rankMessage),
    sendTransactionNotification(session.toCitizenId, notifyTo),
  ]);

  res.json({
    session: {
      ...updatedSession,
      startedAt: updatedSession.startedAt.toISOString(),
      stoppedAt: updatedSession.stoppedAt?.toISOString() ?? null,
    },
    transaction: {
      ...transaction,
      createdAt: transaction.createdAt.toISOString(),
    },
    sheetsLogged,
  });
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, id))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    ...session,
    startedAt: session.startedAt.toISOString(),
    stoppedAt: session.stoppedAt?.toISOString() ?? null,
  });
});

export default router;
