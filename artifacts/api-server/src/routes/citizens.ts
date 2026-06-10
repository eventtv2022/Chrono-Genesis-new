import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, timelineAnchorsTable } from "@workspace/db";
import {
  CreateCitizenBody,
  UpdateCitizenBody,
} from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

router.get("/citizens", async (req, res): Promise<void> => {
  const citizens = await db
    .select()
    .from(citizensTable)
    .orderBy(citizensTable.createdAt);
  res.json(
    citizens.map((c) => ({
      ...c,
      transferableBalance: c.balanceMinutes - 1,
      lastActivity: c.lastActivity?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.post("/citizens", async (req, res): Promise<void> => {
  const parsed = CreateCitizenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.phone, parsed.data.phone))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Citizen with this phone already exists" });
    return;
  }

  const [citizen] = await db
    .insert(citizensTable)
    .values(parsed.data)
    .returning();

  req.log.info({ citizenId: citizen.id, name: citizen.name }, "New citizen registered");
  res.status(201).json({
    ...citizen,
    transferableBalance: citizen.balanceMinutes - 1,
    lastActivity: citizen.lastActivity?.toISOString() ?? null,
    createdAt: citizen.createdAt.toISOString(),
  });
});

router.get("/citizens/by-phone/:phone", async (req, res): Promise<void> => {
  const phone = Array.isArray(req.params.phone)
    ? req.params.phone[0]
    : req.params.phone;

  if (!phone) {
    res.status(400).json({ error: "Phone is required" });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.phone, phone))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  res.json({
    ...citizen,
    transferableBalance: citizen.balanceMinutes - 1,
    lastActivity: citizen.lastActivity?.toISOString() ?? null,
    createdAt: citizen.createdAt.toISOString(),
  });
});

router.get("/citizens/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid citizen ID" });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  res.json({
    ...citizen,
    transferableBalance: citizen.balanceMinutes - 1,
    lastActivity: citizen.lastActivity?.toISOString() ?? null,
    createdAt: citizen.createdAt.toISOString(),
  });
});

router.patch("/citizens/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid citizen ID" });
    return;
  }

  const parsed = UpdateCitizenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [citizen] = await db
    .update(citizensTable)
    .set(parsed.data)
    .where(eq(citizensTable.id, id))
    .returning();

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  res.json({
    ...citizen,
    transferableBalance: citizen.balanceMinutes - 1,
    lastActivity: citizen.lastActivity?.toISOString() ?? null,
    createdAt: citizen.createdAt.toISOString(),
  });
});

const HeritageTransferBody = z.object({
  heirCitizenId: z.number().int().positive(),
});

router.post("/citizens/:id/heritage-transfer", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid citizen ID" });
    return;
  }

  const parsed = HeritageTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { heirCitizenId } = parsed.data;

  if (id === heirCitizenId) {
    res.status(400).json({ error: "Нельзя передать наследство самому себе" });
    return;
  }

  const [fromCitizen] = await db.select().from(citizensTable).where(eq(citizensTable.id, id)).limit(1);
  if (!fromCitizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  const [heirCitizen] = await db.select().from(citizensTable).where(eq(citizensTable.id, heirCitizenId)).limit(1);
  if (!heirCitizen) {
    res.status(404).json({ error: "Heir citizen not found" });
    return;
  }

  await db
    .update(timelineAnchorsTable)
    .set({ citizenId: heirCitizenId })
    .where(eq(timelineAnchorsTable.citizenId, id));

  await db
    .update(citizensTable)
    .set({ balanceMinutes: heirCitizen.balanceMinutes + fromCitizen.balanceMinutes, status: "inactive" })
    .where(eq(citizensTable.id, heirCitizenId));

  await db
    .update(citizensTable)
    .set({ balanceMinutes: 0, status: "inactive" })
    .where(eq(citizensTable.id, id));

  req.log.info({ fromCitizenId: id, heirCitizenId }, "Heritage transfer completed");

  res.json({
    message: `Наследство гражданина ${fromCitizen.name} передано гражданину ${heirCitizen.name}`,
    fromCitizenId: id,
    heirCitizenId,
    balanceTransferred: fromCitizen.balanceMinutes,
  });
});

const WalletLinkBody = z.object({
  walletAddress: z
    .string()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "walletAddress must be a valid EVM address: 0x followed by 40 hex characters"
    ),
});

router.post("/citizens/:id/wallet-link", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid citizen ID" });
    return;
  }

  const parsed = WalletLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { walletAddress } = parsed.data;

  const [existingWallet] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.walletAddress, walletAddress))
    .limit(1);

  if (existingWallet && existingWallet.id !== id) {
    res.status(409).json({ error: "Этот кошелёк уже привязан к другому гражданину" });
    return;
  }

  const [citizen] = await db
    .update(citizensTable)
    .set({ walletAddress })
    .where(eq(citizensTable.id, id))
    .returning();

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  req.log.info({ citizenId: id, walletAddress }, "Web3 wallet linked to citizen");

  res.json({
    ...citizen,
    transferableBalance: citizen.balanceMinutes - 1,
    lastActivity: citizen.lastActivity?.toISOString() ?? null,
    createdAt: citizen.createdAt.toISOString(),
  });
});

// ─── POST /api/citizens/:id/age-verify ────────────────────────────────────────
// COPPA / EU DSA age affirmation: citizen self-declares they are 18+.
// Platform records the timestamp and unblocks AI content generation.
router.post("/citizens/:id/age-verify", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [citizen] = await db
    .select({ id: citizensTable.id, ageVerified: citizensTable.ageVerified })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  if (citizen.ageVerified) {
    res.json({ ok: true, ageVerified: true, alreadyVerified: true });
    return;
  }

  await db
    .update(citizensTable)
    .set({ ageVerified: 1 })
    .where(eq(citizensTable.id, id));

  req.log.info({ citizenId: id }, "Age verified (18+ affirmation — COPPA/DSA)");
  res.json({ ok: true, ageVerified: true });
});

export default router;
