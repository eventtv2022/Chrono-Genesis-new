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
import { generateCinematicPrompt, type VisualStyle as CinematicVisualStyle } from "./cinematicPromptService";
import { generateAIBackground } from "./freeVideoApiService";
import { buildStorageRecord } from "./videoStorage";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────
export const MEDIA_DIR = path.join(process.cwd(), "media");
// Google TTS voice — Wavenet-D (male) is the best Russian voice on free tier
const GOOGLE_TTS_VOICE = "ru-RU-Wavenet-D";
const GOOGLE_TTS_LANG  = "ru-RU";
const VIDEO_DURATION_SEC = 60;   // 60-second broadcast slot
const SEGMENT_DURATION_SEC = 12; // 5 × 12s = 60s exactly

// Ensure media directory exists at startup
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Mode A: Template Manifesto Expansion (~130 words, 60-second fallback) ─────
// Used when Gemini is unavailable. Approx 120–140 words = 60 sec at natural pace.
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
    `1440 слотов в сутках. Каждый — чья-то история, чей-то сигнал в будущее. Время — единственная абсолютно синхронная точка отсчёта на планете. Нет часового пояса, который обошёл бы полночь. В этой универсальности — сила. Я здесь не ради охвата. Я здесь ради точности своего голоса.`,
    `Прямо сейчас на планете идёт непрерывный эфир, который никто не контролирует централизованно. Граждане TimeNation занимают свои минуты — и каждая несёт реальную мысль реального человека. Не алгоритм, не бюджет. Просто голос, синхронизированный с глобальным временем. Именно так должно работать вещание будущего.`,
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

// ── Google Cloud TTS (Service Account — Wavenet quality) ──────────────────────

function getGoogleTTSAuth() {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw) return null;
  try {
    const credentials = JSON.parse(raw);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  } catch (err) {
    logger.error({ err }, "Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON for TTS");
    return null;
  }
}

async function googleCloudTTS(text: string): Promise<Buffer | null> {
  const auth = getGoogleTTSAuth();
  if (!auth) return null;
  try {
    const accessToken = await auth.getAccessToken();
    if (!accessToken) return null;
    const response = await fetch(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          input: { text: text.slice(0, 5000) },
          voice: { languageCode: GOOGLE_TTS_LANG, name: GOOGLE_TTS_VOICE },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
        }),
      }
    );
    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body }, "Google Cloud TTS error");
      return null;
    }
    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    return Buffer.from(data.audioContent, "base64");
  } catch (err) {
    logger.warn({ err }, "Google Cloud TTS failed");
    return null;
  }
}

// ── Google Translate TTS fallback (no API key, chunked for >200 chars) ────────

/** Split text into sentence-aware chunks ≤200 chars */
function splitIntoChunks(text: string, maxLen = 180): string[] {
  const chunks: string[] = [];
  // Split at sentence boundaries first
  const sentences = text.split(/(?<=[.!?])\s+/);
  let cur = "";
  for (const sent of sentences) {
    if ((cur + " " + sent).trim().length <= maxLen) {
      cur = (cur + " " + sent).trim();
    } else {
      if (cur) chunks.push(cur);
      // If single sentence is too long, split by comma/clause
      if (sent.length > maxLen) {
        const parts = sent.split(/,\s*/);
        let sub = "";
        for (const p of parts) {
          if ((sub + ", " + p).trim().length <= maxLen) {
            sub = sub ? sub + ", " + p : p;
          } else {
            if (sub) chunks.push(sub);
            sub = p;
          }
        }
        if (sub) cur = sub;
        else cur = "";
      } else {
        cur = sent;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter(Boolean);
}

async function fetchChunkTTS(chunk: string): Promise<Buffer | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ru&client=tw-ob&q=${encodeURIComponent(chunk)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TimeNation/1.0)" },
    });
    if (!res.ok) { logger.warn({ status: res.status, chunk: chunk.slice(0, 30) }, "gTTS chunk failed"); return null; }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ err }, "gTTS chunk fetch error");
    return null;
  }
}

async function googleTranslateTTS(text: string): Promise<Buffer | null> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return null;
  logger.info({ chunks: chunks.length }, "gTTS: fetching chunks");

  const buffers = await Promise.all(chunks.map(fetchChunkTTS));
  const valid = buffers.filter((b): b is Buffer => b !== null);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0]!;

  // Concatenate MP3 chunks via FFmpeg concat filter
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtts-"));
  try {
    const tmpFiles = valid.map((buf, i) => {
      const f = path.join(tmpDir, `chunk_${i}.mp3`);
      fs.writeFileSync(f, buf);
      return f;
    });
    const listFile = path.join(tmpDir, "list.txt");
    fs.writeFileSync(listFile, tmpFiles.map(f => `file '${f}'`).join("\n"));
    const outFile = path.join(tmpDir, "combined.mp3");

    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outFile]);
      ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg concat exit ${code}`)));
    });

    return fs.readFileSync(outFile);
  } catch (err) {
    logger.warn({ err }, "gTTS: ffmpeg concat failed, returning first chunk");
    return valid[0] ?? null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Main TTS entry point (Cloud TTS → gTTS fallback) ──────────────────────────

export async function generateTTSBuffer(text: string): Promise<Buffer | null> {
  // Try Google Cloud TTS first (Wavenet, highest quality)
  const cloudBuf = await googleCloudTTS(text);
  if (cloudBuf) {
    logger.info("TTS: using Google Cloud TTS (Wavenet)");
    return cloudBuf;
  }
  // Fallback: Google Translate TTS (no API key required)
  logger.info("TTS: Cloud TTS unavailable, falling back to Google Translate TTS");
  return googleTranslateTTS(text);
}

// ── Text helpers ───────────────────────────────────────────────────────────────
function wrapLine(line: string, maxLen = 52): string[] {
  const words = line.split(/\s+/);
  const result: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > maxLen) {
      if (cur) result.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) result.push(cur);
  return result;
}

function splitSegments(text: string, count: number): string[] {
  if (!text.trim()) return Array(count).fill("TimeNation TV");
  const sentences = text.split(/(?<=[.!?»])\s+/).filter(Boolean);
  const perGroup = Math.ceil(sentences.length / count);
  const segments: string[] = [];
  for (let i = 0; i < sentences.length; i += perGroup) {
    segments.push(sentences.slice(i, i + perGroup).join(" ").trim());
  }
  // Pad if fewer segments than expected
  while (segments.length < count) segments.push(segments.at(-1) ?? "");
  return segments.slice(0, count);
}

/** Escape text for FFmpeg drawtext filter value */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")   // curly apostrophe — avoids shell quoting issues
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// ── Visual style themes (Shariah anti-Gharar: user pre-selects before payment) ─
export const VISUAL_STYLE_THEMES = {
  space:     { bg: "0x0D1B2A", title: "0x6B7E93", text: "0xC9A84C", accent: "0x4A90D9" },
  cyberpunk: { bg: "0x0A0014", title: "0xFF00FF", text: "0x00FFFF", accent: "0xFF6B00" },
  abstract:  { bg: "0x1A0A2E", title: "0x9B59B6", text: "0xE8D5B7", accent: "0xF39C12" },
  nature:    { bg: "0x0F1B0F", title: "0x4CAF50", text: "0xA8D8A8", accent: "0x8BC34A" },
  minimal:   { bg: "0x111111", title: "0x666666", text: "0xEEEEEE", accent: "0xFFFFFF" },
} as const;
export type VisualStyle = keyof typeof VISUAL_STYLE_THEMES;

// ── FFmpeg LIGHT render ────────────────────────────────────────────────────────
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
    const segCount = Math.ceil(VIDEO_DURATION_SEC / SEGMENT_DURATION_SEC);
    const segments = splitSegments(manifestoText, segCount);

    // Apply visual style theme (Shariah anti-Gharar: user chose this before render)
    const style = visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? VISUAL_STYLE_THEMES[visualStyle as VisualStyle]
      : VISUAL_STYLE_THEMES.space;

    // Build drawtext filters: title always visible + rotating text segments
    const titleFilter =
      `drawtext=text='TIMENATION TV':fontsize=18:fontcolor=${style.title}:` +
      `x=(w-text_w)/2:y=48:alpha=0.8`;

    const slotFilter =
      `drawtext=text='SLOT ${slotId}':fontsize=14:fontcolor=${style.accent}@0.6:` +
      `x=(w-text_w)/2:y=78`;

    const segFilters: string[] = [];
    segments.forEach((seg, i) => {
      const t0 = i * SEGMENT_DURATION_SEC;
      const t1 = t0 + SEGMENT_DURATION_SEC;
      const lines = wrapLine(seg, 52).slice(0, 4);
      const totalH = lines.length * 42;
      const baseY = Math.round((720 - totalH) / 2);
      lines.forEach((line, li) => {
        segFilters.push(
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=${style.text}:` +
          `x=(w-text_w)/2:y=${baseY + li * 42}:` +
          `enable='between(t\\,${t0}\\,${t1})'`
        );
      });
    });

    // EU AI Act / China CAC: permanent AI watermark, bottom-right corner
    const watermarkFilter =
      `drawtext=text='TimeNation AI':fontsize=14:fontcolor=white@0.75:` +
      `x=w-tw-10:y=h-th-10:shadowcolor=black@0.5:shadowx=1:shadowy=1`;

    const vf = [titleFilter, slotFilter, ...segFilters, watermarkFilter].join(",");

    // Cryptographic metadata injection (EU AI Act / CAC Article 25)
    const metadataArgs = [
      "-metadata", `title=TimeNation-TV — Slot ${slotId}`,
      "-metadata", "comment=Author: TimeNation AI, Type: Synthesized Media",
      "-metadata", "artist=TimeNation",
      "-metadata", `description=AI Generated / Сгенерировано ИИ / Generated via Artificial Intelligence technologies. Visual style: ${visualStyle ?? "space"}.`,
    ];

    await onProgress?.("encoding");
    if (audioBuffer) {
      // ── 2-pass audio/video sync (as per Synchronized AI Capsule spec) ──────
      // Pass 1: generate visual-only MP4 with exactly VIDEO_DURATION_SEC duration
      const audioPath = path.join(tmpDir, "audio.mp3");
      const visualPath = path.join(tmpDir, "visual_only.mp4");
      fs.writeFileSync(audioPath, audioBuffer);

      await runFFmpeg([
        "-f", "lavfi", "-i", `color=c=${style.bg}:s=1280x720:r=25`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac",
        "-t", String(VIDEO_DURATION_SEC),
        "-y", visualPath,
      ]);

      // Pass 2: merge ElevenLabs audio into visual — copy video stream (no re-encode)
      await runFFmpeg([
        "-i", visualPath,
        "-i", audioPath,
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        ...metadataArgs,
        "-y", outputPath,
      ]);
    } else {
      // No audio: single pass with silent track
      await runFFmpeg([
        "-f", "lavfi", "-i", `color=c=${style.bg}:s=1280x720:r=25`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac",
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

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-1000)}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

// ── Progress reporter ──────────────────────────────────────────────────────────
type ProgressReporter = (stage: string) => Promise<void>;

async function setRenderProgress(slotId: number, stage: string): Promise<void> {
  try {
    await db
      .update(tvCapsulesTable)
      .set({ renderProgress: stage, updatedAt: new Date() })
      .where(eq(tvCapsulesTable.slotId, slotId));
  } catch (err) {
    logger.warn({ err, slotId, stage }, "Failed to update renderProgress");
  }
}

// ── AI Background Render ───────────────────────────────────────────────────────
// Renders a video using an AI-generated background (HuggingFace or Pollinations),
// overlaying the text manifesto and TTS audio on top.
// Falls back to solid-color renderLightVideo if AI video unavailable.
async function renderWithAIBackground(
  audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  seedText?: string | null,
  citizenId?: number | null,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-ai-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    // Step 1: Generate cinematic prompt via Gemini
    const style = (visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? visualStyle
      : "space") as CinematicVisualStyle;

    const cinematicPrompt = await generateCinematicPrompt(
      seedText ?? manifestoText.slice(0, 400),
      style
    );

    // Step 1b: Load citizen name and rank for overlay
    let citizenName = "Гражданин TimeNation";
    let citizenRank = "Гражданин";
    if (citizenId) {
      try {
        const [citizen] = await db
          .select({ name: citizensTable.name, rank: citizensTable.rank })
          .from(citizensTable)
          .where(eq(citizensTable.id, citizenId))
          .limit(1);
        if (citizen) {
          citizenName = citizen.name ?? citizenName;
          citizenRank = citizen.rank ?? citizenRank;
        }
      } catch (err) {
        logger.warn({ err, citizenId }, "Could not load citizen data for overlay");
      }
    }

    // Step 2: Fetch AI background video (HuggingFace → Pollinations → null)
    await onProgress?.("fetching_video");
    const { videoPath: aiVideoPath } = await generateAIBackground(
      cinematicPrompt,
      tmpDir,
      signal
    );

    if (!aiVideoPath) {
      // Total failure — fall back to solid-color light render
      logger.info({ slotId, style }, "AI background unavailable — falling back to solid-color render");
      return renderLightVideo(audioBuffer, manifestoText, slotId, visualStyle);
    }

    // Step 3: Build overlay filters (manifesto text + citizen rank/name)
    const theme = VISUAL_STYLE_THEMES[style];
    const segCount = Math.ceil(VIDEO_DURATION_SEC / SEGMENT_DURATION_SEC);
    const segments = splitSegments(manifestoText, segCount);

    const titleFilter =
      `drawtext=text='TIMENATION TV':fontsize=18:fontcolor=${theme.title}:` +
      `x=(w-text_w)/2:y=48:alpha=0.8`;

    const slotFilter =
      `drawtext=text='SLOT ${slotId}':fontsize=14:fontcolor=${theme.accent}@0.6:` +
      `x=(w-text_w)/2:y=78`;

    // Citizen rank (bottom-left, always visible)
    const rankFilter =
      `drawtext=text='${esc(citizenRank)}':fontsize=15:fontcolor=${theme.accent}@0.9:` +
      `x=12:y=h-th-34:shadowcolor=black@0.6:shadowx=1:shadowy=1`;

    // Citizen name (bottom-left below rank, always visible)
    const nameFilter =
      `drawtext=text='${esc(citizenName)}':fontsize=17:fontcolor=${theme.text}:` +
      `x=12:y=h-th-12:shadowcolor=black@0.6:shadowx=1:shadowy=1`;

    const segFilters: string[] = [];
    segments.forEach((seg, i) => {
      const t0 = i * SEGMENT_DURATION_SEC;
      const t1 = t0 + SEGMENT_DURATION_SEC;
      const lines = wrapLine(seg, 52).slice(0, 4);
      const totalH = lines.length * 42;
      const baseY = Math.round((720 - totalH) / 2);
      lines.forEach((line, li) => {
        segFilters.push(
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=${theme.text}:` +
          `x=(w-text_w)/2:y=${baseY + li * 42}:` +
          `enable='between(t\\,${t0}\\,${t1})'`
        );
      });
    });

    const watermarkFilter =
      `drawtext=text='TimeNation AI':fontsize=14:fontcolor=white@0.75:` +
      `x=w-tw-10:y=h-th-10:shadowcolor=black@0.5:shadowx=1:shadowy=1`;

    // Semi-transparent dark overlay to ensure text readability over any background
    const darkenFilter = `colorchannelmixer=aa=0.55`;

    const vf = [
      // Scale AI video to 1280×720, then darken slightly for readability
      `scale=1280:720:force_original_aspect_ratio=decrease`,
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2`,
      `setsar=1`,
      darkenFilter,
      titleFilter,
      slotFilter,
      rankFilter,
      nameFilter,
      ...segFilters,
      watermarkFilter,
    ].join(",");

    const metadataArgs = [
      "-metadata", `title=TimeNation-TV — Slot ${slotId}`,
      "-metadata", "comment=Author: TimeNation AI, Type: Synthesized Media",
      "-metadata", "artist=TimeNation",
      "-metadata", `description=AI Generated / Сгенерировано ИИ / AI cinematic background. Visual style: ${style}. Prompt: ${cinematicPrompt.slice(0, 120)}.`,
    ];

    await onProgress?.("encoding");
    if (audioBuffer) {
      const audioPath = path.join(tmpDir, "audio.mp3");
      fs.writeFileSync(audioPath, audioBuffer);

      await runFFmpeg([
        "-stream_loop", "-1", "-i", aiVideoPath,
        "-i", audioPath,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac", "-b:a", "128k",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-t", String(VIDEO_DURATION_SEC),
        "-shortest",
        ...metadataArgs,
        "-y", outputPath,
      ]);
    } else {
      await runFFmpeg([
        "-stream_loop", "-1", "-i", aiVideoPath,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-t", String(VIDEO_DURATION_SEC),
        ...metadataArgs,
        "-y", outputPath,
      ]);
    }

    logger.info({ slotId, style, cinematicPrompt: cinematicPrompt.slice(0, 80) }, "AI background render complete");
    return `/api/tv/media/slot_${slotId}.mp4`;
  } catch (err) {
    logger.error({ err, slotId }, "renderWithAIBackground failed — falling back to solid-color");
    return renderLightVideo(audioBuffer, manifestoText, slotId, visualStyle, onProgress);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Main Orchestrator ──────────────────────────────────────────────────────────
export async function renderCapsule(slotId: number, signal?: AbortSignal): Promise<{
  manifestoText: string;
  mediaUrl: string | null;
  catcastUrl: string | null;
  status: string;
}> {
  const [capsule] = await db
    .select()
    .from(tvCapsulesTable)
    .where(eq(tvCapsulesTable.slotId, slotId))
    .limit(1);

  if (!capsule) throw new Error(`No capsule found for slotId=${slotId}`);

  // Mark as processing
  const reportProgress: ProgressReporter = (stage) => setRenderProgress(slotId, stage);

  await db
    .update(tvCapsulesTable)
    .set({ status: "pending_render", renderProgress: "generating_prompt", updatedAt: new Date() })
    .where(eq(tvCapsulesTable.slotId, slotId));

  // 1. Load slot for date/minuteIndex (needed for Gemini prompt context)
  const [slot] = await db
    .select({ date: tvSlotsTable.date, minuteIndex: tvSlotsTable.minuteIndex })
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.id, slotId))
    .limit(1);

  // 2. Determine manifesto text
  let manifestoText: string;
  if (capsule.contentState === "empty") {
    manifestoText = "TimeNation — пространство тишины. Момент принадлежит тебе.";
  } else if (capsule.mode === "b") {
    // Mode B: raw seed, no LLM expansion
    manifestoText = capsule.seedText ?? "";
  } else {
    // Mode A: Gemini AI packaging → fallback to template if key missing or error
    if (capsule.seedText && slot) {
      const geminiResult = await generateManifesto(
        capsule.seedText,
        slot.date,
        slot.minuteIndex
      );
      manifestoText = geminiResult ?? expandSeedToManifesto(capsule.seedText);
      if (!geminiResult) {
        logger.info({ slotId }, "Gemini unavailable — used template manifesto fallback");
      }
    } else {
      manifestoText = capsule.seedText
        ? expandSeedToManifesto(capsule.seedText)
        : "TimeNation — суверенное государство времени.";
    }
  }

  // 2. Route by render path ─────────────────────────────────────────────────
  //    LIGHT → ElevenLabs TTS + FFmpeg (instant)
  //    HEAVY → external Video API stub (Quarter / Half / Apex slots)
  let mediaUrl: string | null = null;
  let finalStatus = "draft";

  // Generate TTS audio once (shared by both paths)
  await reportProgress("generating_tts");
  const audioBuffer = manifestoText ? await generateTTSBuffer(manifestoText) : null;

  if (capsule.renderPath === "heavy") {
    // Premium slot: full AI cinematic video (HuggingFace → Pollinations → solid-color)
    try {
      mediaUrl = await renderWithAIBackground(
        audioBuffer,
        manifestoText,
        slotId,
        capsule.visualStyle,
        capsule.seedText,
        capsule.citizenId,
        reportProgress,
        signal
      );
      finalStatus = "rendered";
      logger.info({ slotId }, "HEAVY slot rendered with AI background");
    } catch (err) {
      logger.error({ err, slotId }, "renderWithAIBackground failed for HEAVY slot — falling back to LIGHT");
      try {
        mediaUrl = await renderLightVideo(audioBuffer, manifestoText, slotId, capsule.visualStyle, reportProgress);
        finalStatus = "rendered";
      } catch (lightErr) {
        logger.error({ lightErr, slotId }, "LIGHT fallback for HEAVY slot also failed");
        finalStatus = "draft";
      }
    }
  } else {
    // LIGHT path: Citizen slots also get AI background (with graceful fallback)
    try {
      mediaUrl = await renderWithAIBackground(
        audioBuffer,
        manifestoText,
        slotId,
        capsule.visualStyle,
        capsule.seedText,
        capsule.citizenId,
        reportProgress,
        signal
      );
      finalStatus = "rendered";
    } catch (err) {
      logger.error({ err, slotId }, "renderWithAIBackground failed for LIGHT slot — falling back to solid-color");
      try {
        mediaUrl = await renderLightVideo(audioBuffer, manifestoText, slotId, capsule.visualStyle, reportProgress);
        finalStatus = "rendered";
      } catch (lightErr) {
        logger.error({ lightErr, slotId }, "renderLightVideo also failed");
        finalStatus = "draft";
      }
    }
  }

  // 4. Build storage record and persist
  const localPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);
  let sizeBytes: number | undefined;
  try {
    sizeBytes = fs.existsSync(localPath) ? fs.statSync(localPath).size : undefined;
  } catch { /* ignore */ }
  const storageRecord = buildStorageRecord(slotId, localPath, sizeBytes);
  // Use hot CDN URL as the canonical mediaUrl if available
  const canonicalMediaUrl = storageRecord.hotUrl ?? mediaUrl;

  await db
    .update(tvCapsulesTable)
    .set({
      manifestoText: manifestoText || null,
      mediaUrl: canonicalMediaUrl,
      status: finalStatus,
      updatedAt: new Date(),
    })
    .where(eq(tvCapsulesTable.slotId, slotId));

  // 5. Upload to Catcast.tv (async, non-blocking for caller)
  let catcastUrl: string | null = null;
  if (finalStatus === "rendered" && mediaUrl) {
    const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);
    const [citizen] = await db
      .select({ name: citizensTable.name })
      .from(citizensTable)
      .where(eq(citizensTable.id, capsule.citizenId))
      .limit(1);
    const citizenName = citizen?.name ?? "Гражданин TimeNation";

    const catcastResult = await uploadToCatcast(
      outputPath,
      slotId,
      citizenName,
      capsule.seedText ?? ""
    ).catch((err) => {
      logger.warn({ err, slotId }, "Catcast upload threw, skipping");
      return null;
    });

    if (catcastResult) {
      catcastUrl = catcastResult.videoUrl;
      await db
        .update(tvCapsulesTable)
        .set({
          catcastVideoId: catcastResult.videoId,
          catcastUrl: catcastResult.videoUrl,
          updatedAt: new Date(),
        })
        .where(eq(tvCapsulesTable.slotId, slotId));
      logger.info({ slotId, catcastUrl }, "Capsule published to Catcast");
    }
  }

  return { manifestoText, mediaUrl, catcastUrl, status: finalStatus };
}
