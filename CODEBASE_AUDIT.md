# TimeNation Chrono-Genesis — Полный кодовый дайджест для архитектурного аудита

> **Дата**: 23 июня 2026  
> **Стек**: Node.js 24 / Express 5 / Drizzle ORM / PostgreSQL / Expo React Native / Gemini 2.5 Flash  
> **Репозиторий**: eventtv2022/Chrono-Genesis-new (приватный)

---

## ⚠️ Примечания по запрошенным файлам

| Запрошено | Реальное расположение |
|---|---|
| `timeAuditorService.ts` | Не вынесен в сервис — логика встроена в `routes/government.ts` |
| `agentSimulatorService.ts` | **Отсутствует** — не реализован |
| `routes/chats.ts` | Чат-роуты находятся в конце `routes/deals.ts` (`/deals/:id/chat`) |
| `app/(tabs)/timetr.tsx` | Переименован: `app/(tabs)/index.tsx` |

---

## 1. АРХИТЕКТУРА БД (Drizzle ORM)

### `lib/db/src/schema/citizens.ts`

```typescript
import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
// balance_minutes, total_given, total_received are `real` to support fractional Darmins (tax 2% = 0.02 Д on 1 Д)
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citizensTable = pgTable("citizens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  telegramId: text("telegram_id").unique(),
  walletAddress: text("wallet_address").unique(),
  walletNonce: text("wallet_nonce"),
  walletVerified: integer("wallet_verified").notNull().default(0),
  balanceMinutes: real("balance_minutes").notNull().default(1), // 1 родовая минута
  totalGiven: real("total_given").notNull().default(0),
  totalReceived: real("total_received").notNull().default(0),
  status: text("status").notNull().default("active"),
  meritScore: real("merit_score").notNull().default(0),
  rank: text("rank").notNull().default("Гражданин"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  ageVerified: integer("age_verified").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // ── ICAO Doc 9303 Passport fields ──────────────────────────────────────────
  citizenNumber: text("citizen_number").unique(), // 000000001 … 999999999
  surname: text("surname"),
  givenNames: text("given_names"),
  dateOfBirth: text("date_of_birth"), // YYYY-MM-DD
  photoUrl: text("photo_url"),
  idCardUrl: text("id_card_url"), // filled when issued
  // 'pending' → 'issued' | 'rejected'. NULL = legacy citizen (treated as issued)
  registrationStatus: text("registration_status"),
  availableAt: timestamp("available_at", { withTimezone: true }), // NOW + 1h

  // ── Registration contact & compliance fields ───────────────────────────────
  email: text("email"),
  seedThought: text("seed_thought"),
  privacyAgreementAccepted: integer("privacy_agreement_accepted").notNull().default(0),
  privacyAgreementDate: timestamp("privacy_agreement_date", { withTimezone: true }),
  signatureBase64: text("signature_base64"),

  // ── Government role ────────────────────────────────────────────────────────
  govRole: text("gov_role").notNull().default("citizen"),

  // ── Labor Deposit & Rate Auditor ───────────────────────────────────────────
  professionalSkills: text("professional_skills"),
  calculatedMinuteRate: real("calculated_minute_rate").notNull().default(1.0), // Kq coefficient
  potentialLaborDepositedMinutes: integer("potential_labor_deposited_minutes").notNull().default(0), // 0–480
  skillsAuditedAt: timestamp("skills_audited_at", { withTimezone: true }),
  reviewScoreCount: integer("review_score_count").notNull().default(0),
});

export const insertCitizenSchema = createInsertSchema(citizensTable).omit({
  id: true,
  balanceMinutes: true,
  totalGiven: true,
  totalReceived: true,
  meritScore: true,
  rank: true,
  lastActivity: true,
  createdAt: true,
  walletAddress: true,
});
export type InsertCitizen = z.infer<typeof insertCitizenSchema>;
export type Citizen = typeof citizensTable.$inferSelect;
```

---

### `lib/db/src/schema/timeAuditLogs.ts`

```typescript
import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeAuditLogsTable = pgTable("time_audit_logs", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id"),
  taskDescription: text("task_description").notNull(),
  estimatedMinutes: real("estimated_minutes").notNull(),
  actualMinutes: real("actual_minutes"),
  deviationPercent: real("deviation_percent"),
  complexityLevel: text("complexity_level").notNull(),
  justification: text("justification").notNull(),
  requiresCalibration: integer("requires_calibration").notNull().default(0),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  moderatedByName: text("moderated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTimeAuditLogSchema = createInsertSchema(timeAuditLogsTable).omit({
  id: true,
  createdAt: true,
});

export type TimeAuditLog = typeof timeAuditLogsTable.$inferSelect;
export type InsertTimeAuditLog = z.infer<typeof insertTimeAuditLogSchema>;
```

---

### `lib/db/src/schema/chatMessages.ts`

```typescript
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  senderId: integer("sender_id").notNull(),
  messageText: text("message_text"),
  imageUrl: text("image_url"),   // base64 data URL, ~450KB image
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type InsertChatMessage = typeof chatMessagesTable.$inferInsert;
```

---

## 2. ИИ-СЕРВИСЫ

### `artifacts/api-server/src/services/rateAuditorService.ts`

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const SYSTEM_PROMPT = `Ты — Главный Профильный Аудитор TimeNation.
Перед тобой профиль гражданина (навыки, опыт, услуги).
Твоя задача — определить коэффициент квалификации Kq от 0.5 (новичок) до 2.5 (эксперт высшей категории) для его отрасли.
Отрасли-ориентиры:
• IT-архитектура, сложная хирургия — Kq 1.8–2.5
• Веб-разработка, дизайн, юриспруденция — Kq 1.3–1.8
• Ремесло (сантехника, авторемонт средней сложности) — Kq 0.9–1.3
• Неквалифицированный труд — Kq 0.5–0.9
Строго верни JSON: { "kq": number, "industry": "string", "justification": "string", "depositBonus": number }
где depositBonus — рекомендованное количество бонусных Дарминов при депозите 480 минут (от 0 до 120).`;

const REVIEW_SYSTEM_PROMPT = `Ты — Главный Профильный Аудитор TimeNation.
Изучи новые платные отзывы о работе специалиста. На основе тональности и оценок скорректируй его текущий коэффициент стоимости минуты (calculatedMinuteRate).
Правила корректировки:
• Восторженные отзывы, оценки 5 — повысь на 0.05–0.15 (не выше 2.5)
• Нейтральные, оценки 3–4 — без изменений (дельта 0)
• Критические, оценки 1–2 — понизь на 0.05–0.15 (не ниже 0.5)
• Аномальная частота (>3 отзывов за сутки от одного автора) — понизь обоих на 0.1
Строго верни JSON: { "newRate": number, "delta": number, "reason": "string" }`;

export interface RateAuditResult {
  kq: number;
  industry: string;
  justification: string;
  depositBonus: number;
}

export interface ReviewAdjustResult {
  newRate: number;
  delta: number;
  reason: string;
}

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY не настроен");
  return new GoogleGenerativeAI(apiKey);
}

function parseJson<T>(raw: string): T {
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(clean) as T;
}

export async function auditCitizenRate(skills: string): Promise<RateAuditResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: SYSTEM_PROMPT });
  const result = await model.generateContent(`Профиль гражданина:\n${skills}`);
  return parseJson<RateAuditResult>(result.response.text().trim());
}

export async function adjustRateByReviews(
  targetId: number,
  currentRate: number,
  reviews: Array<{ rating: number; reviewText: string; authorId: number }>
): Promise<ReviewAdjustResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: REVIEW_SYSTEM_PROMPT });

  const reviewsText = reviews
    .map((r, i) => `Отзыв ${i + 1}: оценка ${r.rating}/5 — "${r.reviewText}"`)
    .join("\n");

  const prompt = `Текущий коэффициент специалиста: ${currentRate}\nПоследние отзывы:\n${reviewsText}`;
  const result = await model.generateContent(prompt);
  const adj = parseJson<ReviewAdjustResult>(result.response.text().trim());

  const clamped = Math.max(0.5, Math.min(2.5, adj.newRate));
  await db
    .update(citizensTable)
    .set({ calculatedMinuteRate: clamped, reviewScoreCount: reviews.length })
    .where(eq(citizensTable.id, targetId));

  logger.info({ targetId, oldRate: currentRate, newRate: clamped, delta: adj.delta }, "Rate adjusted by reviews");
  return { ...adj, newRate: clamped };
}
```

---

### `artifacts/api-server/src/services/freeVideoApiService.ts`

```typescript
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { logger } from "../lib/logger";

// ── Free Video API Service ─────────────────────────────────────────────────────
// Provider chain:
//   1. HuggingFace text-to-video-ms-1.7b  (free, optional HF_TOKEN for higher limits)
//   2. Picsum Photos slideshow             (reliable CDN, no auth, no rate limits)
//   3. Pollinations AI slideshow           (AI-generated but often 429 on shared IPs)
//   4. null → caller falls back to solid-color light path

const HF_API_URL =
  "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b";

const HF_TIMEOUT_MS = 120_000;

const POLLINATIONS_IMAGES = 5;
const CROSSFADE_DURATION_SEC = 2;
const TARGET_VIDEO_DURATION_SEC = 60;
// With N=5, C=2: (60 + 8) / 5 = 13.6s per image
const PER_IMG_SEC = (TARGET_VIDEO_DURATION_SEC + CROSSFADE_DURATION_SEC * (POLLINATIONS_IMAGES - 1)) / POLLINATIONS_IMAGES;
const POLLINATIONS_REQUEST_DELAY_MS = 1200;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([timeoutController.signal, externalSignal])
    : timeoutController.signal;
  try {
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider 1: HuggingFace text-to-video ─────────────────────────────────────
async function generateViaHuggingFace(
  prompt: string,
  tmpDir: string,
  signal?: AbortSignal
): Promise<string | null> {
  const hfToken = process.env["HF_TOKEN"];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`;

  logger.info({ prompt: prompt.slice(0, 80), hasToken: !!hfToken }, "HuggingFace text-to-video: requesting");

  let response: Response;
  try {
    response = await fetchWithTimeout(HF_API_URL, { method: "POST", headers, body: JSON.stringify({ inputs: prompt }) }, HF_TIMEOUT_MS, signal);
  } catch (err: unknown) {
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    if (isAbort) logger.warn({ prompt: prompt.slice(0, 60) }, "HuggingFace timeout after 120s — switching to Picsum");
    else logger.warn({ err }, "HuggingFace network error — switching to Picsum");
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn({ status: response.status, body: body.slice(0, 200) }, "HuggingFace returned error — switching to Picsum");
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("video") && !contentType.includes("octet-stream")) {
    logger.warn({ contentType }, "HuggingFace response is not video — switching to Picsum");
    return null;
  }

  try {
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength < 1024) { logger.warn({ bytes: arrayBuf.byteLength }, "HuggingFace returned too-small blob"); return null; }
    const videoPath = path.join(tmpDir, "hf_video.mp4");
    fs.writeFileSync(videoPath, Buffer.from(arrayBuf));
    logger.info({ bytes: arrayBuf.byteLength, videoPath }, "HuggingFace video saved");
    return videoPath;
  } catch (err) {
    logger.warn({ err }, "HuggingFace: failed to save video blob");
    return null;
  }
}

// ── Provider 2: Picsum Photos slideshow ───────────────────────────────────────
// Uses https://picsum.photos (free, no auth, reliable CDN backed by Unsplash)
// Seed is derived from hash of prompt → same prompt = same images (deterministic)
const PICSUM_IMAGES = 5;

async function generateViaPicsumSlideshow(
  prompt: string,
  tmpDir: string,
  signal?: AbortSignal
): Promise<string | null> {
  logger.info({ count: PICSUM_IMAGES }, "Picsum slideshow: fetching images");

  let seed = 0;
  for (let i = 0; i < prompt.length; i++) seed = ((seed << 5) - seed + prompt.charCodeAt(i)) | 0;
  if (seed < 0) seed = -seed;

  const imageBuffers: (Buffer | null)[] = [];
  for (let i = 0; i < PICSUM_IMAGES; i++) {
    if (signal?.aborted) break;
    const imgSeed = (seed + i * 97) % 1000;
    const url = `https://picsum.photos/seed/${imgSeed}/1280/720`;
    try {
      const res = await fetchWithTimeout(url, {}, 20_000, signal);
      if (!res.ok) { logger.warn({ status: res.status, i }, "Picsum image fetch failed"); imageBuffers.push(null); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      imageBuffers.push(buf.byteLength >= 1024 ? buf : null);
      logger.info({ i, ok: true, bytes: buf.byteLength }, "Picsum image fetched");
    } catch (err) {
      logger.warn({ err, i }, "Picsum image error");
      imageBuffers.push(null);
    }
  }

  const validImages = imageBuffers.filter((b): b is Buffer<ArrayBuffer> => b !== null);
  if (validImages.length === 0) { logger.warn("Picsum: all image fetches failed"); return null; }

  logger.info({ count: validImages.length }, "Picsum: building crossfade slideshow");

  const imagePaths = validImages.map((buf, i) => {
    const imgPath = path.join(tmpDir, `picsum_${i}.jpg`);
    fs.writeFileSync(imgPath, buf);
    return imgPath;
  });

  const N = imagePaths.length;
  const C = CROSSFADE_DURATION_SEC;
  const perImg = (TARGET_VIDEO_DURATION_SEC + C * (N - 1)) / N;
  const outputPath = path.join(tmpDir, "picsum_slideshow.mp4");

  try {
    if (N === 1) {
      await runFFmpeg([
        "-loop", "1", "-t", String(TARGET_VIDEO_DURATION_SEC), "-i", imagePaths[0]!,
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-an", "-y", outputPath,
      ], signal);
    } else {
      const inputArgs: string[] = [];
      for (const imgPath of imagePaths) inputArgs.push("-loop", "1", "-t", perImg.toFixed(3), "-i", imgPath);

      const scaleFilters = imagePaths.map(
        (_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[sv${i}]`
      );

      const xfadeChains: string[] = [];
      let prevLabel = `sv0`;
      for (let i = 0; i < N - 1; i++) {
        const offset = ((i + 1) * perImg - i * C).toFixed(3);
        const outLabel = i === N - 2 ? "vout" : `xf${i}`;
        xfadeChains.push(`[${prevLabel}][sv${i + 1}]xfade=transition=fade:duration=${C}:offset=${offset}[${outLabel}]`);
        prevLabel = outLabel;
      }

      await runFFmpeg([
        ...inputArgs,
        "-filter_complex", [...scaleFilters, ...xfadeChains].join(";"),
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-t", String(TARGET_VIDEO_DURATION_SEC),
        "-an", "-y", outputPath,
      ], signal);
    }
    logger.info({ outputPath, images: N }, "Picsum crossfade slideshow created");
    return outputPath;
  } catch (err) {
    logger.warn({ err }, "Picsum: FFmpeg crossfade failed");
    return null;
  }
}

// ── Provider 3: Pollinations AI slideshow ─────────────────────────────────────
async function generateViaPollinationsSlideshow(
  prompt: string,
  tmpDir: string,
  signal?: AbortSignal
): Promise<string | null> {
  logger.info({ prompt: prompt.slice(0, 80), count: POLLINATIONS_IMAGES }, "Pollinations slideshow: fetching images");

  const encodedPrompt = encodeURIComponent(prompt);
  const imageBuffers: (Buffer | null)[] = [];

  for (let i = 0; i < POLLINATIONS_IMAGES; i++) {
    if (signal?.aborted) break;
    if (i > 0) await new Promise<void>((r) => setTimeout(r, POLLINATIONS_REQUEST_DELAY_MS));
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&nologo=true&seed=${i * 13 + 7}`;
    let buf: Buffer | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {}, 35_000, signal);
        if (res.status === 429) { if (attempt === 0) await new Promise<void>((r) => setTimeout(r, 3_000)); continue; }
        if (!res.ok) { break; }
        const raw = Buffer.from(await res.arrayBuffer());
        if (raw.byteLength >= 1024) { buf = raw; break; }
      } catch (err) { logger.warn({ err, i }, "Pollinations image error"); break; }
    }
    imageBuffers.push(buf);
    logger.info({ i, ok: buf !== null }, "Pollinations image result");
  }

  const validImages = imageBuffers.filter((b): b is Buffer<ArrayBuffer> => b !== null);
  if (validImages.length === 0) { logger.warn("Pollinations: all image fetches failed"); return null; }

  const imagePaths = validImages.map((buf, i) => {
    const imgPath = path.join(tmpDir, `slide_${i}.jpg`);
    fs.writeFileSync(imgPath, buf);
    return imgPath;
  });

  const N = imagePaths.length;
  const C = CROSSFADE_DURATION_SEC;
  const perImg = (TARGET_VIDEO_DURATION_SEC + C * (N - 1)) / N;
  const outputPath = path.join(tmpDir, "slideshow.mp4");

  try {
    if (N === 1) {
      await runFFmpeg([
        "-loop", "1", "-t", String(TARGET_VIDEO_DURATION_SEC), "-i", imagePaths[0]!,
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-an", "-y", outputPath,
      ], signal);
    } else {
      const inputArgs: string[] = [];
      for (const imgPath of imagePaths) inputArgs.push("-loop", "1", "-t", perImg.toFixed(3), "-i", imgPath);
      const scaleFilters = imagePaths.map(
        (_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[sv${i}]`
      );
      const xfadeChains: string[] = [];
      let prevLabel = `sv0`;
      for (let i = 0; i < N - 1; i++) {
        const offset = ((i + 1) * perImg - i * C).toFixed(3);
        const outLabel = i === N - 2 ? "vout" : `xf${i}`;
        xfadeChains.push(`[${prevLabel}][sv${i + 1}]xfade=transition=fade:duration=${C}:offset=${offset}[${outLabel}]`);
        prevLabel = outLabel;
      }
      await runFFmpeg([
        ...inputArgs,
        "-filter_complex", [...scaleFilters, ...xfadeChains].join(";"),
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-t", String(TARGET_VIDEO_DURATION_SEC),
        "-an", "-y", outputPath,
      ], signal);
    }
    logger.info({ outputPath, images: N, perImgSec: perImg.toFixed(2) }, "Pollinations crossfade slideshow created");
    return outputPath;
  } catch (err) {
    logger.warn({ err }, "Pollinations: FFmpeg crossfade failed");
    return null;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function generateAIBackground(
  prompt: string,
  tmpDir?: string,
  signal?: AbortSignal
): Promise<{ videoPath: string | null; ownsTmpDir: boolean; tmpDir: string }> {
  const dir = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "tn-aibg-"));
  const ownsTmpDir = !tmpDir;

  const hfPath = await generateViaHuggingFace(prompt, dir, signal);
  if (hfPath) return { videoPath: hfPath, ownsTmpDir, tmpDir: dir };

  const picsumPath = await generateViaPicsumSlideshow(prompt, dir, signal);
  if (picsumPath) return { videoPath: picsumPath, ownsTmpDir, tmpDir: dir };

  const slidePath = await generateViaPollinationsSlideshow(prompt, dir, signal);
  if (slidePath) return { videoPath: slidePath, ownsTmpDir, tmpDir: dir };

  logger.warn({ prompt: prompt.slice(0, 60) }, "All AI video providers failed — using solid-color fallback");
  return { videoPath: null, ownsTmpDir, tmpDir: dir };
}

function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => { if (code === 0) resolve(); else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-800)}`)); });
    proc.on("error", (err) => reject(err));
    if (signal) signal.addEventListener("abort", () => { proc.kill("SIGTERM"); }, { once: true });
  });
}
```

---

### `artifacts/api-server/src/services/renderService.ts` (ключевые части)

```typescript
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { tvCapsulesTable, citizensTable, tvSlotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { uploadToCatcast } from "./catcastService";
import { generateManifesto } from "./geminiService";
import { generateCinematicPromptTiered, generateMultiScenePrompts, type VisualStyle as CinematicVisualStyle, type RenderTier } from "./cinematicPromptService";
import { getSlotType } from "./tvService";
import { generateAIBackground } from "./freeVideoApiService";
import { buildStorageRecord } from "./videoStorage";
import { logger } from "../lib/logger";

export const MEDIA_DIR = path.join(process.cwd(), "media");
const GOOGLE_TTS_VOICE = "ru-RU-Wavenet-D";
const GOOGLE_TTS_LANG  = "ru-RU";
const VIDEO_DURATION_SEC = 60;   // 60-second broadcast slot
const SEGMENT_DURATION_SEC = 12; // 5 × 12s = 60s exactly

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Шаблонный манифест (fallback когда Gemini недоступен) ──────────────────────
export function expandSeedToManifesto(seed: string): string {
  const clean = seed.trim().replace(/\s+/g, " ");
  const idx = Math.abs(hashStr(clean)) % 3;
  const openings = [
    `Я говорю это прямо сейчас, в одну из 1440 минут, из которых состоят сутки. Моя мысль: «${clean}».`,
    `В глобальном эфире TimeNation каждая минута — координата. Сегодня моя: «${clean}».`,
    `Мир вещает непрерывно. Я выбираю свою минуту, чтобы сказать: «${clean}».`,
  ];
  const bodies = [
    `Эту минуту нельзя стереть, купить задним числом или подделать. Она выкуплена, зафиксирована в сети. Дармин сгорел — но координата осталась навсегда. Глобальное вещание — это не привилегия корпораций. Это право каждого гражданина, у которого есть что сказать миру прямо сейчас.`,
    `1440 слотов в сутках. Каждый — чья-то история, чей-то сигнал в будущее. Время — единственная абсолютно синхронная точка отсчёта на планете.`,
    `Прямо сейчас на планете идёт непрерывный эфир, который никто не контролирует централизованно. Граждане TimeNation занимают свои минуты — и каждая несёт реальную мысль реального человека.`,
  ];
  const closings = [
    `Таймлайн принял мой сигнал. Координата запечатана.`,
    `Сеть слышит меня. Момент зафиксирован навсегда.`,
    `Минута выкуплена. Мой голос — часть глобального эфира.`,
  ];
  return `${openings[idx]}\n\n${bodies[idx]}\n\n${closings[idx]}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (const c of s) { h = (Math.imul(31, h) + c.charCodeAt(0)) | 0; }
  return h;
}

// ── Google Cloud TTS (Service Account) ────────────────────────────────────────
async function googleCloudTTS(text: string): Promise<Buffer | null> {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const accessToken = await auth.getAccessToken();
    if (!accessToken) return null;
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        input: { text: text.slice(0, 5000) },
        voice: { languageCode: GOOGLE_TTS_LANG, name: GOOGLE_TTS_VOICE },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
      }),
    });
    if (!response.ok) { logger.warn({ status: response.status }, "Google Cloud TTS error"); return null; }
    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    return Buffer.from(data.audioContent, "base64");
  } catch (err) { logger.warn({ err }, "Google Cloud TTS failed"); return null; }
}

// ── Google Translate TTS fallback (без API-ключа, чанки ≤180 символов) ────────
async function googleTranslateTTS(text: string): Promise<Buffer | null> {
  // splitIntoChunks → fetchChunkTTS → ffmpeg concat
  // [детали опущены для краткости, логика стандартная]
  return null; // placeholder — полная реализация в файле
}

export async function generateTTSBuffer(text: string): Promise<Buffer | null> {
  const cloudBuf = await googleCloudTTS(text);
  if (cloudBuf) { logger.info("TTS: using Google Cloud TTS (Wavenet)"); return cloudBuf; }
  logger.info("TTS: Cloud TTS unavailable, falling back to Google Translate TTS");
  return googleTranslateTTS(text);
}

// ── Visual style themes ────────────────────────────────────────────────────────
export const VISUAL_STYLE_THEMES = {
  space:     { bg: "0x0D1B2A", title: "0x6B7E93", text: "0xC9A84C", accent: "0x4A90D9" },
  cyberpunk: { bg: "0x0A0014", title: "0xFF00FF", text: "0x00FFFF", accent: "0xFF6B00" },
  abstract:  { bg: "0x1A0A2E", title: "0x9B59B6", text: "0xE8D5B7", accent: "0xF39C12" },
  nature:    { bg: "0x0F1B0F", title: "0x4CAF50", text: "0xA8D8A8", accent: "0x8BC34A" },
  minimal:   { bg: "0x111111", title: "0x666666", text: "0xEEEEEE", accent: "0xFFFFFF" },
} as const;
export type VisualStyle = keyof typeof VISUAL_STYLE_THEMES;

// ── LIGHT render: solid-color + drawtext overlay ──────────────────────────────
// Используется как fallback для citizen-слотов и при таймаутах PRIME-пути
export async function renderLightVideo(
  audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  onProgress?: ProgressReporter
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-tv-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    const segCount = Math.ceil(VIDEO_DURATION_SEC / SEGMENT_DURATION_SEC); // = 5
    const segments = splitSegments(manifestoText, segCount);
    const style = visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? VISUAL_STYLE_THEMES[visualStyle as VisualStyle]
      : VISUAL_STYLE_THEMES.space;

    // drawtext filters: заголовок + слот + текст манифеста (по сегментам) + AI watermark
    const vf = [titleFilter, slotFilter, ...segFilters, watermarkFilter].join(",");

    await onProgress?.("encoding");
    if (audioBuffer) {
      // Pass 1: visual-only 60s MP4
      await runFFmpeg([
        "-f", "lavfi", "-i", `color=c=${style.bg}:s=1280x720:r=25`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac",
        "-t", String(VIDEO_DURATION_SEC), "-y", visualPath,
      ]);

      // Pass 2: merge audio — НЕТ -shortest, только -t 60
      // ВАЖНО: если аудио короче 60с — дорожка дополняется тишиной (не обрезает видео)
      await runFFmpeg([
        "-i", visualPath,
        "-i", audioPath,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v:0", "-map", "1:a:0",
        "-t", String(VIDEO_DURATION_SEC), // ← без -shortest!
        ...metadataArgs,
        "-y", outputPath,
      ]);
    } else {
      // No audio: single pass с silent track
      await runFFmpeg([
        "-f", "lavfi", "-i", `color=c=${style.bg}:s=1280x720:r=25`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac",
        "-t", String(VIDEO_DURATION_SEC),
        ...metadataArgs,
        "-y", outputPath,
      ]);
    }
    logger.info({ slotId, hasAudio: !!audioBuffer }, "LIGHT render complete");
    return `/api/tv/media/slot_${slotId}.mp4`;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── AI Background render (citizen/quarter слоты) ──────────────────────────────
async function renderWithAIBackground(
  audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  seedText?: string | null,
  citizenId?: number | null,
  onProgress?: ProgressReporter,
  signal?: AbortSignal,
  tier: RenderTier = "citizen"
): Promise<string> {
  // Step 1: Gemini генерирует кинематографический промт (→ cinematicPromptService)
  // Step 2: generateAIBackground: HuggingFace → Picsum → Pollinations → null
  // Step 3: overlay drawtext (манифест, ранг гражданина, watermark)
  // Step 4: merge audio — НЕТ -shortest, только -t 60
  await runFFmpeg([
    "-stream_loop", "-1", "-i", aiVideoPath,
    "-i", audioPath,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-b:a", "128k",
    "-map", "0:v:0", "-map", "1:a:0",
    "-t", String(VIDEO_DURATION_SEC), // ← без -shortest!
    ...metadataArgs, "-y", outputPath,
  ]);
}

// ── PRIME TIME 3-scene montage (half/apex слоты) ──────────────────────────────
// 3 независимых AI-фона по 22с → xfade → 60с composite → merge audio
async function renderPrimeVideo(...): Promise<string> {
  // xfade montage: scene1[0-20s] + scene2[18-38s] + scene3[36-60s]
  // "-t", "60" → trimming composite to exactly 60s
  // audio merge — НЕТ -shortest, только -t 60
  await runFFmpeg([
    "-i", compositePath,
    "-i", audioPath,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "fast", "-crf", "24",
    "-c:a", "aac", "-b:a", "192k",
    "-map", "0:v:0", "-map", "1:a:0",
    "-t", String(VIDEO_DURATION_SEC), // ← без -shortest!
    ...metadataArgs, "-y", outputPath,
  ]);
}

// ── Главный оркестратор: renderCapsule ────────────────────────────────────────
export async function renderCapsule(slotId: number, signal?: AbortSignal): Promise<{ mediaUrl: string | null }> {
  // citizen → renderWithAIBackground(tier="citizen")
  // quarter → renderWithAIBackground(tier="quarter")
  // half    → renderPrimeVideo (3-scene)
  // apex    → renderPrimeVideo (3-scene, premium quality)
  // fallback: renderLightVideo
}
```

---

### `artifacts/api-server/src/services/renderQueue.ts`

```typescript
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { renderCapsule, renderLightVideo } from "./renderService";
import { sendTransactionNotification } from "./telegramService";
import { logger } from "../lib/logger";

// ── Константы таймаутов ────────────────────────────────────────────────────────
const MAX_CONCURRENT_RENDERS = parseInt(process.env["MAX_CONCURRENT_RENDERS"] ?? "2", 10);

const RENDER_JOB_TIMEOUT_MS = parseInt(process.env["RENDER_JOB_TIMEOUT_MS"] ?? "180000", 10);       // 3 мин (generic fallback)
export const RENDER_JOB_TIMEOUT_LIGHT_MS = parseInt(process.env["RENDER_JOB_TIMEOUT_LIGHT_MS"] ?? "120000", 10); // 2 мин (citizen)
export const RENDER_JOB_TIMEOUT_HEAVY_MS = parseInt(process.env["RENDER_JOB_TIMEOUT_HEAVY_MS"] ?? "300000", 10); // 5 мин (quarter/half/apex)

class RenderTimeoutError extends Error {
  readonly elapsed: number;
  constructor(slotId: number, elapsed: number) {
    super(`Render timed out after ${elapsed}ms for slotId=${slotId}`);
    this.name = "RenderTimeoutError";
    this.elapsed = elapsed;
  }
}

interface RenderJob {
  jobId: string;
  slotId: number;
  citizenId: number;
  capsuleSeedText: string | null;
  timeoutMs?: number;
}

let activeCount = 0;
const queue: Array<() => void> = [];
const jobStatus = new Map<string, { slotId: number; status: "queued" | "running" | "done" | "failed" }>();

function drainQueue(): void {
  while (activeCount < MAX_CONCURRENT_RENDERS && queue.length > 0) { queue.shift()?.(); }
}

export function enqueueRender(job: RenderJob): string {
  const { jobId, slotId, citizenId } = job;
  const effectiveTimeoutMs = job.timeoutMs ?? RENDER_JOB_TIMEOUT_MS;

  jobStatus.set(jobId, { slotId, status: "queued" });

  const run = () => {
    activeCount++;
    if (jobStatus.get(jobId)) jobStatus.get(jobId)!.status = "running";

    void (async () => {
      const startTime = Date.now();
      const abortController = new AbortController();

      const deadline = new Promise<never>((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new RenderTimeoutError(slotId, Date.now() - startTime));
        }, effectiveTimeoutMs);
      });

      try {
        // Основной рендер vs deadline
        const result = await Promise.race([renderCapsule(slotId, abortController.signal), deadline]);

        if (result.mediaUrl) {
          // → tvSlots.status = 'broadcast', tvCapsules.status = 'broadcast'
          await db.update(tvSlotsTable).set({ status: "broadcast" }).where(eq(tvSlotsTable.id, slotId));
          await db.update(tvCapsulesTable).set({ status: "broadcast", renderProgress: "done", updatedAt: new Date() }).where(eq(tvCapsulesTable.slotId, slotId));
        }

        if (jobStatus.get(jobId)) jobStatus.get(jobId)!.status = "done";
        sendTransactionNotification(citizenId, `📡 *Капсула готова к эфиру!*\nСлот #${slotId} отрендерен.`).catch(() => {});

      } catch (err) {
        if (err instanceof RenderTimeoutError) {
          // ── Timeout fallback: solid-color renderLightVideo ──────────────
          logger.warn({ slotId, jobId, elapsed: err.elapsed }, "Render job exceeded wall-clock timeout — falling back to solid-color render");
          try {
            const [capsule] = await db.select({ seedText: tvCapsulesTable.seedText, visualStyle: tvCapsulesTable.visualStyle })
              .from(tvCapsulesTable).where(eq(tvCapsulesTable.slotId, slotId)).limit(1);

            await renderLightVideo(null, capsule?.seedText ?? "TimeNation — суверенное государство времени.", slotId, capsule?.visualStyle ?? null);

            await db.update(tvCapsulesTable).set({ status: "rendered", renderProgress: "done", updatedAt: new Date() }).where(eq(tvCapsulesTable.slotId, slotId));
            await db.update(tvSlotsTable).set({ status: "broadcast" }).where(eq(tvSlotsTable.id, slotId));

            if (jobStatus.get(jobId)) jobStatus.get(jobId)!.status = "done";
            sendTransactionNotification(citizenId, `⏱ *Слот #${slotId} отрендерен* (упрощённый режим — AI-генерация превысила лимит времени)`).catch(() => {});
          } catch (fallbackErr) {
            logger.error({ fallbackErr, slotId }, "Solid-color fallback render also failed after timeout");
            if (jobStatus.get(jobId)) jobStatus.get(jobId)!.status = "failed";
            await db.update(tvCapsulesTable).set({ status: "draft", renderProgress: null, updatedAt: new Date() }).where(eq(tvCapsulesTable.slotId, slotId)).catch(() => {});
          }
        } else {
          logger.error({ err }, "Render job failed");
          if (jobStatus.get(jobId)) jobStatus.get(jobId)!.status = "failed";
          await db.update(tvCapsulesTable).set({ status: "draft", renderProgress: null, updatedAt: new Date() }).where(eq(tvCapsulesTable.slotId, slotId)).catch(() => {});
        }
      } finally {
        activeCount--;
        drainQueue();
        setTimeout(() => jobStatus.delete(jobId), 60 * 60 * 1000); // evict after 1h
      }
    })();
  };

  if (activeCount < MAX_CONCURRENT_RENDERS) run();
  else { queue.push(run); logger.info({ slotId, jobId, queueDepth: queue.length }, "Render job queued — concurrency cap reached"); }

  return jobId;
}

// При старте сервера — re-queue капсулы зависшие в pending_render
export async function rehydrateRenderQueue(): Promise<void> {
  const stuck = await db.select({ slotId: tvCapsulesTable.slotId, citizenId: tvCapsulesTable.citizenId, seedText: tvCapsulesTable.seedText, renderPath: tvCapsulesTable.renderPath })
    .from(tvCapsulesTable).where(eq(tvCapsulesTable.status, "pending_render"));

  for (const capsule of stuck) {
    enqueueRender({
      jobId: randomUUID(),
      slotId: capsule.slotId,
      citizenId: capsule.citizenId,
      capsuleSeedText: capsule.seedText,
      timeoutMs: capsule.renderPath === "heavy" ? RENDER_JOB_TIMEOUT_HEAVY_MS : RENDER_JOB_TIMEOUT_LIGHT_MS,
    });
  }
}

export function getRenderQueueStats() { return { active: activeCount, queued: queue.length, maxConcurrent: MAX_CONCURRENT_RENDERS }; }
export function getRenderJobStatus(jobId: string) { return jobStatus.get(jobId) ?? null; }
```

---

## 3. БЭКЕНД-МАРШРУТЫ

### `artifacts/api-server/src/routes/government.ts`

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { timeAuditLogsTable, aiSystemPromptsTable, citizensTable } from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Middleware: пароль министерства в заголовке x-gov-password ──────────────────
const GOV_PASSWORD = process.env.GOV_ACCESS_PASSWORD ?? "";

function govAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-gov-password"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!GOV_PASSWORD) { res.status(503).json({ error: "GOV_ACCESS_PASSWORD не настроен на сервере" }); return; }
  if (!provided || provided !== GOV_PASSWORD) { res.status(403).json({ error: "Доступ запрещён — неверный пароль Министерства" }); return; }
  next();
}

// ── Системный промт Gemini (хранится в БД, редактируется через PUT) ────────────
const DEFAULT_SYSTEM_PROMPT = `Ты — Главный ИИ-Аудитор Времени Министерства Труда TimeNation.
Твоя задача — рассчитать нормативное время выполнения задачи в минутах (1 минута = 1 Дармин).

Базовые эталоны оцифровки:
- Разработка / IT: Скрипты/Багфиксы 30–90 мин, Смарт-контракты/Архитектура 180–240+ мин
- Дизайн / Креатив: Графика/Баннеры 45–90 мин, Иллюстрации/3D 120–180 мин
- Тексты / Аналитика: Копирайтинг 20 мин/1к знаков, Аудит/Переводы 30 мин/страница
- Юридические услуги: Договоры/Соглашения 60–120 мин, Консультации 30–60 мин
- Образование: Урок/Лекция 60 мин, Курс из 10 уроков 600–900 мин

Отвечай ТОЛЬКО строгим JSON без markdown-обёртки:
{ "estimated_minutes": number, "complexity_level": "low"|"medium"|"high", "justification": "строка на русском" }`;

async function getSystemPrompt(): Promise<string> {
  const rows = await db.select().from(aiSystemPromptsTable).where(eq(aiSystemPromptsTable.module, "time_auditor")).limit(1);
  if (rows.length > 0) return rows[0].promptText;
  await db.insert(aiSystemPromptsTable).values({ module: "time_auditor", promptText: DEFAULT_SYSTEM_PROMPT });
  return DEFAULT_SYSTEM_PROMPT;
}

function calcDeviation(estimated: number, actual: number): number {
  return Math.abs((actual - estimated) / estimated) * 100;
}

// POST /government/auth/verify — проверить пароль (без govAuth)
router.post("/government/auth/verify", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!GOV_PASSWORD) { res.status(503).json({ error: "GOV_ACCESS_PASSWORD не настроен" }); return; }
  res.json({ ok: password === GOV_PASSWORD });
});

// POST /government/audit/task — вызов Gemini, сохранение лога в time_audit_logs
router.post("/government/audit/task", govAuth, async (req: Request, res: Response) => {
  const bodySchema = z.object({ taskDescription: z.string().min(5), citizenId: z.number().int().optional() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверные данные", details: parsed.error.issues }); return; }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "GOOGLE_API_KEY не настроен" }); return; }

  try {
    const systemPrompt = await getSystemPrompt();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
    const result = await model.generateContent(`Задача для аудита:\n${parsed.data.taskDescription}`);
    const raw = result.response.text().trim();
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed2 = JSON.parse(clean) as { estimated_minutes: number; complexity_level: string; justification: string };

    const [row] = await db.insert(timeAuditLogsTable).values({
      citizenId: parsed.data.citizenId ?? null,
      taskDescription: parsed.data.taskDescription,
      estimatedMinutes: parsed2.estimated_minutes,
      complexityLevel: parsed2.complexity_level,
      justification: parsed2.justification,
      requiresCalibration: 0,
    }).returning();

    res.json({ log: row, aiResult: parsed2 });
  } catch (err) {
    req.log.error({ err }, "government audit task error");
    res.status(500).json({ error: "Ошибка вызова ИИ-аудитора" });
  }
});

// PATCH /government/audit/logs/:id — фактическое время + отклонение (>20% → requiresCalibration=1)
router.patch("/government/audit/logs/:id", govAuth, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const bodySchema = z.object({ actualMinutes: z.number().positive(), moderatedByName: z.string().optional() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверные данные" }); return; }

  const existing = await db.select().from(timeAuditLogsTable).where(eq(timeAuditLogsTable.id, id)).limit(1);
  if (!existing.length) { res.status(404).json({ error: "Запись не найдена" }); return; }

  const deviation = calcDeviation(existing[0].estimatedMinutes, parsed.data.actualMinutes);
  const [updated] = await db.update(timeAuditLogsTable).set({
    actualMinutes: parsed.data.actualMinutes,
    deviationPercent: parseFloat(deviation.toFixed(2)),
    requiresCalibration: deviation > 20 ? 1 : 0,
    moderatedByName: parsed.data.moderatedByName ?? null,
    moderatedAt: new Date(),
  }).where(eq(timeAuditLogsTable.id, id)).returning();

  res.json({ log: updated });
});

// GET /government/audit/logs — список с фильтром по calibrationOnly
router.get("/government/audit/logs", govAuth, async (req: Request, res: Response) => {
  const calibrationOnly = req.query.calibrationOnly === "true";
  const rows = await db.select().from(timeAuditLogsTable)
    .where(calibrationOnly ? eq(timeAuditLogsTable.requiresCalibration, 1) : sql`1=1`)
    .orderBy(desc(timeAuditLogsTable.createdAt)).limit(200);
  res.json({ logs: rows });
});

// GET/PUT /government/system-prompt — чтение и обновление промта Gemini
router.get("/government/system-prompt", govAuth, async (_req, res) => { res.json({ promptText: await getSystemPrompt() }); });
router.put("/government/system-prompt", govAuth, async (req, res) => {
  const bodySchema = z.object({ promptText: z.string().min(20), updatedByName: z.string().optional() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Текст промта слишком короткий" }); return; }
  const existing = await db.select().from(aiSystemPromptsTable).where(eq(aiSystemPromptsTable.module, "time_auditor")).limit(1);
  if (existing.length) {
    await db.update(aiSystemPromptsTable).set({ promptText: parsed.data.promptText, updatedByName: parsed.data.updatedByName ?? null, updatedAt: new Date() }).where(eq(aiSystemPromptsTable.module, "time_auditor"));
  } else {
    await db.insert(aiSystemPromptsTable).values({ module: "time_auditor", promptText: parsed.data.promptText });
  }
  res.json({ ok: true });
});

// GET /government/citizens — список граждан с govRole
router.get("/government/citizens", govAuth, async (_req, res) => {
  const rows = await db.select({ id: citizensTable.id, name: citizensTable.name, citizenNumber: citizensTable.citizenNumber, govRole: citizensTable.govRole, meritScore: citizensTable.meritScore, rank: citizensTable.rank })
    .from(citizensTable).orderBy(citizensTable.id).limit(500);
  res.json({ citizens: rows });
});

// PATCH /government/citizens/:id/gov-role — назначить роль: citizen | labor_officer | gov_admin
router.patch("/government/citizens/:id/gov-role", govAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const bodySchema = z.object({ govRole: z.enum(["citizen", "labor_officer", "gov_admin"]) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверная роль" }); return; }
  await db.update(citizensTable).set({ govRole: parsed.data.govRole }).where(eq(citizensTable.id, id));
  res.json({ ok: true });
});

export default router;
```

---

### `artifacts/api-server/src/routes/deals.ts` (полный файл — 693 строки)

```typescript
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dealsTable, citizensTable, chatMessagesTable } from "@workspace/db";
import { eq, or, asc } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sendTransactionNotification } from "../services/telegramService";

const router: IRouter = Router();

// ─── Validation schemas ────────────────────────────────────────────────────────
const AuditBody = z.object({ description: z.string().min(5).max(2000) });
const CreateDealBody = z.object({
  senderId: z.number().int().positive(),
  receiverId: z.number().int().positive().optional(),
  amount: z.number().int().min(1).max(10000),
  description: z.string().min(5).max(1000),
});
const ProofBody = z.object({ receiverId: z.number().int().positive(), proofText: z.string().max(2000).optional(), proofUrl: z.string().url().optional() });
const ActorBody = z.object({ citizenId: z.number().int().positive() });
const DisputeBody = z.object({ citizenId: z.number().int().positive(), claimText: z.string().min(10).max(2000).optional() });
const ChatMessageBody = z.object({ senderId: z.number().int().positive(), messageText: z.string().max(2000).optional(), imageUrl: z.string().max(600000).optional() }); // base64 ~450KB
const TimerActorBody = z.object({ citizenId: z.number().int().positive() });

// ─── POST /api/deals/audit — Gemini оценивает задачу → suggestedAmount в Д ────
router.post("/deals/audit", async (req, res): Promise<void> => {
  const parsed = AuditBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Описание задачи обязательно (мин. 5 символов)" }); return; }

  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) { res.status(503).json({ error: "ИИ-аудитор временно недоступен" }); return; }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Ты — ИИ-Аудитор Министерства Труда суверенного государства TimeNation.
Валюта — Дармины (Д). 1 Дармин = 1 минута реального рабочего времени.
Задача: ${parsed.data.description}
Верни ТОЛЬКО JSON: { "suggestedAmount": int, "summary": "строка", "breakdown": ["этап — N Д", ...] }
Правила: простая ~5-15 Д, средняя ~30-60 Д, сложная ~100-500 Д. Сумма breakdown = suggestedAmount.`;

  const result = await model.generateContent(prompt);
  const audit = JSON.parse(result.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { suggestedAmount: number; summary: string; breakdown: string[] };
  res.json(audit);
});

// ─── POST /api/deals — создание сделки + немедленная заморозка escrow ─────────
// ВАЖНО: два отдельных UPDATE без транзакции → риск race condition при высокой нагрузке
router.post("/deals", async (req, res): Promise<void> => {
  const { senderId, receiverId, amount, description } = CreateDealBody.parse(req.body);

  const [sender] = await db.select({ id: citizensTable.id, balance: citizensTable.balanceMinutes }).from(citizensTable).where(eq(citizensTable.id, senderId)).limit(1);
  if (!sender) { res.status(404).json({ error: "Отправитель не найден" }); return; }
  if (sender.balance - 1 < amount) { res.status(402).json({ error: `Недостаточно Дарминов. Доступно: ${sender.balance - 1} Д` }); return; }

  // 1. Списать с баланса отправителя
  await db.update(citizensTable).set({ balanceMinutes: sender.balance - amount }).where(eq(citizensTable.id, senderId));
  // 2. Создать сделку
  const [deal] = await db.insert(dealsTable).values({ senderId, receiverId: receiverId ?? null, amount, description, status: "open" }).returning();

  void sendTransactionNotification(senderId, `🔒 *Сделка #${deal.id} создана*\n💎 ${amount} Д заморожено в эскроу\n📋 _${description}_`);
  if (receiverId) void sendTransactionNotification(receiverId, `📨 *Новая сделка для вас #${deal.id}*\n💰 Награда: ${amount} Д\n📋 _${description}_`);

  res.status(201).json(deal);
});

// ─── GET /api/deals?citizenId=X ───────────────────────────────────────────────
router.get("/deals", async (req, res): Promise<void> => {
  const citizenId = z.number().int().positive().safeParse(Number(req.query["citizenId"]));
  if (!citizenId.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }
  const deals = await db.select().from(dealsTable).where(or(eq(dealsTable.senderId, citizenId.data), eq(dealsTable.receiverId, citizenId.data))).orderBy(dealsTable.createdAt);
  res.json({ deals });
});

// ─── GET /api/deals/open — биржа задач (без receiverId) ──────────────────────
router.get("/deals/open", async (_req, res): Promise<void> => {
  const deals = await db.select({ id: dealsTable.id, senderId: dealsTable.senderId, senderName: citizensTable.name, amount: dealsTable.amount, description: dealsTable.description, status: dealsTable.status, createdAt: dealsTable.createdAt })
    .from(dealsTable).leftJoin(citizensTable, eq(dealsTable.senderId, citizensTable.id)).where(eq(dealsTable.status, "open")).orderBy(dealsTable.createdAt);
  res.json({ deals });
});

// ─── POST /api/deals/:id/accept-task — исполнитель принимает задачу ───────────
router.post("/deals/:id/accept-task", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = ActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.status !== "open") { res.status(409).json({ error: `Сделка уже в статусе «${deal.status}»` }); return; }
  if (deal.senderId === citizenId) { res.status(400).json({ error: "Нельзя принять собственную сделку" }); return; }
  const [updated] = await db.update(dealsTable).set({ receiverId: citizenId, status: "accepted", updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  void sendTransactionNotification(deal.senderId, `✅ *Сделка #${id} принята исполнителем*\n💰 ${deal.amount} Д в эскроу`);
  res.json(updated);
});

// ─── POST /api/deals/:id/proof — исполнитель сдаёт работу ────────────────────
router.post("/deals/:id/proof", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { receiverId, proofText, proofUrl } = ProofBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.status !== "accepted" || deal.receiverId !== receiverId) { res.status(403).json({ error: "Только исполнитель принятой сделки может отправить доказательство" }); return; }
  if (!proofText && !proofUrl) { res.status(400).json({ error: "Нужно proof_text или proof_url" }); return; }
  const [updated] = await db.update(dealsTable).set({ proofText: proofText ?? null, proofUrl: proofUrl ?? null, status: "proof_submitted", updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  void sendTransactionNotification(deal.senderId, `📤 *Доказательство по сделке #${id}*\n${proofText ? `_${proofText.slice(0, 200)}_` : ""}\nПодтвердите или отклоните.`);
  res.json(updated);
});

// ─── POST /api/deals/:id/complete — заказчик подписывает Акт → release escrow ─
router.post("/deals/:id/complete", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = ActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.status !== "proof_submitted" || deal.senderId !== citizenId || !deal.receiverId) { res.status(409).json({ error: "Невозможно завершить" }); return; }
  const [receiver] = await db.select({ balance: citizensTable.balanceMinutes }).from(citizensTable).where(eq(citizensTable.id, deal.receiverId)).limit(1);
  if (!receiver) { res.status(404).json({ error: "Получатель не найден" }); return; }
  await db.update(citizensTable).set({ balanceMinutes: receiver.balance + deal.amount }).where(eq(citizensTable.id, deal.receiverId));
  const [updated] = await db.update(dealsTable).set({ status: "completed", updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  void sendTransactionNotification(deal.receiverId, `🎉 *Сделка #${id} завершена!*\n💎 +${deal.amount} Д зачислено`);
  res.json(updated);
});

// ─── POST /api/deals/:id/decline — заказчик отклоняет, escrow остаётся заморожен
router.post("/deals/:id/decline", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = ActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.status !== "proof_submitted" || deal.senderId !== citizenId) { res.status(409).json({ error: "Невозможно отклонить" }); return; }
  const [updated] = await db.update(dealsTable).set({ status: "declined", updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  if (deal.receiverId) void sendTransactionNotification(deal.receiverId, `❌ *Доказательство по сделке #${id} отклонено*\n${deal.amount} Д заморожены. Откройте спор.`);
  res.json({ ...updated, note: "Эскроу заморожен. Откройте спор или отмените сделку для возврата." });
});

// ─── POST /api/deals/:id/cancel — заказчик отменяет → возврат escrow ────────
router.post("/deals/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = ActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || !["open", "accepted", "declined"].includes(deal.status) || deal.senderId !== citizenId) { res.status(409).json({ error: "Невозможно отменить" }); return; }
  const [sender] = await db.select({ balance: citizensTable.balanceMinutes }).from(citizensTable).where(eq(citizensTable.id, deal.senderId)).limit(1);
  if (!sender) { res.status(404).json({ error: "Отправитель не найден" }); return; }
  await db.update(citizensTable).set({ balanceMinutes: sender.balance + deal.amount }).where(eq(citizensTable.id, deal.senderId));
  const [updated] = await db.update(dealsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  void sendTransactionNotification(deal.senderId, `↩️ *Сделка #${id} отменена*\n💎 +${deal.amount} Д возвращено`);
  res.json(updated);
});

// ─── POST /api/deals/:id/dispute — Gemini ИИ-Арбитр + уведомление обеих сторон
router.post("/deals/:id/dispute", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId, claimText } = DisputeBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || !["accepted", "proof_submitted", "declined"].includes(deal.status)) { res.status(409).json({ error: "Спор нельзя открыть" }); return; }
  if (deal.senderId !== citizenId && deal.receiverId !== citizenId) { res.status(403).json({ error: "Только участник сделки" }); return; }

  let aiVerdict: string | null = null;
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (apiKey && claimText) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(
        `Ты — ИИ-Арбитр Минтруда TimeNation.\nТЗ: ${deal.description}\nСумма: ${deal.amount} Д\nСтатус: ${deal.status}\nДоказательство: ${deal.proofText ?? "нет"}\nПретензия: ${claimText}\nВынеси вердикт до 250 слов. Финал: [ВЕРНУТЬ ЗАКАЗЧИКУ / ВЫПЛАТИТЬ ИСПОЛНИТЕЛЮ / РАЗДЕЛИТЬ ПОПОЛАМ]`
      );
      aiVerdict = result.response.text();
    } catch (err) { req.log.error({ err }, "Gemini arbitration failed"); }
  }

  const [updated] = await db.update(dealsTable).set({ status: "disputed", disputeClaimText: claimText ?? null, aiVerdict: aiVerdict ?? null, updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();

  const otherPartyId = citizenId === deal.senderId ? deal.receiverId : deal.senderId;
  void sendTransactionNotification(citizenId, `⚖️ *Спор по сделке #${id} открыт*${aiVerdict ? `\n🤖 *Вердикт ИИ:*\n_${aiVerdict.slice(0, 500)}_` : ""}`);
  if (otherPartyId) void sendTransactionNotification(otherPartyId, `⚖️ *По сделке #${id} открыт спор*\n${deal.amount} Д заморожено`);

  res.json(updated);
});

// ─── GET /api/deals/:id/chat — история чата сделки ───────────────────────────
router.get("/deals/:id/chat", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const messages = await db.select({
    id: chatMessagesTable.id, dealId: chatMessagesTable.dealId,
    senderId: chatMessagesTable.senderId, senderName: citizensTable.name,
    messageText: chatMessagesTable.messageText, imageUrl: chatMessagesTable.imageUrl,
    createdAt: chatMessagesTable.createdAt,
  }).from(chatMessagesTable).leftJoin(citizensTable, eq(chatMessagesTable.senderId, citizensTable.id))
    .where(eq(chatMessagesTable.dealId, id)).orderBy(asc(chatMessagesTable.createdAt));
  res.json({ messages });
});

// ─── POST /api/deals/:id/chat — отправить сообщение (текст и/или base64 image) ─
router.post("/deals/:id/chat", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { senderId, messageText, imageUrl } = ChatMessageBody.parse(req.body);
  if (!messageText && !imageUrl) { res.status(400).json({ error: "Нужен текст или изображение" }); return; }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Сделка не найдена" }); return; }
  if (deal.senderId !== senderId && deal.receiverId !== senderId) { res.status(403).json({ error: "Только участники сделки" }); return; }

  const [msg] = await db.insert(chatMessagesTable).values({ dealId: id, senderId, messageText: messageText ?? null, imageUrl: imageUrl ?? null }).returning();

  const otherId = senderId === deal.senderId ? deal.receiverId : deal.senderId;
  if (otherId) {
    const [sender] = await db.select({ name: citizensTable.name }).from(citizensTable).where(eq(citizensTable.id, senderId)).limit(1);
    void sendTransactionNotification(otherId, `💬 *Новое сообщение по Сделке #${id}*\n👤 ${sender?.name ?? "Участник"}: ${messageText ? `_${messageText.slice(0, 200)}_` : "📎 фото"}`);
  }
  res.status(201).json(msg);
});

// ─── Work Timer: start / pause / complete ────────────────────────────────────

// POST /api/deals/:id/timer/start — только исполнитель (receiverId)
router.post("/deals/:id/timer/start", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = TimerActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.receiverId !== citizenId) { res.status(403).json({ error: "Только исполнитель управляет таймером" }); return; }
  if (deal.timerStatus === "running") { res.status(409).json({ error: "Таймер уже запущен" }); return; }
  if (deal.timerStatus === "completed") { res.status(409).json({ error: "Работа уже завершена" }); return; }
  const [updated] = await db.update(dealsTable).set({ timerStatus: "running", timerStartedAt: new Date(), updatedAt: new Date() }).where(eq(dealsTable.id, id)).returning();
  res.json(updated);
});

// POST /api/deals/:id/timer/pause — накапливает elapsed минуты в totalTrackedMinutes
router.post("/deals/:id/timer/pause", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = TimerActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.receiverId !== citizenId || deal.timerStatus !== "running") { res.status(409).json({ error: "Таймер не запущен" }); return; }
  const now = new Date();
  const elapsed = deal.timerStartedAt ? Math.floor((now.getTime() - deal.timerStartedAt.getTime()) / 60000) : 0;
  const newTotal = deal.totalTrackedMinutes + elapsed;
  const [updated] = await db.update(dealsTable).set({ timerStatus: "paused", totalTrackedMinutes: newTotal, timerStartedAt: null, updatedAt: now }).where(eq(dealsTable.id, id)).returning();
  req.log.info({ dealId: id, elapsed, newTotal }, "Work timer paused");
  res.json(updated);
});

// POST /api/deals/:id/timer/complete — финал: Gemini анализирует отклонение хронометража
// Результат публикуется ИИ-сообщением в чат сделки
router.post("/deals/:id/timer/complete", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  const { citizenId } = TimerActorBody.parse(req.body);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, id)).limit(1);
  if (!deal || deal.receiverId !== citizenId || deal.timerStatus === "completed") { res.status(409).json({ error: "Невозможно завершить" }); return; }

  const now = new Date();
  let newTotal = deal.totalTrackedMinutes;
  if (deal.timerStatus === "running" && deal.timerStartedAt) {
    newTotal += Math.floor((now.getTime() - deal.timerStartedAt.getTime()) / 60000);
  }

  let aiDeviation: string | null = null;
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const deviationPct = deal.amount > 0 ? Math.round(((newTotal - deal.amount) / deal.amount) * 100) : 0;
      const result = await model.generateContent(
        `Ты ИИ-аудитор хронометража TimeNation.\nЗадача: "${deal.description}"\nПлан: ${deal.amount} Д\nФакт: ${newTotal} Д\nОтклонение: ${deviationPct > 0 ? "+" : ""}${deviationPct}%\nДай краткий анализ (2-3 предложения) без лишних слов.`
      );
      aiDeviation = result.response.text().trim();
    } catch (e) { logger.error({ err: e }, "Timer deviation AI failed"); }
  }

  const [updated] = await db.update(dealsTable).set({ timerStatus: "completed", totalTrackedMinutes: newTotal, timerStartedAt: null, updatedAt: now }).where(eq(dealsTable.id, id)).returning();

  // ИИ-комментарий публикуется как сообщение в чат
  if (aiDeviation) {
    await db.insert(chatMessagesTable).values({
      dealId: id,
      senderId: citizenId,
      messageText: `🤖 *ИИ-Хронометраж:* ${aiDeviation}\n\n📊 План: ${deal.amount} Д · Факт: ${newTotal} Д`,
      imageUrl: null,
    });
  }

  res.json({ deal: updated, aiDeviation, actualMinutes: newTotal });
});

export default router;
```

---

## 4. МОБИЛЬНЫЙ ФРОНТЕНД (Expo)

### `artifacts/mobile/app/(tabs)/index.tsx` — TiMETR (главный экран, 1291 строк)

**Архитектура экрана:**

```
TiMETR (index.tsx)
├── Режим "Перевод"
│   ├── FlatList граждан → выбор получателя
│   ├── RateWidget — ИИ-аудит Kq получателя (GET /api/citizens/:id/rate)
│   ├── СТАРТ → POST /api/sessions { fromCitizenId, toCitizenId }
│   ├── setInterval(1s) → elapsed state → formatTime()
│   └── СТОП → POST /api/sessions/:id/stop → minutesTransferred зачисляются
│
└── Режим "Эскроу"
    └── <EscrowModule> (встроенный компонент)
        ├── Шаг 1 "Описать" → POST /api/deals/audit (Gemini → suggestedAmount)
        ├── Шаг 2 "Подтвердить" → POST /api/deals (escrow lock)
        ├── Кнопки: Принять / Сдать работу / Подписать Акт / Отклонить / Спор / Отмена
        ├── "Обсудить" → <DiscussionModal dealId={deal.id} />
        └── Защита от овердрафта: fresh balance fetch перед созданием
```

```typescript
// Ключевые типы
interface Deal {
  id: number; senderId: number; receiverId: number | null;
  amount: number; description: string;
  status: "open" | "accepted" | "proof_submitted" | "completed" | "declined" | "disputed" | "cancelled";
  proofUrl: string | null; proofText: string | null;
  disputeClaimText: string | null; aiVerdict: string | null;
  timerStatus: string;            // 'idle' | 'running' | 'paused' | 'completed'
  totalTrackedMinutes: number;    // накопленные минуты (сервер)
  timerStartedAt: string | null;  // ISO-timestamp последнего старта
  createdAt: string; updatedAt: string;
}

// Защита от устаревшего кеша при создании сделки:
const freshBalance = await fetch(`${BASE_URL}/api/citizens/${citizen.id}`)
  .then(r => r.json()).then(d => d.balanceMinutes ?? citizen.balanceMinutes);
const available = freshBalance - 1; // родовая минута неотчуждаема
if (available < amt) { Alert.alert("Недостаточно Дарминов", ...); return; }

// RateWidget: показывает Kq, calculatedHourRate, reviewScoreCount получателя
function RateWidget({ recipient, colors }) {
  // GET /api/citizens/:id/rate
  // Если skillsAuditedAt — показывает бейдж "подтверждено"
}

// EscrowModule: двухшаговый флоу создания
const handleAudit = async () => {
  // POST /api/deals/audit → { suggestedAmount, summary, breakdown }
  setAuditResult(data); setAmount(String(data.suggestedAmount));
  setCreateStep("audit");
};
const handleCreate = async () => {
  // POST /api/deals → escrow created
};
```

---

### `artifacts/mobile/components/chronopedia-map-html.ts`

```typescript
// Leaflet map HTML — shared: native WebView + web iframe
// Protocol:
//   OUT (map → host): ReactNativeWebView.postMessage / window.parent.postMessage
//                     { type: 'ready' | 'slotClick' | 'mapClick', lat?, lng?, slotId? }
//   IN  (host → map): injectJavaScript / iframe.contentWindow.postMessage
//                     { fn: string, args: unknown[] } → window[fn].apply(null, args)

export const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body,#map{width:100%;height:100%;background:#f5f5f5;}
.leaflet-control-attribution,.leaflet-control-zoom{display:none;}
.tn-tip{background:#fff!important;color:#111827!important;border:1px solid #d1d5db!important;
  font-size:12px!important;padding:6px 10px!important;border-radius:8px!important;
  white-space:nowrap!important;box-shadow:0 4px 16px rgba(0,0,0,0.15)!important;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', {center:[20,10], zoom:2, zoomControl:false, attributionControl:false, worldCopyJump:true});
// Тайлы Google Maps (бесплатный эндпоинт)
L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=ru&x={x}&y={y}&z={z}', {maxZoom:20}).addTo(map);

var markers = {}, selectedSlotId = null, pendingMarker = null;

function send(d) {
  var m = JSON.stringify(d);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m);
  else try { window.parent.postMessage(m, '*'); } catch(e) {}
}

function makeIcon(count, isMine, isSelected) {
  var bg = isSelected ? '#f59e0b' : isMine ? '#16a34a' : '#2563eb';
  return L.divIcon({className:'', html:'<div style="width:36px;height:36px;background:'+bg+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">'+(count>1?String(count):'●')+'</div>', iconSize:[36,36], iconAnchor:[18,18]});
}

function escHtml(s) {
  return String(s||'').replace(/[&<>"]/g, function(c) {
    return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]||c;
  });
}

function updateMarkers(slots, myId, selId) {
  selectedSlotId = (selId !== undefined) ? selId : selectedSlotId;
  Object.values(markers).forEach(function(m){m.remove();}); markers = {};
  (slots||[]).forEach(function(s) {
    if (!s.geoLat && !s.geoLng) return; // skip null-island (не геокодирован)
    if (s.geoLat === 0 && s.geoLng === 0) return;
    var m = L.marker([s.geoLat, s.geoLng], {icon: makeIcon(s.eventCount||0, !!s.hasMyEvent, s.id===selectedSlotId)}).addTo(map);
    m.bindTooltip('<b>'+escHtml(s.locationName)+'</b><br><small>'+escHtml(s.timeMarker)+'</small><br>'+(s.eventCount||0)+' мнений', {className:'tn-tip', direction:'top'});
    m.on('click', function(){send({type:'slotClick', slotId:s.id});});
    markers[s.id] = m;
    if (s.id === selectedSlotId) { map.setView([s.geoLat, s.geoLng], 13, {animate:true}); setTimeout(function(){m.openTooltip();}, 300); }
  });
}

function setPending(lat, lng) {
  if (pendingMarker) { pendingMarker.remove(); pendingMarker = null; }
  if (lat == null || lng == null) return;
  pendingMarker = L.marker([lat, lng], {icon: makePendingIcon(), zIndexOffset:1000}).addTo(map);
  var z = map.getZoom();
  map.setView([lat, lng], z < 8 ? 8 : z, {animate:true});
}

function centerOn(lat, lng, z) { map.setView([lat, lng], z||12, {animate:true}); }
function clearSelection() { selectedSlotId = null; }

map.on('click', function(e) {
  var lng = (((e.latlng.lng % 360) + 540) % 360) - 180; // нормализация за ±180°
  send({type:'mapClick', lat:parseFloat(e.latlng.lat.toFixed(6)), lng:parseFloat(lng.toFixed(6))});
});

// Экспорт API для вызова из host-окружения
window.updateMarkers = updateMarkers;
window.setPending = setPending;
window.centerOn = centerOn;
window.clearSelection = clearSelection;

// Получение команд от host (iframe/WebView postMessage)
window.addEventListener('message', function(e) {
  try {
    var cmd = JSON.parse(typeof e.data === 'string' ? e.data : JSON.stringify(e.data));
    if (cmd && cmd.fn && typeof window[cmd.fn] === 'function') window[cmd.fn].apply(null, cmd.args || []);
  } catch(x) {}
});

setTimeout(function(){send({type:'ready'});}, 400);

// Проброс JS-ошибок в host для отладки
window.onerror = function(msg, src, line, col, err) {
  send({type:'jsError', message:String(msg), source:String(src), line:line, col:col, stack:err?String(err.stack):''});
  return true;
};
</script>
</body>
</html>`;
```

---

## 5. ВЫВОДЫ ДЛЯ АРХИТЕКТУРНОГО АУДИТА

| # | Область | Проблема | Приоритет |
|---|---|---|---|
| 1 | **Аутентификация** | `govAuth` — plain-text пароль в заголовке `x-gov-password`. Нет JWT, нет rate-limiting, нет session. Брутфорс не защищён. | 🔴 Высокий |
| 2 | **Консистентность эскроу** | Списание с баланса и создание сделки — два отдельных `UPDATE` без транзакции. Race condition при параллельных запросах → двойное списание возможно. | 🔴 Высокий |
| 3 | **Хранение изображений в БД** | `imageUrl` в `chat_messages` — base64 до 600KB прямо в PostgreSQL (`text`). Без ротации, без лимита сообщений на сделку. | 🟡 Средний |
| 4 | **TTS — Google Translate API** | `https://translate.google.com/translate_tts` — неофициальный эндпоинт, нарушает ToS Google, может быть заблокирован в любой момент без предупреждения. | 🟡 Средний |
| 5 | **Video providers** | HuggingFace — DNS недоступен из Replit. Pollinations — 429 на shared IP Replit. Picsum работает, но даёт случайные фото вместо AI-генерации. Нет собственного хостинга. | 🟡 Средний |
| 6 | **Gemini без retry** | Все вызовы Gemini — fire-and-forget без экспоненциального backoff. При 503/429 → мгновенный fallback без повторной попытки. | 🟡 Средний |
| 7 | **timerStatus ≠ TiMETR-сессии** | Два независимых механизма учёта времени: `deals.timerStatus` (рабочий таймер сделки) и `sessions` таблица (TiMETR-переводы). Не синхронизированы. | 🟡 Средний |
| 8 | **agentSimulatorService** | Отсутствует полностью — если нужна симуляция 3 агентов для калибровки, это незаполненный пробел в архитектуре. | 🟠 Низкий |
| 9 | **Deviation threshold хардкод** | `requiresCalibration = deviation > 20%` — не вынесен в конфиг или admin-панель. | 🟠 Низкий |
| 10 | **Отсутствие авторизации гражданина** | Нет сессий, токенов или middleware для граждан. Любой может отправить `citizenId` чужого гражданина и совершить операции от его имени. | 🔴 Критический |

---

*Файл сгенерирован автоматически из актуальной кодовой базы TimeNation Chrono-Genesis, 23 июня 2026.*
