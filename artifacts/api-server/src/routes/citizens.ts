import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, timelineAnchorsTable } from "@workspace/db";
import {
  UpdateCitizenBody,
} from "@workspace/api-zod";
import { z } from "zod";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCitizenRow(c: typeof citizensTable.$inferSelect) {
  return {
    ...c,
    transferableBalance: c.balanceMinutes - 1,
    lastActivity: c.lastActivity?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    availableAt: c.availableAt?.toISOString() ?? null,
  };
}

async function generateNextCitizenNumber(): Promise<string> {
  const result = await db
    .select({ max: sql<string>`MAX(citizen_number)` })
    .from(citizensTable);
  const current = result[0]?.max ? parseInt(result[0].max, 10) : 0;
  return String(current + 1).padStart(9, "0");
}

function generatePassportSvg(c: {
  citizenNumber: string;
  name: string;
  surname?: string | null;
  givenNames?: string | null;
  dateOfBirth?: string | null;
  rank: string;
  meritScore: number;
  createdAt: Date | string;
}): string {
  const surnameVal = (c.surname ?? c.name.split(" ")[0] ?? c.name).toUpperCase();
  const givenVal = (c.givenNames ?? (c.name.split(" ").slice(1).join(" ") || c.name)).toUpperCase();
  const dobRaw = c.dateOfBirth ?? "";
  const dobDisplay = dobRaw
    ? `${dobRaw.slice(8, 10)}.${dobRaw.slice(5, 7)}.${dobRaw.slice(0, 4)}`
    : "—";
  const issueDate = new Date(c.createdAt).toLocaleDateString("ru-RU");

  // MRZ (decorative, TD3)
  const mrzName = `${surnameVal.replace(/\s+/g, "<")}<<${givenVal.replace(/\s+/g, "<")}`;
  const mrz1 = `P<TN${mrzName}`.padEnd(44, "<").slice(0, 44);
  const dobMrz = dobRaw
    ? `${dobRaw.slice(2, 4)}${dobRaw.slice(5, 7)}${dobRaw.slice(8, 10)}`
    : "000000";
  const mrz2 = `${c.citizenNumber}TN${dobMrz}M9912319`.padEnd(44, "<").slice(0, 44);

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a1a1a" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="600" height="380" fill="#0d0d0d"/>
  <rect width="600" height="380" fill="url(#grid)"/>
  <rect width="600" height="8" fill="#e9b95a"/>

  <text x="30" y="44" font-family="monospace" font-size="22" font-weight="bold" fill="#e9b95a" letter-spacing="4">TIMENATION</text>
  <text x="30" y="62" font-family="monospace" font-size="9" fill="#666" letter-spacing="2">DIGITAL PASSPORT · ЦИФРОВОЙ ПАСПОРТ</text>

  <rect x="450" y="20" width="135" height="26" rx="4" fill="#22c55e18" stroke="#22c55e55" stroke-width="1"/>
  <text x="517" y="37" font-family="monospace" font-size="11" fill="#22c55e" text-anchor="middle" font-weight="bold">✓ ISSUED</text>

  <text x="30" y="100" font-family="monospace" font-size="10" fill="#555" letter-spacing="2">НОМЕР ГРАЖДАНИНА</text>
  <text x="30" y="138" font-family="monospace" font-size="38" font-weight="bold" fill="#ffffff" letter-spacing="6">${esc(c.citizenNumber)}</text>

  <text x="30" y="175" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">ФАМИЛИЯ / SURNAME</text>
  <text x="30" y="192" font-family="monospace" font-size="15" fill="#ddd">${esc(surnameVal)}</text>

  <text x="30" y="215" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">ИМЯ / GIVEN NAMES</text>
  <text x="30" y="232" font-family="monospace" font-size="15" fill="#ddd">${esc(givenVal)}</text>

  <text x="30" y="255" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">ДАТА РОЖДЕНИЯ / DATE OF BIRTH</text>
  <text x="30" y="272" font-family="monospace" font-size="15" fill="#ddd">${esc(dobDisplay)}</text>

  <text x="330" y="175" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">РАНГ / RANK</text>
  <text x="330" y="192" font-family="monospace" font-size="15" fill="#e9b95a">${esc(c.rank)}</text>

  <text x="330" y="215" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">MERIT SCORE</text>
  <text x="330" y="232" font-family="monospace" font-size="15" fill="#ddd">${c.meritScore.toFixed(1)}</text>

  <text x="330" y="255" font-family="monospace" font-size="9" fill="#555" letter-spacing="1">ДАТА ВЫДАЧИ / DATE OF ISSUE</text>
  <text x="330" y="272" font-family="monospace" font-size="15" fill="#ddd">${esc(issueDate)}</text>

  <rect y="305" width="600" height="75" fill="#080808"/>
  <rect y="305" width="600" height="1" fill="#2a2a2a"/>
  <text x="14" y="326" font-family="Courier New, monospace" font-size="11" fill="#383838" letter-spacing="1">${esc(mrz1)}</text>
  <text x="14" y="345" font-family="Courier New, monospace" font-size="11" fill="#383838" letter-spacing="1">${esc(mrz2)}</text>
  <text x="14" y="372" font-family="monospace" font-size="8" fill="#2a2a2a">MACHINE READABLE ZONE · TD3 · TIMENATION DIGITAL STATE</text>
</svg>`;
}

// ── GET /citizens ─────────────────────────────────────────────────────────────
router.get("/citizens", async (req, res): Promise<void> => {
  const citizens = await db
    .select()
    .from(citizensTable)
    .orderBy(citizensTable.createdAt);
  res.json(citizens.map(formatCitizenRow));
});

// ── POST /citizens ────────────────────────────────────────────────────────────
// Extended registration: generates 9-digit citizenNumber, sets 1-hour pending delay.
const RegisterCitizenBody = z.object({
  name: z.string().min(1, "Имя обязательно"),
  phone: z.string().min(5, "Телефон обязателен"),
  surname: z.string().optional(),
  givenNames: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).optional(),
  photoUrl: z.string().url().optional().or(z.literal("")).optional(),
  tosAcceptedAt: z.string().optional(),
  telegramId: z.string().optional(),
});

router.post("/citizens", async (req, res): Promise<void> => {
  const parsed = RegisterCitizenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const existing = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.phone, parsed.data.phone))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Гражданин с таким телефоном уже существует" });
    return;
  }

  const citizenNumber = await generateNextCitizenNumber();
  const availableAt = new Date(Date.now() + 60 * 60 * 1000); // +1 hour

  const { name, phone, surname, givenNames, dateOfBirth, photoUrl, tosAcceptedAt, telegramId } = parsed.data;

  const [citizen] = await db
    .insert(citizensTable)
    .values({
      name,
      phone,
      surname: surname ?? null,
      givenNames: givenNames ?? null,
      dateOfBirth: dateOfBirth || null,
      photoUrl: photoUrl || null,
      citizenNumber,
      registrationStatus: "pending",
      availableAt,
      tosAcceptedAt: tosAcceptedAt ? new Date(tosAcceptedAt) : undefined,
      telegramId: telegramId ?? undefined,
    })
    .returning();

  req.log.info({ citizenId: citizen!.id, citizenNumber }, "New citizen registered — pending verification");

  res.status(201).json({
    ...formatCitizenRow(citizen!),
    citizenNumber,
    availableAt: availableAt.toISOString(),
    registrationStatus: "pending",
  });
});

// ── GET /citizens/by-phone/:phone ─────────────────────────────────────────────
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

  res.json(formatCitizenRow(citizen));
});

// ── GET /citizens/number/:num/status ─────────────────────────────────────────
// Checks registration status. Auto-issues passport after 1-hour delay.
router.get("/citizens/number/:num/status", async (req, res): Promise<void> => {
  const num = req.params["num"] ?? "";

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.citizenNumber, num))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  // Legacy citizen (no registrationStatus) → treated as issued
  if (!citizen.registrationStatus || citizen.registrationStatus === "issued") {
    const passportUrl = `/api/citizens/number/${num}/passport`;
    res.json({ status: "issued", citizenNumber: num, idCardUrl: passportUrl });
    return;
  }

  if (citizen.registrationStatus === "rejected") {
    res.json({ status: "rejected", citizenNumber: num });
    return;
  }

  // pending — check if 1 hour has elapsed
  const now = Date.now();
  const due = citizen.availableAt ? citizen.availableAt.getTime() : now;

  if (now >= due) {
    // Auto-issue
    const passportUrl = `/api/citizens/number/${num}/passport`;
    await db
      .update(citizensTable)
      .set({ registrationStatus: "issued", idCardUrl: passportUrl })
      .where(eq(citizensTable.citizenNumber, num));

    req.log.info({ citizenNumber: num, citizenId: citizen.id }, "Passport auto-issued after 1-hour delay");
    res.json({ status: "issued", citizenNumber: num, idCardUrl: passportUrl });
    return;
  }

  const timeLeftSeconds = Math.ceil((due - now) / 1000);
  res.json({
    status: "pending",
    citizenNumber: num,
    timeLeftSeconds,
    availableAt: citizen.availableAt?.toISOString(),
  });
});

// ── GET /citizens/number/:num/passport ───────────────────────────────────────
// Returns SVG digital passport card for the citizen.
router.get("/citizens/number/:num/passport", async (req, res): Promise<void> => {
  const num = req.params["num"] ?? "";

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.citizenNumber, num))
    .limit(1);

  if (!citizen) {
    res.status(404).send("Гражданин не найден");
    return;
  }

  const svg = generatePassportSvg({
    citizenNumber: citizen.citizenNumber ?? num,
    name: citizen.name,
    surname: citizen.surname,
    givenNames: citizen.givenNames,
    dateOfBirth: citizen.dateOfBirth,
    rank: citizen.rank,
    meritScore: citizen.meritScore,
    createdAt: citizen.createdAt,
  });

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(svg);
});

// ── GET /citizens/:id ─────────────────────────────────────────────────────────
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

  res.json(formatCitizenRow(citizen));
});

// ── PATCH /citizens/:id ───────────────────────────────────────────────────────
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

  res.json(formatCitizenRow(citizen));
});

// ── POST /citizens/:id/heritage-transfer ─────────────────────────────────────
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

// ── POST /citizens/:id/wallet-link ───────────────────────────────────────────
const WalletLinkBody = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be a valid EVM address"),
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

  req.log.info({ citizenId: id, walletAddress }, "Web3 wallet linked");
  res.json(formatCitizenRow(citizen));
});

// ── POST /citizens/:id/age-verify ────────────────────────────────────────────
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

  req.log.info({ citizenId: id }, "Age verified (18+ — COPPA/DSA)");
  res.json({ ok: true, ageVerified: true });
});

export default router;
