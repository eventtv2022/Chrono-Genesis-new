import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { encrypt, encryptNullable, tryDecrypt } from "../services/encryptionService";

const VAULT_PHOTOS_DIR = path.join(process.cwd(), "secure_vault", "photos");
fs.mkdirSync(VAULT_PHOTOS_DIR, { recursive: true });

const router: IRouter = Router();

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Safe citizen shape (never exposes password fields) ────────────────────────
function safeRow(c: typeof citizensTable.$inferSelect) {
  // Never expose password fields or the auth token in regular profile responses
  const { passwordHash: _ph, resetPasswordToken: _rt, resetPasswordExpires: _re, authToken: _at, ...rest } = c;
  return {
    ...rest,
    email:      tryDecrypt(c.email)      ?? null,
    surname:    tryDecrypt(c.surname)    ?? null,
    givenNames: tryDecrypt(c.givenNames) ?? null,
    photoUrl:   c.photoUrl ? "vault:protected" : null,
    transferableBalance: c.balanceMinutes - 1,
    lastActivity: c.lastActivity?.toISOString() ?? null,
    createdAt:    c.createdAt.toISOString(),
    availableAt:  c.availableAt?.toISOString() ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Registers a new citizen with a password (hashed via bcrypt).
// ─────────────────────────────────────────────────────────────────────────────
const RegisterBody = z.object({
  name:     z.string().min(1, "Имя обязательно"),
  phone:    z.string().min(5, "Телефон обязателен"),
  password: z.string().min(6, "Пароль минимум 6 символов"),
  surname:    z.string().optional(),
  givenNames: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).optional(),
  email: z.string().email("Неверный email").optional().or(z.literal("")).optional(),
  telegramId: z.string().optional(),
  tosAcceptedAt: z.string().optional(),
  privacyAgreementAccepted: z.boolean().optional(),
  photoBase64: z.string().optional(), // data:image/...;base64,... from mobile
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { name, phone, password, surname, givenNames, dateOfBirth, email, telegramId, tosAcceptedAt, privacyAgreementAccepted, photoBase64 } = parsed.data;

  const existing = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.phone, phone))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Гражданин с таким телефоном уже существует" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Generate sequential citizen number
  const countRow = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .orderBy(citizensTable.id);
  const citizenNumber = String(countRow.length + 1).padStart(9, "0");
  const availableAt = new Date(Date.now() + 60 * 60 * 1000);

  // Save base64 photo to vault if provided
  let photoUrl: string | null = null;
  if (photoBase64) {
    try {
      const matches = photoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
        const buf = Buffer.from(matches[2]!, "base64");
        const filename = `photo_${Date.now()}.${ext}`;
        const filepath = path.join(VAULT_PHOTOS_DIR, filename);
        fs.writeFileSync(filepath, buf);
        photoUrl = filepath;
      }
    } catch (err) {
      logger.warn({ err }, "Failed to save photo from /auth/register");
    }
  }

  const newAuthToken = crypto.randomBytes(32).toString("hex");

  const [citizen] = await db
    .insert(citizensTable)
    .values({
      name,
      phone,
      passwordHash,
      authToken: newAuthToken,
      surname:    encryptNullable(surname ?? null),
      givenNames: encryptNullable(givenNames ?? null),
      dateOfBirth: dateOfBirth || null,
      email:      encryptNullable(email || null),
      telegramId: telegramId ?? undefined,
      citizenNumber,
      registrationStatus: "pending",
      availableAt,
      tosAcceptedAt: tosAcceptedAt ? new Date(tosAcceptedAt) : undefined,
      privacyAgreementAccepted: privacyAgreementAccepted ? 1 : 0,
      privacyAgreementDate: privacyAgreementAccepted ? new Date() : null,
      photoUrl,
    })
    .returning();

  req.log.info({ citizenId: citizen!.id, citizenNumber }, "Citizen registered via /auth/register");

  res.status(201).json({
    ...safeRow(citizen!),
    authToken: newAuthToken,
    citizenNumber,
    availableAt: availableAt.toISOString(),
    registrationStatus: "pending",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Phone + password login. Falls back to phone-only for legacy accounts.
// ─────────────────────────────────────────────────────────────────────────────
const LoginBody = z.object({
  phone:    z.string().min(1, "Телефон обязателен"),
  password: z.string().optional(),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { phone, password } = parsed.data;

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.phone, phone))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Гражданин с таким телефоном не найден" });
    return;
  }

  if (citizen.passwordHash) {
    // ── Password-protected account ───────────────────────────────────────────
    if (!password) {
      res.status(401).json({ error: "Этот аккаунт защищён паролем. Введите пароль." });
      return;
    }
    const ok = await bcrypt.compare(password, citizen.passwordHash);
    if (!ok) {
      req.log.warn({ citizenId: citizen.id }, "Failed login attempt — wrong password");
      res.status(401).json({ error: "Неверный пароль" });
      return;
    }
  } else {
    // ── Legacy phone-only account (no password set) ───────────────────────────
    req.log.info({ citizenId: citizen.id }, "Login via legacy phone-only (no password set)");
  }

  // Issue or reuse authToken
  let token = citizen.authToken;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await db.update(citizensTable).set({ authToken: token }).where(eq(citizensTable.id, citizen.id));
  }

  req.log.info({ citizenId: citizen.id }, "Citizen logged in");
  res.json({ ...safeRow(citizen), authToken: token });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Generates a reset token, logs the recovery link to the server console.
// ─────────────────────────────────────────────────────────────────────────────
const ForgotPasswordBody = z.object({
  phone: z.string().min(1, "Телефон обязателен"),
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { phone } = parsed.data;

  const [citizen] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.phone, phone))
    .limit(1);

  // Always return 200 to prevent phone enumeration
  if (!citizen) {
    res.json({ ok: true, message: "Если аккаунт с таким телефоном существует, токен выдан" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db
    .update(citizensTable)
    .set({ resetPasswordToken: token, resetPasswordExpires: expires })
    .where(eq(citizensTable.id, citizen.id));

  // In production — send via SMS or Telegram. For now, log to server console.
  const resetUrl = `/api/auth/reset-password?token=${token}`;
  logger.info(
    { citizenId: citizen.id, citizenName: citizen.name, resetUrl, expiresAt: expires.toISOString() },
    "🔑 PASSWORD RESET TOKEN ISSUED — send this link to the citizen"
  );

  req.log.info({ citizenId: citizen.id }, "Password reset token generated");
  res.json({ ok: true, message: "Токен восстановления выдан. Проверьте сервер-лог для получения ссылки." });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Validates the token and sets a new hashed password.
// ─────────────────────────────────────────────────────────────────────────────
const ResetPasswordBody = z.object({
  token:       z.string().min(1, "Токен обязателен"),
  newPassword: z.string().min(6, "Пароль минимум 6 символов"),
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { token, newPassword } = parsed.data;

  const [citizen] = await db
    .select({ id: citizensTable.id, resetPasswordExpires: citizensTable.resetPasswordExpires })
    .from(citizensTable)
    .where(eq(citizensTable.resetPasswordToken, token))
    .limit(1);

  if (!citizen) {
    res.status(400).json({ error: "Токен недействителен или уже использован" });
    return;
  }

  if (!citizen.resetPasswordExpires || citizen.resetPasswordExpires < new Date()) {
    res.status(400).json({ error: "Токен истёк. Запросите новый через /api/auth/forgot-password" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db
    .update(citizensTable)
    .set({
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    })
    .where(eq(citizensTable.id, citizen.id));

  req.log.info({ citizenId: citizen.id }, "Password reset successfully");
  res.json({ ok: true, message: "Пароль успешно изменён. Войдите с новым паролем." });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/set-password
// Lets a legacy (phone-only) citizen set a password for the first time.
// ─────────────────────────────────────────────────────────────────────────────
const SetPasswordBody = z.object({
  phone:       z.string().min(1),
  newPassword: z.string().min(6, "Пароль минимум 6 символов"),
});

router.post("/auth/set-password", async (req, res): Promise<void> => {
  const parsed = SetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { phone, newPassword } = parsed.data;

  const [citizen] = await db
    .select({ id: citizensTable.id, passwordHash: citizensTable.passwordHash })
    .from(citizensTable)
    .where(eq(citizensTable.phone, phone))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  if (citizen.passwordHash) {
    res.status(409).json({ error: "Пароль уже установлен. Используйте forgot-password для сброса." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db
    .update(citizensTable)
    .set({ passwordHash })
    .where(eq(citizensTable.id, citizen.id));

  req.log.info({ citizenId: citizen.id }, "Password set for legacy account");
  res.json({ ok: true, message: "Пароль установлен. Теперь при входе требуется пароль." });
});

// ── QR Login ─────────────────────────────────────────────────────────────────
import { generateQrToken, consumeQrToken } from "../services/qrAuthService";
import { pushQrLogin } from "../services/socialAlarmWs";

// GET /auth/qr-token — web requests a short-lived token to display as QR
router.get("/auth/qr-token", (_req, res) => {
  const token = generateQrToken();
  res.json({ token, expiresIn: 120 });
});

// POST /auth/qr-verify — mobile scans QR, verifies and pushes login to web WS
router.post("/auth/qr-verify", async (req, res): Promise<void> => {
  const { qrToken, authToken } = req.body as { qrToken?: string; authToken?: string };
  if (!qrToken || !authToken) {
    res.status(400).json({ error: "Требуются qrToken и authToken" });
    return;
  }

  // Verify mobile citizen by authToken
  const [citizen] = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      balanceMinutes: citizensTable.balanceMinutes,
      rank: citizensTable.rank,
      authToken: citizensTable.authToken,
    })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, authToken))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Неверный токен авторизации" });
    return;
  }

  // Check and consume the QR token
  const valid = consumeQrToken(qrToken);
  if (!valid) {
    res.status(400).json({ error: "QR-код недействителен или истёк. Обновите страницу." });
    return;
  }

  // Push login event to web socket waiting on this token
  const pushed = pushQrLogin(qrToken, {
    type: "qr_login",
    citizenId: citizen.id,
    authToken: citizen.authToken ?? "",
    name: citizen.name,
    balanceMinutes: citizen.balanceMinutes,
  });

  logger.info({ citizenId: citizen.id, pushed }, "QR login verified");
  res.json({ ok: true, pushed, citizenId: citizen.id });
});

export default router;
