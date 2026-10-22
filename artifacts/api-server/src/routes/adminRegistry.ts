/**
 * Admin Registry — База данных граждан с двухфакторной защитой.
 *
 * 2FA flow:
 *   1. POST /admin/registry/request-otp  (master-password check → OTP sent via TG + email)
 *   2. POST /admin/registry/verify        (master-password + OTP → 24h registry session token)
 *
 * All data endpoints require X-Registry-Token header.
 *
 *   GET  /admin/registry/users              — full citizen list
 *   GET  /admin/registry/users/:id          — single citizen profile (incl. photo + signature)
 *   POST /admin/registry/users/:id/action   — restart_emission | activate | block
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { db } from "@workspace/db";
import { citizensTable, blockVoteRequestsTable, governmentPollsTable, governmentPollBallotsTable } from "@workspace/db";
import { eq, or, ilike, sql, ne, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { sendDirectMessage, getBot } from "../services/telegramService";
import { sendRegistryOtpEmail } from "../services/emailService";
import { logger } from "../lib/logger";
import { issueEligiblePassport } from "../services/passportIssuanceService";
import { notifyPassportEmissionStarted } from "../services/telegramService";
import { encryptNullable, tryDecrypt } from "../services/encryptionService";
import { cropSignature, normalizePassportPhoto } from "../services/imageService";
import { deriveAgeTier } from "../services/ageGateService";
import { getCitizenDisplayName } from "../services/citizenIdentity";
import { syncProductionCitizensToSheets } from "../lib/googleSheets";

const router = Router();
const registryPhotoDir = path.join(process.cwd(), "secure_vault", "photos");
fs.mkdirSync(registryPhotoDir, { recursive: true });

const registryPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, fieldSize: 1_500_000, fields: 8 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Фото должно быть JPG, PNG или WEBP"));
  },
});

async function syncCurrentCitizenSnapshotToSheets() {
  const rows = await db
    .select({
      citizenNumber: citizensTable.citizenNumber,
      citizenId: citizensTable.id,
      name: citizensTable.name,
      phone: citizensTable.phone,
      rank: citizensTable.rank,
      balanceMinutes: citizensTable.balanceMinutes,
      meritScore: citizensTable.meritScore,
      registrationStatus: citizensTable.registrationStatus,
    })
    .from(citizensTable)
    .where(isNotNull(citizensTable.citizenNumber))
    .orderBy(citizensTable.id);

  return syncProductionCitizensToSheets(
    rows.flatMap((row) => row.citizenNumber
      ? [{
          citizenNumber: row.citizenNumber,
          citizenId: row.citizenId,
          name: row.name,
          phone: row.phone,
          rank: row.rank,
          balanceMinutes: row.balanceMinutes,
          meritScore: row.meritScore,
          registrationStatus: row.registrationStatus ?? "issued",
        }]
      : []),
    { completeSnapshot: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory stores
// ─────────────────────────────────────────────────────────────────────────────

interface RegistryOtp {
  otp: string;
  expiresAt: number;
}
const otpStore = new Map<number, RegistryOtp>(); // key = adminId

interface RegistrySession {
  adminId: number;
  expiresAt: number;
}
const sessionStore = new Map<string, RegistrySession>(); // key = token UUID

// Purge expired entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore)     if (now > v.expiresAt)     otpStore.delete(k);
  for (const [k, v] of sessionStore) if (now > v.expiresAt) sessionStore.delete(k);
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: verify registry session token
// ─────────────────────────────────────────────────────────────────────────────

function requireRegistrySession(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const token = req.headers["x-registry-token"] as string | undefined;
  if (!token) {
    res.status(403).json({ error: "X-Registry-Token required" });
    return;
  }
  const session = sessionStore.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionStore.delete(token ?? "");
    res.status(403).json({ error: "Registry session expired or invalid. Re-authenticate." });
    return;
  }
  // Attach adminId for downstream use
  (req as import("express").Request & { registryAdminId?: number }).registryAdminId = session.adminId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/request-otp
// Requires: regular admin auth + master password in body
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/request-otp",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { masterPassword } = req.body as { masterPassword?: string };

    const expected = process.env["ADMIN_SECRET_PASSWORD"];
    if (!expected) {
      res.status(500).json({ error: "ADMIN_SECRET_PASSWORD not configured on server" });
      return;
    }
    if (!masterPassword || masterPassword !== expected) {
      res.status(401).json({ error: "Неверный мастер-пароль" });
      return;
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(req.citizen!.id, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // Deliver via Telegram (to ADMIN_TELEGRAM_ID env) + email
    const adminTgId = process.env["ADMIN_TELEGRAM_ID"] ?? "";
    const tgMsg =
      `🛡️ *TimeNation — Вход в Реестр Граждан*\n\n` +
      `Ваш OTP-код:\n\`${otp}\`\n\n` +
      `Действителен 5 минут. Никому не передавайте.`;

    const [tgSent, emailSent] = await Promise.allSettled([
      adminTgId ? sendDirectMessage(adminTgId, tgMsg) : Promise.resolve(false),
      sendRegistryOtpEmail(otp),
    ]);

    const tgOk = tgSent.status === "fulfilled" && tgSent.value;
    const emailOk = emailSent.status === "fulfilled" && emailSent.value;

    if (!tgOk && !emailOk) {
      // Fallback — log OTP so admin can find it in workflow logs
      logger.warn({ otp }, "Registry OTP: delivery failed — CODE LOGGED");
    }

    logger.info({ adminId: req.citizen!.id, tgOk, emailOk }, "Registry OTP requested");
    res.json({ ok: true, tgSent: tgOk, emailSent: emailOk });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/verify
// Requires: regular admin auth + master password + OTP
// Returns: { token } — 24h registry session token
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/verify",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { masterPassword, otp } = req.body as { masterPassword?: string; otp?: string };

    const expected = process.env["ADMIN_SECRET_PASSWORD"];
    if (!expected) {
      res.status(500).json({ error: "ADMIN_SECRET_PASSWORD not configured" });
      return;
    }
    if (!masterPassword || masterPassword !== expected) {
      res.status(401).json({ error: "Неверный мастер-пароль" });
      return;
    }

    const record = otpStore.get(req.citizen!.id);
    if (!record) {
      res.status(400).json({ error: "OTP не запрошен или истёк. Нажмите «Запросить код»." });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(req.citizen!.id);
      res.status(400).json({ error: "Срок действия OTP истёк. Запросите новый код." });
      return;
    }
    if (!otp || otp.trim() !== record.otp) {
      res.status(401).json({ error: "Неверный OTP-код." });
      return;
    }

    // Issue 24h session token
    otpStore.delete(req.citizen!.id);
    const token = randomUUID();
    sessionStore.set(token, {
      adminId: req.citizen!.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    logger.info({ adminId: req.citizen!.id }, "Registry session created");
    res.json({ ok: true, token });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/users
// Requires: X-Registry-Token
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/registry/users", requireRegistrySession, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };

  // Build query
  let query = db
    .select({
      id:                 citizensTable.id,
      name:               citizensTable.name,
      surname:            citizensTable.surname,
      givenNames:         citizensTable.givenNames,
      citizenNumber:      citizensTable.citizenNumber,
      rank:               citizensTable.rank,
      telegramId:         citizensTable.telegramId,
      telegramUsername:   citizensTable.telegramUsername,
      email:              citizensTable.email,
      whatsappPhone:      citizensTable.whatsappPhone,
      phone:              citizensTable.phone,
      registrationStatus: citizensTable.registrationStatus,
      status:             citizensTable.status,
      balanceMinutes:     citizensTable.balanceMinutes,
      isAdmin:            citizensTable.isAdmin,
      govRole:            citizensTable.govRole,
      availableAt:        citizensTable.availableAt,
      createdAt:          citizensTable.createdAt,
      lastActivity:       citizensTable.lastActivity,
      hasPhoto: sql<boolean>`(${citizensTable.photoUrl} IS NOT NULL)`.as("has_photo"),
      hasSignature: sql<boolean>`(${citizensTable.signatureBase64} IS NOT NULL)`.as("has_signature"),
    })
    .from(citizensTable);

  // Status filter
  const statusMap: Record<string, string> = {
    active:   "issued",
    rejected: "rejected",
    pending:  "pending",
    banned:   "banned",
  };
  if (status && status !== "all" && statusMap[status]) {
    if (status === "banned") {
      query = query.where(eq(citizensTable.status, "banned")) as typeof query;
    } else {
      query = query.where(eq(citizensTable.registrationStatus, statusMap[status]!)) as typeof query;
    }
  }

  const citizens = (await query.orderBy(citizensTable.id)).map((citizen) => ({
    ...citizen,
    name: getCitizenDisplayName(citizen),
  }));

  // Apply search filter in JS (simpler than complex SQL OR across text fields)
  const q = search?.toLowerCase().trim();
  const filtered = q
    ? citizens.filter(c =>
        String(c.id).includes(q) ||
        (c.name?.toLowerCase().includes(q)) ||
        (c.telegramId?.toLowerCase().includes(q)) ||
        (c.telegramUsername?.toLowerCase().includes(q)) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.citizenNumber?.toLowerCase().includes(q))
      )
    : citizens;

  res.json(filtered);
});

router.post("/admin/registry/sync-google-sheets", requireRegistrySession, async (req, res): Promise<void> => {
  if (process.env["NODE_ENV"] !== "production") {
    res.status(409).json({ error: "Сверка доступна только в production" });
    return;
  }

  const result = await syncCurrentCitizenSnapshotToSheets();
  if (!result.ok) {
    res.status(502).json({ error: result.error ?? "Не удалось синхронизировать таблицу" });
    return;
  }

  const adminId = (req as unknown as { registryAdminId?: number }).registryAdminId;
  req.log.info({ adminId, ...result }, "Admin synchronized production citizen register to Google Sheets");
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/users/:id  — full profile (incl. photo + signature)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/registry/users/:id", requireRegistrySession, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [citizen] = await db
    .select({
      id:                 citizensTable.id,
      name:               citizensTable.name,
      citizenNumber:      citizensTable.citizenNumber,
      rank:               citizensTable.rank,
      telegramId:         citizensTable.telegramId,
      telegramUsername:   citizensTable.telegramUsername,
      email:              citizensTable.email,
      whatsappPhone:      citizensTable.whatsappPhone,
      phone:              citizensTable.phone,
      registrationStatus: citizensTable.registrationStatus,
      status:             citizensTable.status,
      balanceMinutes:     citizensTable.balanceMinutes,
      isAdmin:            citizensTable.isAdmin,
      govRole:            citizensTable.govRole,
      availableAt:        citizensTable.availableAt,
      createdAt:          citizensTable.createdAt,
      lastActivity:       citizensTable.lastActivity,
      photoUrl:           citizensTable.photoUrl,
      signatureBase64:    citizensTable.signatureBase64,
      surname:            citizensTable.surname,
      givenNames:         citizensTable.givenNames,
      dateOfBirth:        citizensTable.dateOfBirth,
      meritScore:         citizensTable.meritScore,
      totalGiven:         citizensTable.totalGiven,
      totalReceived:      citizensTable.totalReceived,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Citizen not found" }); return; }

  // Never expose raw filesystem path to the client
  res.json({
    ...citizen,
    name: getCitizenDisplayName(citizen),
    surname: tryDecrypt(citizen.surname) ?? "",
    givenNames: tryDecrypt(citizen.givenNames) ?? "",
    hasPhoto: !!citizen.photoUrl,
    photoUrl: undefined,
  });
});

// Update identity details and documents only from a valid admin registry session.
router.patch(
  "/admin/registry/users/:id/citizen-number",
  requireRegistrySession,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Неверный ID гражданина" });
      return;
    }

    const body = z.object({
      citizenNumber: z.string().regex(/^\d{9}$/, "Номер паспорта должен содержать 9 цифр"),
    }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Неверный номер паспорта" });
      return;
    }

    try {
      const [updated] = await db
        .update(citizensTable)
        .set({ citizenNumber: body.data.citizenNumber })
        .where(eq(citizensTable.id, id))
        .returning({ id: citizensTable.id, citizenNumber: citizensTable.citizenNumber });

      if (!updated) {
        res.status(404).json({ error: "Гражданин не найден" });
        return;
      }

      const adminId = (req as unknown as { registryAdminId?: number }).registryAdminId;
      req.log.info({ adminId, citizenId: id }, "Admin registry passport number updated");
      let sheetSync: Awaited<ReturnType<typeof syncCurrentCitizenSnapshotToSheets>> | null = null;
      if (process.env["NODE_ENV"] === "production") {
        try {
          sheetSync = await syncCurrentCitizenSnapshotToSheets();
        } catch (syncError) {
          req.log.warn({ err: syncError, adminId, citizenId: id }, "Passport number saved but production sheet snapshot could not be loaded");
          sheetSync = {
            ok: false,
            updated: 0,
            appended: 0,
            unverified: 0,
            error: "Номер сохранён, но не удалось загрузить production-реестр для синхронизации",
          };
        }
      }
      if (sheetSync && !sheetSync.ok) {
        req.log.warn({ adminId, citizenId: id, reason: sheetSync.error }, "Passport number saved but Google Sheets sync failed");
      }
      res.json({ ok: true, id: updated.id, citizenNumber: updated.citizenNumber, sheetSync });
    } catch (error) {
      const dbError = error as { code?: string; cause?: { code?: string; cause?: { code?: string } } };
      if (dbError.code === "23505" || dbError.cause?.code === "23505" || dbError.cause?.cause?.code === "23505") {
        res.status(409).json({ error: "Этот номер паспорта уже назначен другому гражданину" });
        return;
      }
      throw error;
    }
  },
);

router.patch(
  "/admin/registry/users/:id",
  requireRegistrySession,
  registryPhotoUpload.single("photo"),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = Number.parseInt(rawId ?? "", 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Неверный ID гражданина" });
      return;
    }

    const body = z.object({
      name: z.string().trim().min(1).max(160),
      surname: z.string().trim().min(1).max(80),
      givenNames: z.string().trim().min(1).max(100),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате ГГГГ-ММ-ДД"),
      signatureBase64: z.string().max(1_500_000).optional(),
    }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Проверьте данные паспорта" });
      return;
    }
    const dobDate = new Date(`${body.data.dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(dobDate.getTime()) || dobDate.toISOString().slice(0, 10) !== body.data.dateOfBirth) {
      res.status(400).json({ error: "Укажите корректную дату рождения" });
      return;
    }

    let signatureBase64: string | undefined;
    if (body.data.signatureBase64 !== undefined) {
      if (!/^data:image\/(?:png|jpeg);base64,/i.test(body.data.signatureBase64)) {
        res.status(400).json({ error: "Подпись должна быть PNG или JPEG" });
        return;
      }
      const cropped = await cropSignature(body.data.signatureBase64);
      if (!cropped) {
        res.status(400).json({ error: "Не удалось распознать подпись" });
        return;
      }
      signatureBase64 = cropped;
    }

    const [current] = await db
      .select({ id: citizensTable.id, photoUrl: citizensTable.photoUrl })
      .from(citizensTable)
      .where(eq(citizensTable.id, id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Гражданин не найден" });
      return;
    }

    let newPhotoPath: string | null = null;
    if (req.file) {
      const ext = req.file.mimetype === "image/png" ? ".png" : req.file.mimetype === "image/webp" ? ".webp" : ".jpg";
      newPhotoPath = path.join(registryPhotoDir, `photo_registry_${id}_${randomUUID()}${ext}`);
      fs.writeFileSync(newPhotoPath, req.file.buffer);
      if (ext !== ".jpg") {
        newPhotoPath = await normalizePassportPhoto(newPhotoPath);
      }
    }

    const updates: Partial<typeof citizensTable.$inferInsert> = {
      name: body.data.name,
      surname: encryptNullable(body.data.surname),
      givenNames: encryptNullable(body.data.givenNames),
      dateOfBirth: body.data.dateOfBirth,
      ageTier: deriveAgeTier(body.data.dateOfBirth),
    };
    if (signatureBase64 !== undefined) updates.signatureBase64 = signatureBase64;
    if (newPhotoPath) updates.photoUrl = `vault:photos/${path.basename(newPhotoPath)}`;

    try {
      await db.update(citizensTable).set(updates).where(eq(citizensTable.id, id));
    } catch (error) {
      if (newPhotoPath) fs.unlink(newPhotoPath, () => undefined);
      throw error;
    }

    if (newPhotoPath && current.photoUrl?.startsWith("vault:")) {
      const oldRelative = current.photoUrl.slice("vault:".length);
      const oldPath = path.resolve(process.cwd(), "secure_vault", oldRelative);
      if (oldPath.startsWith(`${path.resolve(process.cwd(), "secure_vault")}${path.sep}`)) {
        fs.unlink(oldPath, () => undefined);
      }
    }

    const adminId = (req as unknown as { registryAdminId?: number }).registryAdminId;
    req.log.info({ adminId, citizenId: id, photoUpdated: !!newPhotoPath, signatureUpdated: signatureBase64 !== undefined }, "Admin registry passport details updated");
    res.json({ ok: true });
  }
);

router.post("/admin/registry/users/:id/request-signature", requireRegistrySession, async (req, res): Promise<void> => {
  const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Неверный ID гражданина" });
    return;
  }

  const [citizen] = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      surname: citizensTable.surname,
      givenNames: citizensTable.givenNames,
      telegramId: citizensTable.telegramId,
      signatureBase64: citizensTable.signatureBase64,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }
  if (citizen.signatureBase64?.trim()) {
    res.status(409).json({ error: "Подпись уже добавлена" });
    return;
  }
  if (!citizen.telegramId) {
    res.status(409).json({ error: "У гражданина не привязан Telegram" });
    return;
  }

  const bot = getBot();
  if (!bot) {
    res.status(503).json({ error: "Telegram-бот сейчас недоступен" });
    return;
  }

  const citizenName = getCitizenDisplayName(citizen);
  const signatureUrl = "https://chrono-genesis.replit.app/web/signature-request";
  try {
    await bot.telegram.sendMessage(
      citizen.telegramId,
      `✍️ ${citizenName}, администратор TimeNation просит добавить подпись в реестр граждан.\n\nОткройте форму, распишитесь пальцем или мышью и отправьте подпись. Она сохранится в вашем паспорте и реестре.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Добавить подпись", url: signatureUrl }]],
        },
      },
    );
  } catch (error) {
    logger.warn({ err: error, citizenId: id }, "Admin signature request Telegram delivery failed");
    res.status(502).json({ error: "Не удалось отправить сообщение в Telegram" });
    return;
  }

  const adminId = (req as import("express").Request & { registryAdminId?: number }).registryAdminId;
  logger.info({ adminId, citizenId: id }, "Admin requested citizen passport signature");
  res.json({ ok: true, message: `Запрос подписи отправлен гражданину ${citizenName} в Telegram` });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/users/:id/photo?token=<session-token>
// Serves the citizen's vault photo. Uses query-param auth because <img> tags
// cannot set custom headers.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/registry/users/:id/photo", async (req, res): Promise<void> => {
  // Validate registry session via query param
  const token = req.query["token"] as string | undefined;
  if (!token) { res.status(403).json({ error: "token required" }); return; }
  const session = sessionStore.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionStore.delete(token ?? "");
    res.status(403).json({ error: "Registry session expired" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [citizen] = await db
    .select({ photoUrl: citizensTable.photoUrl })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen || !citizen.photoUrl) {
    res.status(404).json({ error: "No photo" });
    return;
  }

  // Resolve vault: prefix (photos saved as "vault:photos/filename.jpg")
  let filePath = citizen.photoUrl;
  if (filePath.startsWith("vault:")) {
    filePath = path.join(process.cwd(), "secure_vault", filePath.slice("vault:".length));
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Photo file not found on disk" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const contentType = mimeMap[ext] ?? "image/jpeg";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=300");
  fs.createReadStream(filePath).pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/users/:id/action
// Body: { action: "restart_emission" | "activate" | "block" }
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/users/:id/action",
  requireRegistrySession,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { action, reason } = req.body as { action?: string; reason?: string };
    if (!action) { res.status(400).json({ error: "action required" }); return; }

    // Citizen #1 (первый администратор) защищён от любой блокировки
    if (action === "block" && id === 1) {
      res.status(403).json({ error: "Блокировка администратора (гражданина №1) невозможна" });
      return;
    }

    const [citizen] = await db
      .select({
        id: citizensTable.id,
        name: citizensTable.name,
        citizenNumber: citizensTable.citizenNumber,
        registrationStatus: citizensTable.registrationStatus,
        signatureBase64: citizensTable.signatureBase64,
      })
      .from(citizensTable)
      .where(eq(citizensTable.id, id))
      .limit(1);

    if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

    const adminId = (req as import("express").Request & { registryAdminId?: number }).registryAdminId;

    if (action === "restart_emission") {
      const newAvailableAt = new Date(Date.now() + 60 * 60 * 1000);
      await db
        .update(citizensTable)
        .set({ registrationStatus: "pending", availableAt: newAvailableAt, status: "active" })
        .where(eq(citizensTable.id, id));
      void notifyPassportEmissionStarted({
        citizenId: citizen.id,
        citizenName: citizen.name,
        citizenNumber: citizen.citizenNumber,
        availableAt: newAvailableAt,
      });
      logger.info({ adminId, citizenId: id }, "Admin: restart_emission");
      res.json({ ok: true, message: `Эмиссия перезапущена для ${citizen.name}` });

    } else if (action === "activate") {
      if (!citizen.signatureBase64?.trim()) {
        res.status(409).json({ error: "Перед активацией добавьте подпись гражданина" });
        return;
      }
      // Manual admin approval still uses the same atomic issuance path so the
      // ancestral-minute grant and ledger entry cannot be skipped.
      await db
        .update(citizensTable)
        .set({ registrationStatus: "pending", availableAt: new Date(), status: "active" })
        .where(eq(citizensTable.id, id));
      const issued = await issueEligiblePassport(id);
      if (!issued) {
        res.status(409).json({ error: "Не удалось активировать паспорт" });
        return;
      }
      logger.info({ adminId, citizenId: id }, "Admin: manual activate");
      res.json({ ok: true, message: `${citizen.name} — паспорт активирован вручную` });

    } else if (action === "block") {
      // Требуем причину блокировки
      if (!reason?.trim()) {
        res.status(400).json({ error: "Укажите причину блокировки" });
        return;
      }

      // Создаём запрос на голосование (не блокируем сразу)
      const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [voteRequest] = await db
        .insert(blockVoteRequestsTable)
        .values({
          citizenId:     id,
          citizenName:   citizen.name ?? "—",
          reason:        reason.trim(),
          initiatedById: adminId ?? 0,
          endsAt,
        })
        .returning({ id: blockVoteRequestsTable.id });

      logger.info({ adminId, citizenId: id, voteRequestId: voteRequest!.id }, "Admin: block vote initiated");

      // Уведомляем всех eligible voters (govRole != 'citizen' + isAdmin=1)
      await notifyBlockVoters(voteRequest!.id, citizen.name ?? "—", reason.trim(), endsAt);

      res.json({
        ok: true,
        voteRequestId: voteRequest!.id,
        message: `Голосование о блокировке ${citizen.name} инициировано. Членам правительства и судьям отправлено уведомление в Telegram.`,
      });

    } else {
      res.status(400).json({ error: `Unknown action: ${action}` });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Notify eligible voters via Telegram
// ─────────────────────────────────────────────────────────────────────────────
async function notifyBlockVoters(
  voteRequestId: number,
  citizenName: string,
  reason: string,
  endsAt: Date,
): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  // Eligible: govRole != 'citizen' OR isAdmin = 1, with linked Telegram
  const voters = await db
    .select({ id: citizensTable.id, telegramId: citizensTable.telegramId, name: citizensTable.name })
    .from(citizensTable)
    .where(
      eq(citizensTable.isAdmin, 1),
    );

  // Also fetch non-citizen gov members
  const govMembers = await db
    .select({ id: citizensTable.id, telegramId: citizensTable.telegramId, name: citizensTable.name })
    .from(citizensTable)
    .where(ne(citizensTable.govRole, "citizen"));

  const allVoters = [...voters, ...govMembers].filter(
    (v, i, arr) => v.telegramId && arr.findIndex(x => x.id === v.id) === i,
  );

  const domain = process.env["REPLIT_DEV_DOMAIN"] ?? "";
  const voteUrl = domain
    ? `https://${domain}/web/gov/block-votes`
    : "https://timenation.info/web/gov/block-votes";

  const endsStr = endsAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

  const msg =
    `🗳️ *Голосование о блокировке гражданина*\n\n` +
    `👤 *Гражданин:* ${citizenName}\n` +
    `📋 *Причина:* ${reason}\n\n` +
    `⏰ Голосование открыто до *${endsStr} (МСК)*\n\n` +
    `Нажмите кнопку ниже, чтобы проголосовать.`;

  for (const voter of allVoters) {
    if (!voter.telegramId) continue;
    bot.telegram
      .sendMessage(voter.telegramId, msg, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🗳 Голосовать", url: voteUrl },
          ]],
        },
      })
      .catch((err) => logger.warn({ err, voterId: voter.id }, "notifyBlockVoter: TG send failed"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/block-votes  — admin view of all vote requests
// ─────────────────────────────────────────────────────────────────────────────

import { blockVoteBallotsTable } from "@workspace/db";

router.get("/admin/registry/block-votes", requireRegistrySession, async (req, res): Promise<void> => {
  const votes = await db
    .select()
    .from(blockVoteRequestsTable)
    .orderBy(blockVoteRequestsTable.createdAt);

  const withCounts = await Promise.all(votes.map(async (v) => {
    const ballots = await db
      .select({ vote: blockVoteBallotsTable.vote, voterName: blockVoteBallotsTable.voterName })
      .from(blockVoteBallotsTable)
      .where(eq(blockVoteBallotsTable.requestId, v.id));
    return {
      ...v,
      yesCount: ballots.filter(b => b.vote === "yes").length,
      noCount:  ballots.filter(b => b.vote === "no").length,
      ballots,
    };
  }));

  res.json(withCounts);
});

const PollRole = z.enum(["citizen", "labor_officer", "gov_admin", "system_admin"]);
const GOVERNMENT_POLL_MIN_LEAD_MS = 24 * 60 * 60 * 1000;
const CreateGovernmentPollBody = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(""),
  eligibleRoles: z.array(PollRole).min(1).max(4),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

router.get("/admin/registry/general-votes", requireRegistrySession, async (_req, res): Promise<void> => {
  const polls = await db
    .select()
    .from(governmentPollsTable)
    .orderBy(governmentPollsTable.startsAt);

  const withCounts = await Promise.all(polls.map(async (poll) => {
    const ballots = await db
      .select({ vote: governmentPollBallotsTable.vote })
      .from(governmentPollBallotsTable)
      .where(eq(governmentPollBallotsTable.pollId, poll.id));
    return {
      ...poll,
      yesCount: ballots.filter((ballot) => ballot.vote === "yes").length,
      noCount: ballots.filter((ballot) => ballot.vote === "no").length,
    };
  }));
  res.json(withCounts);
});

router.post("/admin/registry/general-votes", requireRegistrySession, async (req, res): Promise<void> => {
  const parsed = CreateGovernmentPollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Проверьте параметры голосования" });
    return;
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
    res.status(400).json({ error: "Время окончания должно быть позже времени начала" });
    return;
  }
  if (startsAt.getTime() < Date.now() + GOVERNMENT_POLL_MIN_LEAD_MS) {
    res.status(400).json({ error: "Запланируйте голосование минимум за 24 часа до его начала" });
    return;
  }

  const roles = [...new Set(parsed.data.eligibleRoles)];
  const registryAdminId = (req as typeof req & { registryAdminId?: number }).registryAdminId ?? 0;
  const [poll] = await db.insert(governmentPollsTable).values({
    title: parsed.data.title,
    description: parsed.data.description,
    eligibleRoles: roles,
    createdBy: registryAdminId,
    startsAt,
    endsAt,
    status: "scheduled",
  }).returning();

  if (!poll) {
    res.status(500).json({ error: "Не удалось создать голосование" });
    return;
  }
  res.status(201).json({ ...poll, yesCount: 0, noCount: 0 });
});

export default router;
