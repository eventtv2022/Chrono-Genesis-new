import fs from "fs";
import { logger } from "../lib/logger";

// ── Catcast.tv Upload Service ──────────────────────────────────────────────────
// Based on catcast-d REST API (github.com/mrcatman/catcast-d)
// Endpoint base and auth scheme may need adjustment if catcast.tv differs from self-hosted.

const CATCAST_BASE = "https://catcast.tv";
const CATCAST_CHANNEL_ID = process.env["CATCAST_CHANNEL_ID"] ?? "27813";
const AI_DISCLOSURE =
  "AI Generated / Сгенерировано ИИ / Generated via Artificial Intelligence technologies.";

// In-memory token cache (1h TTL)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAuthToken(): Promise<string | null> {
  const email = process.env["CATCAST_EMAIL"];
  const password = process.env["CATCAST_PASSWORD"];
  if (!email || !password) {
    logger.info("CATCAST_EMAIL/CATCAST_PASSWORD not set — upload skipped");
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  try {
    const res = await fetch(`${CATCAST_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Catcast auth failed");
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      token?: string;
      data?: { token?: string };
    };
    const token = data.access_token ?? data.token ?? data.data?.token;
    if (!token) { logger.warn("Catcast: no token in auth response"); return null; }

    cachedToken = { token, expiresAt: Date.now() + 3_600_000 };
    logger.info("Catcast auth: token obtained");
    return token;
  } catch (err) {
    logger.warn({ err }, "Catcast auth fetch failed");
    return null;
  }
}

export interface CatcastUploadResult {
  videoId: string;
  videoUrl: string;
}

export async function uploadToCatcast(
  filePath: string,
  slotId: number,
  citizenName: string,
  seedText: string
): Promise<CatcastUploadResult | null> {
  if (!process.env["CATCAST_EMAIL"]) return null;

  const token = await getAuthToken();
  if (!token) return null;

  const title = `TimeNation-TV — Минута №${slotId}`;
  const description = [
    seedText,
    `Гражданин: ${citizenName}`,
    AI_DISCLOSURE,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "video/mp4" });

    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    form.append("channel_id", CATCAST_CHANNEL_ID);
    form.append("visibility", "public");
    form.append("file", blob, `timenation_slot_${slotId}.mp4`);

    const res = await fetch(`${CATCAST_BASE}/api/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(120_000), // 2min for large uploads
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, body, slotId }, "Catcast upload failed");
      // Invalidate cached token on auth errors
      if (res.status === 401 || res.status === 403) cachedToken = null;
      return null;
    }

    const data = (await res.json()) as {
      id?: number | string;
      url?: string;
      data?: { id?: number | string; url?: string; video_url?: string };
    };

    const videoId = String(data.id ?? data.data?.id ?? "");
    const videoUrl =
      data.url ??
      data.data?.url ??
      data.data?.video_url ??
      `${CATCAST_BASE}/videos/${videoId}`;

    logger.info({ slotId, videoId, videoUrl }, "Catcast upload complete");
    return { videoId, videoUrl };
  } catch (err) {
    logger.warn({ err, slotId }, "Catcast upload error");
    return null;
  }
}
