/**
 * Telegram WebApp (TWA) authentication & passport draft endpoint.
 *
 * Routes (all mounted under /api by the main router):
 *   POST /auth/telegram-webapp          — validate initData, auto-register or return existing session
 *   POST /auth/telegram-webapp/draft    — save passport draft data (photo, 2nd contact, privacy)
 *   GET  /auth/telegram-webapp/status   — poll current emission status for a session
 *
 * The same router is also mounted at /api/v1 in app.ts so the paths
 * /api/v1/auth/telegram-webapp etc. work per the specification.
 */
import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db, citizensTable, onboardingProgressTable, referralsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { encryptNullable } from "../services/encryptionService";
import { notifyPassportEmissionStarted } from "../services/telegramService";
import { issueEligiblePassport } from "../services/passportIssuanceService";
import { cropSignature } from "../services/imageService";
import { deriveAgeTier } from "../services/ageGateService";
import { requireAdultKyc, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const VAULT_PHOTOS_DIR = path.join(process.cwd(), "secure_vault", "photos");
fs.mkdirSync(VAULT_PHOTOS_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate Telegram WebApp initData HMAC-SHA256 signature.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computed = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

/** Map registrationStatus + availableAt to TWA status string and secondsLeft. */
function emissionState(citizen: { registrationStatus: string | null; availableAt: Date | null }) {
  if (citizen.registrationStatus === "rejected") {
    return { status: "APPLICATION_REJECTED" as const, secondsLeft: 0 };
  }
  const now = Date.now();
  const ready = citizen.availableAt?.getTime() ?? now;
  const secondsLeft = Math.max(0, Math.floor((ready - now) / 1000));
  const status: "IN_EMISSION" | "ACTIVE" =
    citizen.registrationStatus === "pending" ? "IN_EMISSION" : "ACTIVE";
  return { status, secondsLeft };
}

/** Validate the 3 passport-activation criteria for a citizen. */
interface EmissionCriteria {
  hasPhoto:      boolean;
  hasSignature:  boolean;
  hasTelegram:   boolean;
  hasEmail:      boolean;
  hasWhatsapp:   boolean;
  verifiedCount: number;
  contactsOk:    boolean;
  allPassed:     boolean;
}

function checkCriteria(citizen: {
  photoUrl:       string | null | undefined;
  signatureBase64: string | null | undefined;
  telegramId:     string | null | undefined;
  email:          string | null | undefined;
  whatsappPhone:  string | null | undefined;
}): EmissionCriteria {
  const hasPhoto     = !!citizen.photoUrl;
  const hasSignature = !!citizen.signatureBase64;
  const hasTelegram  = !!citizen.telegramId;
  const hasEmail     = !!citizen.email;
  const hasWhatsapp  = !!citizen.whatsappPhone;
  const verifiedCount =
    (hasTelegram ? 1 : 0) + (hasEmail ? 1 : 0) + (hasWhatsapp ? 1 : 0);
  const contactsOk = verifiedCount >= 2;
  const allPassed  = hasPhoto && hasSignature && contactsOk;
  return { hasPhoto, hasSignature, hasTelegram, hasEmail, hasWhatsapp,
           verifiedCount, contactsOk, allPassed };
}

// TWA initData validation MUST use the client bot token (@timenation_bot).
// This is TELEGRAM_BOT_TOKEN — distinct from ADMIN_BOT_TOKEN (admin/alert bot).
function resolvedBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/telegram-webapp
// Validates initData, auto-registers or returns existing session.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/telegram-webapp", async (req, res): Promise<void> => {
  const { initData, preApplicationProgressToken, dateOfBirth } = req.body as {
    initData?: string;
    preApplicationProgressToken?: string;
    dateOfBirth?: string;
    referrerId?: number;
  };

  if (!initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const botToken = resolvedBotToken();
  if (!botToken) {
    logger.error("TWA auth: BOT_TOKEN / TELEGRAM_BOT_TOKEN not set");
    res.status(503).json({ error: "Bot not configured on server" });
    return;
  }

  // ── HMAC validation ────────────────────────────────────────────────────────
  if (!validateInitData(initData, botToken)) {
    req.log.warn("TWA auth: invalid initData signature");
    res.status(401).json({ error: "Invalid initData signature" });
    return;
  }

  // ── Parse Telegram user ────────────────────────────────────────────────────
  const params = new URLSearchParams(initData);
  const userJson = params.get("user");
  if (!userJson) {
    res.status(400).json({ error: "No user object in initData" });
    return;
  }

  let tgUser: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  try {
    tgUser = JSON.parse(userJson);
  } catch {
    res.status(400).json({ error: "Malformed user object in initData" });
    return;
  }

  const telegramId = String(tgUser.id);

  // ── Lookup existing citizen by telegramId ──────────────────────────────────
  const [existing] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.telegramId, telegramId))
    .limit(1);

  if (existing) {
    // Existing DOB is authoritative; a later client request must not be able to
    // replace a minor's birth date with an adult one.
    const suppliedDob = existing.dateOfBirth ?? dateOfBirth ?? "";
    const ageTier = deriveAgeTier(suppliedDob);
    if (!ageTier) {
      res.status(428).json({ error: "Необходимо указать дату рождения", code: "DATE_OF_BIRTH_REQUIRED" });
      return;
    }
    if (ageTier === "UNDER_13") {
      res.status(403).json({ error: "Регистрация доступна с 13 лет", code: "MINIMUM_AGE_NOT_MET" });
      return;
    }
    if (!existing.dateOfBirth || existing.ageTier !== ageTier) {
      await db.update(citizensTable).set({ dateOfBirth: suppliedDob, ageTier }).where(eq(citizensTable.id, existing.id));
    }
    const issuance = await issueEligiblePassport(existing.id);
    const current = issuance?.citizen ?? existing;
    const { status, secondsLeft } = emissionState(current);
    req.log.info({ citizenId: current.id, telegramId, status }, "TWA auth: existing citizen");
    res.json({
      success: true,
      isNewUser: false,
      authToken: current.authToken,
      citizenId: current.id,
      citizenNumber: current.citizenNumber,
      name: current.name,
      photoUrl: existing.photoUrl ? "vault:protected" : null,
      status,
      secondsLeft,
      hasSignature: !!current.signatureBase64?.trim(),
    });
    return;
  }

  const ageTier = deriveAgeTier(dateOfBirth ?? "");
  if (!ageTier) {
    res.status(428).json({ error: "Необходимо указать дату рождения", code: "DATE_OF_BIRTH_REQUIRED" });
    return;
  }
  if (ageTier === "UNDER_13") {
    res.status(403).json({ error: "Регистрация доступна с 13 лет", code: "MINIMUM_AGE_NOT_MET" });
    return;
  }

  if (!preApplicationProgressToken || !/^[a-f0-9]{64}$/.test(preApplicationProgressToken)) {
    res.status(400).json({ error: "Сначала завершите знакомство перед подачей заявления" });
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

  // ── Auto-register new citizen ──────────────────────────────────────────────
  // Synthetic phone: tg_<telegramId> — guaranteed unique by telegramId.unique() constraint
  const syntheticPhone = `tg_${telegramId}`;
  const name =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim() || "Гражданин";
  const availableAt = new Date(Date.now() + 60 * 60 * 1000); // +60 minutes
  const authToken = crypto.randomBytes(32).toString("hex");

  // Sequential citizen number
  const allRows = await db.select({ id: citizensTable.id }).from(citizensTable);
  const citizenNumber = String(allRows.length + 1).padStart(9, "0");

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
        phone: syntheticPhone,
        authToken,
        balanceMinutes: 0,
        ancestralMinuteGranted: false,
        citizenNumber,
        registrationStatus: "pending",
        availableAt,
        onboardingCompleted: false,
        telegramId,
        dateOfBirth,
        ageTier,
        telegramUsername: tgUser.username ? `@${tgUser.username}` : null,
        privacyAgreementAccepted: 1,
        privacyAgreementDate: new Date(),
      })
      .returning();
    if (!created) throw new Error("Citizen insert returned no row");
    const referrerId = Number(req.body?.referrerId);
    if (Number.isInteger(referrerId) && referrerId > 0 && referrerId !== created.id) {
      const [referrer] = await tx
        .select({ id: citizensTable.id })
        .from(citizensTable)
        .where(and(
          eq(citizensTable.id, referrerId),
          or(isNull(citizensTable.registrationStatus), eq(citizensTable.registrationStatus, "issued")),
        ))
        .limit(1);
      if (referrer) {
        await tx.insert(referralsTable)
          .values({ referrerId: referrer.id, referredCitizenId: created.id })
          .onConflictDoNothing();
      }
    }
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

  req.log.info(
    { citizenId: citizen.id, telegramId, name },
    "TWA auth: citizen auto-registered",
  );

  // Citizen and admin receive a passport lifecycle notice from the same bot.
  void notifyPassportEmissionStarted({
    citizenId: citizen.id,
    citizenName: citizen.name,
    citizenNumber: citizen.citizenNumber,
    availableAt,
  });

  res.status(201).json({
    success: true,
    isNewUser: true,
    authToken,
    citizenId: citizen.id,
    citizenNumber,
    name: citizen.name,
    photoUrl: null,
    status: "IN_EMISSION",
    secondsLeft: 3600,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/telegram-webapp/draft
// Saves passport draft data: photo, signature, 2nd contact, privacy.
// Authenticated by authToken in Authorization header.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/telegram-webapp/draft", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Invalid auth token" });
    return;
  }

  const {
    photoBase64,
    secondContact,   // email or WhatsApp number
    privacyAccepted, // boolean
    signatureBase64, // canvas signature data-url
  } = req.body as {
    photoBase64?: string;
    secondContact?: string;
    privacyAccepted?: boolean;
    signatureBase64?: string;
  };

  const updates: Partial<typeof citizensTable.$inferInsert> = {};

  // Photo
  if (photoBase64) {
    try {
      const matches = photoBase64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === "jpeg" ? "jpg" : (matches[1] ?? "jpg");
        const buf = Buffer.from(matches[2]!, "base64");
        const filename = `photo_twa_${citizen.id}_${Date.now()}.${ext}`;
        const filepath = path.join(VAULT_PHOTOS_DIR, filename);
        fs.writeFileSync(filepath, buf);
        updates.photoUrl = filepath;
      }
    } catch (err) {
      logger.warn({ err, citizenId: citizen.id }, "TWA draft: failed to save photo");
    }
  }

  // 2nd contact — detect email vs phone/WhatsApp
  if (secondContact?.trim()) {
    const trimmed = secondContact.trim();
    if (trimmed.includes("@")) {
      updates.email = encryptNullable(trimmed);
      // Ensure email is in preferred channels
      const existing = citizen.preferredChannels ? JSON.parse(citizen.preferredChannels) as string[] : [];
      if (!existing.includes("email")) existing.push("email");
      updates.preferredChannels = JSON.stringify(existing);
    } else {
      updates.whatsappPhone = trimmed;
      const existing = citizen.preferredChannels ? JSON.parse(citizen.preferredChannels) as string[] : [];
      if (!existing.includes("whatsapp")) existing.push("whatsapp");
      updates.preferredChannels = JSON.stringify(existing);
    }
  }

  // Canvas signature (Constitution pledge)
  if (signatureBase64 !== undefined) {
    if (
      typeof signatureBase64 !== "string" ||
      !/^data:image\/(?:png|jpeg);base64,/i.test(signatureBase64) ||
      signatureBase64.length > 1_500_000
    ) {
      res.status(400).json({ error: "Подпись должна быть изображением PNG или JPEG" });
      return;
    }
    const croppedSignature = await cropSignature(signatureBase64);
    if (!croppedSignature) {
      res.status(400).json({ error: "Добавьте непустую подпись" });
      return;
    }
    updates.signatureBase64 = croppedSignature;
  }

  // Privacy
  if (privacyAccepted) {
    updates.privacyAgreementAccepted = 1;
    updates.privacyAgreementDate = new Date();
  }

  if (Object.keys(updates).length > 0) {
    await db.update(citizensTable).set(updates).where(eq(citizensTable.id, citizen.id));
  }

  const { status, secondsLeft } = emissionState({
    registrationStatus: citizen.registrationStatus,
    availableAt: citizen.availableAt,
  });

  req.log.info({ citizenId: citizen.id, updates: Object.keys(updates) }, "TWA draft saved");
  res.json({ ok: true, status, secondsLeft });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/telegram-webapp/status
// Poll emission status. Authenticated by Authorization: Bearer <authToken>.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/auth/telegram-webapp/status", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  const [citizen] = await db
    .select({
      id:                  citizensTable.id,
      name:                citizensTable.name,
      citizenNumber:       citizensTable.citizenNumber,
      rank:                citizensTable.rank,
      photoUrl:            citizensTable.photoUrl,
      signatureBase64:     citizensTable.signatureBase64,
      telegramId:          citizensTable.telegramId,
      email:               citizensTable.email,
      whatsappPhone:       citizensTable.whatsappPhone,
      registrationStatus:  citizensTable.registrationStatus,
      availableAt:         citizensTable.availableAt,
      balanceMinutes:      citizensTable.balanceMinutes,
    })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Invalid auth token" });
    return;
  }

  const issuance = citizen.registrationStatus === "pending" && citizen.availableAt &&
    citizen.availableAt.getTime() <= Date.now()
    ? await issueEligiblePassport(citizen.id)
    : null;
  const finalCitizen = issuance?.citizen ?? citizen;
  const { status: finalStatus, secondsLeft } = emissionState(finalCitizen);
  const criteria = finalStatus === "APPLICATION_REJECTED" ? checkCriteria(citizen) : null;

  res.json({
    citizenId:     finalCitizen.id,
    name:          finalCitizen.name,
    citizenNumber: finalCitizen.citizenNumber,
    rank:          finalCitizen.rank,
    photoUrl:      finalCitizen.photoUrl ? "vault:protected" : null,
    balanceMinutes: finalCitizen.balanceMinutes,
    status:        finalStatus,
    secondsLeft,
    hasSignature: !!finalCitizen.signatureBase64?.trim(),
    signatureRequired: finalStatus === "IN_EMISSION" && !finalCitizen.signatureBase64?.trim(),
    criteria,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/telegram-webapp/check-subscription
// Checks whether the authenticated citizen is subscribed to the public channel.
// Uses ADMIN_BOT_TOKEN (the bot must be admin/member of the channel).
// On any API failure the endpoint returns { subscribed: true, fallback: true }
// so a transient Telegram outage never blocks user access.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/auth/telegram-webapp/check-subscription", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Authorization required" }); return; }

  const [citizen] = await db
    .select({ id: citizensTable.id, telegramId: citizensTable.telegramId })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) { res.status(401).json({ error: "Invalid auth token" }); return; }
  if (!citizen.telegramId) { res.json({ subscribed: true, fallback: true }); return; }

  const adminToken = process.env["ADMIN_BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const channelUsername = process.env["CHANNEL_USERNAME"] ?? "@timenation2026";

  if (!adminToken) {
    res.json({ subscribed: true, fallback: true });
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${adminToken}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelUsername, user_id: Number(citizen.telegramId) }),
    });
    const data = await resp.json() as {
      ok: boolean;
      result?: { status: string };
      description?: string;
    };

    if (!data.ok) {
      // Bot not admin of channel or other API error — don't block user
      logger.warn({ channel: channelUsername, desc: data.description }, "TWA sub-check: API error (fallback=true)");
      res.json({ subscribed: true, fallback: true });
      return;
    }

    const memberStatus = data.result?.status ?? "left";
    const subscribed = !["left", "kicked"].includes(memberStatus);
    res.json({ subscribed, memberStatus });
  } catch (err) {
    logger.warn({ err }, "TWA sub-check: network error (fallback=true)");
    res.json({ subscribed: true, fallback: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/telegram-webapp/resubmit
// Restart emission for a rejected application. Resets timer to +60 min.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/telegram-webapp/resubmit", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Authorization required" }); return; }

  const [citizen] = await db
    .select({
      id:                 citizensTable.id,
      name:               citizensTable.name,
      citizenNumber:      citizensTable.citizenNumber,
      registrationStatus: citizensTable.registrationStatus,
    })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) { res.status(401).json({ error: "Invalid auth token" }); return; }

  if (citizen.registrationStatus !== "rejected") {
    res.status(400).json({ error: "Заявка не находится в статусе отклонения" });
    return;
  }

  const newAvailableAt = new Date(Date.now() + 60 * 60 * 1000); // +60 min
  await db
    .update(citizensTable)
    .set({ registrationStatus: "pending", availableAt: newAvailableAt })
    .where(eq(citizensTable.id, citizen.id));

  req.log.info({ citizenId: citizen.id }, "TWA: application resubmitted");
  void notifyPassportEmissionStarted({
    citizenId: citizen.id,
    citizenName: citizen.name,
    citizenNumber: citizen.citizenNumber,
    availableAt: newAvailableAt,
  });
  res.json({ ok: true, status: "IN_EMISSION", secondsLeft: 3600 });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /channel/post
// Sends a message to the public channel with a Mini App inline button.
// Auth: Bearer token must belong to a citizen whose telegramId matches
//       ADMIN_TELEGRAM_ID (env), or the header X-Admin-Key matches ADMIN_BOT_TOKEN.
// Body: { text: string, parseMode?: "HTML"|"Markdown" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/channel/post", async (req, res): Promise<void> => {
  // Auth: X-Admin-Key must equal ADMIN_BOT_TOKEN value
  const adminKey = req.headers["x-admin-key"];
  const adminToken = process.env["ADMIN_BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const channelUsername = process.env["CHANNEL_USERNAME"] ?? "@timenation2026";
  const botWebAppUrl = process.env["BOT_WEBAPP_URL"] ?? "https://t.me/TimeNation_app_bot/app";

  if (!adminKey || adminKey !== adminToken) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!adminToken) {
    res.status(503).json({ error: "Admin bot not configured" });
    return;
  }

  const { text, parseMode = "HTML" } = req.body as { text?: string; parseMode?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelUsername,
        text,
        parse_mode: parseMode,
        reply_markup: {
          inline_keyboard: [[
            { text: "🚀 Открыть TimeNation App", url: botWebAppUrl },
          ]],
        },
      }),
    });
    const data = await resp.json() as {
      ok: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!data.ok) {
      res.status(400).json({ error: data.description ?? "Telegram API error" });
      return;
    }

    req.log.info({ channel: channelUsername, messageId: data.result?.message_id }, "channel/post: sent");
    res.json({ ok: true, messageId: data.result?.message_id });
  } catch (err) {
    logger.error({ err }, "channel/post: network error");
    res.status(500).json({ error: "Network error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/telegram-webapp/ton-wallet
// Save TON wallet address (from TON Connect) linked to authenticated citizen.
// Body: { tonWalletAddress: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/telegram-webapp/ton-wallet", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  const { tonWalletAddress } = req.body as { tonWalletAddress?: string };
  if (!tonWalletAddress || typeof tonWalletAddress !== "string" || tonWalletAddress.length < 10) {
    res.status(400).json({ error: "tonWalletAddress is required" });
    return;
  }

  const [citizen] = await db
    .select({ id: citizensTable.id, telegramId: citizensTable.telegramId })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Invalid auth token" });
    return;
  }

  await db
    .update(citizensTable)
    .set({ tonWalletAddress })
    .where(eq(citizensTable.id, citizen.id));

  req.log.info({ citizenId: citizen.id, tonWalletAddress }, "TON wallet linked");

  res.json({ success: true, tonWalletAddress });
});

export default router;
