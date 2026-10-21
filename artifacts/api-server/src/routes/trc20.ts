/**
 * USDT TRC20 payment routes.
 *
 * Flow:
 *   1. POST /payments/trc20/request  — client requests payment → server returns
 *      { address, amountUsdt, requestId }.
 *   2. POST /payments/trc20/confirm  — client submits txId after on-chain transfer
 *      → server saves txId + notifies admin via Telegram.
 *   3. Admin manually verifies on Tronscan and credits Darmins via admin panel.
 */
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { notifyAdminTrc20Payment } from "../services/telegramService";
import { requireAdultKyc, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// ── Config ────────────────────────────────────────────────────────────────────
export const CREATOR_TRC20_WALLET = "TDLRNKKjNJ5RNuit6Hr7nVta5syzEEwr2q";
export const SYSTEM_FEE_PERCENT   = 0.05; // 5 %

/**
 * Calculate USDT amount for N Darmins.
 *   Base rate: 1 Д = 1 USDT
 *   Progressive discount (mirrors EUR Stripe tiers)
 *   System fee (5 %) added on top of the discounted price.
 */
export function calcUsdtAmount(darmins: number): {
  baseUsdt: number;
  discountPct: number;
  discountedUsdt: number;
  feeUsdt: number;
  totalUsdt: number;
} {
  let discountPct = 0;
  if (darmins > 10000) discountPct = 10;
  else if (darmins >= 5000) discountPct = 8;
  else if (darmins >= 1000) discountPct = 7;
  else if (darmins >= 500)  discountPct = 6;
  else if (darmins >= 100)  discountPct = 5;

  const baseUsdt      = darmins;
  const discountedUsdt = parseFloat((baseUsdt * (1 - discountPct / 100)).toFixed(4));
  const feeUsdt        = parseFloat((discountedUsdt * SYSTEM_FEE_PERCENT).toFixed(4));
  const totalUsdt      = parseFloat((discountedUsdt + feeUsdt).toFixed(4));

  return { baseUsdt, discountPct, discountedUsdt, feeUsdt, totalUsdt };
}

// ── POST /payments/trc20/request ──────────────────────────────────────────────
const RequestBody = z.object({
  citizenId: z.number().int().positive(),
  darmins:   z.number().int().min(1).max(1_000_000),
  purpose:   z.enum(["darmins", "tv_slot", "escrow", "embassy"]).default("darmins"),
  referenceId: z.number().int().optional(),
});

router.post("/payments/trc20/request", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const parsed = RequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citizenId, darmins, purpose, referenceId } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя создать оплату от имени другого гражданина" });
    return;
  }

  const [citizen] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  const pricing = calcUsdtAmount(darmins);

  // Store pending payment record
  let requestId: number | null = null;
  try {
    const result = await db.execute(
      sql`INSERT INTO trc20_payments
            (citizen_id, amount_usdt, darmins, purpose, reference_id, status)
          VALUES (${citizenId}, ${pricing.totalUsdt}, ${darmins}, ${purpose}, ${referenceId ?? null}, 'pending')
          RETURNING id`
    ) as unknown as { rows: { id: number }[] };
    requestId = result.rows?.[0]?.id ?? null;
  } catch (err) {
    logger.error({ err }, "trc20/request: failed to insert record");
    // Non-fatal — continue so user still gets payment info
  }

  req.log.info({ citizenId, darmins, purpose, requestId }, "TRC20 payment request created");

  res.json({
    requestId,
    address:      CREATOR_TRC20_WALLET,
    network:      "TRON (TRC20)",
    token:        "USDT",
    darmins,
    ...pricing,
    memo:         `TN-${citizenId}-${requestId ?? "X"}`,
    tronscanUrl:  `https://tronscan.org/#/address/${CREATOR_TRC20_WALLET}`,
  });
});

// ── POST /payments/trc20/confirm ──────────────────────────────────────────────
const ConfirmBody = z.object({
  requestId:  z.number().int().positive().optional(),
  citizenId:  z.number().int().positive(),
  txId:       z.string().min(10),
  amountUsdt: z.number().positive(),
  darmins:    z.number().int().positive(),
  purpose:    z.string().default("darmins"),
});

router.post("/payments/trc20/confirm", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const parsed = ConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { requestId, citizenId, txId, amountUsdt, darmins, purpose } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя подтвердить оплату от имени другого гражданина" });
    return;
  }

  const [citizen] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  // Update DB record if it exists
  if (requestId) {
    try {
      await db.execute(
        sql`UPDATE trc20_payments
            SET tx_id = ${txId}, status = 'submitted', submitted_at = NOW()
            WHERE id = ${requestId} AND citizen_id = ${citizenId}`
      );
    } catch (err) {
      logger.warn({ err }, "trc20/confirm: failed to update record");
    }
  }

  // Notify admin via Telegram
  await notifyAdminTrc20Payment({
    citizenId: citizen.id,
    citizenName: citizen.name,
    amountUsdt,
    darmins,
    purpose,
    txId,
    requestId: requestId ?? null,
  });

  req.log.info({ citizenId, txId, amountUsdt, darmins }, "TRC20 payment confirmation submitted");

  res.json({
    success: true,
    message: "Транзакция принята на проверку. Дармины будут зачислены после подтверждения в блокчейне.",
    txId,
    tronscanTxUrl: `https://tronscan.org/#/transaction/${txId}`,
  });
});

export default router;
