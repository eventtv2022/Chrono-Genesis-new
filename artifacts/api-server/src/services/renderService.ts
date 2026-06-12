import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { db } from "@workspace/db";
import { tvCapsulesTable, citizensTable, tvSlotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { uploadToCatcast } from "./catcastService";
import { generateManifesto } from "./geminiService";
import { buildStorageRecord } from "./videoStorage";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────
export const MEDIA_DIR = path.join(process.cwd(), "media");
const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — EN/RU multilingual
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

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────────

/** Fetch first available voice for this API key (works on free plans). */
async function resolveVoiceId(apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) return ELEVENLABS_VOICE_ID; // fallback
    const data = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string }[] };
    const voices = data.voices ?? [];
    // Prefer "cloned" or "generated" voices first (always usable on any plan),
    // then any voice that belongs to this account ("my" category / no category).
    const mine = voices.find(
      (v) => v.category === "cloned" || v.category === "generated"
    );
    if (mine) return mine.voice_id;
    // Fall back to the first voice in the list (may be premade — works on paid plans)
    if (voices.length > 0) return voices[0]!.voice_id;
  } catch {
    // ignore, use default
  }
  return ELEVENLABS_VOICE_ID;
}

export async function generateTTSBuffer(text: string): Promise<Buffer | null> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    logger.info("ELEVENLABS_API_KEY not set — rendering without audio");
    return null;
  }

  const voiceId = await resolveVoiceId(apiKey);
  logger.info({ voiceId }, "ElevenLabs TTS: using voice");

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body, voiceId }, "ElevenLabs TTS error");
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    logger.warn({ err }, "ElevenLabs TTS fetch failed");
    return null;
  }
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
  visualStyle?: string | null
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

// ── HEAVY render stub (Queue for external Video API: Kling / Luma / Runway) ───
// When a real Video API key is added, replace this stub with the actual call.
async function renderHeavyVideo(
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null
): Promise<{ mediaUrl: null; status: "pending_heavy_render" }> {
  logger.warn(
    { slotId, visualStyle, words: manifestoText.split(" ").length },
    "HEAVY_RENDER queued — awaiting external Video API (Kling/Luma/Runway). Returning pending status."
  );
  // TODO: send to video generation queue (Kling / Luma / Runway)
  // When implemented, write generated video URL to capsule.mediaUrl and set status = "rendered"
  return { mediaUrl: null, status: "pending_heavy_render" };
}

// ── Main Orchestrator ──────────────────────────────────────────────────────────
export async function renderCapsule(slotId: number): Promise<{
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
  await db
    .update(tvCapsulesTable)
    .set({ status: "pending_render", updatedAt: new Date() })
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

  if (capsule.renderPath === "heavy") {
    // Premium slot: queue for full AI video generation
    const ttsBuffer = manifestoText ? await generateTTSBuffer(manifestoText) : null;
    const heavyResult = await renderHeavyVideo(manifestoText, slotId, capsule.visualStyle);
    mediaUrl = heavyResult.mediaUrl;
    finalStatus = heavyResult.status;
    // Still run LIGHT render as fallback preview while heavy is queued
    if (!mediaUrl) {
      try {
        mediaUrl = await renderLightVideo(ttsBuffer, manifestoText, slotId, capsule.visualStyle);
        finalStatus = "pending_heavy_render"; // override: heavy is still queued
        logger.info({ slotId }, "HEAVY slot got LIGHT preview while awaiting Video API");
      } catch (err) {
        logger.error({ err, slotId }, "LIGHT fallback for HEAVY slot also failed");
      }
    }
  } else {
    // LIGHT path: ElevenLabs TTS + FFmpeg (Citizen slots)
    const audioBuffer = manifestoText ? await generateTTSBuffer(manifestoText) : null;
    try {
      mediaUrl = await renderLightVideo(audioBuffer, manifestoText, slotId, capsule.visualStyle);
      finalStatus = "rendered";
    } catch (err) {
      logger.error({ err, slotId }, "renderLightVideo failed");
      finalStatus = "draft";
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
