/**
 * tvPublishService — публикация видео-капсул TimeNation TV в Telegram-группу.
 *
 * Конфигурация (Replit Secrets):
 *   TELEGRAM_BOT_TOKEN        — токен бота @TimeNaming_bot (уже есть)
 *   TELEGRAM_CHAT_ID          — числовой ID группы @estminuta (например -1001234567890)
 *   TELEGRAM_TV_THREAD_ID     — ID темы «все видео» по умолчанию (опционально)
 *   TELEGRAM_TV_THREAD_CITIZEN — thread_id для слотов «Гражданин» (опционально)
 *   TELEGRAM_TV_THREAD_QUARTER — thread_id для слотов «Четверть» (опционально)
 *   TELEGRAM_TV_THREAD_HALF   — thread_id для слотов «Полчаса» (опционально)
 *   TELEGRAM_TV_THREAD_APEX   — thread_id для слотов «Апекс» (опционально)
 */

import { logger } from "../lib/logger";

const TG_API_BASE = "https://api.telegram.org/bot";

// ─── Thread-ID routing by slot type ───────────────────────────────────────────
// Read lazily (inside the function) so changes to env vars after module load
// are picked up without a server restart.

export function getThreadIdForSlotType(slotType: string): number | undefined {
  const threadMap: Record<string, string | undefined> = {
    citizen: process.env["TELEGRAM_TV_THREAD_CITIZEN"],
    quarter: process.env["TELEGRAM_TV_THREAD_QUARTER"],
    half:    process.env["TELEGRAM_TV_THREAD_HALF"],
    apex:    process.env["TELEGRAM_TV_THREAD_APEX"],
  };
  const raw = threadMap[slotType] ?? process.env["TELEGRAM_TV_THREAD_ID"];
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return isNaN(n) ? undefined : n;
}

// ─── URL resolver ──────────────────────────────────────────────────────────────

/**
 * Converts a potentially relative mediaUrl into an absolute public https URL
 * that Telegram servers can download.
 *
 * Priority:
 *  1. catcastUrl  — already a public absolute URL from CatCast CDN
 *  2. mediaUrl    — may be relative (/api/tv/media/slot_X.mp4); resolved using
 *                   the first entry of REPLIT_DOMAINS
 *
 * Returns null if neither produces a usable URL.
 */
export function resolvePublicVideoUrl(
  mediaUrl:   string | null | undefined,
  catcastUrl: string | null | undefined,
): string | null {
  // Prefer catcastUrl — it's always a public absolute URL
  if (catcastUrl && catcastUrl.startsWith("https://")) return catcastUrl;

  if (!mediaUrl) return null;

  // Already absolute
  if (mediaUrl.startsWith("https://")) return mediaUrl;

  // Relative path — prepend the first public domain
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const domain  = domains.split(",")[0]?.trim();
  if (!domain) {
    logger.warn(
      { mediaUrl },
      "REPLIT_DOMAINS not set — cannot resolve relative mediaUrl to public URL for Telegram",
    );
    return null;
  }

  return `https://${domain}${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`;
}

// ─── Caption builder ───────────────────────────────────────────────────────────

const SLOT_EMOJI: Record<string, string> = {
  citizen: "⏱",
  quarter: "📺",
  half:    "🎬",
  apex:    "👑",
};

export interface CaptionOptions {
  slotDate: string;
  slotTime: string;
  citizenName: string;
  slotType: string;
  seedText?: string | null;
  sovereignUrl?: string | null;
}

export function buildTVCaption(opts: CaptionOptions): string {
  const emoji = SLOT_EMOJI[opts.slotType] ?? "📡";

  let caption = `${emoji} <b>TimeNation TV</b>\n`;
  caption += `📅 <b>${opts.slotDate}</b> · ${opts.slotTime} UTC\n`;
  caption += `👤 ${escapeHtml(opts.citizenName)}\n`;

  if (opts.seedText?.trim()) {
    const preview = opts.seedText.trim().slice(0, 300);
    caption += `\n💬 <i>${escapeHtml(preview)}${opts.seedText.length > 300 ? "…" : ""}</i>\n`;
  }

  if (opts.sovereignUrl) {
    caption += `\n🔗 ${opts.sovereignUrl}\n`;
  }

  caption += `\n🏛 <a href="https://t.me/estminuta">estminuta</a>`;

  return caption;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Telegram API call ─────────────────────────────────────────────────────────

interface TgApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
  error_code?: number;
}

async function callTelegramApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TgApiResponse> {
  const res = await fetch(`${TG_API_BASE}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<TgApiResponse>;
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type PublishSuccess = { ok: true; messageId: number };
export type PublishFailure = { ok: false; description: string; errorCode: number };
export type PublishResult  = PublishSuccess | PublishFailure;

// ─── Core publish function ────────────────────────────────────────────────────

export interface PublishVideoOptions {
  /** Публичная https-ссылка на MP4-файл (Telegram скачает самостоятельно). */
  videoUrl: string;
  /** HTML-подпись к видео (до 1024 символов). */
  caption?: string;
  /** ID темы (форумная ветка) внутри группы. Если не задан — публикация в основной чат. */
  threadId?: number;
}

/**
 * Отправляет видео в Telegram-группу через Bot API (sendVideo).
 * Повторяет запрос до `maxRetries` раз при временных сетевых ошибках.
 * Не повторяет при ошибках 400/403/404 (постоянные ошибки конфигурации).
 */
export async function publishVideoToTelegram(
  options: PublishVideoOptions,
  maxRetries = 3,
): Promise<PublishResult> {
  const token  = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];

  if (!token) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN не настроен", errorCode: 0 };
  }
  if (!chatId) {
    return { ok: false, description: "TELEGRAM_CHAT_ID не настроен", errorCode: 0 };
  }

  const body: Record<string, unknown> = {
    chat_id:            chatId,
    video:              options.videoUrl,
    supports_streaming: true,
  };
  if (options.caption)  body["caption"]           = options.caption;
  if (options.caption)  body["parse_mode"]         = "HTML";
  if (options.threadId) body["message_thread_id"]  = options.threadId;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await callTelegramApi(token, "sendVideo", body);
      logger.debug({ method: "sendVideo", attempt, ok: data.ok }, "Telegram API response");

      if (data.ok && data.result) {
        logger.info({ messageId: data.result.message_id, chatId, threadId: options.threadId }, "Video published to Telegram");
        return { ok: true, messageId: data.result.message_id };
      }

      const errCode = data.error_code ?? 0;
      const errDesc = data.description ?? "Unknown Telegram error";

      // Постоянные ошибки — не повторяем
      if (errCode === 400 || errCode === 401 || errCode === 403 || errCode === 404) {
        logger.error({ errCode, errDesc, chatId }, "Telegram publish: permanent error");
        return { ok: false, description: errDesc, errorCode: errCode };
      }

      logger.warn({ errCode, errDesc, attempt, maxRetries }, "Telegram publish: retryable error");
    } catch (err) {
      logger.warn({ err, attempt, maxRetries }, "Telegram publish: network error");
      if (attempt === maxRetries) {
        return { ok: false, description: String(err), errorCode: -1 };
      }
    }

    // Экспоненциальная пауза перед повтором
    if (attempt < maxRetries) {
      await new Promise<void>((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return { ok: false, description: "Max retries exceeded", errorCode: -1 };
}
