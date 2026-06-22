import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dealsTable, citizensTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sendTransactionNotification } from "../services/telegramService";

const router: IRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const CreateDealBody = z.object({
  senderId: z.number().int().positive(),
  receiverId: z.number().int().positive().optional(),
  amount: z.number().int().min(1).max(10000),
  description: z.string().min(5).max(1000),
});

const ProofBody = z.object({
  receiverId: z.number().int().positive(),
  proofText: z.string().max(2000).optional(),
  proofUrl: z.string().url().optional(),
});

const ActorBody = z.object({
  citizenId: z.number().int().positive(),
});

const DisputeBody = z.object({
  citizenId: z.number().int().positive(),
  claimText: z.string().min(10).max(2000).optional(),
});

// ─── POST /api/deals ──────────────────────────────────────────────────────────
// Create a new deal. Immediately locks `amount` from sender's balance (escrow).
router.post("/deals", async (req, res): Promise<void> => {
  const parsed = CreateDealBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { senderId, receiverId, amount, description } = parsed.data;

  const [sender] = await db
    .select({ id: citizensTable.id, balance: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, senderId))
    .limit(1);

  if (!sender) { res.status(404).json({ error: "Отправитель не найден" }); return; }
  if (sender.balance - 1 < amount) {
    // -1 because founding minute cannot be transferred
    res.status(402).json({ error: `Недостаточно Дарминов. Доступно: ${sender.balance - 1} Д` });
    return;
  }

  // Lock minutes in escrow (deduct from sender immediately)
  await db
    .update(citizensTable)
    .set({ balanceMinutes: sender.balance - amount })
    .where(eq(citizensTable.id, senderId));

  const [deal] = await db
    .insert(dealsTable)
    .values({ senderId, receiverId: receiverId ?? null, amount, description, status: "open" })
    .returning();

  req.log.info({ dealId: deal.id, senderId, amount }, "TiMETR escrow deal created");

  // Notify sender
  void sendTransactionNotification(
    senderId,
    `🔒 *Сделка #${deal.id} создана*\n💎 ${amount} Д заморожено в эскроу\n📋 _${description}_`
  );
  // Notify receiver if already assigned
  if (receiverId) {
    void sendTransactionNotification(
      receiverId,
      `📨 *Новая сделка для вас #${deal.id}*\n💰 Награда: ${amount} Д\n📋 _${description}_`
    );
  }

  res.status(201).json(deal);
});

// ─── GET /api/deals?citizenId=X ───────────────────────────────────────────────
router.get("/deals", async (req, res): Promise<void> => {
  const citizenId = z.number().int().positive().safeParse(Number(req.query["citizenId"]));
  if (!citizenId.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const deals = await db
    .select()
    .from(dealsTable)
    .where(or(
      eq(dealsTable.senderId, citizenId.data),
      eq(dealsTable.receiverId, citizenId.data),
    ))
    .orderBy(dealsTable.createdAt);

  res.json({ deals });
});

// ─── GET /api/deals/open ──────────────────────────────────────────────────────
// Open marketplace — deals with no receiver assigned yet
router.get("/deals/open", async (_req, res): Promise<void> => {
  const deals = await db
    .select({
      id: dealsTable.id,
      senderId: dealsTable.senderId,
      senderName: citizensTable.name,
      amount: dealsTable.amount,
      description: dealsTable.description,
      status: dealsTable.status,
      createdAt: dealsTable.createdAt,
    })
    .from(dealsTable)
    .leftJoin(citizensTable, eq(dealsTable.senderId, citizensTable.id))
    .where(eq(dealsTable.status, "open"))
    .orderBy(dealsTable.createdAt);

  res.json({ deals });
});

// ─── GET /api/deals/:id ───────────────────────────────────────────────────────
router.get("/deals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  res.json(deal);
});

// ─── POST /api/deals/:id/accept-task ─────────────────────────────────────────
// Receiver volunteers to take an open deal (assigns themselves).
router.post("/deals/:id/accept-task", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ActorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.status !== "open") { res.status(409).json({ error: `Сделка уже в статусе «${deal.status}»` }); return; }
  if (deal.senderId === parsed.data.citizenId) { res.status(400).json({ error: "Нельзя принять собственную сделку" }); return; }

  const [updated] = await db
    .update(dealsTable)
    .set({ receiverId: parsed.data.citizenId, status: "accepted", updatedAt: new Date() })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id, receiverId: parsed.data.citizenId }, "Deal accepted by receiver");

  // Notify sender that someone took the task
  void sendTransactionNotification(
    deal.senderId,
    `✅ *Сделка #${id} принята исполнителем*\n💰 ${deal.amount} Д в эскроу\n📋 _${deal.description}_`
  );

  res.json(updated);
});

// ─── POST /api/deals/:id/proof ────────────────────────────────────────────────
// Receiver submits Proof-of-Work (text + optional URL).
router.post("/deals/:id/proof", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ProofBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.status !== "accepted") { res.status(409).json({ error: "Доказательство можно отправить только для принятой сделки" }); return; }
  if (deal.receiverId !== parsed.data.receiverId) { res.status(403).json({ error: "Только исполнитель может отправить доказательство" }); return; }
  if (!parsed.data.proofText && !parsed.data.proofUrl) {
    res.status(400).json({ error: "Нужно указать proof_text или proof_url" });
    return;
  }

  const [updated] = await db
    .update(dealsTable)
    .set({
      proofText: parsed.data.proofText ?? null,
      proofUrl: parsed.data.proofUrl ?? null,
      status: "proof_submitted",
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id }, "Proof of work submitted");

  // Notify sender to review the proof
  void sendTransactionNotification(
    deal.senderId,
    `📤 *Доказательство по сделке #${id}*\n${parsed.data.proofText ? `_${parsed.data.proofText.slice(0, 200)}_` : ""}${parsed.data.proofUrl ? `\n🔗 ${parsed.data.proofUrl}` : ""}\n\nПодтвердите или отклоните работу.`
  );

  res.json(updated);
});

// ─── POST /api/deals/:id/complete ─────────────────────────────────────────────
// Sender approves proof → releases escrow to receiver.
router.post("/deals/:id/complete", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ActorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.status !== "proof_submitted") { res.status(409).json({ error: "Нельзя завершить — доказательство ещё не отправлено" }); return; }
  if (deal.senderId !== parsed.data.citizenId) { res.status(403).json({ error: "Только отправитель может подтвердить сделку" }); return; }
  if (!deal.receiverId) { res.status(409).json({ error: "Получатель не назначен" }); return; }

  // Release escrow: credit receiver
  const [receiver] = await db
    .select({ balance: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, deal.receiverId))
    .limit(1);

  if (!receiver) { res.status(404).json({ error: "Получатель не найден" }); return; }

  await db
    .update(citizensTable)
    .set({ balanceMinutes: receiver.balance + deal.amount })
    .where(eq(citizensTable.id, deal.receiverId));

  const [updated] = await db
    .update(dealsTable)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id, receiverId: deal.receiverId, amount: deal.amount }, "Deal completed, escrow released");

  // Notify receiver — payout confirmed
  void sendTransactionNotification(
    deal.receiverId,
    `🎉 *Сделка #${id} завершена!*\n💎 +${deal.amount} Д зачислено на ваш баланс\n📋 _${deal.description}_`
  );

  res.json(updated);
});

// ─── POST /api/deals/:id/decline ──────────────────────────────────────────────
// Sender declines proof → escrow stays locked, status = declined (dispute phase).
router.post("/deals/:id/decline", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ActorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.status !== "proof_submitted") { res.status(409).json({ error: "Нечего отклонять — доказательство не отправлено" }); return; }
  if (deal.senderId !== parsed.data.citizenId) { res.status(403).json({ error: "Только отправитель может отклонить сделку" }); return; }

  const [updated] = await db
    .update(dealsTable)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id }, "Deal declined by sender — escrow remains locked");

  // Notify receiver — proof rejected
  if (deal.receiverId) {
    void sendTransactionNotification(
      deal.receiverId,
      `❌ *Доказательство по сделке #${id} отклонено*\n💎 ${deal.amount} Д остаются заморожены\n📋 _${deal.description}_\n\nВы можете открыть спор.`
    );
  }

  res.json({ ...updated, note: "Эскроу заморожен. Откройте спор или отмените сделку для возврата." });
});

// ─── POST /api/deals/:id/cancel ───────────────────────────────────────────────
// Sender cancels deal (open or declined) → returns escrow to sender.
router.post("/deals/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = ActorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (!["open", "declined"].includes(deal.status)) {
    res.status(409).json({ error: `Нельзя отменить сделку в статусе «${deal.status}»` });
    return;
  }
  if (deal.senderId !== parsed.data.citizenId) { res.status(403).json({ error: "Только отправитель может отменить сделку" }); return; }

  // Return escrow to sender
  const [sender] = await db
    .select({ balance: citizensTable.balanceMinutes })
    .from(citizensTable)
    .where(eq(citizensTable.id, deal.senderId))
    .limit(1);

  if (!sender) { res.status(404).json({ error: "Отправитель не найден" }); return; }

  await db
    .update(citizensTable)
    .set({ balanceMinutes: sender.balance + deal.amount })
    .where(eq(citizensTable.id, deal.senderId));

  const [updated] = await db
    .update(dealsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id, senderId: deal.senderId, refunded: deal.amount }, "Deal cancelled, escrow returned to sender");

  // Notify sender — funds returned
  void sendTransactionNotification(
    deal.senderId,
    `↩️ *Сделка #${id} отменена*\n💎 +${deal.amount} Д возвращено на ваш баланс\n📋 _${deal.description}_`
  );

  res.json(updated);
});

// ─── POST /api/deals/:id/dispute ─────────────────────────────────────────────
// Either party flags the deal for arbitration. Gemini acts as ИИ-Арбитр Минтруда.
router.post("/deals/:id/dispute", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = DisputeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (!["accepted", "proof_submitted", "declined"].includes(deal.status)) {
    res.status(409).json({ error: "Спор можно открыть только для активной сделки" });
    return;
  }
  if (deal.senderId !== parsed.data.citizenId && deal.receiverId !== parsed.data.citizenId) {
    res.status(403).json({ error: "Только участник сделки может открыть спор" });
    return;
  }

  // ── Gemini AI Arbitration (ИИ-Арбитр Минтруда) ───────────────────────────
  let aiVerdict: string | null = null;
  const claimText = parsed.data.claimText;
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (apiKey && claimText) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `Ты — ИИ-Арбитр Министерства Труда суверенного государства TimeNation. Твоя задача — справедливо разобрать конфликт между гражданами.

ПАРАМЕТРЫ СДЕЛКИ:
Техническое задание (ТЗ): ${deal.description}
Сумма сделки: ${deal.amount} Дарминов (заморожены в эскроу)
Статус на момент спора: ${deal.status}
${deal.proofText ? `Доказательство исполнителя: ${deal.proofText}` : "Доказательство работы: не предоставлено"}
${deal.proofUrl ? `Ссылка на доказательство: ${deal.proofUrl}` : ""}

СУТЬ ПРЕТЕНЗИИ:
${claimText}

ТВОЁ ЗАДАНИЕ:
Проанализируй ситуацию и выдай официальное заключение арбитра (строго до 250 слов):
1. Оценка ситуации — соответствует ли доказательство ТЗ?
2. Рекомендация — кому вернуть Дармины и на каком основании?
3. Финальный вердикт для офицера Минтруда: [ВЕРНУТЬ ЗАКАЗЧИКУ / ВЫПЛАТИТЬ ИСПОЛНИТЕЛЮ / РАЗДЕЛИТЬ ПОПОЛАМ]

Пиши официально, нейтрально, по существу.`;

      const result = await model.generateContent(prompt);
      aiVerdict = result.response.text();
      req.log.info({ dealId: id }, "Gemini arbitration verdict generated");
    } catch (err) {
      req.log.error({ err }, "Gemini arbitration failed, proceeding without verdict");
    }
  }

  const [updated] = await db
    .update(dealsTable)
    .set({
      status: "disputed",
      disputeClaimText: claimText ?? null,
      aiVerdict: aiVerdict ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, id))
    .returning();

  req.log.info({ dealId: id, initiatorId: parsed.data.citizenId }, "Deal disputed");

  // Notify both parties about the dispute
  const otherPartyId = parsed.data.citizenId === deal.senderId ? deal.receiverId : deal.senderId;
  void sendTransactionNotification(
    parsed.data.citizenId,
    `⚖️ *Спор по сделке #${id} открыт*\n${aiVerdict ? `\n🤖 *Вердикт ИИ-Арбитра:*\n_${aiVerdict.slice(0, 500)}_` : "ИИ-арбитраж недоступен — ожидайте решения вручную."}`
  );
  if (otherPartyId) {
    void sendTransactionNotification(
      otherPartyId,
      `⚖️ *По сделке #${id} открыт спор*\n💎 ${deal.amount} Д заморожено до решения арбитра\n📋 _${deal.description}_${aiVerdict ? `\n\n🤖 *Вердикт ИИ-Арбитра:*\n_${aiVerdict.slice(0, 500)}_` : ""}`
    );
  }

  res.json(updated);
});

export default router;
