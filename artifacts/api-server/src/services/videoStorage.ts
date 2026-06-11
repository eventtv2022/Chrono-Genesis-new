/**
 * Трёхконтурная система хранения видео TimeNation-TV
 *
 * Контур «Горячий»  — CDN ссылка (AWS S3 / DigitalOcean Spaces + Cloudflare)
 * Контур «Холодный» — архивная ссылка (Google Cloud Storage / Backblaze B2)
 * Контур «Метаданные» — PostgreSQL (только ссылки, не бинарные данные)
 *
 * В текущей реализации Replit хранит файлы локально (/media/slot_N.mp4).
 * При подключении реального CDN: заменить `buildHotUrl` на реальный S3/DO presigned URL,
 * а `buildColdUrl` — на GCS/B2 ссылку. БД продолжает хранить только URL.
 */

import { logger } from "../lib/logger";

export interface VideoStorageRecord {
  slotId: number;
  hotUrl: string | null;       // CDN / streaming URL (HLS / MP4)
  coldUrl: string | null;      // архивная ссылка (долгосрочное хранение)
  localPath: string | null;    // путь на диске Replit (dev/fallback)
  storageBackend: "local" | "s3" | "do_spaces" | "gcs" | "b2";
  sizeBytes: number | null;
  uploadedAt: Date | null;
}

// ── Env-based config ──────────────────────────────────────────────────────────
const S3_BUCKET    = process.env["S3_BUCKET"];
const S3_CDN_URL   = process.env["S3_CDN_URL"];     // e.g. https://cdn.timenation.tv
const GCS_BUCKET   = process.env["GCS_BUCKET"];
const GCS_BASE_URL = process.env["GCS_BASE_URL"];   // e.g. https://storage.googleapis.com/bucket

// ── Backend detection ─────────────────────────────────────────────────────────
export function getStorageBackend(): "s3" | "do_spaces" | "gcs" | "b2" | "local" {
  if (S3_BUCKET && S3_CDN_URL) return "s3";
  if (GCS_BUCKET && GCS_BASE_URL) return "gcs";
  return "local";
}

// ── Hot URL builder (streaming / CDN) ────────────────────────────────────────
export function buildHotUrl(slotId: number): string | null {
  const backend = getStorageBackend();

  if (backend === "s3" || backend === "do_spaces") {
    // AWS S3 or DigitalOcean Spaces behind Cloudflare CDN
    return `${S3_CDN_URL}/tv/slots/slot_${slotId}.mp4`;
  }

  if (backend === "gcs") {
    return `${GCS_BASE_URL}/tv/slots/slot_${slotId}.mp4`;
  }

  // Local fallback (Replit dev): serve through Express route
  return `/api/tv/media/slot_${slotId}.mp4`;
}

// ── Cold URL builder (archive) ────────────────────────────────────────────────
export function buildColdUrl(slotId: number): string | null {
  const backend = getStorageBackend();

  if (backend === "gcs") {
    return `${GCS_BASE_URL}/tv/archive/slot_${slotId}.mp4`;
  }

  if (backend === "s3" || backend === "do_spaces") {
    // Archive bucket (cheaper storage class / B2 compatible)
    return `${S3_CDN_URL}/tv/archive/slot_${slotId}.mp4`;
  }

  // No separate cold tier in local mode
  return null;
}

// ── Build full storage record for a rendered slot ─────────────────────────────
export function buildStorageRecord(
  slotId: number,
  localPath: string,
  sizeBytes?: number
): VideoStorageRecord {
  const backend = getStorageBackend();

  const record: VideoStorageRecord = {
    slotId,
    hotUrl: buildHotUrl(slotId),
    coldUrl: buildColdUrl(slotId),
    localPath,
    storageBackend: backend,
    sizeBytes: sizeBytes ?? null,
    uploadedAt: new Date(),
  };

  logger.info(
    { slotId, backend, hotUrl: record.hotUrl, coldUrl: record.coldUrl },
    "VideoStorage record built"
  );

  return record;
}

// ── Treasury tax calculator ───────────────────────────────────────────────────
// Казначейский налог: 10% от стоимости слота в Дарминах, округление вверх.
// Удерживается при бронировании через TiMETR (timeltr payment path).
// Для fiat/crypto — налог учитывается в EUR цене (уже включён в BURN_MATRIX).
export const TREASURY_TAX_RATE = 0.10;

export function calcTreasuryTax(timeltrBurnCost: number): number {
  return Math.ceil(timeltrBurnCost * TREASURY_TAX_RATE);
}

// ID казначейского аккаунта (гражданин с id=1 — системный кошелёк)
export const TREASURY_CITIZEN_ID = 1;
