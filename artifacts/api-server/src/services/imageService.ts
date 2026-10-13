/**
 * imageService — Sharp-based image processing for citizen documents.
 *
 * cropSignature:        Trims transparent/white padding from a signature PNG (bounding-box crop).
 * normalizePassportPhoto: Resizes/crops an uploaded photo to passport proportions (400×514 px JPEG).
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

// ── Signature bounding-box crop ───────────────────────────────────────────────

/**
 * Accepts a PNG data-URI (from signature_pad), finds the tightest bounding box
 * of non-transparent pixels, crops to it (with a 4 px padding), and returns a
 * new data-URI. Falls back to the original if the canvas is blank or on error.
 */
export async function cropSignature(dataUri: string): Promise<string | null> {
  try {
    const base64 = dataUri.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    let top = height, left = width, right = 0, bottom = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const alpha = data[idx + 3] ?? 0;
        if (alpha > 10) {
          if (x < left)   left   = x;
          if (x > right)  right  = x;
          if (y < top)    top    = y;
          if (y > bottom) bottom = y;
          found = true;
        }
      }
    }

    if (!found || right <= left || bottom <= top) return null;

    const PAD = 4;
    const exLeft   = Math.max(0, left   - PAD);
    const exTop    = Math.max(0, top    - PAD);
    const exWidth  = Math.min(width  - exLeft, right  - left + 1 + PAD * 2);
    const exHeight = Math.min(height - exTop,  bottom - top  + 1 + PAD * 2);

    const cropped = await sharp(buffer)
      .extract({ left: exLeft, top: exTop, width: exWidth, height: exHeight })
      .png()
      .toBuffer();

    logger.info(
      { original: `${width}×${height}`, cropped: `${exWidth}×${exHeight}` },
      "Signature cropped"
    );

    return `data:image/png;base64,${cropped.toString("base64")}`;
  } catch (err) {
    logger.warn({ err }, "cropSignature failed — rejecting invalid signature");
    return null;
  }
}

// ── Passport photo normalisation ──────────────────────────────────────────────

/**
 * Passport proportions: 35×45 mm  ≈  400×514 px @ ~291 dpi.
 * The image is resized with cover-crop (top-biased to keep the face), then
 * saved as a progressive JPEG (quality 85) at the same vault path.
 *
 * Returns the normalised vault path (always ends in `.jpg`).
 * The caller must update `photoUrl` in the DB if the path changes.
 */
export async function normalizePassportPhoto(vaultFilePath: string): Promise<string> {
  const PASSPORT_W = 400;
  const PASSPORT_H = 514;

  const ext = path.extname(vaultFilePath).toLowerCase();
  const jpgPath = ext === ".jpg" || ext === ".jpeg"
    ? vaultFilePath
    : vaultFilePath.replace(/\.[^.]+$/, ".jpg");

  try {
    await sharp(vaultFilePath)
      .resize(PASSPORT_W, PASSPORT_H, {
        fit: "cover",
        position: "top",   // bias toward top so face is kept
      })
      .jpeg({ quality: 85, progressive: true })
      .toFile(jpgPath);

    if (jpgPath !== vaultFilePath) {
      try { fs.unlinkSync(vaultFilePath); } catch { /* ignore */ }
    }

    logger.info({ jpgPath, size: `${PASSPORT_W}×${PASSPORT_H}` }, "Passport photo normalised");
    return jpgPath;
  } catch (err) {
    logger.warn({ err, vaultFilePath }, "normalizePassportPhoto failed — keeping original");
    return vaultFilePath;
  }
}
