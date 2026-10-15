import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { db, citizensTable, onboardingProgressTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { encrypt, encryptNullable, tryDecrypt } from "../services/encryptionService";
import { deriveAgeTier } from "../services/ageGateService";
import { requireAuth } from "../middleware/auth";
import { notifyPassportEmissionStarted } from "../services/telegramService";

const VAULT_PHOTOS_DIR = path.join(process.cwd(), "secure_vault", "photos");
fs.mkdirSync(VAULT_PHOTOS_DIR, { recursive: true });

const router: IRouter = Router();

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Safe citizen shape (never exposes password fields) ────────────────────────
function safeRow(c: typeof citizensTable.$inferSelect) {
  // Never expose password fields or the auth token in regular profile responses
  const {
    passwordHash: _ph, resetPasswordToken: _rt, resetPasswordExpires: _re, authToken: _at,
    dateOfBirth: _dob, ageTier: _ageTier, kycVerified: _kycVerified, ...rest
  } = c;
  return {
    ...rest,
    email:      tryDecrypt(c.email)      ?? null,
    surname:    tryDecrypt(c.surname)    ?? null,
    givenNames: tryDecrypt(c.givenNames) ?? null,
    photoUrl:   c.photoUrl ? "vault:protected" : null,
    transferableBalance: Math.max(0, c.balanceMinutes - 1),
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
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email("Неверный email").optional().or(z.literal("")).optional(),
  telegramId: z.string().optional(),
  tosAcceptedAt: z.string().optional(),
  privacyAgreementAccepted: z.boolean().optional(),
  photoBase64: z.string().optional(), // data:image/...;base64,... from mobile
  whatsappPhone: z.string().optional(),
  preferredChannels: z.string().optional(), // JSON: ['email','telegram','whatsapp','sms','phone'] — ≥2
  preApplicationProgressToken: z.string().regex(/^[a-f0-9]{64}$/),
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }

  const { name, phone, password, surname, givenNames, dateOfBirth, email, telegramId, tosAcceptedAt, privacyAgreementAccepted, photoBase64, whatsappPhone, preferredChannels, preApplicationProgressToken } = parsed.data;
  const ageTier = deriveAgeTier(dateOfBirth);
  if (!ageTier) {
    res.status(400).json({ error: "Укажите корректную дату рождения" });
    return;
  }
  if (ageTier === "UNDER_13") {
    res.status(403).json({ error: "Регистрация доступна с 13 лет", code: "MINIMUM_AGE_NOT_MET" });
    return;
  }

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

  const [preflightProgress] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.progressToken, preApplicationProgressToken))
    .limit(1);
  if (!preflightProgress?.guideCompleted || preflightProgress.citizenId !== null) {
    res.status(409).json({ error: "Сначала завершите 30 вопросов знакомства перед подачей заявления" });
    return;
  }

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
        name,
        phone,
        passwordHash,
        authToken: newAuthToken,
        balanceMinutes: 0,
        ancestralMinuteGranted: false,
        surname:    encryptNullable(surname ?? null),
        givenNames: encryptNullable(givenNames ?? null),
        dateOfBirth: dateOfBirth || null,
        ageTier,
        email:      encryptNullable(email || null),
        telegramId: telegramId ?? undefined,
        citizenNumber,
        registrationStatus: "pending",
        availableAt,
        onboardingCompleted: false,
        tosAcceptedAt: tosAcceptedAt ? new Date(tosAcceptedAt) : undefined,
        privacyAgreementAccepted: privacyAgreementAccepted ? 1 : 0,
        privacyAgreementDate: privacyAgreementAccepted ? new Date() : null,
        photoUrl,
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

  req.log.info({ citizenId: citizen.id, citizenNumber }, "Citizen registered via /auth/register");
  void notifyPassportEmissionStarted({
    citizenId: citizen.id,
    citizenName: citizen.name,
    citizenNumber: citizen.citizenNumber,
    availableAt,
  });

  res.status(201).json({
    ...safeRow(citizen),
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

  const ageTier = deriveAgeTier(citizen.dateOfBirth ?? "");
  if (ageTier === "UNDER_13") {
    res.status(403).json({ error: "Доступ к аккаунту недоступен до 13 лет", code: "MINIMUM_AGE_NOT_MET" });
    return;
  }
  if (ageTier && citizen.ageTier !== ageTier) {
    await db.update(citizensTable).set({ ageTier }).where(eq(citizensTable.id, citizen.id));
    citizen.ageTier = ageTier;
  }

  // Issue or reuse authToken
  let token = citizen.authToken;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    await db.update(citizensTable).set({ authToken: token }).where(eq(citizensTable.id, citizen.id));
  }

  req.log.info({ citizenId: citizen.id }, "Citizen logged in");
  res.json({ ...safeRow(citizen), authToken: token, ageProfileRequired: ageTier === null });
});

const CompleteAgeBody = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/auth/complete-age", requireAuth, async (req, res): Promise<void> => {
  const parsed = CompleteAgeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Укажите корректную дату рождения" });
    return;
  }

  const citizen = req.citizen!;
  const currentTier = deriveAgeTier(citizen.dateOfBirth ?? "");
  if (currentTier) {
    res.status(currentTier === "UNDER_13" ? 403 : 409).json({
      error: currentTier === "UNDER_13"
        ? "Доступ к аккаунту недоступен до 13 лет"
        : "Дата рождения уже подтверждена для этого аккаунта",
      ...(currentTier === "UNDER_13" ? { code: "MINIMUM_AGE_NOT_MET" } : {}),
    });
    return;
  }
  const ageTier = deriveAgeTier(parsed.data.dateOfBirth);
  if (!ageTier) {
    res.status(400).json({ error: "Укажите корректную дату рождения" });
    return;
  }
  if (ageTier === "UNDER_13") {
    res.status(403).json({ error: "Доступ к аккаунту недоступен до 13 лет", code: "MINIMUM_AGE_NOT_MET" });
    return;
  }

  await db.update(citizensTable)
    .set({ dateOfBirth: parsed.data.dateOfBirth, ageTier })
    .where(eq(citizensTable.id, citizen.id));
  res.json({ ok: true, ageTier });
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
import { generateQrToken, consumeQrToken, authorizeQrToken } from "../services/qrAuthService";
import { pushQrLogin } from "../services/socialAlarmWs";
import { getBotUsername } from "../services/telegramService";

// GET /auth/qr-token — web requests a short-lived token to display as QR.
// Returns the bot username so the frontend can build the correct t.me deep-link.
router.get("/auth/qr-token", (_req, res) => {
  const token = generateQrToken();
  const botUsername = getBotUsername() || "TimeNation_app_bot";
  res.json({ token, expiresIn: 120, botUsername });
});

// POST /auth/qr-verify — fallback: mobile app scans QR, verifies and pushes login to web WS.
// The primary flow is now via Telegram bot (/start qr_<token>), but this endpoint
// remains so existing mobile builds keep working.
router.post("/auth/qr-verify", async (req, res): Promise<void> => {
  const { qrToken, authToken } = req.body as { qrToken?: string; authToken?: string };
  if (!qrToken || !authToken) {
    res.status(400).json({ error: "Требуются qrToken и authToken" });
    return;
  }

  // Verify mobile citizen by authToken
  const [citizen] = await db
    .select({
      id:             citizensTable.id,
      name:           citizensTable.name,
      balanceMinutes: citizensTable.balanceMinutes,
      rank:           citizensTable.rank,
      authToken:      citizensTable.authToken,
    })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, authToken))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Неверный токен авторизации" });
    return;
  }

  // Authorize and consume the QR token
  const ok = authorizeQrToken(qrToken, {
    authToken:      citizen.authToken ?? "",
    id:             citizen.id,
    name:           citizen.name,
    balanceMinutes: citizen.balanceMinutes,
  });
  const entry = ok ? consumeQrToken(qrToken) : null;
  if (!ok || !entry) {
    res.status(400).json({ error: "QR-код недействителен или истёк. Обновите страницу." });
    return;
  }

  // Push login event to the web socket waiting on this token
  const pushed = pushQrLogin(qrToken, {
    type:           "qr_login",
    citizenId:      citizen.id,
    authToken:      citizen.authToken ?? "",
    name:           citizen.name,
    balanceMinutes: citizen.balanceMinutes,
  });

  logger.info({ citizenId: citizen.id, pushed }, "QR login verified (mobile fallback)");
  res.json({ ok: true, pushed, citizenId: citizen.id });
});

export default router;
