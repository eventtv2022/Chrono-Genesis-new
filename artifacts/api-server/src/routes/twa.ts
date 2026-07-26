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
import { eq } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { encryptNullable } from "../services/encryptionService";
import { sendDirectMessage } from "../services/telegramService";

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
  const now = Date.now();
  const ready = citizen.availableAt?.getTime() ?? now;
  const secondsLeft = Math.max(0, Math.floor((ready - now) / 1000));
  // If timer still running → IN_EMISSION regardless of DB status
  const status: "IN_EMISSION" | "ACTIVE" =
    secondsLeft > 0 && citizen.registrationStatus === "pending" ? "IN_EMISSION" : "ACTIVE";
  return { status, secondsLeft };
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
  const { initData } = req.body as { initData?: string };

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
    const { status, secondsLeft } = emissionState(existing);
    req.log.info({ citizenId: existing.id, telegramId, status }, "TWA auth: existing citizen");
    res.json({
      success: true,
      isNewUser: false,
      authToken: existing.authToken,
      citizenId: existing.id,
      citizenNumber: existing.citizenNumber,
      name: existing.name,
      photoUrl: existing.photoUrl ? "vault:protected" : null,
      status,
      secondsLeft,
    });
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

  const [citizen] = await db
    .insert(citizensTable)
    .values({
      name,
      phone: syntheticPhone,
      authToken,
      balanceMinutes: 1,
      citizenNumber,
      registrationStatus: "pending",
      availableAt,
      telegramId,
      telegramUsername: tgUser.username ? `@${tgUser.username}` : null,
      privacyAgreementAccepted: 1,
      privacyAgreementDate: new Date(),
    })
    .returning();

  req.log.info(
    { citizenId: citizen!.id, telegramId, name },
    "TWA auth: citizen auto-registered",
  );

  // Notification (non-blocking)
  sendDirectMessage(
    telegramId,
    "⏳ *Профиль создан!*\n\n" +
      "Запущен 60-минутный процесс эмиссии вашего Цифрового Паспорта TimeNation.\n\n" +
      "Заполните данные в открывшемся окне — это ускорит активацию.",
  ).catch((err: unknown) => logger.warn({ err, telegramId }, "TWA: registration notification failed"));

  res.status(201).json({
    success: true,
    isNewUser: true,
    authToken,
    citizenId: citizen!.id,
    citizenNumber,
    name: citizen!.name,
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
  } = req.body as {
    photoBase64?: string;
    secondContact?: string;
    privacyAccepted?: boolean;
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
      id: citizensTable.id,
      name: citizensTable.name,
      citizenNumber: citizensTable.citizenNumber,
      rank: citizensTable.rank,
      photoUrl: citizensTable.photoUrl,
      registrationStatus: citizensTable.registrationStatus,
      availableAt: citizensTable.availableAt,
      balanceMinutes: citizensTable.balanceMinutes,
    })
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);

  if (!citizen) {
    res.status(401).json({ error: "Invalid auth token" });
    return;
  }

  const { status, secondsLeft } = emissionState(citizen);
  res.json({
    citizenId: citizen.id,
    name: citizen.name,
    citizenNumber: citizen.citizenNumber,
    rank: citizen.rank,
    photoUrl: citizen.photoUrl ? "vault:protected" : null,
    balanceMinutes: citizen.balanceMinutes,
    status,
    secondsLeft,
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

export default router;
