import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable, citizensTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import {
  ensureSlotsForDate,
  getFingerprint,
  generateSovereignUrl,
  isRetroSlot,
  isValidDate,
  BURN_MATRIX,
  type SlotType,
} from "../services/tvService";
import { renderCapsule, MEDIA_DIR } from "../services/renderService";
import {
  isCryptomusConfigured,
  createCryptoPayment,
  verifyCryptomusWebhook,
} from "../services/cryptomusService";
import { sanctionsMiddleware } from "../middleware/sanctions";
import { moderateText } from "../middleware/moderation";
import fs from "fs";
import path from "path";

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];

const router: IRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const BookSlotBody = z.object({
  slotId: z.number().int().positive(),
  citizenId: z.number().int().positive(),
  paymentType: z.enum(["fiat", "timeltr"]),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});

const VISUAL_STYLES = ["space", "cyberpunk", "abstract", "nature", "minimal"] as const;
type VisualStyle = typeof VISUAL_STYLES[number];

const CreateCapsuleBody = z.object({
  citizenId: z.number().int().positive(),
  seedText: z.string().max(500).optional(),
  mode: z.enum(["a", "b"]).default("a"),
  renderPath: z.enum(["light", "heavy"]).default("light"),
  broadcastPolicy: z.enum(["echo", "noise", "private"]).default("noise"),
  contentState: z.enum(["filled", "empty"]).default("filled"),
  hasSovereignLink: z.boolean().default(false),
  // Shariah/anti-Gharar: visual style chosen BEFORE render makes service deterministic
  visualStyle: z.enum(VISUAL_STYLES).optional(),
});

const UpdateCapsuleBody = z.object({
  seedText: z.string().max(500).optional(),
  mode: z.enum(["a", "b"]).optional(),
  renderPath: z.enum(["light", "heavy"]).optional(),
  broadcastPolicy: z.enum(["echo", "noise", "private"]).optional(),
  contentState: z.enum(["filled", "empty"]).optional(),
  hasSovereignLink: z.boolean().optional(),
  visualStyle: z.enum(VISUAL_STYLES).optional(),
});

// ─── GET /api/tv/slots?date=YYYY-MM-DD ────────────────────────────────────────
// Returns all 1440 slots for a given date; generates them on first request.
router.get("/tv/slots", async (req, res): Promise<void> => {
  const date = (req.query["date"] as string | undefined) ?? "";
  if (!isValidDate(date)) {
    res.status(400).json({ error: "Параметр date обязателен в формате YYYY-MM-DD" });
    return;
  }

  await ensureSlotsForDate(date);

  const slots = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.date, date))
    .orderBy(tvSlotsTable.minuteIndex);

  // Enrich with derived fields
  const enriched = slots.map((s) => ({
    ...s,
    isRetro: isRetroSlot(s.date, s.minuteIndex),
    hourLabel: String(Math.floor(s.minuteIndex / 60)).padStart(2, "0"),
    minLabel: String(s.minuteIndex % 60).padStart(2, "0"),
  }));

  res.json({ date, count: enriched.length, slots: enriched });
});

// ─── GET /api/tv/slots/:id ────────────────────────────────────────────────────
router.get("/tv/slots/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const [slot] = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.id, id))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Слот не найден" }); return; }

  res.json({
    ...slot,
    isRetro: isRetroSlot(slot.date, slot.minuteIndex),
    pricing: BURN_MATRIX[slot.slotType as SlotType],
  });
});

// ─── POST /api/tv/slots/book ──────────────────────────────────────────────────
// paymentType=fiat   → Stripe EUR checkout session
// paymentType=timeltr → instant hard burn from citizen balance
router.post("/tv/slots/book", async (req, res): Promise<void> => {
  const parsed = BookSlotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { slotId, citizenId, paymentType, successUrl, cancelUrl } = parsed.data;

  // Load slot
  const [slot] = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.id, slotId))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Слот не найден" }); return; }
  if (slot.status !== "free") {
    res.status(409).json({ error: "Слот уже забронирован" });
    return;
  }

  // Load citizen
  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  // Anti-consecutive guard
  const fingerprint = getFingerprint(req);
  const adjacent = await db
    .select({ id: tvSlotsTable.id })
    .from(tvSlotsTable)
    .where(
      and(
        eq(tvSlotsTable.date, slot.date),
        inArray(tvSlotsTable.minuteIndex, [slot.minuteIndex - 1, slot.minuteIndex + 1]),
        eq(tvSlotsTable.status, "booked"),
        eq(tvSlotsTable.fingerprintHash, fingerprint)
      )
    );

  if (adjacent.length > 0) {
    res.status(400).json({
      error: "Нельзя бронировать соседние минуты подряд (anti-consecutive rule)",
    });
    return;
  }

  // ── TiMETR hard burn ──────────────────────────────────────────────────────
  if (paymentType === "timeltr") {
    const burnCost = slot.timeltrBurnCost;
    const transferable = citizen.balanceMinutes - 1; // Родовая минута неприкосновенна
    if (burnCost > transferable) {
      res.status(400).json({
        error: `Недостаточно Дарминов. Нужно ${burnCost} Д, доступно ${transferable} Д`,
      });
      return;
    }

    // Hard burn — постоянное списание
    await db
      .update(citizensTable)
      .set({ balanceMinutes: citizen.balanceMinutes - burnCost })
      .where(eq(citizensTable.id, citizenId));

    await db
      .update(tvSlotsTable)
      .set({
        status: "booked",
        ownerId: citizenId,
        paymentType: "timeltr",
        fingerprintHash: fingerprint,
      })
      .where(eq(tvSlotsTable.id, slotId));

    req.log.info({ citizenId, slotId, burnCost }, "TV slot booked via TiMETR burn");
    res.status(201).json({ ok: true, slotId, burnCost, paymentType: "timeltr" });
    return;
  }

  // ── Fiat (Stripe EUR) ─────────────────────────────────────────────────────
  if (!STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Stripe не настроен. Установите STRIPE_SECRET_KEY." });
    return;
  }

  const pricing = BURN_MATRIX[slot.slotType as SlotType];
  const finalSuccessUrl =
    successUrl ??
    `${req.protocol}://${req.get("host")}/api/tv/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`;
  const finalCancelUrl = cancelUrl ?? `${req.protocol}://${req.get("host")}/api/tv/checkout/cancel`;

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const hour = String(Math.floor(slot.minuteIndex / 60)).padStart(2, "0");
  const min = String(slot.minuteIndex % 60).padStart(2, "0");

  // Billing descriptor: SaaS / compute-utility framing (prevents merchant account suspension)
  const billingDescriptor =
    `Compute-Time Utility Token — TimeNation SaaS Infrastructure | ` +
    `Slot ${slot.date} ${hour}:${min} UTC | ${pricing.label}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Compute-Time Utility Token — TimeNation SaaS Infrastructure",
            description:
              `AI media synthesis compute-slot access. Slot: ${slot.date} ${hour}:${min} UTC — ` +
              `${pricing.label}. Non-monetary SaaS infrastructure access token. ` +
              `Not a security, financial instrument, or real-world asset.`,
          },
          unit_amount: pricing.priceEurCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: finalSuccessUrl,
    cancel_url: finalCancelUrl,
    metadata: {
      type: "tv_slot",
      slotId: String(slotId),
      citizenId: String(citizenId),
      fingerprintHash: fingerprint,
      billingDescriptor,
    },
    client_reference_id: String(citizenId),
  });

  // Save session ID + billing descriptor so webhook can match it
  await db
    .update(tvSlotsTable)
    .set({ stripeSessionId: session.id, billingDescriptor })
    .where(eq(tvSlotsTable.id, slotId));

  req.log.info({ citizenId, slotId, sessionId: session.id }, "TV slot Stripe checkout created");
  res.json({ url: session.url, sessionId: session.id });
});

// ─── POST /api/tv/slots/book-crypto ──────────────────────────────────────────
// Pathway B: create a Cryptomus stablecoin (USDT/USDC) payment order.
// Returns { paymentUrl, paymentUuid } — frontend redirects user to paymentUrl.
// Cryptomus calls POST /api/tv/crypto/webhook when paid.
const BookCryptoBody = z.object({
  slotId: z.number().int().positive(),
  citizenId: z.number().int().positive(),
  successUrl: z.string().optional(),
});

router.post("/tv/slots/book-crypto", sanctionsMiddleware, async (req, res): Promise<void> => {
  if (!isCryptomusConfigured()) {
    res.status(503).json({
      error: "Крипто-шлюз не настроен. Установите CRYPTOMUS_MERCHANT_ID и CRYPTOMUS_API_KEY.",
    });
    return;
  }

  const parsed = BookCryptoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { slotId, citizenId, successUrl } = parsed.data;

  const [slot] = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.id, slotId))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Слот не найден" }); return; }
  if (slot.status !== "free") { res.status(409).json({ error: "Слот уже занят" }); return; }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);
  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  const pricing = BURN_MATRIX[slot.slotType as SlotType];
  // Convert EUR cents → USD (approx: 1 EUR ≈ 1.08 USD for conservative estimate)
  const amountUsd = (pricing.priceEurCents / 100 * 1.08).toFixed(2);

  const hour = String(Math.floor(slot.minuteIndex / 60)).padStart(2, "0");
  const min = String(slot.minuteIndex % 60).padStart(2, "0");
  const billingDescriptor =
    `Compute-Time Utility Token — TimeNation SaaS | Slot ${slot.date} ${hour}:${min} UTC | ${pricing.label}`;

  const host = `${req.protocol}://${req.get("host")}`;
  const callbackUrl = `${host}/api/tv/crypto/webhook`;
  const finalSuccessUrl = successUrl ?? `${host}/api/tv/checkout/success`;

  const payment = await createCryptoPayment({
    orderId: `slot_${slotId}_c${citizenId}_${Date.now()}`,
    amountUsd,
    billingDescriptor,
    callbackUrl,
    successUrl: finalSuccessUrl,
  });

  // Mark slot as pending crypto payment
  await db
    .update(tvSlotsTable)
    .set({
      cryptoPaymentUuid: payment.uuid,
      paymentStatus: "pending",
      billingDescriptor,
      paymentType: "crypto",
    })
    .where(eq(tvSlotsTable.id, slotId));

  req.log.info(
    { slotId, citizenId, uuid: payment.uuid, amountUsd },
    "Cryptomus payment created for TV slot"
  );

  res.status(201).json({
    paymentUrl: payment.url,
    paymentUuid: payment.uuid,
    amountUsd,
    currency: payment.currency,
  });
});

// ─── POST /api/tv/crypto/webhook ──────────────────────────────────────────────
// Cryptomus calls this URL when payment status changes.
// Confirms slot booking and records paymentStatus='completed'.
router.post("/tv/crypto/webhook", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const incomingSign = (req.headers["sign"] ?? body["sign"] ?? "") as string;

  if (!verifyCryptomusWebhook(body, incomingSign)) {
    req.log.warn({ body }, "Cryptomus webhook signature mismatch");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  const uuid = body["uuid"] as string | undefined;
  const status = body["status"] as string | undefined;
  const citizenIdRaw = (body["order_id"] as string | undefined)?.match(/c(\d+)/)?.[1];

  req.log.info({ uuid, status }, "Cryptomus webhook received");

  if (!uuid || status !== "paid") {
    // Not yet paid — acknowledge but don't unlock
    res.json({ ok: true });
    return;
  }

  const citizenId = citizenIdRaw ? parseInt(citizenIdRaw, 10) : null;

  // Find slot by cryptoPaymentUuid
  const [slot] = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.cryptoPaymentUuid, uuid))
    .limit(1);

  if (!slot) {
    req.log.warn({ uuid }, "Cryptomus webhook: slot not found");
    res.json({ ok: true });
    return;
  }

  if (slot.status === "free") {
    await db
      .update(tvSlotsTable)
      .set({
        status: "booked",
        ownerId: citizenId ?? slot.ownerId,
        paymentType: "crypto",
        paymentStatus: "completed",
      })
      .where(eq(tvSlotsTable.id, slot.id));

    req.log.info(
      { slotId: slot.id, uuid, citizenId },
      "TV slot confirmed via Cryptomus webhook"
    );
  }

  res.json({ ok: true });
});

// ─── GET /api/tv/checkout/confirm?session_id=... ──────────────────────────────
// Stripe redirects here after successful payment; confirms slot booking.
router.get("/tv/checkout/confirm", async (req, res): Promise<void> => {
  const sessionId = req.query["session_id"] as string | undefined;
  if (!sessionId || !STRIPE_SECRET_KEY) {
    res.status(400).send("<h1>Ошибка подтверждения</h1>");
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    res.status(400).send("<h1>Недействительная сессия</h1>");
    return;
  }

  if (session.payment_status !== "paid") {
    res.status(402).send("<h1>Оплата не завершена</h1>");
    return;
  }

  const slotId = parseInt(session.metadata?.["slotId"] ?? "", 10);
  const citizenId = parseInt(session.metadata?.["citizenId"] ?? "", 10);
  const fingerprintHash = session.metadata?.["fingerprintHash"] ?? null;

  if (!isNaN(slotId) && !isNaN(citizenId)) {
    const [slot] = await db
      .select()
      .from(tvSlotsTable)
      .where(eq(tvSlotsTable.id, slotId))
      .limit(1);

    if (slot && slot.status === "free") {
      await db
        .update(tvSlotsTable)
        .set({
          status: "booked",
          ownerId: citizenId,
          paymentType: "fiat",
          paymentStatus: "completed",
          stripeSessionId: sessionId,
          fingerprintHash,
        })
        .where(eq(tvSlotsTable.id, slotId));

      logger.info({ citizenId, slotId, sessionId }, "TV slot confirmed after Stripe payment");
    }
  }

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Слот забронирован</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1B2A;font-family:system-ui,sans-serif;color:#E8EDF2}.c{text-align:center;padding:40px}.icon{font-size:64px}.t{font-size:24px;font-weight:700;color:#C9A84C;margin:12px 0}.s{opacity:.7;margin:0 0 8px}.n{font-size:13px;opacity:.45}</style>
</head><body><div class="c"><div class="icon">📡</div><h1 class="t">Слот активирован!</h1><p class="s">Вернись в приложение — настрой капсулу.</p><p class="n">Закрой эту вкладку</p></div></body></html>`);
});

// ─── GET /api/tv/checkout/cancel ──────────────────────────────────────────────
router.get("/tv/checkout/cancel", (_req, res): void => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Отменено</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1B2A;font-family:system-ui,sans-serif;color:#E8EDF2}.c{text-align:center;padding:40px}.icon{font-size:64px}.t{font-size:24px;font-weight:700;color:#6B7E93;margin:12px 0}.s{opacity:.7}</style>
</head><body><div class="c"><div class="icon">❌</div><h1 class="t">Бронирование отменено</h1><p class="s">Вернись в приложение и попробуй снова.</p></div></body></html>`);
});

// ─── GET /api/tv/capsule/:slotId ──────────────────────────────────────────────
router.get("/tv/capsule/:slotId", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["slotId"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slotId" }); return; }

  const [capsule] = await db
    .select()
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.slotId, slotId))
    .limit(1);

  if (!capsule) { res.status(404).json({ error: "Капсула не найдена" }); return; }
  res.json(capsule);
});

// ─── POST /api/tv/capsule/:slotId ─────────────────────────────────────────────
// Create a capsule for an already-booked slot.
router.post("/tv/capsule/:slotId", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["slotId"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slotId" }); return; }

  const parsed = CreateCapsuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { citizenId, seedText, mode, renderPath, broadcastPolicy, contentState, hasSovereignLink, visualStyle } =
    parsed.data;

  // Verify slot ownership
  const [slot] = await db
    .select()
    .from(tvSlotsTable)
    .where(and(eq(tvSlotsTable.id, slotId), eq(tvSlotsTable.status, "booked")))
    .limit(1);

  if (!slot) {
    res.status(404).json({ error: "Забронированный слот не найден" });
    return;
  }
  if (slot.ownerId !== citizenId) {
    res.status(403).json({ error: "Только владелец слота может создать капсулу" });
    return;
  }

  // Check for existing capsule
  const [existing] = await db
    .select({ id: tvCapsulesTable.id })
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.slotId, slotId))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Капсула для этого слота уже существует. Используй PATCH." });
    return;
  }

  const sovereignUrl = hasSovereignLink
    ? generateSovereignUrl(slot.date, slot.minuteIndex)
    : null;

  const retro = isRetroSlot(slot.date, slot.minuteIndex);

  const [capsule] = await db
    .insert(tvCapsulesTable)
    .values({
      slotId,
      citizenId,
      seedText: seedText ?? null,
      mode,
      renderPath,
      broadcastPolicy,
      contentState,
      hasSovereignLink,
      sovereignUrl,
      visualStyle: visualStyle ?? null,
      isRetro: retro,
      status: "draft",
    })
    .returning();

  req.log.info({ slotId, citizenId, broadcastPolicy, isRetro: retro }, "TV capsule created");
  res.status(201).json(capsule);
});

// ─── PATCH /api/tv/capsule/:slotId ────────────────────────────────────────────
// Update an existing capsule (seed, mode, policies).
router.patch("/tv/capsule/:slotId", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["slotId"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slotId" }); return; }

  const citizenId = z.number().int().positive().safeParse(req.body?.citizenId);
  if (!citizenId.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const parsed = UpdateCapsuleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [capsule] = await db
    .select()
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.slotId, slotId))
    .limit(1);

  if (!capsule) { res.status(404).json({ error: "Капсула не найдена" }); return; }
  if (capsule.citizenId !== citizenId.data) {
    res.status(403).json({ error: "Только владелец может редактировать капсулу" });
    return;
  }
  if (capsule.status === "broadcast") {
    res.status(409).json({ error: "Нельзя редактировать уже вышедшую в эфир капсулу" });
    return;
  }

  const { seedText, mode, renderPath, broadcastPolicy, contentState, hasSovereignLink, visualStyle } =
    parsed.data;

  // Regenerate sovereign URL if requested
  let sovereignUrl = capsule.sovereignUrl;
  if (hasSovereignLink === true && !capsule.hasSovereignLink) {
    const [slot] = await db
      .select()
      .from(tvSlotsTable)
      .where(eq(tvSlotsTable.id, slotId))
      .limit(1);
    if (slot) sovereignUrl = generateSovereignUrl(slot.date, slot.minuteIndex);
  } else if (hasSovereignLink === false) {
    sovereignUrl = null;
  }

  const [updated] = await db
    .update(tvCapsulesTable)
    .set({
      ...(seedText !== undefined && { seedText }),
      ...(mode !== undefined && { mode }),
      ...(renderPath !== undefined && { renderPath }),
      ...(broadcastPolicy !== undefined && { broadcastPolicy }),
      ...(contentState !== undefined && { contentState }),
      ...(hasSovereignLink !== undefined && { hasSovereignLink, sovereignUrl }),
      ...(visualStyle !== undefined && { visualStyle }),
      updatedAt: new Date(),
    })
    .where(eq(tvCapsulesTable.slotId, slotId))
    .returning();

  req.log.info({ slotId, citizenId: citizenId.data }, "TV capsule updated");
  res.json(updated);
});

// ─── GET /api/tv/moment/:date/:time ───────────────────────────────────────────
// Look up capsule by sovereign URL path (e.g. /api/tv/moment/1972-06-09/0930)
router.get("/tv/moment/:date/:time", async (req, res): Promise<void> => {
  const { date, time } = req.params as { date: string; time: string };
  if (!isValidDate(date) || !/^\d{4}$/.test(time)) {
    res.status(400).json({ error: "Формат: /api/tv/moment/YYYY-MM-DD/HHmm" });
    return;
  }

  const sovereignUrl = `timenation.tv/moment/${date}-${time}`;
  const [capsule] = await db
    .select()
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.sovereignUrl, sovereignUrl))
    .limit(1);

  if (!capsule) {
    res.status(404).json({ error: "Момент не найден. Возможно, капсула приватная или не существует." });
    return;
  }

  if (capsule.broadcastPolicy === "private") {
    res.status(403).json({ error: "Этот момент отмечен как Absolute Privacy." });
    return;
  }

  res.json({ sovereignUrl, capsule });
});

// ─── GET /api/tv/schedule?date=YYYY-MM-DD ────────────────────────────────────
// Broadcast schedule: booked + noise-pool slots for the day
router.get("/tv/schedule", async (req, res): Promise<void> => {
  const date = (req.query["date"] as string | undefined) ?? "";
  if (!isValidDate(date)) {
    res.status(400).json({ error: "Параметр date обязателен в формате YYYY-MM-DD" });
    return;
  }

  await ensureSlotsForDate(date);

  const slots = await db
    .select({
      id: tvSlotsTable.id,
      minuteIndex: tvSlotsTable.minuteIndex,
      slotType: tvSlotsTable.slotType,
      status: tvSlotsTable.status,
      ownerId: tvSlotsTable.ownerId,
      ownerName: citizensTable.name,
    })
    .from(tvSlotsTable)
    .leftJoin(citizensTable, eq(tvSlotsTable.ownerId, citizensTable.id))
    .where(eq(tvSlotsTable.date, date))
    .orderBy(tvSlotsTable.minuteIndex);

  const booked = slots.filter((s) => s.status === "booked");
  const free = slots.filter((s) => s.status === "free");

  res.json({
    date,
    total: slots.length,
    booked: booked.length,
    free: free.length,
    slots,
  });
});

// ─── POST /api/tv/capsule/:slotId/render ──────────────────────────────────────
// Trigger LIGHT render pipeline: Mode A/B manifesto → ElevenLabs TTS → FFmpeg
router.post("/tv/capsule/:slotId/render", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["slotId"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slotId" }); return; }

  const citizenId = z.number().int().positive().safeParse(req.body?.citizenId);
  if (!citizenId.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  // Verify ownership
  const [capsule] = await db
    .select()
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.slotId, slotId))
    .limit(1);

  if (!capsule) { res.status(404).json({ error: "Капсула не найдена" }); return; }
  if (capsule.citizenId !== citizenId.data) {
    res.status(403).json({ error: "Только владелец может запустить рендер" });
    return;
  }
  if (capsule.status === "pending_render") {
    res.status(409).json({ error: "Рендер уже запущен" });
    return;
  }
  if (capsule.status === "broadcast") {
    res.status(409).json({ error: "Капсула уже в эфире" });
    return;
  }

  // ── Age verification (COPPA / EU DSA) ──────────────────────────────────────
  const [citizenRecord] = await db
    .select({ ageVerified: citizensTable.ageVerified })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId.data))
    .limit(1);

  if (!citizenRecord) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }
  if (!citizenRecord.ageVerified) {
    res.status(403).json({
      error: "Для генерации AI-контента необходимо подтвердить возраст 18+.",
      code: "AGE_VERIFICATION_REQUIRED",
    });
    return;
  }

  // ── Sanctions check (OFAC / international compliance) ──────────────────────
  await new Promise<void>((resolve, reject) => {
    sanctionsMiddleware(req, res, (err?: unknown) => {
      if (err) reject(err); else resolve();
    });
  }).catch(() => { /* res already sent by middleware */ });
  if (res.headersSent) return;

  // ── Content moderation (EU DSA / US/RU/CN frameworks) ───────────────────────
  if (capsule.seedText) {
    const modResult = moderateText(capsule.seedText);
    if (!modResult.allowed) {
      res.status(422).json({
        error: "Ваш текст не прошел проверку глобальной безопасности контента.",
        code: "CONTENT_MODERATION_BLOCK",
      });
      return;
    }
  }

  req.log.info({ slotId, citizenId: citizenId.data, mode: capsule.mode }, "Render triggered");

  // Run render synchronously for MVP (typically < 15s for 60s clip)
  try {
    const result = await renderCapsule(slotId);
    res.json({
      ok: true,
      slotId,
      status: result.status,
      mediaUrl: result.mediaUrl,
      catcastUrl: result.catcastUrl ?? null,
      manifestoWords: result.manifestoText.split(/\s+/).filter(Boolean).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, slotId }, "Render failed");
    res.status(500).json({ error: `Ошибка рендера: ${msg}` });
  }
});

// ─── POST /api/tv/capsule/:id/report  (DMCA / takedown) ───────────────────────
// US DMCA § 512 notice-and-takedown: immediately suspends capsule from public view.
router.post("/tv/capsule/:id/report", async (req, res): Promise<void> => {
  const capsuleId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(capsuleId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const bodySchema = z.object({
    reason: z.string().min(1).max(2000),
    reporterEmail: z.string().email().optional(),
    copyrightOwner: z.string().max(200).optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "reason обязателен" }); return; }

  const [capsule] = await db
    .select({ id: tvCapsulesTable.id, reportStatus: tvCapsulesTable.reportStatus })
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.id, capsuleId))
    .limit(1);

  if (!capsule) { res.status(404).json({ error: "Капсула не найдена" }); return; }
  if (capsule.reportStatus === "removed") {
    res.status(410).json({ error: "Контент уже удалён" });
    return;
  }

  const reportNote = [
    body.data.reason,
    body.data.copyrightOwner ? `Copyright owner: ${body.data.copyrightOwner}` : null,
    body.data.reporterEmail ? `Reporter: ${body.data.reporterEmail}` : null,
  ].filter(Boolean).join(" | ");

  await db
    .update(tvCapsulesTable)
    .set({
      isReported: true,
      reportStatus: "suspended",
      reportReason: reportNote,
      updatedAt: new Date(),
    })
    .where(eq(tvCapsulesTable.id, capsuleId));

  req.log.info({ capsuleId, reason: body.data.reason }, "DMCA report filed — capsule suspended");
  res.json({
    ok: true,
    message: "Жалоба принята. Контент временно скрыт до проверки.",
    capsuleId,
  });
});

// ─── GET /api/tv/schedule?date=YYYY-MM-DD ────────────────────────────────────
// Public schedule summary: booked slots + capsule render status for a date.
router.get("/tv/schedule", async (req, res): Promise<void> => {
  const date = (req.query["date"] as string | undefined) ?? "";
  if (!isValidDate(date)) {
    res.status(400).json({ error: "Параметр date обязателен в формате YYYY-MM-DD" });
    return;
  }

  await ensureSlotsForDate(date);

  const slots = await db
    .select()
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.date, date))
    .orderBy(tvSlotsTable.minuteIndex);

  const bookedSlots = slots.filter((s) => s.status === "booked" || s.status === "aired");

  // Load capsules for booked slots
  const bookedIds = bookedSlots.map((s) => s.id);
  const capsules =
    bookedIds.length > 0
      ? await db
          .select()
          .from(tvCapsulesTable)
          .where(inArray(tvCapsulesTable.slotId, bookedIds))
      : [];
  const capsuleBySlot = new Map(capsules.map((c) => [c.slotId, c]));

  // Load owner names
  const ownerIds = [...new Set(bookedSlots.map((s) => s.ownerId).filter(Boolean))] as number[];
  const owners =
    ownerIds.length > 0
      ? await db
          .select({ id: citizensTable.id, name: citizensTable.name })
          .from(citizensTable)
          .where(inArray(citizensTable.id, ownerIds))
      : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

  const schedule = bookedSlots.map((s) => {
    const capsule = capsuleBySlot.get(s.id);
    return {
      slotId: s.id,
      minuteIndex: s.minuteIndex,
      slotType: s.slotType,
      hourLabel: String(Math.floor(s.minuteIndex / 60)).padStart(2, "0"),
      minLabel: String(s.minuteIndex % 60).padStart(2, "0"),
      ownerName: s.ownerId ? (ownerMap.get(s.ownerId) ?? null) : null,
      hasRenderedVideo: !!(capsule?.mediaUrl),
      catcastUrl: capsule?.catcastUrl ?? null,
      mediaUrl: capsule?.mediaUrl ?? null,
      isRetro: isRetroSlot(s.date, s.minuteIndex),
    };
  });

  res.json({
    date,
    totalSlots: slots.length,
    bookedSlots: bookedSlots.length,
    freeSlots: slots.length - bookedSlots.length,
    schedule,
  });
});

// ─── GET /api/tv/media/:filename ───────────────────────────────────────────────
// Serve generated MP4 files from the media directory
router.get("/tv/media/:filename", (req, res): void => {
  const filename = req.params["filename"] ?? "";
  if (!filename.endsWith(".mp4") || filename.includes("..") || filename.includes("/")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const filePath = path.join(MEDIA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Медиафайл не найден. Запустите рендер." });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(filePath).pipe(res);
});

export default router;
