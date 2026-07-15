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
import { logger } from "../lib/logger";
import {
  publishVideoToTelegram,
  buildTVCaption,
  getThreadIdForSlotType,
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

    // ── Publish ───────────────────────────────────────────────────────────────
    logger.info({ slotId, slotType: slot.slotType, threadId }, "Publishing capsule to Telegram");

    const result: PublishResult = await publishVideoToTelegram(
      { videoUrl: capsule.mediaUrl, caption, threadId },
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
