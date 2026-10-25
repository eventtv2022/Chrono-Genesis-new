/**
 * AES-256-GCM symmetric encryption for PII fields (email, surname, givenNames).
 *
 * Key source (priority order):
 *   1. ENCRYPTION_KEY env var — 32-byte hex (64 hex chars) or base64 (44 chars)
 *   2. Derived from SESSION_SECRET via scrypt (development fallback, logs a warning)
 *
 * Format: `v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 * Prefix `v1:` lets future versions detect format changes.
 * Values that don't start with `v1:` are treated as plaintext (backwards-compat).
 */

import crypto from "crypto";
import { logger } from "../lib/logger";

const ALGO = "aes-256-gcm";

function resolveKey(): Buffer {
  const raw = process.env["ENCRYPTION_KEY"];
  if (raw) {
    if (raw.length === 64) return Buffer.from(raw, "hex");
    if (raw.length === 44) return Buffer.from(raw, "base64");
    if (raw.length >= 32)  return Buffer.from(raw.slice(0, 32));
  }

  // Fallback: derive from SESSION_SECRET (acceptable in development)
  const secret = process.env["SESSION_SECRET"] ?? "timenation-dev-secret";
  const salt   = Buffer.from("timenation-pii-salt-v1");
  logger.warn("ENCRYPTION_KEY not set — deriving key from SESSION_SECRET (set ENCRYPTION_KEY in production)");
  return crypto.scryptSync(secret, salt, 32);
}

// Resolved once at module load
const KEY: Buffer = resolveKey();

// ── Public API ────────────────────────────────────────────────────────────────

/** Encrypt plaintext → `v1:<iv>:<authTag>:<ciphertext>` (hex-encoded parts) */
export function encrypt(plaintext: string): string {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ct     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/** Encrypt binary uploads without expanding them into hexadecimal ciphertext. */
export function encryptBytes(plaintext: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `b1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("base64")}`;
}

/** Decrypt a binary upload; unsupported or corrupted data fails closed. */
export function decryptBytes(ciphertext: string): Buffer | null {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4 || parts[0] !== "b1") return null;
    const [, ivHex, tagHex, ctBase64] = parts as [string, string, string, string];
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ctBase64, "base64")), decipher.final()]);
  } catch {
    return null;
  }
}

/** Decrypt a `v1:…` ciphertext back to plaintext. Returns null on any error. */
export function decrypt(ciphertext: string): string | null {
  if (!ciphertext.startsWith("v1:")) return null;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) return null;
    const [, ivHex, tagHex, ctHex] = parts as [string, string, string, string];
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(ctHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

/**
 * Safe decrypt: returns the original value if it is not encrypted (legacy rows)
 * or null/undefined as-is. Never throws.
 */
export function tryDecrypt(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  if (!value.startsWith("v1:")) return value; // plaintext legacy row
  return decrypt(value) ?? value;             // return raw on failure (don't lose data)
}

/** Encrypt a nullable string — returns null unchanged */
export function encryptNullable(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}
