import crypto from "crypto";

// ── QR Login Token Store ────────────────────────────────────────────────────
// Maps token → expiry. Consumed/verified on mobile scan.

interface QrToken {
  expiresAt: number;
  citizenId: number | null;
}

const tokens = new Map<string, QrToken>();
const QR_TTL_MS = 2 * 60 * 1000; // 2 minutes

/** Purge expired tokens */
function purge() {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (v.expiresAt < now) tokens.delete(k);
  }
}

/** Generate a new QR login token and return it */
export function generateQrToken(): string {
  purge();
  const token = crypto.randomUUID();
  tokens.set(token, { expiresAt: Date.now() + QR_TTL_MS, citizenId: null });
  return token;
}

/** Validate and consume a QR token. Returns true if valid and not expired. */
export function consumeQrToken(token: string): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    tokens.delete(token);
    return false;
  }
  tokens.delete(token);
  return true;
}

/** Check if a token exists and is valid (non-consuming peek) */
export function isValidQrToken(token: string): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { tokens.delete(token); return false; }
  return true;
}
