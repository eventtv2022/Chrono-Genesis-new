import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { ethers } from "ethers";
import { z } from "zod";
import { logger } from "../lib/logger";
import crypto from "node:crypto";
import { requireAdultKyc, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const NONCE_TTL_MINUTES = 10;

function buildSignMessage(citizenId: number, walletAddress: string, nonce: string): string {
  return [
    "Welcome to TimeNation — the Digital State where Time is Currency.",
    "",
    `Linking wallet to Passport ID: ${citizenId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires in: ${NONCE_TTL_MINUTES} minutes`,
  ].join("\n");
}

router.get("/auth/wallet-nonce", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const parsed = z.object({
    walletAddress: z.string().min(10),
    citizenId: z.coerce.number().int().positive(),
  }).safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: "walletAddress and citizenId are required" });
    return;
  }

  const { walletAddress, citizenId } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя подключить кошелёк другого гражданина" });
    return;
  }
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя подключить кошелёк другого гражданина" });
    return;
  }

  const citizen = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (citizen.length === 0) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  if (citizen[0]!.walletVerified && citizen[0]!.walletAddress) {
    res.status(409).json({ error: "Wallet already verified for this citizen" });
    return;
  }

  const conflicting = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.walletAddress, walletAddress.toLowerCase()))
    .limit(1);

  if (conflicting.length > 0 && conflicting[0]!.id !== citizenId) {
    res.status(409).json({ error: "This wallet address is linked to another citizen" });
    return;
  }

  const nonce = crypto.randomBytes(16).toString("hex");

  await db
    .update(citizensTable)
    .set({ walletAddress: walletAddress.toLowerCase(), walletNonce: nonce })
    .where(eq(citizensTable.id, citizenId));

  const message = buildSignMessage(citizenId, walletAddress, nonce);

  req.log.info({ citizenId, walletAddress }, "Wallet nonce generated");

  res.json({ nonce, message });
});

const VerifyBody = z.object({
  citizenId: z.number().int().positive(),
  walletAddress: z.string().min(10),
  signature: z.string().min(10),
});

router.post("/auth/wallet-verify", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const parsed = VerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citizenId, walletAddress, signature } = parsed.data;
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя подтвердить кошелёк другого гражданина" });
    return;
  }
  if (req.citizen!.id !== citizenId) {
    res.status(403).json({ error: "Нельзя подтвердить кошелёк другого гражданина" });
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

  if (!citizen.walletNonce) {
    res.status(400).json({ error: "No nonce found. Request a nonce first." });
    return;
  }

  if (citizen.walletAddress !== walletAddress.toLowerCase()) {
    res.status(400).json({ error: "Wallet address does not match nonce session" });
    return;
  }

  const message = buildSignMessage(citizenId, walletAddress, citizen.walletNonce);

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch (err) {
    logger.warn({ err }, "Invalid signature format");
    res.status(400).json({ error: "Invalid signature format" });
    return;
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    res.status(401).json({
      error: "Signature verification failed — recovered address does not match",
      recovered: recoveredAddress.toLowerCase(),
      provided: walletAddress.toLowerCase(),
    });
    return;
  }

  await db
    .update(citizensTable)
    .set({ walletNonce: null, walletVerified: 1, walletAddress: walletAddress.toLowerCase() })
    .where(eq(citizensTable.id, citizenId));

  const [updated] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  req.log.info({ citizenId, walletAddress }, "Wallet verified and linked");

  res.json({
    success: true,
    walletAddress: walletAddress.toLowerCase(),
    citizen: {
      ...updated,
      transferableBalance: (updated?.balanceMinutes ?? 0) - 1,
      lastActivity: updated?.lastActivity?.toISOString() ?? null,
      createdAt: updated!.createdAt.toISOString(),
    },
  });
});

router.delete("/auth/wallet-unlink", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const parsed = z.object({ citizenId: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "citizenId is required" });
    return;
  }
  if (req.citizen!.id !== parsed.data.citizenId) {
    res.status(403).json({ error: "Нельзя отключить кошелёк другого гражданина" });
    return;
  }
  if (req.citizen!.id !== parsed.data.citizenId) {
    res.status(403).json({ error: "Нельзя отключить кошелёк другого гражданина" });
    return;
  }

  await db
    .update(citizensTable)
    .set({ walletAddress: null, walletNonce: null, walletVerified: 0 })
    .where(eq(citizensTable.id, parsed.data.citizenId));

  res.json({ success: true });
});

export default router;
