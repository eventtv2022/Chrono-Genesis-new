import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { requireAdultKyc, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"];

// ── Discount engine (shared logic, server is source of truth) ─────────────────

export function calcDarminDiscount(amount: number): number {
  if (amount > 10000) return 10;
  if (amount >= 5000) return 8;
  if (amount >= 1000) return 7;
  if (amount >= 500)  return 6;
  if (amount >= 100)  return 5;
  return 0;
}

export function calcDarminPrice(amount: number): {
  discountPct: number;
  baseEur: number;
  totalEur: number;
  totalCents: number;
  eurPerDarmin: number;
} {
  const discountPct = calcDarminDiscount(amount);
  const baseEur = amount;
  const totalEur = parseFloat((amount * (1 - discountPct / 100)).toFixed(2));
  const totalCents = Math.round(totalEur * 100);
  const eurPerDarmin = parseFloat((totalEur / amount).toFixed(4));
  return { discountPct, baseEur, totalEur, totalCents, eurPerDarmin };
}

// ── Legacy packages (kept for backward compat) ────────────────────────────────

export const MINUTE_PACKAGES = [
  { id: "pack_100",  minutes: 100,  price: 95,  currency: "eur", label: "100 Дарминов",  discountPct: 5 },
  { id: "pack_500",  minutes: 500,  price: 470, currency: "eur", label: "500 Дарминов",  discountPct: 6 },
  { id: "pack_1000", minutes: 1000, price: 930, currency: "eur", label: "1000 Дарминов", discountPct: 7 },
] as const;

router.get("/payments/packages", (_req, res) => {
  res.json(MINUTE_PACKAGES);
});

// ── Dynamic checkout (new) ────────────────────────────────────────────────────

const CustomCheckoutBody = z.object({
  citizenId:  z.number().int().positive(),
  amount:     z.number().int().min(1).max(1_000_000),
  successUrl: z.string().url(),
  cancelUrl:  z.string().url(),
});

router.post("/payments/checkout-custom", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  if (!STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Фиатный шлюз не настроен. Установите STRIPE_SECRET_KEY." });
    return;
  }

  const parsed = CustomCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citizenId, amount, successUrl, cancelUrl } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя оплатить от имени другого гражданина" });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  const { discountPct, totalEur, totalCents, eurPerDarmin } = calcDarminPrice(amount);

  if (totalCents < 50) {
    res.status(400).json({ error: "Минимальная сумма — 0.50 €" });
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const discountLabel = discountPct > 0 ? ` (скидка ${discountPct}%)` : "";
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `${amount} Дарминов — TimeNation${discountLabel}`,
            description:
              `SaaS compute-time credits (${amount} units, ${eurPerDarmin} €/unit) for AI media synthesis ` +
              `on TimeNation infrastructure. Non-monetary software utility tokens. ` +
              `Not a security, financial instrument, or real-world asset.`,
          },
          unit_amount: totalCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      citizenId: String(citizenId),
      minutes:   String(amount),
      discountPct: String(discountPct),
      totalEur:  String(totalEur),
    },
    client_reference_id: String(citizenId),
  });

  logger.info(
    { citizenId, amount, discountPct, totalEur, sessionId: session.id },
    "Stripe custom checkout session created"
  );

  res.json({ url: session.url, sessionId: session.id });
});

// ── Legacy fixed-package checkout ─────────────────────────────────────────────

const CheckoutBody = z.object({
  citizenId:  z.number().int().positive(),
  packageId:  z.string(),
  successUrl: z.string(),
  cancelUrl:  z.string(),
});

router.post("/payments/checkout", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  if (!STRIPE_SECRET_KEY) {
    res.status(503).json({ error: "Фиатный шлюз не настроен. Установите STRIPE_SECRET_KEY." });
    return;
  }

  const parsed = CheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citizenId, packageId, successUrl, cancelUrl } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя оплатить от имени другого гражданина" });
    return;
  }

  const pack = MINUTE_PACKAGES.find((p) => p.id === packageId);
  if (!pack) {
    res.status(400).json({ error: `Пакет "${packageId}" не найден` });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: pack.currency,
          product_data: {
            name: "Compute-Time Utility Token — TimeNation SaaS Infrastructure",
            description:
              `SaaS cloud-compute access credits (${pack.minutes} units) for AI media synthesis ` +
              `on TimeNation infrastructure. Non-monetary software utility tokens. ` +
              `Not a security, financial instrument, or real-world asset.`,
          },
          unit_amount: pack.price * 100,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      citizenId: String(citizenId),
      packageId,
      minutes: String(pack.minutes),
    },
    client_reference_id: String(citizenId),
  });

  logger.info(
    { citizenId, packageId, sessionId: session.id },
    "Stripe checkout session created"
  );

  res.json({ url: session.url, sessionId: session.id });
});

// ── Static pages ──────────────────────────────────────────────────────────────

router.get("/payments/success", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оплата прошла</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1B2A;font-family:system-ui,sans-serif;color:#E8EDF2}.card{text-align:center;padding:40px;max-width:380px}.icon{font-size:64px;margin-bottom:16px}.title{font-size:24px;font-weight:700;color:#C9A84C;margin:0 0 12px}.sub{font-size:15px;opacity:.7;margin:0 0 24px}.note{font-size:13px;opacity:.5}</style></head><body><div class="card"><div class="icon">⏳</div><h1 class="title">Минуты зачислены!</h1><p class="sub">Вернись в приложение — баланс обновится автоматически.</p><p class="note">Можно закрыть эту вкладку</p></div></body></html>`);
});

router.get("/payments/cancel", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Отменено</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1B2A;font-family:system-ui,sans-serif;color:#E8EDF2}.card{text-align:center;padding:40px;max-width:380px}.icon{font-size:64px;margin-bottom:16px}.title{font-size:24px;font-weight:700;color:#6B7E93;margin:0 0 12px}.sub{font-size:15px;opacity:.7;margin:0 0 24px}</style></head><body><div class="card"><div class="icon">❌</div><h1 class="title">Платёж отменён</h1><p class="sub">Вернись в приложение и попробуй снова.</p></div></body></html>`);
});

// ── Webhook ───────────────────────────────────────────────────────────────────

router.post("/payments/webhook", async (req, res): Promise<void> => {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook не настроен" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as string | Buffer,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Webhook signature invalid" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: { citizenId?: string; minutes?: string };
      id: string;
    };
    const citizenId = parseInt(session.metadata?.citizenId ?? "", 10);
    const minutes   = parseInt(session.metadata?.minutes   ?? "", 10);

    if (!isNaN(citizenId) && !isNaN(minutes) && minutes > 0) {
      const [citizen] = await db
        .select()
        .from(citizensTable)
        .where(eq(citizensTable.id, citizenId))
        .limit(1);

      if (citizen) {
        await db
          .update(citizensTable)
          .set({ balanceMinutes: citizen.balanceMinutes + minutes })
          .where(eq(citizensTable.id, citizenId));

        logger.info(
          { citizenId, minutes, stripeSessionId: session.id },
          "Minutes credited after Stripe payment"
        );
      }
    }
  }

  res.json({ received: true });
});

export default router;
