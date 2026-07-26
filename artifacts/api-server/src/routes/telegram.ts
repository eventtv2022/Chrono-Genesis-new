/**
 * POST /api/telegram/publish
 *
 * Публикует видео-капсулу TimeNation TV в Telegram-группу @estminuta.
 * Может вызываться вручную (из мобильного приложения или веб-интерфейса)
 * или автоматически из renderQueue после завершения рендера.
 *
 * Body:
 *   slotId      — number   (обязательно)
 *   threadId    — number?  (переопределить topic-ветку; если не задан — авто по типу слота)
 *
 * Auth: Bearer-токен = SESSION_SECRET (server-to-server вызов) или гражданин-владелец слота.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable, citizensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { getBotUsername } from "../services/telegramService";
import {
  publishVideoToTelegram,
  buildTVCaption,
  getThreadIdForSlotType,
  resolvePublicVideoUrl,
  type PublishResult,
} from "../services/tvPublishService";

const router: IRouter = Router();

const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "";

// ─── Schema ───────────────────────────────────────────────────────────────────

const PublishBody = z.object({
  slotId:   z.number().int().positive(),
  threadId: z.number().int().positive().optional(),
});

// ─── POST /api/telegram/publish ───────────────────────────────────────────────

router.post(
  "/telegram/publish",
  async (req: Request, res: Response): Promise<void> => {

    // ── Auth ─────────────────────────────────────────────────────────────────
    // Принимаем либо Bearer SESSION_SECRET (server-to-server),
    // либо citizenId в теле (гражданин публикует свою капсулу).
    const authHeader = req.headers["authorization"] ?? "";
    const isServerCall =
      SESSION_SECRET &&
      authHeader === `Bearer ${SESSION_SECRET}`;

    const citizenIdHeader = req.headers["x-citizen-id"];
    const callerCitizenId = citizenIdHeader
      ? parseInt(String(citizenIdHeader), 10)
      : undefined;

    if (!isServerCall && !callerCitizenId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const parsed = PublishBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const { slotId, threadId: overrideThreadId } = parsed.data;

    // ── Load slot + capsule + citizen ────────────────────────────────────────
    const [slot] = await db
      .select()
      .from(tvSlotsTable)
      .where(eq(tvSlotsTable.id, slotId))
      .limit(1);

    if (!slot) {
      res.status(404).json({ error: "Slot not found" });
      return;
    }

    const [capsule] = await db
      .select()
      .from(tvCapsulesTable)
      .where(eq(tvCapsulesTable.slotId, slotId))
      .limit(1);

    if (!capsule?.mediaUrl) {
      res.status(422).json({ error: "Slot has no rendered video yet" });
      return;
    }

    // ── Ownership guard (non-server callers) ──────────────────────────────────
    if (!isServerCall && callerCitizenId !== capsule.citizenId) {
      res.status(403).json({ error: "You are not the owner of this capsule" });
      return;
    }

    // ── Load citizen name ────────────────────────────────────────────────────
    const [citizen] = await db
      .select({ name: citizensTable.name })
      .from(citizensTable)
      .where(eq(citizensTable.id, capsule.citizenId))
      .limit(1);

    const citizenName = citizen?.name ?? `#${capsule.citizenId}`;

    // ── Build caption ────────────────────────────────────────────────────────
    const slotTime = `${String(Math.floor(slot.minuteIndex / 60)).padStart(2, "0")}:${String(slot.minuteIndex % 60).padStart(2, "0")}`;
    const caption  = buildTVCaption({
      slotDate:     slot.date,
      slotTime,
      citizenName,
      slotType:     slot.slotType,
      seedText:     capsule.seedText,
      sovereignUrl: capsule.hasSovereignLink ? capsule.catcastUrl : null,
    });

    // ── Resolve thread ID ────────────────────────────────────────────────────
    const threadId = overrideThreadId ?? getThreadIdForSlotType(slot.slotType);

    // ── Resolve absolute public video URL ────────────────────────────────────
    const videoUrl = resolvePublicVideoUrl(capsule.mediaUrl, capsule.catcastUrl);
    if (!videoUrl) {
      res.status(422).json({
        error: "Cannot resolve a public video URL for this capsule. Ensure REPLIT_DOMAINS is set or the capsule has a catcastUrl.",
      });
      return;
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    logger.info({ slotId, slotType: slot.slotType, threadId, videoUrl }, "Publishing capsule to Telegram");

    const result: PublishResult = await publishVideoToTelegram(
      { videoUrl, caption, threadId },
    );

    if (!result.ok) {
      logger.error(
        { slotId, errorCode: result.errorCode, description: result.description },
        "Telegram publish failed",
      );
      res.status(502).json({ error: result.description, errorCode: result.errorCode });
      return;
    }

    res.json({ ok: true, messageId: result.messageId });
  },
);

// ─── POST /api/telegram/bind-token ────────────────────────────────────────────
// Generate a one-time token and return the deep link for the citizen to open.

router.post(
  "/telegram/bind-token",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const citizen = req.citizen!;
    const token = crypto.randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db
      .update(citizensTable)
      .set({ tgBindToken: token, tgBindTokenExpires: expires })
      .where(eq(citizensTable.id, citizen.id));

    const botUsername = getBotUsername();
    if (!botUsername) {
      res.status(503).json({ error: "Telegram bot not configured" });
      return;
    }

    const deepLink = `https://t.me/${botUsername}?start=bind_${citizen.id}_${token}`;
    res.json({ deepLink, expiresAt: expires.toISOString() });
  },
);

// ─── GET /api/telegram/status ─────────────────────────────────────────────────
// Returns telegram link status and notification settings for the current citizen.

router.get(
  "/telegram/status",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const citizen = req.citizen!;
    const [row] = await db
      .select({
        telegramId: citizensTable.telegramId,
        telegramUsername: citizensTable.telegramUsername,
        tgNotifyDm: citizensTable.tgNotifyDm,
        tgNotifyCapsules: citizensTable.tgNotifyCapsules,
        tgNotifyMentions: citizensTable.tgNotifyMentions,
        tgNotifyState: citizensTable.tgNotifyState,
        tgNotifyAllGroups: citizensTable.tgNotifyAllGroups,
      })
      .from(citizensTable)
      .where(eq(citizensTable.id, citizen.id))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Citizen not found" }); return; }

    res.json({
      linked: !!row.telegramId,
      username: row.telegramUsername ?? null,
      settings: {
        dm:         !!row.tgNotifyDm,
        capsules:   !!row.tgNotifyCapsules,
        mentions:   !!row.tgNotifyMentions,
        state:      !!row.tgNotifyState,
        all_groups: !!row.tgNotifyAllGroups,
      },
    });
  },
);

// ─── PATCH /api/telegram/settings ─────────────────────────────────────────────
// Update notification toggles.

const TgSettingsBody = z.object({
  dm:         z.boolean().optional(),
  capsules:   z.boolean().optional(),
  mentions:   z.boolean().optional(),
  state:      z.boolean().optional(),
  all_groups: z.boolean().optional(),
});

router.patch(
  "/telegram/settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TgSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const d = parsed.data;
    const updates: Record<string, number> = {};
    if (d.dm         !== undefined) updates.tgNotifyDm        = d.dm         ? 1 : 0;
    if (d.capsules   !== undefined) updates.tgNotifyCapsules   = d.capsules   ? 1 : 0;
    if (d.mentions   !== undefined) updates.tgNotifyMentions   = d.mentions   ? 1 : 0;
    if (d.state      !== undefined) updates.tgNotifyState      = d.state      ? 1 : 0;
    if (d.all_groups !== undefined) updates.tgNotifyAllGroups  = d.all_groups ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      res.json({ ok: true });
      return;
    }

    await db
      .update(citizensTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updates as any)
      .where(eq(citizensTable.id, req.citizen!.id));

    res.json({ ok: true });
  },
);

// ─── DELETE /api/telegram/unbind ──────────────────────────────────────────────
// Disconnect Telegram from this account.

router.delete(
  "/telegram/unbind",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    await db
      .update(citizensTable)
      .set({
        telegramId: null,
        telegramUsername: null,
        tgBindToken: null,
        tgBindTokenExpires: null,
      })
      .where(eq(citizensTable.id, req.citizen!.id));

    res.json({ ok: true });
  },
);

// ─── POST /api/citizens/:id/generate-telegram-link ────────────────────────────
// Generates a short-lived auth code and returns a t.me deep-link.
// Citizen must be authenticated; they click the link in the mobile app.

router.post(
  "/citizens/:id/generate-telegram-link",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const citizenId = req.citizen!.id;
    // Ensure citizen can only generate their own link (or admin)
    const requestedId = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(requestedId) || requestedId !== citizenId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Generate 8-char uppercase hex code (48 bits of entropy)
    const code = crypto.randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db
      .update(citizensTable)
      .set({ telegramAuthCode: code, telegramAuthCodeExpiresAt: expiresAt })
      .where(eq(citizensTable.id, citizenId));

    const botUsername = getBotUsername();
    if (!botUsername) {
      res.status(503).json({ error: "Telegram bot not configured" });
      return;
    }

    const link = `https://t.me/${botUsername}?start=${code}`;
    logger.info({ citizenId, expiresAt }, "Telegram auth code generated");
    res.json({ link, code, expiresAt: expiresAt.toISOString() });
  },
);

// ─── GET /api/citizens/by-telegram/:telegramId ────────────────────────────────
// Used by the Telegram bot to look up a citizen by their Telegram user ID.
// No auth required — bot uses this to identify who's writing to it.

router.get(
  "/citizens/by-telegram/:telegramId",
  async (req: Request, res: Response): Promise<void> => {
    const telegramId = String(req.params["telegramId"] ?? "");
    if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

    const [citizen] = await db
      .select({
        id:              citizensTable.id,
        name:            citizensTable.name,
        citizenNumber:   citizensTable.citizenNumber,
        rank:            citizensTable.rank,
        balanceMinutes:  citizensTable.balanceMinutes,
        telegramUsername: citizensTable.telegramUsername,
      })
      .from(citizensTable)
      .where(eq(citizensTable.telegramId, telegramId))
      .limit(1);

    if (!citizen) { res.status(404).json({ error: "Citizen not found" }); return; }
    res.json(citizen);
  },
);

// ─── POST /api/telegram/verify-webapp ─────────────────────────────────────────
// Verifies Telegram Mini App initData using HMAC-SHA256 as per official docs:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Returns { ok: true, telegramId, citizen? } or { ok: false, error }.

router.post(
  "/telegram/verify-webapp",
  async (req: Request, res: Response): Promise<void> => {
    const { initData } = req.body as { initData?: string };
    if (!initData) {
      res.status(400).json({ ok: false, error: "initData required" });
      return;
    }

    const botToken = process.env["TELEGRAM_BOT_TOKEN"];
    if (!botToken) {
      res.status(503).json({ ok: false, error: "Bot not configured" });
      return;
    }

    // 1. Parse initData and extract hash
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      res.status(400).json({ ok: false, error: "hash field missing from initData" });
      return;
    }

    // 2. Build data-check-string (sorted key=value pairs, \n-separated, excluding hash)
    params.delete("hash");
    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // 3. Compute HMAC-SHA256 using secret_key = HMAC("WebAppData", bot_token)
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

    if (expectedHash !== hash) {
      res.status(401).json({ ok: false, error: "Signature invalid" });
      return;
    }

    // 4. Extract Telegram user ID from the verified initData
    let telegramId: string | null = null;
    const userRaw = params.get("user");
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw) as { id?: number };
        if (parsed.id) telegramId = String(parsed.id);
      } catch { /* malformed user JSON */ }
    }

    // 5. Look up the bound citizen (if any)
    let citizen = null;
    if (telegramId) {
      const [row] = await db
        .select({
          id:             citizensTable.id,
          name:           citizensTable.name,
          citizenNumber:  citizensTable.citizenNumber,
          rank:           citizensTable.rank,
          balanceMinutes: citizensTable.balanceMinutes,
        })
        .from(citizensTable)
        .where(eq(citizensTable.telegramId, telegramId))
        .limit(1);
      citizen = row ?? null;
    }

    res.json({ ok: true, telegramId, citizen });
  },
);

// ─── GET /api/telegram/config ─────────────────────────────────────────────────
// Возвращает текущее состояние конфигурации (без секретов).

router.get(
  "/telegram/config",
  async (_req: Request, res: Response): Promise<void> => {
    const hasBotToken = !!process.env["TELEGRAM_BOT_TOKEN"];
    const hasChatId   = !!process.env["TELEGRAM_CHAT_ID"];

    res.json({
      botConfigured:    hasBotToken,
      chatConfigured:   hasChatId,
      autoPublish:      hasBotToken && hasChatId,
      threads: {
        default:  process.env["TELEGRAM_TV_THREAD_ID"]       ? "set" : "not set",
        citizen:  process.env["TELEGRAM_TV_THREAD_CITIZEN"]  ? "set" : "not set",
        quarter:  process.env["TELEGRAM_TV_THREAD_QUARTER"]  ? "set" : "not set",
        half:     process.env["TELEGRAM_TV_THREAD_HALF"]     ? "set" : "not set",
        apex:     process.env["TELEGRAM_TV_THREAD_APEX"]     ? "set" : "not set",
      },
    });
  },
);

export default router;
