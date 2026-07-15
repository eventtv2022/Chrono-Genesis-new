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
import {
  generateCinematicPromptTiered,
  generateMultiScenePrompts,
  type VisualStyle as CinematicVisualStyle,
  type RenderTier,
} from "./cinematicPromptService";
import { getSlotType } from "./tvService";
import { generateAIBackground } from "./freeVideoApiService";
import { buildStorageRecord } from "./videoStorage";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────
export const MEDIA_DIR = path.join(process.cwd(), "media");
// Google TTS voice — Wavenet-D (male) is the best Russian voice on free tier
const GOOGLE_TTS_VOICE = "ru-RU-Wavenet-D";
const GOOGLE_TTS_LANG  = "ru-RU";
// Video duration is now dynamic (driven by actual TTS audio lengths via ffprobe).
// No fixed VIDEO_DURATION_SEC / SEGMENT_DURATION_SEC constants — each render function
// measures real audio length per segment and syncs the video timeline to it.

// Ensure media directory exists at startup
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Mode A: Template Manifesto Expansion (5-sentence cinematic fallback) ──────
// Used when Gemini is unavailable. Each template: 8 long TTS-ready sentences (~60s).
export function expandSeedToManifesto(seed: string): string {
  const clean = seed.trim().replace(/\s+/g, " ").slice(0, 300);
  const idx = Math.abs(hashStr(clean)) % 6;

  const templates = [
    // 0 — Sovereignty of the moment
    `${clean} — это не просто слова, это осознанный акт суверенитета над самым невосполнимым ресурсом, которым мы располагаем. ` +
    `Большинство людей проживают свои 1440 минут в сутках, не оставляя ни одного заметного следа в глобальном эфире, — и это не случайность, это выбор. ` +
    `Каждая мысль, произнесённая вслух и зафиксированная в таймлайне, постепенно меняет архитектуру реальности вокруг говорящего. ` +
    `Один Дармин — это одна минута жизни, сожжённая ради того, чтобы твой сигнал прозвучал без купюр, без алгоритмов, без посредников. ` +
    `Большинство боятся вещать, потому что вещание — это ответственность: ты заявляешь не только о мысли, но и о себе. ` +
    `Однако именно страх вещания отличает потребителя чужого эфира от его создателя, и это различие определяет всё остальное. ` +
    `Когда ты выкупаешь минуту и говоришь — ты перестаёшь быть пассивным зрителем чужого времени и становишься архитектором своего. ` +
    `Таймлайн принял мой сигнал. Координата запечатана навсегда.`,

    // 1 — Creation vs consumption
    `Мир всегда был разделён на тех, кто потребляет чужое время, и тех, кто создаёт собственное — и я нахожусь по вторую сторону этой черты. ` +
    `${clean}: это не декларация на ветер, это код, встроенный в глобальный эфир навсегда и не поддающийся редактированию. ` +
    `Минута, в которую ты выбираешь молчать, принадлежит тем, кто говорит, — и именно они формируют нарратив, который ты потом называешь реальностью. ` +
    `Созидание требует мужества именно потому, что его можно измерить: сколько минут ты вложил в смысл, столько его и получит мир обратно. ` +
    `Каждый акт публичного вещания — это ставка: ты ставишь свою минуту против информационного шума и заявляешь, что твой сигнал важнее. ` +
    `Те, кто понимает это, перестают спрашивать разрешения на существование в эфире и просто занимают свою координату. ` +
    `Дармин — это не валюта покупки, это валюта присутствия: ты платишь им не за контент, а за право быть услышанным. ` +
    `Сеть слышит меня. Момент создан и зафиксирован навсегда.`,

    // 2 — Architecture of consciousness
    `Пространство, которое ты не заполняешь собственным смыслом, неизбежно заполняется чужим шумом — и это касается не только комнат, но и эфира. ` +
    `${clean}: именно здесь начинается перестройка — не стен и не интерфейсов, а архитектоники самого разума. ` +
    `Хаос снаружи — это всегда точная проекция незавершённой внутренней работы, и никакой внешний порядок не исправит внутренний беспорядок. ` +
    `TimeNation предлагает инструмент радикальной честности: сжечь одну минуту жизни в огне глобального вещания и получить взамен координату, которую не стереть. ` +
    `Это не про технологию и не про блокчейн — это про решение выйти в эфир в тот момент, когда большинство продолжает молчать. ` +
    `Молчание безопасно, молчание удобно, молчание ничего не стоит — именно поэтому оно не оставляет следа в таймлайне человечества. ` +
    `Я выбираю след. Я выбираю координату. Я выбираю быть архитектором этого момента, а не его свидетелем. ` +
    `Минута выкуплена навсегда. Таймлайн принял мой сигнал.`,

    // 3 — Signal in the noise
    `В океане информационного шума самое революционное и самое редкое действие — выйти в эфир с собственной, незаимствованной частотой. ` +
    `${clean} — это моя частота, мой сигнал, мой личный вклад в летопись именно этих суток, именно этой минуты. ` +
    `Алгоритмы крупнейших платформ решают, что услышат миллиарды людей, — но мою минуту они не контролируют и контролировать не смогут. ` +
    `1440 слотов в сутках, и каждый из них — чья-то потенциальная точка невозврата, разделяющая молчание и присутствие. ` +
    `Кто-то выбирает промолчать сегодня и завтра, и послезавтра — пока его время тихо перетекает в чужие нарративы. ` +
    `Я выбираю говорить, и это не самонадеянность — это элементарная ответственность перед собственным временем существования. ` +
    `Каждый сигнал в глобальном эфире — это маяк для тех, кто движется в той же темноте и ищет подтверждения, что они не одни. ` +
    `Сеть слышит меня. Мой голос навсегда встроен в глобальный эфир.`,

    // 4 — Time as the only true currency
    `Деньги можно напечатать заново, репутацию восстановить, потерянные знания — вернуть, но потраченную минуту не вернуть никогда и ни при каких условиях. ` +
    `${clean} — вот ради чего я трачу эту конкретную минуту, и я не считаю это потерей, я считаю это инвестицией. ` +
    `Дармин — это не просто токен протокола, это конвертированное и упакованное время жизни, а его сжигание — высшая форма декларации ценностей. ` +
    `Когда ты вкладываешь время в смысл, смысл начинает работать на тебя даже спустя годы после того, как та минута давно прошла. ` +
    `Это и есть настоящее сложное существо — не деньги, не власть, а смысл, встроенный в таймлайн в нужный момент. ` +
    `Те, кто понял это правило, перестают тратить минуты на потребление и начинают вкладывать их в производство сигнала. ` +
    `Я здесь. Я говорю. Я фиксирую координату — потому что это единственное действие, которое останется после меня в эфире. ` +
    `Координата запечатана. Таймлайн принял этот сигнал навсегда.`,

    // 5 — The broadcast manifesto
    `Глобальный эфир идёт непрерывно — 86 400 секунд в сутки, и подавляющее большинство из них заполнено чужими голосами, чужими смыслами. ` +
    `${clean}: я выхожу в этот эфир не потому, что мне кто-то позволил, а потому что я сам выкупил свою минуту и своё право говорить. ` +
    `Суверенитет времени — это не красивая метафора, это конкретный протокол: ты либо владеешь своей координатой в таймлайне, либо ею тихо владеет кто-то другой. ` +
    `Каждая произнесённая и зафиксированная мысль — это маяк для тех, кто движется в той же темноте и ищет ориентир. ` +
    `Большинство ждут идеального момента для вещания — и именно поэтому большинство никогда не выходит в эфир вообще. ` +
    `Идеального момента не существует: существует только этот момент, эта минута, это единственное окно, которое не повторится. ` +
    `Я не жду. Я говорю сейчас, вкладываю смысл в глобальный эфир и принимаю ответственность за каждое произнесённое слово. ` +
    `Сеть слышит меня. Минута выкуплена навсегда.`,
  ];

  return templates[idx]!;
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
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.88, pitch: 0 },
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
// audioBuffer param is retained for backward-compat but ignored —
// TTS is generated per-segment internally for precise subtitle sync.
export async function renderLightVideo(
  _audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  onProgress?: ProgressReporter
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-tv-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    const SEG_COUNT = 8;
    const segments = splitSegments(manifestoText, SEG_COUNT);
    const style = visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? VISUAL_STYLE_THEMES[visualStyle as VisualStyle]
      : VISUAL_STYLE_THEMES.space;

    // ── Step 1: Generate TTS per segment, measure real durations ─────────────
    await onProgress?.("generating_tts");
    const { segFiles, durations, totalDuration } = await buildSegmentAudio(segments, tmpDir);
    const timeline = buildTimeline(durations);
    logger.info({ slotId, durations: durations.map(d => d.toFixed(2)), totalDuration: totalDuration.toFixed(2) }, "LIGHT: per-segment audio ready");

    // ── Step 2: Concat + normalize to exactly 60 s ───────────────────────────
    const rawAudioPath = await concatAudioSegments(segFiles, tmpDir);
    const finalAudioPath = await normalizeAudioDuration(rawAudioPath, totalDuration, TARGET_DURATION_SEC, tmpDir);
    // Scale subtitle timestamps so they map onto the normalized 60-second timeline
    const subScale = TARGET_DURATION_SEC / totalDuration;
    const scaledTimeline = timeline.map(({ t0, t1 }) => ({
      t0: t0 * subScale,
      t1: t1 * subScale,
    }));

    // ── Step 3: Build drawtext filters using scaled audio timestamps ──────────
    const titleFilter =
      `drawtext=text='TIMENATION TV':fontsize=18:fontcolor=${style.title}:` +
      `x=(w-text_w)/2:y=48:alpha=0.8`;
    const slotFilter =
      `drawtext=text='SLOT ${slotId}':fontsize=14:fontcolor=${style.accent}@0.6:` +
      `x=(w-text_w)/2:y=78`;

    const segFilters: string[] = [];
    segments.forEach((seg, i) => {
      const { t0, t1 } = scaledTimeline[i]!;
      const lines = wrapLine(seg, 52).slice(0, 4);
      const totalH = lines.length * 42;
      const baseY = Math.round((720 - totalH) / 2);
      lines.forEach((line, li) => {
        segFilters.push(
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=${style.text}:` +
          `x=(w-text_w)/2:y=${baseY + li * 42}:` +
          `enable='between(t\\,${t0.toFixed(2)}\\,${t1.toFixed(2)})'`
        );
      });
    });

    const watermarkFilter =
      `drawtext=text='TimeNation AI':fontsize=14:fontcolor=white@0.75:` +
      `x=w-tw-10:y=h-th-10:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
    const vf = [titleFilter, slotFilter, ...segFilters, watermarkFilter].join(",");

    const metadataArgs = [
      "-metadata", `title=TimeNation-TV — Slot ${slotId}`,
      "-metadata", "comment=Author: TimeNation AI, Type: Synthesized Media",
      "-metadata", "artist=TimeNation",
      "-metadata", `description=AI Generated / Сгенерировано ИИ / Generated via Artificial Intelligence technologies. Visual style: ${visualStyle ?? "space"}.`,
    ];

    // ── Step 4: Single-pass render: solid color BG + normalized 60s audio ────
    await onProgress?.("encoding");
    await runFFmpeg([
      "-f", "lavfi", "-i", `color=c=${style.bg}:s=1280x720:r=25`,
      "-i", finalAudioPath,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
      "-c:a", "aac", "-b:a", "128k",
      "-map", "0:v:0", "-map", "1:a:0",
      "-t", String(TARGET_DURATION_SEC),
      ...metadataArgs,
      "-y", outputPath,
    ]);

    logger.info({ slotId, rawDuration: totalDuration.toFixed(2), finalDuration: TARGET_DURATION_SEC }, "LIGHT render complete (60s normalized)");
    return `/api/tv/media/slot_${slotId}.mp4`;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-1000)}`));
    });
    proc.on("error", (err) => reject(err));
    if (signal) signal.addEventListener("abort", () => { proc.kill("SIGTERM"); }, { once: true });
  });
}

// ── ffprobe: get exact audio duration in seconds ──────────────────────────────
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`ffprobe exited ${code}: ${stderr.slice(-200)}`)); return; }
      const dur = parseFloat(stdout.trim());
      if (isNaN(dur)) { reject(new Error(`ffprobe returned non-numeric: "${stdout.trim()}"`)); return; }
      resolve(dur);
    });
    proc.on("error", reject);
  });
}

// ── Per-segment TTS builder ────────────────────────────────────────────────────
// Generates one TTS file per segment, measures real duration via ffprobe.
// Falls back to proportional silence when TTS fails for a segment.
interface SegmentAudio {
  segFiles: string[];
  durations: number[];    // real duration in seconds for each segment
  totalDuration: number;  // sum of durations
}

async function buildSegmentAudio(segments: string[], tmpDir: string): Promise<SegmentAudio> {
  const segFiles: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segPath = path.join(tmpDir, `tts_seg_${i}.mp3`);
    const text = segments[i] ?? "";

    let buf: Buffer | null = null;
    try { buf = await generateTTSBuffer(text); } catch (err) {
      logger.warn({ err, i }, "buildSegmentAudio: TTS threw for segment");
    }

    if (buf && buf.byteLength > 512) {
      fs.writeFileSync(segPath, buf);
    } else {
      // Fallback: silence proportional to word count (~2.5 words/sec speaking pace)
      const silenceSec = Math.max(3, Math.round(text.split(/\s+/).length / 2.5));
      await runFFmpeg([
        "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`,
        "-t", String(silenceSec), "-c:a", "libmp3lame", "-b:a", "64k", "-y", segPath,
      ]);
      logger.info({ i, silenceSec }, "buildSegmentAudio: silence fallback");
    }

    let dur = 8;
    try { dur = await getAudioDuration(segPath); } catch (err) {
      logger.warn({ err, i }, "buildSegmentAudio: ffprobe failed, using 8s fallback");
    }

    segFiles.push(segPath);
    durations.push(dur);
    logger.info({ i, dur: dur.toFixed(2) }, "buildSegmentAudio: segment ready");
  }

  const totalDuration = durations.reduce((a, b) => a + b, 0);
  logger.info({ count: segments.length, totalDuration: totalDuration.toFixed(2) }, "buildSegmentAudio: all segments ready");
  return { segFiles, durations, totalDuration };
}

// ── Concatenate audio segments into one file ───────────────────────────────────
async function concatAudioSegments(segFiles: string[], tmpDir: string): Promise<string> {
  const listPath = path.join(tmpDir, "audio_list.txt");
  fs.writeFileSync(listPath, segFiles.map(f => `file '${f}'`).join("\n"));
  const outPath = path.join(tmpDir, "audio_combined.mp3");
  await runFFmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:a", "libmp3lame", "-b:a", "128k", outPath,
  ]);
  return outPath;
}

// ── Normalize audio to exactly TARGET seconds ──────────────────────────────────
// Uses atempo filter: atempo = totalDuration / target
//   > 1.0 → speed up (speech was too long)
//   < 1.0 → slow down (speech was too short)
// Subtitle timestamps must be scaled by target / totalDuration accordingly.
const TARGET_DURATION_SEC = 60;

async function normalizeAudioDuration(
  inputPath: string,
  totalDuration: number,
  targetSec: number,
  tmpDir: string,
  signal?: AbortSignal
): Promise<string> {
  const atempoVal = totalDuration / targetSec;
  if (Math.abs(atempoVal - 1.0) < 0.005) return inputPath; // close enough

  const outputPath = path.join(tmpDir, "norm_audio.mp3");

  // atempo valid range: 0.5–2.0 per stage; chain for extreme values
  let atempoFilter: string;
  if (atempoVal >= 0.5 && atempoVal <= 2.0) {
    atempoFilter = `atempo=${atempoVal.toFixed(4)}`;
  } else if (atempoVal > 2.0) {
    const half = Math.sqrt(atempoVal);
    atempoFilter = `atempo=${half.toFixed(4)},atempo=${half.toFixed(4)}`;
  } else {
    // < 0.5: very slow, chain two stages
    atempoFilter = `atempo=0.5,atempo=${(atempoVal * 2).toFixed(4)}`;
  }

  await runFFmpeg([
    "-i", inputPath,
    "-af", atempoFilter,
    "-t", String(targetSec),
    "-y", outputPath,
  ], signal);

  logger.info(
    { atempo: atempoVal.toFixed(4), from: totalDuration.toFixed(2), to: targetSec },
    "normalizeAudioDuration: audio normalized"
  );
  return outputPath;
}

// ── Build cumulative timeline from durations ───────────────────────────────────
function buildTimeline(durations: number[]): Array<{ t0: number; t1: number }> {
  const timeline: Array<{ t0: number; t1: number }> = [];
  let t = 0;
  for (const d of durations) {
    timeline.push({ t0: t, t1: t + d });
    t += d;
  }
  return timeline;
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
  _audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  seedText?: string | null,
  citizenId?: number | null,
  onProgress?: ProgressReporter,
  signal?: AbortSignal,
  tier: RenderTier = "citizen"
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-ai-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    // Step 1: Generate cinematic prompt via Gemini
    const style = (visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? visualStyle
      : "space") as CinematicVisualStyle;

    const cinematicPrompt = await generateCinematicPromptTiered(
      seedText ?? manifestoText.slice(0, 400),
      style,
      tier
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
      return renderLightVideo(null, manifestoText, slotId, visualStyle);
    }

    // Step 3: Per-segment TTS → real durations → normalize to 60s
    const theme = VISUAL_STYLE_THEMES[style];
    const SEG_COUNT = 8;
    const segments = splitSegments(manifestoText, SEG_COUNT);

    await onProgress?.("generating_tts");
    const { segFiles, durations, totalDuration } = await buildSegmentAudio(segments, tmpDir);
    const timeline = buildTimeline(durations);
    logger.info({ slotId, totalDuration: totalDuration.toFixed(2) }, "AI-BG: per-segment audio ready");
    const rawAudioPath = await concatAudioSegments(segFiles, tmpDir);
    const finalAudioPath = await normalizeAudioDuration(rawAudioPath, totalDuration, TARGET_DURATION_SEC, tmpDir, signal);
    // Scale subtitle timestamps onto the normalized 60s timeline
    const subScale = TARGET_DURATION_SEC / totalDuration;
    const scaledTimeline = timeline.map(({ t0, t1 }) => ({
      t0: t0 * subScale,
      t1: t1 * subScale,
    }));

    const titleFilter =
      `drawtext=text='TIMENATION TV':fontsize=18:fontcolor=${theme.title}:` +
      `x=(w-text_w)/2:y=48:alpha=0.8`;
    const slotFilter =
      `drawtext=text='SLOT ${slotId}':fontsize=14:fontcolor=${theme.accent}@0.6:` +
      `x=(w-text_w)/2:y=78`;
    const rankFilter =
      `drawtext=text='${esc(citizenRank)}':fontsize=15:fontcolor=${theme.accent}@0.9:` +
      `x=12:y=h-th-34:shadowcolor=black@0.6:shadowx=1:shadowy=1`;
    const nameFilter =
      `drawtext=text='${esc(citizenName)}':fontsize=17:fontcolor=${theme.text}:` +
      `x=12:y=h-th-12:shadowcolor=black@0.6:shadowx=1:shadowy=1`;

    const segFilters: string[] = [];
    segments.forEach((seg, i) => {
      const { t0, t1 } = scaledTimeline[i]!;
      const lines = wrapLine(seg, 52).slice(0, 4);
      const totalH = lines.length * 42;
      const baseY = Math.round((720 - totalH) / 2);
      lines.forEach((line, li) => {
        segFilters.push(
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=${theme.text}:` +
          `x=(w-text_w)/2:y=${baseY + li * 42}:` +
          `enable='between(t\\,${t0.toFixed(2)}\\,${t1.toFixed(2)})'`
        );
      });
    });

    const watermarkFilter =
      `drawtext=text='TimeNation AI':fontsize=14:fontcolor=white@0.75:` +
      `x=w-tw-10:y=h-th-10:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
    const darkenFilter = `colorchannelmixer=aa=0.55`;

    const vf = [
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

    // Single-pass: AI video looped to 60s + normalized 60s audio
    await onProgress?.("encoding");
    await runFFmpeg([
      "-stream_loop", "-1", "-i", aiVideoPath,
      "-i", finalAudioPath,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
      "-c:a", "aac", "-b:a", "128k",
      "-map", "0:v:0", "-map", "1:a:0",
      "-t", String(TARGET_DURATION_SEC),
      ...metadataArgs,
      "-y", outputPath,
    ]);

    logger.info({ slotId, style, rawDuration: totalDuration.toFixed(2), finalDuration: TARGET_DURATION_SEC, cinematicPrompt: cinematicPrompt.slice(0, 80) }, "AI background render complete (60s normalized)");
    return `/api/tv/media/slot_${slotId}.mp4`;
  } catch (err) {
    logger.error({ err, slotId }, "renderWithAIBackground failed — falling back to solid-color");
    return renderLightVideo(null, manifestoText, slotId, visualStyle, onProgress);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Prime Time Render (:00 — multi-scene 3-part montage with xfade) ─────────────
async function renderPrimeVideo(
  _audioBuffer: Buffer | null,
  manifestoText: string,
  slotId: number,
  visualStyle?: string | null,
  seedText?: string | null,
  citizenId?: number | null,
  onProgress?: ProgressReporter,
  signal?: AbortSignal
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `tn-prime-${slotId}-`));
  const outputPath = path.join(MEDIA_DIR, `slot_${slotId}.mp4`);

  try {
    const style = (visualStyle && visualStyle in VISUAL_STYLE_THEMES
      ? visualStyle
      : "space") as CinematicVisualStyle;
    const theme = VISUAL_STYLE_THEMES[style];

    // Load citizen identity for overlay
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
        logger.warn({ err, citizenId }, "Could not load citizen data for PRIME overlay");
      }
    }

    // Step 1 — Generate 3 unique scene prompts via Gemini
    await onProgress?.("generating_scenes");
    const scenePrompts = await generateMultiScenePrompts(
      seedText ?? manifestoText.slice(0, 400),
      manifestoText,
      style
    );
    logger.info(
      { slotId, s1: scenePrompts.scene1.slice(0, 50) },
      "PRIME: 3 scene prompts generated"
    );

    // Step 2 — AI background per scene (sequential, per-scene solid-color fallback)
    await onProgress?.("fetching_scenes");
    const sceneVideoFiles: string[] = [];

    for (let i = 0; i < 3; i++) {
      const prompt = [scenePrompts.scene1, scenePrompts.scene2, scenePrompts.scene3][i]!;
      const sceneDir = path.join(tmpDir, `scene${i + 1}`);
      fs.mkdirSync(sceneDir, { recursive: true });

      try {
        const { videoPath } = await generateAIBackground(prompt, sceneDir, signal);
        if (!videoPath) throw new Error("generateAIBackground returned null");
        sceneVideoFiles.push(videoPath);
        logger.info({ slotId, scene: i + 1 }, `PRIME scene ${i + 1} AI background ready`);
      } catch (err) {
        // Per-scene fallback: solid-color 22s clip
        const fallbackPath = path.join(sceneDir, "fallback.mp4");
        await runFFmpeg([
          "-f", "lavfi", "-i", `color=c=${theme.bg}:s=1280x720:r=25`,
          "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-t", "22", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
          "-c:a", "aac", "-y", fallbackPath,
        ]);
        sceneVideoFiles.push(fallbackPath);
        logger.warn({ slotId, scene: i + 1, err }, `PRIME scene ${i + 1} AI failed — solid-color fallback used`);
      }
    }

    // Step 3a — Per-segment TTS (3 segments for 3 scenes) → normalize to 60s
    await onProgress?.("generating_tts");
    const primeSegments = splitSegments(manifestoText, 3);
    const { segFiles: primeSegFiles, durations: primeDurations, totalDuration: primeTotalDuration } =
      await buildSegmentAudio(primeSegments, tmpDir);
    const primeRawAudio = await concatAudioSegments(primeSegFiles, tmpDir);
    const primeFinalAudio = await normalizeAudioDuration(primeRawAudio, primeTotalDuration, TARGET_DURATION_SEC, tmpDir, signal);

    // Scale per-scene audio durations proportionally to fill exactly 60s
    const primeSubScale = TARGET_DURATION_SEC / primeTotalDuration;
    const scaledPrimeDurations = primeDurations.map(d => d * primeSubScale);

    // Scene video lengths = scaled audio duration + 2s xfade overlap, minimum 8s
    const sceneDurations = scaledPrimeDurations.map(d => Math.max(8, d + 2));
    const [sd0, sd1, sd2] = [sceneDurations[0]!, sceneDurations[1]!, sceneDurations[2]!];
    // xfade offset = cumulative scene length minus transition overlap (2s)
    const xfadeOffset1 = sd0 - 2;
    const xfadeOffset2 = xfadeOffset1 + sd1 - 2;
    const compositeTotal = sd0 + sd1 + sd2 - 4; // two 2s overlaps removed

    logger.info({
      slotId,
      primeDurations: primeDurations.map(d => d.toFixed(2)),
      scaledPrimeDurations: scaledPrimeDurations.map(d => d.toFixed(2)),
      primeTotalDuration: primeTotalDuration.toFixed(2),
      xfadeOffset1: xfadeOffset1.toFixed(2),
      xfadeOffset2: xfadeOffset2.toFixed(2),
    }, "PRIME: 60s-normalized xfade offsets computed");

    // Step 3b — Xfade montage with normalized scene lengths
    await onProgress?.("compositing");
    const compositePath = path.join(tmpDir, "composite.mp4");

    await runFFmpeg([
      "-stream_loop", "-1", "-t", sd0.toFixed(3), "-i", sceneVideoFiles[0]!,
      "-stream_loop", "-1", "-t", sd1.toFixed(3), "-i", sceneVideoFiles[1]!,
      "-stream_loop", "-1", "-t", sd2.toFixed(3), "-i", sceneVideoFiles[2]!,
      "-filter_complex",
        "[0:v]scale=1280:720:force_original_aspect_ratio=decrease," +
        "pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[sv0];" +
        "[1:v]scale=1280:720:force_original_aspect_ratio=decrease," +
        "pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[sv1];" +
        "[2:v]scale=1280:720:force_original_aspect_ratio=decrease," +
        "pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[sv2];" +
        `[sv0][sv1]xfade=transition=dissolve:duration=2:offset=${xfadeOffset1.toFixed(3)}[v01];` +
        `[v01][sv2]xfade=transition=dissolve:duration=2:offset=${xfadeOffset2.toFixed(3)}[vout]`,
      "-map", "[vout]",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
      "-t", compositeTotal.toFixed(3), "-y", compositePath,
    ]);
    logger.info({ slotId, compositeTotal: compositeTotal.toFixed(2) }, "PRIME xfade composite assembled");

    // Step 4 — Text overlay + normalized 60s audio over the composite
    await onProgress?.("encoding");

    // Scene subtitle windows mapped onto the 60s normalized timeline
    const sceneTimes: Array<{ t0: number; t1: number }> = [];
    let timeAccum = 0;
    for (const d of scaledPrimeDurations) {
      sceneTimes.push({ t0: timeAccum, t1: timeAccum + d });
      timeAccum += d;
    }

    const titleFilter =
      `drawtext=text='TIMENATION PRIME':fontsize=20:fontcolor=${theme.title}:` +
      `x=(w-text_w)/2:y=44:alpha=0.9`;
    const slotFilter =
      `drawtext=text='SLOT ${slotId} — ПРАЙМ ТАЙМ':fontsize=14:fontcolor=${theme.accent}@0.85:` +
      `x=(w-text_w)/2:y=72`;
    const rankFilter =
      `drawtext=text='${esc(citizenRank)}':fontsize=15:fontcolor=${theme.accent}@0.9:` +
      `x=12:y=h-th-34:shadowcolor=black@0.6:shadowx=1:shadowy=1`;
    const nameFilter =
      `drawtext=text='${esc(citizenName)}':fontsize=17:fontcolor=${theme.text}:` +
      `x=12:y=h-th-12:shadowcolor=black@0.6:shadowx=1:shadowy=1`;

    const segFilters: string[] = [];
    primeSegments.forEach((seg, i) => {
      const { t0, t1 } = sceneTimes[i]!;
      const lines = wrapLine(seg, 52).slice(0, 4);
      const totalH = lines.length * 42;
      const baseY = Math.round((720 - totalH) / 2);
      lines.forEach((line, li) => {
        segFilters.push(
          `drawtext=text='${esc(line)}':fontsize=28:fontcolor=${theme.text}:` +
          `x=(w-text_w)/2:y=${baseY + li * 42}:` +
          `enable='between(t\\,${t0.toFixed(2)}\\,${t1.toFixed(2)})'`
        );
      });
    });

    const watermarkFilter =
      `drawtext=text='TimeNation AI — PRIME':fontsize=14:fontcolor=white@0.75:` +
      `x=w-tw-10:y=h-th-10:shadowcolor=black@0.5:shadowx=1:shadowy=1`;
    const darkenFilter = `colorchannelmixer=aa=0.55`;
    const vf = [darkenFilter, titleFilter, slotFilter, rankFilter, nameFilter, ...segFilters, watermarkFilter].join(",");

    const metadataArgs = [
      "-metadata", `title=TimeNation-TV — Slot ${slotId} — PRIME TIME`,
      "-metadata", "comment=Author: TimeNation AI, Type: Synthesized Media — 3-Scene Prime Montage",
      "-metadata", "artist=TimeNation",
      "-metadata", `description=AI Prime Montage / 3 scenes: ${scenePrompts.scene1.slice(0, 40)} | ${scenePrompts.scene2.slice(0, 40)} | ${scenePrompts.scene3.slice(0, 40)}.`,
    ];

    await runFFmpeg([
      "-i", compositePath,
      "-i", primeFinalAudio,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "fast", "-crf", "24",
      "-c:a", "aac", "-b:a", "192k",
      "-map", "0:v:0", "-map", "1:a:0",
      "-t", String(TARGET_DURATION_SEC),
      ...metadataArgs, "-y", outputPath,
    ]);

    logger.info(
      { slotId, style, rawDuration: primeTotalDuration.toFixed(2), finalDuration: TARGET_DURATION_SEC, s1: scenePrompts.scene1.slice(0, 40) },
      "PRIME TIME 3-scene montage render complete (60s normalized)"
    );
    return `/api/tv/media/slot_${slotId}.mp4`;

  } catch (err) {
    logger.error({ err, slotId }, "renderPrimeVideo failed — falling back to apex AI background");
    return renderWithAIBackground(
      null, manifestoText, slotId, visualStyle, seedText, citizenId, onProgress, signal, "apex"
    );
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

  // 2. Three-tier render routing by slot type ──────────────────────────────
  //    apex (:00)    → renderPrimeVideo   (3-scene Gemini + FFmpeg xfade montage)
  //    half (:30)    → renderWithAIBackground tier=half  (premium quality prompt)
  //    quarter (:15/:45) → renderWithAIBackground tier=quarter (high quality prompt)
  //    citizen       → renderWithAIBackground tier=citizen (standard quality)
  const slotType = slot ? getSlotType(slot.minuteIndex) : "citizen";
  const tier: RenderTier = slotType;

  let mediaUrl: string | null = null;
  let finalStatus = "draft";

  // TTS is now generated per-segment inside each render function for precise subtitle sync.
  // No pre-generated single audioBuffer here anymore.

  if (slotType === "apex") {
    // PRIME TIME (:00) — 3-scene multi-montage (Gemini splits text → 3 AI frames → xfade)
    try {
      mediaUrl = await renderPrimeVideo(
        null, manifestoText, slotId,
        capsule.visualStyle, capsule.seedText, capsule.citizenId,
        reportProgress, signal
      );
      finalStatus = "rendered";
      logger.info({ slotId }, "PRIME TIME render complete");
    } catch (err) {
      logger.error({ err, slotId }, "renderPrimeVideo failed — falling back to apex AI background");
      try {
        mediaUrl = await renderWithAIBackground(
          null, manifestoText, slotId,
          capsule.visualStyle, capsule.seedText, capsule.citizenId,
          reportProgress, signal, "apex"
        );
        finalStatus = "rendered";
      } catch (bgErr) {
        logger.error({ bgErr, slotId }, "APEX AI background also failed — solid-color fallback");
        try {
          mediaUrl = await renderLightVideo(null, manifestoText, slotId, capsule.visualStyle, reportProgress);
          finalStatus = "rendered";
        } catch (lightErr) {
          logger.error({ lightErr, slotId }, "renderLightVideo fallback also failed");
          finalStatus = "draft";
        }
      }
    }
  } else {
    // HALF / QUARTER / CITIZEN — AI background with tier-specific prompt quality
    try {
      mediaUrl = await renderWithAIBackground(
        null, manifestoText, slotId,
        capsule.visualStyle, capsule.seedText, capsule.citizenId,
        reportProgress, signal, tier
      );
      finalStatus = "rendered";
      logger.info({ slotId, tier }, `${tier.toUpperCase()} slot rendered with AI background`);
    } catch (err) {
      logger.error({ err, slotId, tier }, `${tier.toUpperCase()} renderWithAIBackground failed — solid-color fallback`);
      try {
        mediaUrl = await renderLightVideo(null, manifestoText, slotId, capsule.visualStyle, reportProgress);
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
