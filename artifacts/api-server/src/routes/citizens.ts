import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, desc } from "drizzle-orm";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { citizensTable, onboardingProgressTable, timelineAnchorsTable, timeAuditLogsTable, aiSystemPromptsTable } from "@workspace/db";
import { auditCitizenRate } from "../services/rateAuditorService";
import {
  UpdateCitizenBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { logger } from "../lib/logger";
import { MEDIA_DIR } from "../services/renderService";
import { generateIdCardSvg, loadPhotoAsDataUri } from "../services/idCardService";
import { encrypt, encryptNullable, tryDecrypt } from "../services/encryptionService";
import { EMBLEM_DATA_URI, FLAG_DATA_URI } from "../services/assetsService";
import { cropSignature, normalizePassportPhoto } from "../services/imageService";
import { requireAdultKyc, requireAuth } from "../middleware/auth";
import { sendAdminTelegramNotify } from "../services/emailService";
import { notifyPassportEmissionStarted, sendDirectMessage } from "../services/telegramService";
import { issueEligiblePassport } from "../services/passportIssuanceService";
import { deriveAgeTier } from "../services/ageGateService";

// ── Secure vault: citizen photos stored outside web-accessible paths ──────────
export const VAULT_DIR = path.join(process.cwd(), "secure_vault");
const VAULT_PHOTOS_DIR = path.join(VAULT_DIR, "photos");
fs.mkdirSync(VAULT_PHOTOS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VAULT_PHOTOS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `photo_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения разрешены"));
  },
});

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCitizenRow(c: typeof citizensTable.$inferSelect) {
  // Explicitly exclude sensitive auth fields — never expose to clients
  const {
    passwordHash: _ph,
    resetPasswordToken: _rt,
    resetPasswordExpires: _re,
    authToken: _at,
    signatureBase64: _signature,
    dateOfBirth: _dob,
    ageTier: _ageTier,
    kycVerified: _kycVerified,
    ...safe
  } = c;
  return {
    ...safe,
    // Decrypt PII fields before returning — encrypted values stored as v1:... in DB
    email:      tryDecrypt(c.email)      ?? null,
    surname:    tryDecrypt(c.surname)    ?? null,
    givenNames: tryDecrypt(c.givenNames) ?? null,
    // Never expose the raw vault path as a web URL
    photoUrl: c.photoUrl ? "vault:protected" : null,
    hasSignature: !!c.signatureBase64?.trim(),
    transferableBalance: Math.max(0, c.balanceMinutes - 1),
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

// ICAO Doc 9303 transliteration table (Russian Cyrillic → Latin)
const CYR_TO_LAT: Record<string, string> = {
  А:"A", Б:"B", В:"V", Г:"G", Д:"D", Е:"E", Ё:"E", Ж:"ZH", З:"Z",
  И:"I", Й:"I", К:"K", Л:"L", М:"M", Н:"N", О:"O", П:"P", Р:"R",
  С:"S", Т:"T", У:"U", Ф:"F", Х:"KH", Ц:"TS", Ч:"CH", Ш:"SH",
  Щ:"SHCH", Ъ:"IE", Ы:"Y", Ь:"", Э:"E", Ю:"IU", Я:"IA",
  а:"A", б:"B", в:"V", г:"G", д:"D", е:"E", ё:"E", ж:"ZH", з:"Z",
  и:"I", й:"I", к:"K", л:"L", м:"M", н:"N", о:"O", п:"P", р:"R",
  с:"S", т:"T", у:"U", ф:"F", х:"KH", ц:"TS", ч:"CH", ш:"SH",
  щ:"SHCH", ъ:"IE", ы:"Y", ь:"", э:"E", ю:"IU", я:"IA",
};

function translit(s: string): string {
  return s
    .split("")
    .map(ch => CYR_TO_LAT[ch] ?? (/[A-Za-z0-9\s<]/.test(ch) ? ch.toUpperCase() : ""))
    .join("")
    .toUpperCase();
}

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
  photoUri?: string | null;
  signatureBase64?: string | null;
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

  // MRZ (ICAO TD3, transliterated to Latin)
  const mrzSurname = translit(surnameVal).replace(/\s+/g, "<");
  const mrzGiven  = translit(givenVal).replace(/\s+/g, "<");
  const mrzName = `${mrzSurname}<<${mrzGiven}`;
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
  <!-- Emblem (top-left, real image) -->
  ${EMBLEM_DATA_URI
    ? `<defs><clipPath id="pEmblemClip"><circle cx="43" cy="32" r="22"/></clipPath></defs>
  <image href="${EMBLEM_DATA_URI}" x="21" y="10" width="44" height="44" clip-path="url(#pEmblemClip)" preserveAspectRatio="xMidYMid meet"/>
  <circle cx="43" cy="32" r="22" fill="none" stroke="#8ab4d4" stroke-width="1"/>`
    : `<rect x="18" y="15" width="50" height="35" rx="3" fill="#1e3a8a"/>
  <text x="43" y="36" font-family="Georgia,serif" font-size="11" fill="#d0e4ff" text-anchor="middle">∞</text>`}

  <!-- TIMENATION left -->
  <text x="76" y="33" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="bold" fill="#1a3a8a" letter-spacing="0.5">TIMENATION</text>
  <text x="76" y="47" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#4468a8">Republic of TimeNation</text>

  <!-- Flag (top-right, real image) -->
  ${FLAG_DATA_URI
    ? `<defs><clipPath id="pFlagClip"><rect x="590" y="12" width="72" height="43" rx="3"/></clipPath></defs>
  <image href="${FLAG_DATA_URI}" x="590" y="12" width="72" height="43" clip-path="url(#pFlagClip)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="590" y="12" width="72" height="43" rx="3" fill="none" stroke="#8ab4d4" stroke-width="0.8"/>`
    : `<text x="662" y="33" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="bold" fill="#1a3a8a" text-anchor="end" letter-spacing="0.5">TIMENATION</text>
  <text x="662" y="47" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#4468a8" text-anchor="end">FUTURE BEGINS NOW</text>`}

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
  ${c.signatureBase64 ? `<image href="${esc(c.signatureBase64)}" x="472" y="263" width="98" height="30" preserveAspectRatio="xMinYMid meet" opacity="0.92"/>` : ""}
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

// ── GET /citizens/:id/photo ───────────────────────────────────────────────────
// Serves vault-stored passport photo.
// Auth: Authorization: Bearer <token>  OR  ?token=<token>  (web <img> workaround)
router.get("/citizens/:id/photo", async (req, res): Promise<void> => {
  // Resolve token from header OR query param (web Image tags can't set headers)
  const authHeader = req.headers["authorization"];
  const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : null;
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;

  if (!rawToken) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const [authed] = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, rawToken))
    .limit(1);

  if (!authed) { res.status(401).json({ error: "Неверный токен" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!id) { res.status(400).json({ error: "Неверный ID" }); return; }

  const [row] = await db
    .select({ photoUrl: citizensTable.photoUrl })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!row?.photoUrl) { res.status(404).json({ error: "Фото не найдено" }); return; }

  const rel = row.photoUrl.startsWith("vault:") ? row.photoUrl.slice("vault:".length) : row.photoUrl;
  const absPath = path.resolve(path.join(process.cwd(), "secure_vault", rel));

  if (!fs.existsSync(absPath)) { res.status(404).json({ error: "Файл не найден" }); return; }

  const ext = path.extname(absPath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(absPath);
});

// ── POST /citizens/me/photo ───────────────────────────────────────────────────
// Upload or replace the authenticated citizen's passport photo.
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VAULT_PHOTOS_DIR),
    filename: (_req, _file, cb) => cb(null, `photo_${Date.now()}.jpg`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения разрешены"));
  },
});

router.post("/citizens/me/photo", requireAuth, photoUpload.single("photo"), async (req, res): Promise<void> => {
  const citizen = req.citizen!;
  const file = req.file;
  if (!file) { res.status(400).json({ error: "Файл не загружен" }); return; }

  // Delete old photo file if exists
  if (citizen.photoUrl) {
    const rel = citizen.photoUrl.startsWith("vault:") ? citizen.photoUrl.slice("vault:".length) : null;
    if (rel) {
      const oldPath = path.join(process.cwd(), "secure_vault", rel);
      fs.unlink(oldPath, () => {/* ignore */});
    }
  }

  const vaultRef = `vault:photos/${file.filename}`;
  await db.update(citizensTable).set({ photoUrl: vaultRef }).where(eq(citizensTable.id, citizen.id));

  req.log.info({ citizenId: citizen.id }, "Photo updated");
  res.json({ success: true });
});

router.post("/citizens/me/signature", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({
    signatureBase64: z.string()
      .min(1)
      .max(1_500_000)
      .regex(/^data:image\/(?:png|jpeg);base64,/i),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Загрузите подпись в формате PNG или JPEG" });
    return;
  }

  const citizen = req.citizen!;
  const signatureBase64 = await cropSignature(parsed.data.signatureBase64);
  if (!signatureBase64) {
    res.status(400).json({ error: "Добавьте непустую подпись в формате PNG или JPEG" });
    return;
  }

  await db.update(citizensTable)
    .set({ signatureBase64 })
    .where(eq(citizensTable.id, citizen.id));

  const issuance = citizen.registrationStatus === "pending"
    ? await issueEligiblePassport(citizen.id)
    : null;
  res.json({
    success: true,
    hasSignature: true,
    registrationStatus: issuance?.citizen.registrationStatus ?? citizen.registrationStatus,
  });
});

// ── POST /citizens ────────────────────────────────────────────────────────────
// Extended registration: generates 9-digit citizenNumber, sets 1-hour pending delay.
// Accepts both multipart/form-data (with photo) and application/json.
const RegisterCitizenBody = z.object({
  name: z.string().min(1, "Имя обязательно"),
  phone: z.string().min(5, "Телефон обязателен"),
  surname: z.string().optional(),
  givenNames: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photoUrl: z.string().optional(),
  tosAcceptedAt: z.string().optional(),
  telegramId: z.string().optional(),
  email: z.string().email("Неверный формат email").optional().or(z.literal("")).optional(),
  privacyAgreementAccepted: z.string().optional(), // "true" from FormData
  signatureBase64: z.string()
    .min(1)
    .max(1_500_000)
    .regex(/^data:image\/(?:png|jpeg);base64,/i),
  whatsappPhone: z.string().optional(),
  preferredChannels: z.string().optional(), // JSON: ['email','telegram','whatsapp','sms','phone'] — ≥2
  preApplicationProgressToken: z.string().regex(/^[a-f0-9]{64}$/),
});

router.post("/citizens", upload.single("passport_photo"), async (req, res): Promise<void> => {
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
  const authToken = crypto.randomBytes(32).toString("hex");

  const { name, phone, surname, givenNames, dateOfBirth, tosAcceptedAt, telegramId, email, privacyAgreementAccepted, signatureBase64: rawSignature, whatsappPhone, preferredChannels, preApplicationProgressToken } = parsed.data;
  const ageTier = deriveAgeTier(dateOfBirth);
  if (!ageTier) {
    res.status(400).json({ error: "Укажите корректную дату рождения" });
    return;
  }
  if (ageTier === "UNDER_13") {
    res.status(403).json({ error: "Регистрация доступна с 13 лет", code: "MINIMUM_AGE_NOT_MET" });
    return;
  }

  const [preflightProgress] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.progressToken, preApplicationProgressToken))
    .limit(1);
  if (!preflightProgress?.guideCompleted || preflightProgress.citizenId !== null) {
    res.status(409).json({ error: "Сначала завершите 30 вопросов знакомства перед подачей заявления" });
    return;
  }

  // ── 1. Normalise passport photo (resize to 400×514 px JPEG) ─────────────────
  let vaultPhotoRef: string | null = null;
  if (req.file) {
    const normPath = await normalizePassportPhoto(req.file.path);
    // normPath may have changed extension (e.g. .png → .jpg)
    const normFilename = path.basename(normPath);
    vaultPhotoRef = `vault:photos/${normFilename}`;
  }

  // ── 2. Crop signature to bounding box ────────────────────────────────────────
  const signatureBase64 = await cropSignature(rawSignature);
  if (!signatureBase64) {
    res.status(400).json({ error: "Добавьте непустую подпись" });
    return;
  }

  const privacyAccepted = privacyAgreementAccepted === "true";

  const citizen = await db.transaction(async (tx) => {
    const [lockedProgress] = await tx
      .select()
      .from(onboardingProgressTable)
      .where(eq(onboardingProgressTable.progressToken, preApplicationProgressToken))
      .for("update")
      .limit(1);
    if (!lockedProgress?.guideCompleted || lockedProgress.citizenId !== null) return null;

    const [created] = await tx
      .insert(citizensTable)
      .values({
        name,                                            // display name stays plaintext
        phone,
        surname:    encryptNullable(surname ?? null),    // PII — encrypted
        givenNames: encryptNullable(givenNames ?? null), // PII — encrypted
        dateOfBirth: dateOfBirth || null,
        ageTier,
        photoUrl: vaultPhotoRef,
        citizenNumber,
        authToken,
        balanceMinutes: 0,
        ancestralMinuteGranted: false,
        registrationStatus: "pending",
        availableAt,
        onboardingCompleted: false,
        tosAcceptedAt: tosAcceptedAt ? new Date(tosAcceptedAt) : undefined,
        telegramId: telegramId ?? undefined,
        email: encryptNullable(email || null),           // PII — encrypted
        privacyAgreementAccepted: privacyAccepted ? 1 : 0,
        privacyAgreementDate: privacyAccepted ? new Date() : null,
        signatureBase64,
        whatsappPhone: whatsappPhone || null,
        preferredChannels: preferredChannels || null,
      })
      .returning();
    if (!created) throw new Error("Citizen insert returned no row");
    await tx
      .update(onboardingProgressTable)
      .set({ citizenId: created.id, updatedAt: new Date() })
      .where(eq(onboardingProgressTable.progressToken, preApplicationProgressToken));
    return created;
  });
  if (!citizen) {
    res.status(409).json({ error: "Знакомство уже использовано или не завершено" });
    return;
  }

  req.log.info({ citizenId: citizen.id, citizenNumber }, "New citizen registered — pending verification");

  res.status(201).json({
    ...formatCitizenRow(citizen),
    authToken,
    citizenNumber,
    availableAt: availableAt.toISOString(),
    registrationStatus: "pending",
  });

  void notifyPassportEmissionStarted({
    citizenId: citizen.id,
    citizenName: citizen.name,
    citizenNumber: citizen.citizenNumber,
    availableAt,
  });

  // ── Fire-and-forget: email to citizen + Telegram to admin ─────────────────
  const decryptedEmail = tryDecrypt(citizen.email) ?? null;
  const createdAt = citizen.createdAt ?? new Date();

  // Email to citizen (skipped silently if SMTP not configured or no email)
  // Telegram to admin (skipped silently if ADMIN_TELEGRAM_ID not set)
  sendAdminTelegramNotify({
    sendDirectMessage,
    name: citizen.name,
    email: decryptedEmail,
    citizenNumber,
    citizenId: citizen.id,
    createdAt,
  }).catch((err) => req.log.warn({ err }, "sendAdminTelegramNotify failed (non-critical)"));
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

  // Issue or reuse authToken on login via phone lookup
  let token = citizen.authToken;
  if (!token) {
    const { randomBytes } = await import("crypto");
    token = randomBytes(32).toString("hex");
    await db.update(citizensTable).set({ authToken: token }).where(eq(citizensTable.id, citizen.id));
  }

  res.json({ ...formatCitizenRow(citizen), authToken: token });
});

// ── GET /citizens/number/:num/status ─────────────────────────────────────────
// Checks registration status. Auto-issues passport after 1-hour delay.
router.get("/citizens/number/:num/status", async (req, res): Promise<void> => {
  const num = req.params["num"] ?? "";

  let [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.citizenNumber, num))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  if (
    citizen.registrationStatus === "pending" &&
    citizen.availableAt &&
    citizen.availableAt.getTime() <= Date.now()
  ) {
    const issued = await issueEligiblePassport(citizen.id);
    if (issued) {
      citizen = issued.citizen;
    } else {
      [citizen] = await db
        .select()
        .from(citizensTable)
        .where(eq(citizensTable.citizenNumber, num))
        .limit(1);
      if (!citizen) {
        res.status(404).json({ error: "Гражданин не найден" });
        return;
      }
    }
  }

  // Legacy citizen (no registrationStatus) → treated as issued
  if (!citizen.registrationStatus || citizen.registrationStatus === "issued") {
    res.json({
      status: "issued",
      citizenNumber: num,
      idCardUrl: `/api/citizens/number/${num}/id-card`,
      passportUrl: `/api/citizens/number/${num}/passport`,
      balanceMinutes: citizen.balanceMinutes,
    });
    return;
  }

  if (citizen.registrationStatus === "rejected") {
    res.json({ status: "rejected", citizenNumber: num });
    return;
  }

  // Pending applicants retain the same registration-time eligibility deadline.
  const now = Date.now();
  const due = citizen.availableAt?.getTime() ?? now;

  const timeLeftSeconds = Math.ceil((due - now) / 1000);
  res.json({
    status: "pending",
    citizenNumber: num,
    timeLeftSeconds,
    availableAt: citizen.availableAt?.toISOString(),
    finaleAt: citizen.availableAt
      ? new Date(citizen.availableAt.getTime() - 60_000).toISOString()
      : null,
    secondsUntilFinale: Math.max(0, Math.ceil((due - 60_000 - now) / 1000)),
    balanceMinutes: citizen.balanceMinutes,
  });
});

// ── GET /citizens/number/:num/passport ───────────────────────────────────────
// Returns legacy SVG passport (kept for backwards-compatibility).
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

  const photoUri = loadPhotoAsDataUri(citizen.photoUrl);
  const svg = generatePassportSvg({
    citizenNumber: citizen.citizenNumber ?? num,
    name: citizen.name,
    surname: tryDecrypt(citizen.surname),     // decrypt PII
    givenNames: tryDecrypt(citizen.givenNames), // decrypt PII
    dateOfBirth: citizen.dateOfBirth,
    rank: citizen.rank,
    meritScore: citizen.meritScore,
    createdAt: citizen.createdAt,
    photoUri,
    signatureBase64: citizen.signatureBase64 ?? null,
  });

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-cache");
  res.send(svg);
});

// ── GET /citizens/number/:num/id-card ─────────────────────────────────────────
// Returns the new ID card SVG (matches physical TimeNation card template).
router.get("/citizens/number/:num/id-card", async (req, res): Promise<void> => {
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

  const photoUri = loadPhotoAsDataUri(citizen.photoUrl);

  const svg = generateIdCardSvg({
    citizenNumber: citizen.citizenNumber ?? num,
    name: citizen.name,
    surname: tryDecrypt(citizen.surname),     // decrypt PII
    givenNames: tryDecrypt(citizen.givenNames), // decrypt PII
    dateOfBirth: citizen.dateOfBirth,
    rank: citizen.rank,
    meritScore: citizen.meritScore,
    createdAt: citizen.createdAt,
    photoUrl: citizen.photoUrl,
    signatureBase64: citizen.signatureBase64 ?? null,
  }, photoUri);

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-cache");
  res.send(svg);
});

// ── GET /citizens/lookup/:num — public passport lookup by citizen number ───────
router.get("/citizens/lookup/:num", async (req, res): Promise<void> => {
  const num = (req.params["num"] ?? "").trim().replace(/\D/g, "").padStart(9, "0");

  let [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.citizenNumber, num))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин с таким номером не найден в реестре" });
    return;
  }

  if (
    citizen.registrationStatus === "pending" &&
    citizen.availableAt &&
    citizen.availableAt.getTime() <= Date.now()
  ) {
    const issued = await issueEligiblePassport(citizen.id);
    if (issued) {
      citizen = issued.citizen;
    } else {
      [citizen] = await db
        .select()
        .from(citizensTable)
        .where(eq(citizensTable.citizenNumber, num))
        .limit(1);
      if (!citizen) {
        res.status(404).json({ error: "Гражданин с таким номером не найден в реестре" });
        return;
      }
    }
  }

  if (citizen.registrationStatus !== "issued") {
    res.json({
      status: "pending",
      citizenNumber: num,
      message: "Документы находятся на этапе верификации. Пожалуйста, подождите.",
    });
    return;
  }

  res.json({
    status: "issued",
    citizenNumber: num,
    name: citizen.name,
    rank: citizen.rank,
    idCardUrl: `/api/citizens/number/${num}/id-card`,
    passportUrl: `/api/citizens/number/${num}/passport`,
    balanceMinutes: citizen.balanceMinutes,
  });
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

router.post("/citizens/:id/wallet-link", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid citizen ID" });
    return;
  }
  if (req.citizen!.id !== id) {
    res.status(403).json({ error: "Нельзя привязать кошелёк к другому гражданину" });
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
router.post("/citizens/:id/age-verify", (_req, res): void => {
  res.status(410).json({ error: "Самостоятельная age-verify отключена; возраст определяется по дате рождения." });
});

// ── POST /citizens/audit-rate — расчёт коэффициента Kq через ИИ ───────────────
router.post("/citizens/audit-rate", async (req: Request, res: Response) => {
  const parsed = z.object({
    citizenId: z.number().int().positive(),
    professionalSkills: z.string().min(20),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверные данные" }); return; }
  const { citizenId, professionalSkills } = parsed.data;

  const [citizen] = await db.select().from(citizensTable).where(eq(citizensTable.id, citizenId)).limit(1);
  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  try {
    const audit = await auditCitizenRate(professionalSkills);
    const kq = Math.max(0.5, Math.min(2.5, audit.kq));
    await db.update(citizensTable).set({
      professionalSkills,
      calculatedMinuteRate: kq,
      skillsAuditedAt: new Date(),
    }).where(eq(citizensTable.id, citizenId));
    req.log.info({ citizenId, kq }, "Rate audited");
    res.json({ kq, industry: audit.industry, justification: audit.justification, depositBonus: audit.depositBonus });
  } catch (err) {
    req.log.error({ err }, "audit-rate error");
    res.status(500).json({ error: "Ошибка ИИ-аудитора" });
  }
});

// ── POST /citizens/deposit-labor — депонирование потенциального труда ─────────
router.post("/citizens/deposit-labor", async (req: Request, res: Response) => {
  const parsed = z.object({
    citizenId: z.number().int().positive(),
    professionalSkills: z.string().min(20),
    depositHours: z.number().min(0.5).max(8),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверные данные" }); return; }
  const { citizenId, professionalSkills, depositHours } = parsed.data;

  const [citizen] = await db.select().from(citizensTable).where(eq(citizensTable.id, citizenId)).limit(1);
  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  const totalDeposited = (citizen.potentialLaborDepositedMinutes ?? 0) + depositHours * 60;
  if (totalDeposited > 480) {
    res.status(400).json({ error: `Превышен лимит 8 часов (480 мин). Уже задепонировано: ${citizen.potentialLaborDepositedMinutes} мин` });
    return;
  }

  let kq = citizen.calculatedMinuteRate ?? 1.0;
  let industry = "";
  let justification = "";
  let depositBonus = 0;

  try {
    const audit = await auditCitizenRate(professionalSkills);
    kq = Math.max(0.5, Math.min(2.5, audit.kq));
    industry = audit.industry;
    justification = audit.justification;
    depositBonus = Math.min(120, audit.depositBonus ?? 0);
  } catch (err) {
    req.log.warn({ err }, "Gemini audit failed, using existing rate");
  }

  const earnedDarmins = Math.round(depositHours * kq * 60) + depositBonus;

  await db.update(citizensTable).set({
    professionalSkills,
    calculatedMinuteRate: kq,
    skillsAuditedAt: new Date(),
    potentialLaborDepositedMinutes: Math.round(totalDeposited),
    balanceMinutes: citizen.balanceMinutes + earnedDarmins,
  }).where(eq(citizensTable.id, citizenId));

  req.log.info({ citizenId, kq, depositHours, earnedDarmins }, "Labor deposited");
  res.json({ kq, industry, justification, depositBonus, earnedDarmins, totalDepositedMinutes: Math.round(totalDeposited) });
});

// ── POST /citizens/audit-task — гражданский ИИ-аудит (без gov-пароля) ─────────

async function getAuditorPrompt(): Promise<string> {
  const [row] = await db
    .select()
    .from(aiSystemPromptsTable)
    .where(eq(aiSystemPromptsTable.module, "time_auditor"))
    .limit(1);
  return row?.promptText ?? `Ты — Главный Аудитор Времени TimeNation. Оцени задачу в минутах (1 мин = 1 Дармин).
Базовые ориентиры: Разработка: простой скрипт 60 мин, багфикс 30–90 мин, архитектура 240+ мин. Дизайн: баннер 45 мин, иллюстрация 120 мин, UI-экран 90 мин. Тексты: 1000 знаков 20 мин, перевод страницы 30 мин.
Верни строго JSON: { "estimated_minutes": number, "confidence_score": number, "complexity_level": "low"|"medium"|"high", "justification": "строка" }`;
}

router.post("/citizens/audit-task", async (req: Request, res: Response) => {
  const bodySchema = z.object({
    taskDescription: z.string().min(5),
    citizenId: z.number().int().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные данные" });
    return;
  }
  const { taskDescription, citizenId } = parsed.data;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "GOOGLE_API_KEY не настроен" });
    return;
  }

  try {
    const systemPrompt = await getAuditorPrompt();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
    const result = await model.generateContent(`Задача для аудита:\n${taskDescription}`);
    const raw = result.response.text().trim();
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    let ai: { estimated_minutes: number; confidence_score?: number; complexity_level: string; justification: string };
    try { ai = JSON.parse(clean) as typeof ai; } catch {
      res.status(502).json({ error: "ИИ вернул неверный формат" });
      return;
    }

    const [row] = await db.insert(timeAuditLogsTable).values({
      citizenId: citizenId ?? null,
      taskDescription,
      estimatedMinutes: ai.estimated_minutes,
      complexityLevel: ai.complexity_level,
      justification: ai.justification,
      requiresCalibration: 0,
    }).returning();

    res.json({ log: row, confidenceScore: ai.confidence_score ?? null });
  } catch (err) {
    req.log.error({ err }, "citizen audit-task error");
    res.status(500).json({ error: "Ошибка вызова ИИ-аудитора" });
  }
});

// GET /citizens/:id/audit-logs — история аудитов гражданина
router.get("/:id/audit-logs", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Неверный ID" }); return; }
  const logs = await db
    .select()
    .from(timeAuditLogsTable)
    .where(eq(timeAuditLogsTable.citizenId, id))
    .orderBy(desc(timeAuditLogsTable.createdAt))
    .limit(20);
  res.json({ logs });
});

// PATCH /citizens/audit-logs/:logId/actual — записать фактическое время
router.patch("/audit-logs/:logId/actual", async (req: Request, res: Response) => {
  const logId = parseInt(req.params["logId"] as string);
  if (isNaN(logId)) { res.status(400).json({ error: "Неверный ID" }); return; }
  const { actualMinutes } = z.object({ actualMinutes: z.number().positive() }).parse(req.body);

  const [existing] = await db.select().from(timeAuditLogsTable)
    .where(eq(timeAuditLogsTable.id, logId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Запись не найдена" }); return; }

  const deviation = Math.abs((actualMinutes - existing.estimatedMinutes) / existing.estimatedMinutes * 100);
  const [updated] = await db.update(timeAuditLogsTable).set({
    actualMinutes,
    deviationPercent: deviation,
    requiresCalibration: deviation > 20 ? 1 : 0,
  }).where(eq(timeAuditLogsTable.id, logId)).returning();

  res.json({ log: updated });
});

// ── GET /api/citizens/:id/rate ────────────────────────────────────────────────
// Returns the AI-Auditor rate info for a citizen (used in TiMETR transfer widget).
router.get("/citizens/:id/rate", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [citizen] = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      calculatedMinuteRate: citizensTable.calculatedMinuteRate,
      professionalSkills: citizensTable.professionalSkills,
      reviewScoreCount: citizensTable.reviewScoreCount,
      meritScore: citizensTable.meritScore,
      rank: citizensTable.rank,
      skillsAuditedAt: citizensTable.skillsAuditedAt,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  res.json({
    ...citizen,
    calculatedHourRate: citizen.calculatedMinuteRate * 60,
    skillsAuditedAt: citizen.skillsAuditedAt?.toISOString() ?? null,
  });
});

// ── POST /api/citizens/log-focus ──────────────────────────────────────────────
// Records a completed Pomodoro focus session for AI-Auditor activity tracking.
router.post("/citizens/log-focus", async (req, res): Promise<void> => {
  const { citizenId, durationMinutes } = req.body as { citizenId?: number; durationMinutes?: number };
  if (!citizenId || !durationMinutes) {
    res.status(400).json({ error: "citizenId and durationMinutes required" });
    return;
  }
  const [citizen] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);
  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  req.log.info({ citizenId, durationMinutes }, "Focus session logged");
  res.json({ ok: true, citizenId, durationMinutes, message: `${durationMinutes} мин фокусировки зачислено в профиль` });
});

export default router;
