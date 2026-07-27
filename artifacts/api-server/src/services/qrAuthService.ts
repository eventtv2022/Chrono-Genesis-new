import crypto from "crypto";

// ── QR Login Token Store ────────────────────────────────────────────────────
// Maps token → QrToken entry.
// Tokens are created when the desktop requests a QR code.
// They are authorized when the Telegram bot receives /start qr_<token>.

export interface QrToken {
  expiresAt:      number;
  authorized:     boolean;
  // Filled in when the token is authorized via Telegram bot
  citizenAuthToken?: string;
  citizenId?:        number;
  citizenName?:      string;
  balanceMinutes?:   number;
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
  tokens.set(token, { expiresAt: Date.now() + QR_TTL_MS, authorized: false });
  return token;
}

/**
 * Authorize a QR token from the Telegram bot (/start qr_<token>).
 * Stores the citizen's session data so the desktop WS can log in.
 * Returns false if the token is missing or expired.
 */
export function authorizeQrToken(
  token: string,
  citizen: { authToken: string; id: number; name: string; balanceMinutes: number },
): boolean {
  purge();
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { tokens.delete(token); return false; }
  entry.authorized     = true;
  entry.citizenAuthToken = citizen.authToken;
  entry.citizenId      = citizen.id;
  entry.citizenName    = citizen.name;
  entry.balanceMinutes = citizen.balanceMinutes;
  return true;
}

/**
 * Validate and consume a QR token.
 * Returns the citizen data stored when the token was authorized,
 * or null if the token is invalid / expired / not yet authorized.
 */
export function consumeQrToken(token: string): QrToken | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { tokens.delete(token); return null; }
  tokens.delete(token);
  return entry;
}

/** Non-consuming peek — returns true if token exists and is not expired */
export function isValidQrToken(token: string): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { tokens.delete(token); return false; }
  return true;
}
