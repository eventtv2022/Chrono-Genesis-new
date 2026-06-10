import fs from "fs";
import { logger } from "../lib/logger";

// ── Catcast.tv Upload Service ──────────────────────────────────────────────────
// catcast-d architecture (github.com/mrcatman/catcast-d):
//   Auth:   POST /api/auth/login  { username, password } → JWT token
//   Media:  POST /api/media       { channel_id, title, description } → { id, uuid }
//   Upload: POST /api/media/{id}/upload                  → { key }
//   TUS:    POST /api/files (tusd) with Upload-Metadata: id=<id>, upload_key=<key>
//   nginx routes /api → php:4002, /api/files → tusd:1080

const CATCAST_BASE = process.env["CATCAST_BASE_URL"] ?? "https://catcast.tv";
const CATCAST_CHANNEL_ID = process.env["CATCAST_CHANNEL_ID"] ?? "27813";
const AI_DISCLOSURE =
  "AI Generated / Сгенерировано ИИ / Generated via Artificial Intelligence technologies.";

// In-memory JWT token cache (55min TTL — JWT default is 1h in catcast-d)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAuthToken(): Promise<string | null> {
  const email = process.env["CATCAST_EMAIL"];
  const password = process.env["CATCAST_PASSWORD"];
  if (!email || !password) {
    logger.info("CATCAST_EMAIL/CATCAST_PASSWORD not set — Catcast upload skipped");
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  // catcast-d AuthController uses "username" field (not "email")
  // The email stored in secrets IS the username on catcast.tv
  const username = email.includes("@") ? email.split("@")[0] : email;

  try {
    const res = await fetch(`${CATCAST_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // catcast-d nginx needs explicit Accept: application/json to avoid SPA fallback
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15_000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      logger.warn(
        { status: res.status, contentType },
        "Catcast auth returned non-JSON — API may be unreachable or URL is wrong"
      );
      return null;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      logger.warn({ status: res.status, body }, "Catcast auth failed");
      return null;
    }

    const data = (await res.json()) as {
      token?: string;
      access_token?: string;
      data?: { token?: string };
    };
    const token = data.token ?? data.access_token ?? data.data?.token;
    if (!token) {
      logger.warn({ data }, "Catcast: no token in auth response");
      return null;
    }

    cachedToken = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
    logger.info("Catcast auth: token obtained");
    return token;
  } catch (err) {
    logger.warn({ err }, "Catcast auth fetch failed");
    return null;
  }
}

// ── TUS upload (catcast-d uses tusd at /api/files) ────────────────────────────
async function tusUpload(
  filePath: string,
  mediaId: string | number,
  uploadKey: string,
  token: string
): Promise<boolean> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  const tusUrl = `${CATCAST_BASE}/api/files`;

  // Build base64 metadata per TUS spec
  const meta = [
    `id ${Buffer.from(String(mediaId)).toString("base64")}`,
    `upload_key ${Buffer.from(uploadKey).toString("base64")}`,
    `filename ${Buffer.from(`timenation_slot.mp4`).toString("base64")}`,
    `filetype ${Buffer.from("video/mp4").toString("base64")}`,
  ].join(",");

  // TUS Creation request
  const createRes = await fetch(tusUrl, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(fileSize),
      "Upload-Metadata": meta,
      "Content-Type": "application/offset+octet-stream",
      Authorization: `Bearer ${token}`,
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!createRes.ok && createRes.status !== 201) {
    logger.warn({ status: createRes.status }, "TUS creation failed");
    return false;
  }

  const uploadUrl = createRes.headers.get("location");
  if (!uploadUrl) {
    logger.warn("TUS: no Location header in creation response");
    return false;
  }

  // TUS PATCH — send the full file in one chunk (MVP; resumable for large files)
  const resolvedUploadUrl = uploadUrl.startsWith("http")
    ? uploadUrl
    : `${CATCAST_BASE}${uploadUrl}`;

  const patchRes = await fetch(resolvedUploadUrl, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
      "Content-Length": String(fileSize),
      Authorization: `Bearer ${token}`,
    },
    body: fileBuffer,
    signal: AbortSignal.timeout(300_000), // 5 min for large files
  });

  if (!patchRes.ok) {
    logger.warn({ status: patchRes.status }, "TUS PATCH failed");
    return false;
  }

  return true;
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
    seedText ? `«${seedText.slice(0, 800)}»` : null,
    `Гражданин: ${citizenName}`,
    AI_DISCLOSURE,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    // Step 1: Create media record
    const mediaRes = await fetch(`${CATCAST_BASE}/api/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        channel_id: CATCAST_CHANNEL_ID,
        title,
        description,
        privacy_status: 0, // 0 = public in catcast-d
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!mediaRes.ok) {
      const body = await mediaRes.text();
      logger.warn({ status: mediaRes.status, body }, "Catcast media create failed");
      if (mediaRes.status === 401) cachedToken = null;
      return null;
    }

    const media = (await mediaRes.json()) as {
      id?: number | string;
      uuid?: string;
    };
    const mediaId = media.id;
    const mediaUuid = media.uuid;
    if (!mediaId) {
      logger.warn({ media }, "Catcast: no media id in response");
      return null;
    }

    // Step 2: Request TUS upload key
    const keyRes = await fetch(`${CATCAST_BASE}/api/media/${mediaId}/upload`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!keyRes.ok) {
      logger.warn({ status: keyRes.status }, "Catcast upload key request failed");
      return null;
    }

    const keyData = (await keyRes.json()) as { key?: string };
    const uploadKey = keyData.key;
    if (!uploadKey) {
      logger.warn({ keyData }, "Catcast: no upload key in response");
      return null;
    }

    // Step 3: TUS upload
    const uploadOk = await tusUpload(filePath, mediaId, uploadKey, token);
    if (!uploadOk) return null;

    const videoUrl = mediaUuid
      ? `${CATCAST_BASE}/media/${mediaUuid}`
      : `${CATCAST_BASE}/media/${mediaId}`;

    logger.info({ slotId, mediaId, videoUrl }, "Catcast upload complete");
    return { videoId: String(mediaId), videoUrl };
  } catch (err) {
    logger.warn({ err, slotId }, "Catcast upload error");
    return null;
  }
}
