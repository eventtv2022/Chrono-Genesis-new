import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { db } from "@workspace/db";
import { tvCapsulesTable, citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { uploadToCatcast } from "./catcastService";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────
export const MEDIA_DIR = path.join(process.cwd(), "media");
const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — EN/RU multilingual
const VIDEO_DURATION_SEC = 60;
const SEGMENT_DURATION_SEC = 12;

// Ensure media directory exists at startup
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Mode A: Template Manifesto Expansion (~130 words, cyber-minimalist) ───────
export function expandSeedToManifesto(seed: string): string {
  const clean = seed.trim().replace(/\s+/g, " ");
  const idx = Math.abs(hashStr(clean)) % 3;

  const openings = [
    `В хронике TimeNation зафиксирован сигнал эпохи. Из зерна мысли — координата манифеста: «${clean}»`,
    `Летопись суверенного государства принимает новую точку на таймлайне. Семя: «${clean}»`,
    `Цифровой архив фиксирует истину настоящего момента. Исходный код мысли: «${clean}»`,
  ];

  const cores = [
    `Время — единственная неподдельная валюта. Каждый Дармин — не абстракция, а пульс живого организма под названием история. Эта минута больше не принадлежит случаю: она выкуплена, зафиксирована, застрахована от забвения. Цифровое государство не хранит воспоминания — оно хранит доказательства существования.`,
    `Мысль, не зафиксированная в пространстве-времени, растворяется в шуме эпохи. Здесь — в архитектуре TimeNation — идея обретает плоть координат. Не архив, не музей: живая ДНК цивилизации, где каждая секунда является доказательством присутствия разума во вселенной.`,
    `Пока системы мира торгуют иллюзиями, гражданин TimeNation выбирает абсолютное: быть здесь, быть сейчас, оставить след в ткани цифровой истории. Каждый слот — экзистенциальный акт владения своим местом в таймлайне. Дармин сгорает — координата остаётся навсегда.`,
  ];

  const closings = [
    `Манифест принят. Временная координата запечатана. Свидетели — все узлы сети TimeNation.`,
    `Это не история — это настоящее, замороженное в янтаре вечности. Суверенный архив пополнен.`,
    `Минута выкуплена. Дармин сожжён. Момент — твой навсегда. Сеть подтверждает.`,
  ];

  return `${openings[idx]}\n\n${cores[idx]}\n\n${closings[idx]}`;
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

// ── FFmpeg LIGHT render ────────────────────────────────────────────────────────
export async function renderLightVideo(
  audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-tv-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    const segCount = Math.ceil(VIDEO_DURATION_SEC / SEGMENT_DURATION_SEC);
    const segments = splitSegments(manifestoText, segCount);

    // Build drawtext filters: title always visible + rotating text segments
    const titleFilter =
      `drawtext=text='TIMENATION TV':fontsize=18:fontcolor=0x6B7E93:` +
      `x=(w-text_w)/2:y=48:alpha=0.8`;

    const slotFilter =
      `drawtext=text='SLOT ${slotId}':fontsize=14:fontcolor=0x3D4F63:` +
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
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=0xC9A84C:` +
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
      "-metadata", "description=AI Generated / Сгенерировано ИИ / Generated via Artificial Intelligence technologies.",
    ];

    let args: string[];

    if (audioBuffer) {
      const audioPath = path.join(tmpDir, "audio.mp3");
      fs.writeFileSync(audioPath, audioBuffer);
      args = [
        "-f", "lavfi", "-i", "color=c=0x0D1B2A:s=1280x720:r=25",
        "-i", audioPath,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        ...metadataArgs,
        "-y", outputPath,
      ];
    } else {
      args = [
        "-f", "lavfi", "-i", "color=c=0x0D1B2A:s=1280x720:r=25",
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
        "-c:a", "aac",
        "-t", String(VIDEO_DURATION_SEC),
        ...metadataArgs,
        "-y", outputPath,
      ];
    }

    await runFFmpeg(args);
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

  // 1. Determine manifesto text
  let manifestoText: string;
  if (capsule.contentState === "empty") {
    manifestoText = "TimeNation — пространство тишины. Момент принадлежит тебе.";
  } else if (capsule.mode === "b") {
    // Mode B: raw seed, no LLM
    manifestoText = capsule.seedText ?? "";
  } else {
    // Mode A: AI packaging (template expansion; swap to real LLM when key available)
    manifestoText = capsule.seedText
      ? expandSeedToManifesto(capsule.seedText)
      : "TimeNation — суверенное государство времени.";
  }

  // 2. TTS audio
  const audioBuffer = manifestoText ? await generateTTSBuffer(manifestoText) : null;

  // 3. FFmpeg video render
  let mediaUrl: string | null = null;
  let finalStatus = "draft";

  try {
    mediaUrl = await renderLightVideo(audioBuffer, manifestoText, slotId);
    finalStatus = "rendered";
  } catch (err) {
    logger.error({ err, slotId }, "renderLightVideo failed");
    finalStatus = "draft";
  }

  // 4. Persist local render
  await db
    .update(tvCapsulesTable)
    .set({
      manifestoText: manifestoText || null,
      mediaUrl,
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
