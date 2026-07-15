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

const HF_TIMEOUT_MS = 45_000; // 45 seconds — fast fail on free tier (503 comes quickly)

// Reduced to 5 images: parallel fetches to stay well under job timeout
const POLLINATIONS_IMAGES = 5;
const CROSSFADE_DURATION_SEC = 2;
const TARGET_VIDEO_DURATION_SEC = 60;
// With N=5, C=2: (60 + 8) / 5 = 13.6s per image
const PER_IMG_SEC = (TARGET_VIDEO_DURATION_SEC + CROSSFADE_DURATION_SEC * (POLLINATIONS_IMAGES - 1)) / POLLINATIONS_IMAGES;

// ── Utility: fetch with AbortController timeout ───────────────────────────────
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (hfToken) {
    headers["Authorization"] = `Bearer ${hfToken}`;
  }

  logger.info(
    { prompt: prompt.slice(0, 80), hasToken: !!hfToken },
    "HuggingFace text-to-video: requesting"
  );

  let response: Response;
  try {
    response = await fetchWithTimeout(
      HF_API_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: prompt }),
      },
      HF_TIMEOUT_MS,
      signal
    );
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    if (isAbort) {
      logger.warn({ prompt: prompt.slice(0, 60) }, "HuggingFace timeout after 120s — switching to Pollinations");
    } else {
      logger.warn({ err }, "HuggingFace network error — switching to Pollinations");
    }
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // 503 = model loading (may return in retry), but we don't retry to keep queue moving
    logger.warn(
      { status: response.status, body: body.slice(0, 200) },
      "HuggingFace returned error — switching to Pollinations"
    );
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("video") && !contentType.includes("octet-stream")) {
    logger.warn(
      { contentType },
      "HuggingFace response is not video — switching to Pollinations"
    );
    return null;
  }

  try {
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength < 1024) {
      logger.warn({ bytes: arrayBuf.byteLength }, "HuggingFace returned too-small blob");
      return null;
    }
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
// Images are scenic/nature/architecture photos with seed-based selection.
// Seed is derived from a hash of the prompt so the same prompt always gets
// visually consistent images.
const PICSUM_IMAGES = 5;

async function generateViaPicsumSlideshow(
  prompt: string,
  tmpDir: string,
  signal?: AbortSignal
): Promise<string | null> {
  logger.info({ count: PICSUM_IMAGES }, "Picsum slideshow: fetching images");

  // Derive a numeric seed from the prompt so renders are deterministic
  let seed = 0;
  for (let i = 0; i < prompt.length; i++) seed = ((seed << 5) - seed + prompt.charCodeAt(i)) | 0;
  if (seed < 0) seed = -seed;

  // Fetch all images in parallel — reduces total wait from ~5×20s to ~20s worst case
  const imageBuffers: (Buffer | null)[] = await Promise.all(
    Array.from({ length: PICSUM_IMAGES }, async (_, i) => {
      if (signal?.aborted) return null;
      const imgSeed = (seed + i * 97) % 1000;
      const url = `https://picsum.photos/seed/${imgSeed}/1280/720`;
      try {
        const res = await fetchWithTimeout(url, {}, 20_000, signal);
        if (!res.ok) {
          logger.warn({ status: res.status, i }, "Picsum image fetch failed");
          return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        logger.info({ i, ok: true, bytes: buf.byteLength }, "Picsum image fetched");
        return buf.byteLength >= 1024 ? buf : null;
      } catch (err) {
        logger.warn({ err, i }, "Picsum image error");
        return null;
      }
    })
  );

  const validImages = imageBuffers.filter((b): b is Buffer<ArrayBuffer> => b !== null);
  if (validImages.length === 0) {
    logger.warn("Picsum: all image fetches failed");
    return null;
  }

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
      for (const imgPath of imagePaths) {
        inputArgs.push("-loop", "1", "-t", perImg.toFixed(3), "-i", imgPath);
      }
      const scaleFilters = imagePaths.map(
        (_, i) =>
          `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
          `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[sv${i}]`
      );
      const xfadeChains: string[] = [];
      let prevLabel = `sv0`;
      for (let i = 0; i < N - 1; i++) {
        const offset = ((i + 1) * perImg - i * C).toFixed(3);
        const outLabel = i === N - 2 ? "vout" : `xf${i}`;
        xfadeChains.push(
          `[${prevLabel}][sv${i + 1}]xfade=transition=fade:duration=${C}:offset=${offset}[${outLabel}]`
        );
        prevLabel = outLabel;
      }
      const filterComplex = [...scaleFilters, ...xfadeChains].join(";");
      await runFFmpeg([
        ...inputArgs,
        "-filter_complex", filterComplex,
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
  logger.info(
    { prompt: prompt.slice(0, 80), count: POLLINATIONS_IMAGES },
    "Pollinations slideshow: fetching images (parallel)"
  );

  const encodedPrompt = encodeURIComponent(prompt);

  // Fetch images IN PARALLEL — reduces worst-case from ~180s sequential to ~20s
  const imageBuffers: (Buffer | null)[] = await Promise.all(
    Array.from({ length: POLLINATIONS_IMAGES }, async (_, i) => {
      if (signal?.aborted) return null;
      const url =
        `https://image.pollinations.ai/prompt/${encodedPrompt}` +
        `?width=1280&height=720&nologo=true&seed=${i * 13 + 7}`;
      try {
        const res = await fetchWithTimeout(url, {}, 20_000, signal);
        if (!res.ok) {
          logger.warn({ status: res.status, i }, "Pollinations image fetch failed");
          return null;
        }
        const raw = Buffer.from(await res.arrayBuffer());
        if (raw.byteLength >= 1024) {
          logger.info({ i, ok: true, bytes: raw.byteLength }, "Pollinations image fetched");
          return raw as Buffer<ArrayBuffer>;
        }
        return null;
      } catch (err) {
        logger.warn({ err, i }, "Pollinations image error");
        return null;
      }
    })
  );

  const validImages = imageBuffers.filter((b): b is Buffer<ArrayBuffer> => b !== null);
  if (validImages.length === 0) {
    logger.warn("Pollinations: all image fetches failed");
    return null;
  }

  logger.info({ count: validImages.length }, "Pollinations: images fetched, building crossfade slideshow");

  // Save images to disk
  const imagePaths = validImages.map((buf, i) => {
    const imgPath = path.join(tmpDir, `slide_${i}.jpg`);
    fs.writeFileSync(imgPath, buf);
    return imgPath;
  });

  const N = imagePaths.length;
  const C = CROSSFADE_DURATION_SEC;
  // Per-image duration adjusted so output equals TARGET_VIDEO_DURATION_SEC exactly
  const perImg = (TARGET_VIDEO_DURATION_SEC + C * (N - 1)) / N;

  const outputPath = path.join(tmpDir, "slideshow.mp4");

  try {
    if (N === 1) {
      // Edge case: only 1 image — simple loop
      await runFFmpeg([
        "-loop", "1", "-t", String(TARGET_VIDEO_DURATION_SEC), "-i", imagePaths[0]!,
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
        "-an", "-y", outputPath,
      ], signal);
    } else {
      // Build -loop 1 -t {perImg} -i {img} inputs for each image
      const inputArgs: string[] = [];
      for (const imgPath of imagePaths) {
        inputArgs.push("-loop", "1", "-t", perImg.toFixed(3), "-i", imgPath);
      }

      // Build filter_complex: scale each input, then chain xfade between consecutive pairs
      // offset_i = (i+1)*perImg - i*C  (cumulative offset in output timeline)
      const scaleFilters = imagePaths.map(
        (_, i) =>
          `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
          `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25[sv${i}]`
      );

      const xfadeChains: string[] = [];
      let prevLabel = `sv0`;
      for (let i = 0; i < N - 1; i++) {
        const offset = ((i + 1) * perImg - i * C).toFixed(3);
        const outLabel = i === N - 2 ? "vout" : `xf${i}`;
        xfadeChains.push(
          `[${prevLabel}][sv${i + 1}]xfade=transition=fade:duration=${C}:offset=${offset}[${outLabel}]`
        );
        prevLabel = outLabel;
      }

      const filterComplex = [...scaleFilters, ...xfadeChains].join(";");

      await runFFmpeg([
        ...inputArgs,
        "-filter_complex", filterComplex,
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
/**
 * Attempt to generate an AI background video for the given prompt.
 * Returns a path to a local temporary video file, or null on total failure.
 * Caller is responsible for cleaning up the tmpDir.
 */
export async function generateAIBackground(
  prompt: string,
  tmpDir?: string,
  signal?: AbortSignal
): Promise<{ videoPath: string | null; ownsTmpDir: boolean; tmpDir: string }> {
  const dir = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "tn-aibg-"));
  const ownsTmpDir = !tmpDir;

  // Provider 1: HuggingFace text-to-video (uses prompt → actual video)
  const hfPath = await generateViaHuggingFace(prompt, dir, signal);
  if (hfPath) {
    return { videoPath: hfPath, ownsTmpDir, tmpDir: dir };
  }

  // Provider 2: Pollinations AI slideshow (uses prompt → AI-generated images matching content)
  // Placed before Picsum so backgrounds actually reflect the citizen's thought
  const slidePath = await generateViaPollinationsSlideshow(prompt, dir, signal);
  if (slidePath) {
    return { videoPath: slidePath, ownsTmpDir, tmpDir: dir };
  }

  // Provider 3: Picsum Photos slideshow (reliable fallback — ignores prompt, random photos)
  const picsumPath = await generateViaPicsumSlideshow(prompt, dir, signal);
  if (picsumPath) {
    return { videoPath: picsumPath, ownsTmpDir, tmpDir: dir };
  }

  // Total failure — caller will use solid-color fallback
  logger.warn({ prompt: prompt.slice(0, 60) }, "All AI video providers failed — using solid-color fallback");
  return { videoPath: null, ownsTmpDir, tmpDir: dir };
}

// ── FFmpeg helper ─────────────────────────────────────────────────────────────
function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
    proc.on("error", (err) => reject(err));
    if (signal) {
      signal.addEventListener("abort", () => { proc.kill("SIGTERM"); }, { once: true });
    }
  });
}
