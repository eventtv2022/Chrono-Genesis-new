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

// ── Passport SVG helpers ──────────────────────────────────────────────────────

function p2(n: number): string { return String(Math.floor(n)).padStart(2, "0"); }

function starPath(cx: number, cy: number, r: number, fill: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" opacity="0.55"/>`;
}

function starsRing(cx: number, cy: number, R: number, n: number, fill: string): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    out += starPath(cx + R * Math.cos(a), cy + R * Math.sin(a), 5.5, fill);
  }
  return out;
}

function decorativeQr(x0: number, y0: number, size: number): string {
  // 21-module visual QR pattern (decorative, not scannable)
  const rows = [
    "111111101001101111111",
    "100000101110001000001",
    "101110101011001011101",
    "101110100100101011101",
    "101110101010001011101",
    "100000100110101000001",
    "111111101010101111111",
    "000000011101100000000",
    "101011010110101010110",
    "010110100101010011010",
    "110100101011010110010",
    "001001010110100100101",
    "010110101001010100110",
    "000000011010100000001",
    "111111011011101011010",
    "100000100101010111110",
    "101110101010010011010",
    "101110100101101110010",
    "101110101010101001010",
    "100000101101010000010",
    "111111101010101111110",
  ];
  const cs = size / 21;
  let out = `<rect x="${x0}" y="${y0}" width="${size}" height="${size}" fill="white" rx="3"/>`;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? "";
    for (let col = 0; col < row.length; col++) {
      if (row[col] === "1") {
        out += `<rect x="${(x0 + col * cs).toFixed(1)}" y="${(y0 + r * cs).toFixed(1)}" width="${cs.toFixed(1)}" height="${cs.toFixed(1)}" fill="#0a1428"/>`;
      }
    }
  }
  return out;
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

  // DATE OF BIRTH display: "08 FEB 1990"
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const dobDisplay = dobRaw
    ? `${dobRaw.slice(8, 10)} ${months[parseInt(dobRaw.slice(5, 7), 10) - 1] ?? "?"} ${dobRaw.slice(0, 4)}`
    : "—";

  // DATE/TIME OF ISSUE
  const issued = new Date(c.createdAt);
  const issueDT = `${p2(issued.getDate())}.${p2(issued.getMonth() + 1)}.${issued.getFullYear()}  ${p2(issued.getHours())}:${p2(issued.getMinutes())}`;

  // MRZ (decorative TD3)
  const mrzName = `${surnameVal.replace(/\s+/g, "<")}<<${givenVal.replace(/\s+/g, "<")}`;
  const mrz1 = `IN${mrzName}`.padEnd(30, "<").slice(0, 30);
  const dobMrz = dobRaw ? `${dobRaw.slice(2,4)}${dobRaw.slice(5,7)}${dobRaw.slice(8,10)}` : "000000";
  const mrz2 = `${c.citizenNumber}<TN${dobMrz}M9912319`.padEnd(30, "<").slice(0, 30);

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const stars = starsRing(594, 190, 54, 12, "#d4a020");
  const qr = decorativeQr(472, 68, 98);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="680" height="430" viewBox="0 0 680 430">
  <defs>
    <pattern id="dp" width="11" height="11" patternUnits="userSpaceOnUse">
      <circle cx="5.5" cy="5.5" r="0.7" fill="#7aadd0" opacity="0.45"/>
    </pattern>
    <clipPath id="card"><rect width="680" height="430" rx="14"/></clipPath>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c0d4ec"/>
      <stop offset="100%" stop-color="#d4e6f6"/>
    </linearGradient>
  </defs>

  <!-- Card background -->
  <rect width="680" height="430" rx="14" fill="url(#bgGrad)"/>
  <rect width="680" height="430" fill="url(#dp)" clip-path="url(#card)"/>

  <!-- Large ∞ watermark -->
  <text x="388" y="310" font-family="Georgia,serif" font-size="270" fill="#5a90be" opacity="0.13" text-anchor="middle">∞</text>

  <!-- Stars ring (right) -->
  ${stars}

  <!-- ══ HEADER ══ -->
  <!-- Flag (top-left) -->
  <rect x="18" y="15" width="50" height="35" rx="3" fill="white" stroke="#9ab8d8" stroke-width="0.8"/>
  <rect x="18" y="15" width="50" height="12" rx="3" fill="#1e3a8a"/>
  <rect x="18" y="15" width="50" height="3" rx="0" fill="#1e3a8a"/>
  <rect x="18" y="38" width="50" height="12" rx="3" fill="#1e3a8a"/>
  <rect x="18" y="44" width="50" height="6" rx="0" fill="#1e3a8a"/>
  <circle cx="43" cy="32.5" r="8" fill="none" stroke="#c8d8f0" stroke-width="0.8" opacity="0.7"/>
  <text x="43" y="36.5" font-family="Georgia,serif" font-size="11" fill="#d0e4ff" text-anchor="middle" opacity="0.9">∞</text>

  <!-- TIMENATION left -->
  <text x="76" y="33" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="bold" fill="#1a3a8a" letter-spacing="0.5">TIMENATION</text>
  <text x="76" y="47" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#4468a8">Republic of TimeNation</text>

  <!-- TIMENATION right -->
  <text x="662" y="33" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="bold" fill="#1a3a8a" text-anchor="end" letter-spacing="0.5">TIMENATION</text>
  <text x="662" y="47" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#4468a8" text-anchor="end">FUTURE BEGINS NOW</text>

  <!-- Divider -->
  <line x1="18" y1="60" x2="662" y2="60" stroke="#8ab0d4" stroke-width="0.9"/>

  <!-- ══ PHOTO AREA ══ -->
  <rect x="18" y="70" width="152" height="213" rx="5" fill="#dce9f5" stroke="#9bbcd8" stroke-width="1"/>
  <!-- silhouette placeholder -->
  <circle cx="94" cy="145" r="38" fill="#b8cee4"/>
  <ellipse cx="94" cy="223" rx="54" ry="32" fill="#b8cee4"/>
  <text x="94" y="152" font-family="Arial,sans-serif" font-size="9" fill="#7a9abf" text-anchor="middle" opacity="0.7">PHOTO</text>

  <!-- ══ DATA FIELDS ══ -->
  <!-- SURNAME -->
  <text x="188" y="87" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">SURNAME</text>
  <text x="188" y="107" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#090f1e">${esc(surnameVal)}</text>

  <!-- GIVEN NAME -->
  <text x="188" y="128" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">GIVEN NAME</text>
  <text x="188" y="148" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#090f1e">${esc(givenVal)}</text>

  <!-- NATIONALITY -->
  <text x="188" y="169" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">NATIONALITY</text>
  <text x="188" y="189" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#090f1e">TIMENATION</text>

  <!-- DATE OF BIRTH -->
  <text x="188" y="210" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">DATE OF BIRTH</text>
  <text x="188" y="230" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#090f1e">${esc(dobDisplay)}</text>

  <!-- DATE/TIME OF ISSUE -->
  <text x="188" y="251" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">DATE/TIME OF ISSUE</text>
  <text x="188" y="271" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#090f1e">${esc(issueDT)}</text>

  <!-- CITIZEN NO + RANK -->
  <text x="188" y="295" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">CITIZEN NO.</text>
  <text x="188" y="313" font-family="Courier New,monospace" font-size="17" font-weight="bold" fill="#090f1e" letter-spacing="3">${esc(c.citizenNumber)}</text>

  <!-- RANK -->
  <text x="188" y="338" font-family="Arial,Helvetica,sans-serif" font-size="9.5" font-weight="bold" fill="#1d4ed8" letter-spacing="1.2">RANK / MERIT</text>
  <text x="188" y="356" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#090f1e">${esc(c.rank)}  ·  ${c.meritScore.toFixed(1)}</text>

  <!-- ══ QR CODE (decorative) ══ -->
  ${qr}

  <!-- ══ MINI PHOTO (right, below QR) ══ -->
  <rect x="472" y="178" width="98" height="105" rx="4" fill="#dce9f5" stroke="#9bbcd8" stroke-width="0.8"/>
  <circle cx="521" cy="220" r="24" fill="#b8cee4"/>
  <ellipse cx="521" cy="278" rx="34" ry="22" fill="#b8cee4"/>

  <!-- Signature line -->
  <line x1="472" y1="296" x2="570" y2="296" stroke="#8ab0d4" stroke-width="0.8"/>
  <text x="488" y="308" font-family="Georgia,serif" font-size="9" fill="#4a6a9a" font-style="italic">signature</text>

  <!-- ══ MRZ ZONE ══ -->
  <rect x="0" y="363" width="680" height="67" fill="#070e1a" clip-path="url(#card)"/>
  <rect x="0" y="363" width="680" height="2" fill="#2060a8"/>
  <text x="18" y="388" font-family="Courier New,monospace" font-size="14" fill="#5a88b8" letter-spacing="2.5">${esc(mrz1)}</text>
  <text x="18" y="413" font-family="Courier New,monospace" font-size="14" fill="#5a88b8" letter-spacing="2.5">${esc(mrz2)}</text>
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
