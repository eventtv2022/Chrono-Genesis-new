/**
 * ID Card generator — matches the TimeNation template (blue card, photo right, MRZ bottom).
 * Output: SVG string with embedded photo (base64 data-URI) if available.
 */

import fs from "fs";
import path from "path";
import { MEDIA_DIR } from "./renderService";
import { EMBLEM_DATA_URI, FLAG_DATA_URI } from "./assetsService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function p2(n: number) { return String(n).padStart(2, "0"); }

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

function formatDob(raw: string | null | undefined): string {
  if (!raw || raw.length < 10) return "—";
  const m = MONTHS[parseInt(raw.slice(5, 7), 10) - 1] ?? "?";
  return `${raw.slice(8, 10)} ${m} ${raw.slice(0, 4)}`;
}

// ── Transliteration (Cyrillic → Latin, ICAO-style) ────────────────────────────

const TRANSLIT: Record<string, string> = {
  А:"A", Б:"B", В:"V", Г:"G", Д:"D", Е:"E", Ё:"E", Ж:"ZH", З:"Z",
  И:"I", Й:"I", К:"K", Л:"L", М:"M", Н:"N", О:"O", П:"P", Р:"R",
  С:"S", Т:"T", У:"U", Ф:"F", Х:"KH", Ц:"TS", Ч:"CH", Ш:"SH",
  Щ:"SHCH", Ъ:"", Ы:"Y", Ь:"", Э:"E", Ю:"IU", Я:"IA",
};
function translit(s: string): string {
  return s.toUpperCase().split("").map(c => TRANSLIT[c] ?? c).join("");
}

// ── MRZ (ICAO TD1, 3×30 chars) ────────────────────────────────────────────────

function mrzCheck(str: string): number {
  const weights = [7, 3, 1];
  const VALUES: Record<string, number> = { "<": 0 };
  for (let i = 0; i < 10; i++) VALUES[String(i)] = i;
  for (let i = 0; i < 26; i++) VALUES[String.fromCharCode(65 + i)] = i + 10;
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += (VALUES[str[i] ?? "<"] ?? 0) * (weights[i % 3] ?? 1);
  }
  return sum % 10;
}

function buildMrz(c: {
  citizenNumber: string;
  surname: string | null | undefined;
  givenNames: string | null | undefined;
  name: string;
  dateOfBirth: string | null | undefined;
}): [string, string] {
  const sn = translit(c.surname ?? c.name.split(" ")[0] ?? c.name).replace(/\s+/g, "<").slice(0, 15);
  const gn = translit((c.givenNames ?? c.name.split(" ").slice(1).join(" ")) || c.name).replace(/\s+/g, "<").slice(0, 13);
  const line1 = `ID${("TN" + (c.citizenNumber ?? "").padStart(9, "0")).slice(0, 9).padEnd(9, "<")}${mrzCheck((c.citizenNumber ?? "").padEnd(9, "<"))}${("" + "").padEnd(15, "<")}`.padEnd(30, "<").slice(0, 30);
  const dobMrz = c.dateOfBirth ? `${c.dateOfBirth.slice(2,4)}${c.dateOfBirth.slice(5,7)}${c.dateOfBirth.slice(8,10)}` : "000000";
  const line2 = `${dobMrz}${mrzCheck(dobMrz)}M9912319`.padEnd(29, "<").slice(0, 29) + "0";
  const namePart = `${sn}<<${gn}`.padEnd(30, "<").slice(0, 30);
  return [line1, line2 + " " + namePart.slice(0, 28)];
}

// ── EU-style star ring ────────────────────────────────────────────────────────

function starRing(cx: number, cy: number, r: number, count: number, fill: string): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = (cx + r * Math.cos(a)).toFixed(1);
    const y = (cy + r * Math.sin(a)).toFixed(1);
    out += `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="11" fill="${fill}" text-anchor="middle" dominant-baseline="middle" opacity="0.75">★</text>`;
  }
  return out;
}

// ── Photo loader (disk → base64 data-URI) ─────────────────────────────────────

/** VAULT_DIR is exported from citizens router; lazy-resolved here to avoid circular deps */
function resolveVaultDir(): string {
  return path.join(process.cwd(), "secure_vault");
}

export function loadPhotoAsDataUri(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || photoUrl === "vault:protected") return null;

  let filePath: string;

  if (photoUrl.startsWith("vault:")) {
    // New secure vault path: vault:photos/photo_123.jpg
    const rel = photoUrl.slice("vault:".length); // e.g. "photos/photo_123.jpg"
    filePath = path.join(resolveVaultDir(), rel);
  } else if (photoUrl.startsWith("/media/")) {
    // Legacy path: /media/avatars/avatar_123.jpg
    const rel = photoUrl.slice("/media/".length);
    filePath = path.join(MEDIA_DIR, rel);
  } else {
    return null;
  }

  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ── Main generator ────────────────────────────────────────────────────────────

export interface IdCardCitizen {
  citizenNumber: string;
  name: string;
  surname?: string | null;
  givenNames?: string | null;
  dateOfBirth?: string | null;
  rank: string;
  meritScore: number;
  createdAt: Date | string;
  photoUrl?: string | null;
  signatureBase64?: string | null;
}

export function generateIdCardSvg(c: IdCardCitizen, photoDataUri?: string | null): string {
  const surnameVal  = (c.surname  ?? c.name.split(" ")[0] ?? c.name).toUpperCase();
  const givenVal    = (c.givenNames ?? (c.name.split(" ").slice(1).join(" ") || c.name)).toUpperCase();
  const dobDisplay  = formatDob(c.dateOfBirth);

  const issued = new Date(c.createdAt);
  const issueDT = `${p2(issued.getDate())}.${p2(issued.getMonth() + 1)}.${issued.getFullYear()}  ${p2(issued.getHours())}:${p2(issued.getMinutes())} UTC`;

  const [mrz1, mrz2] = buildMrz({
    citizenNumber: c.citizenNumber,
    surname: c.surname,
    givenNames: c.givenNames,
    name: c.name,
    dateOfBirth: c.dateOfBirth,
  });

  // Layout constants
  const W = 856, H = 540;  // ID-1 aspect ratio scaled up
  const PHOTO_X = 584, PHOTO_Y = 82, PHOTO_W = 240, PHOTO_H = 308;
  const DATA_X = 32;
  const MRZ_Y = H - 96;

  const stars = starRing(PHOTO_X + PHOTO_W / 2, PHOTO_Y + PHOTO_H / 2, PHOTO_W / 2 + 26, 12, "#b8d4f0");

  const photoEl = photoDataUri
    ? `<image href="${esc(photoDataUri)}" x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>`
    : `<!-- silhouette --><circle cx="${PHOTO_X + PHOTO_W / 2}" cy="${PHOTO_Y + 110}" r="58" fill="#b8d0e8"/>
       <ellipse cx="${PHOTO_X + PHOTO_W / 2}" cy="${PHOTO_Y + PHOTO_H - 20}" rx="84" ry="58" fill="#b8d0e8"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="dp" width="13" height="13" patternUnits="userSpaceOnUse">
      <circle cx="6.5" cy="6.5" r="0.85" fill="#7aadd0" opacity="0.38"/>
    </pattern>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#bdd4ed"/>
      <stop offset="60%"  stop-color="#cfe2f4"/>
      <stop offset="100%" stop-color="#d8eaf8"/>
    </linearGradient>
    <linearGradient id="mrzBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#06101e"/>
      <stop offset="100%" stop-color="#091525"/>
    </linearGradient>
    <clipPath id="card">  <rect width="${W}" height="${H}" rx="18"/></clipPath>
    <clipPath id="photoClip"><rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="6"/></clipPath>
  </defs>

  <!-- ── Background ─────────────────────────────────────────── -->
  <rect width="${W}" height="${H}" rx="18" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dp)" clip-path="url(#card)"/>

  <!-- Large ∞ watermark (center-right) -->
  <text x="490" y="390" font-family="Georgia,serif" font-size="380"
        fill="#4a80b8" opacity="0.085" text-anchor="middle"
        clip-path="url(#card)">∞</text>

  <!-- EU-style stars around photo -->
  ${stars}

  <!-- ── Header ─────────────────────────────────────────────── -->
  <!-- Emblem (top-left, real image) -->
  ${EMBLEM_DATA_URI ? `<defs><clipPath id="emblemClipL"><circle cx="53" cy="37" r="26"/></clipPath></defs>
  <image href="${EMBLEM_DATA_URI}" x="27" y="11" width="52" height="52" clip-path="url(#emblemClipL)" preserveAspectRatio="xMidYMid meet"/>
  <circle cx="53" cy="37" r="26" fill="none" stroke="#8ab4d4" stroke-width="1.2"/>` : `<rect x="22" y="16" width="62" height="42" rx="4" fill="#1a3988"/>
  <text x="53" y="41" font-family="Georgia,serif" font-size="13" fill="#d4ecff" text-anchor="middle">∞</text>`}

  <text x="92"  y="34" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="bold" fill="#132e7a" letter-spacing="1">TIMENATION</text>
  <text x="92"  y="51" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#3a5a9e">Republic of TimeNation</text>

  <!-- Flag (top-right, real image) -->
  ${FLAG_DATA_URI ? `<defs><clipPath id="flagClipR"><rect x="${W - 110}" y="10" width="88" height="54" rx="4"/></clipPath></defs>
  <image href="${FLAG_DATA_URI}" x="${W - 110}" y="10" width="88" height="54" clip-path="url(#flagClipR)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="${W - 110}" y="10" width="88" height="54" rx="4" fill="none" stroke="#8ab4d4" stroke-width="1"/>` : `<text x="${W - 24}" y="34" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="bold" fill="#132e7a" text-anchor="end" letter-spacing="1">TIMENATION</text>
  <text x="${W - 24}" y="51" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="#3a5a9e" text-anchor="end">FUTURE BEGINS NOW</text>`}

  <line x1="22" y1="72" x2="${W - 22}" y2="72" stroke="#88aed0" stroke-width="1.1"/>

  <!-- ── Photo box ───────────────────────────────────────────── -->
  <rect x="${PHOTO_X - 2}" y="${PHOTO_Y - 2}" width="${PHOTO_W + 4}" height="${PHOTO_H + 4}" rx="8" fill="none" stroke="#8ab4d2" stroke-width="1.4"/>
  <rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="6" fill="#d0e4f4"/>
  ${photoEl}
  <!-- Subtle vignette on photo -->
  <rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" rx="6"
        fill="none" stroke="#6090b8" stroke-width="0.6" clip-path="url(#photoClip)"/>

  <!-- ── Data fields (left side) ───────────────────────────── -->

  <!-- SURNAME -->
  <text x="${DATA_X}" y="96"  font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">SURNAME</text>
  <text x="${DATA_X}" y="120" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="500" fill="#080f20">${esc(surnameVal)}</text>

  <!-- GIVEN NAME -->
  <text x="${DATA_X}" y="146" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">GIVEN NAME</text>
  <text x="${DATA_X}" y="170" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="500" fill="#080f20">${esc(givenVal)}</text>

  <!-- NATIONALITY -->
  <text x="${DATA_X}" y="196" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">NATIONALITY</text>
  <text x="${DATA_X}" y="220" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="500" fill="#080f20">TIMENATION</text>

  <!-- DATE OF BIRTH -->
  <text x="${DATA_X}" y="246" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">DATE OF BIRTH</text>
  <text x="${DATA_X}" y="270" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="500" fill="#080f20">${esc(dobDisplay)}</text>

  <!-- DATE/TIME OF ISSUE -->
  <text x="${DATA_X}" y="296" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">DATE / TIME OF ISSUE</text>
  <text x="${DATA_X}" y="320" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="500" fill="#080f20">${esc(issueDT)}</text>

  <!-- Citizen No. + Rank (bottom-left of data area) -->
  <line x1="${DATA_X}" y1="336" x2="560" y2="336" stroke="#8ab0d0" stroke-width="0.7" stroke-dasharray="3,3"/>

  <text x="${DATA_X}" y="355" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">DOCUMENT NO.</text>
  <text x="${DATA_X}" y="378" font-family="Courier New,monospace" font-size="20" font-weight="bold" fill="#080f20" letter-spacing="4">${esc(c.citizenNumber)}</text>

  <text x="240" y="355" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="bold" fill="#1a4fc4" letter-spacing="1.5">RANK / MERIT</text>
  <text x="240" y="378" font-family="Arial,Helvetica,sans-serif" font-size="18" fill="#080f20">${esc(c.rank)}  ·  ${c.meritScore.toFixed(1)}</text>

  <!-- ── Signature line ──────────────────────────────────────── -->
  ${c.signatureBase64 ? `<image href="${esc(c.signatureBase64)}" x="${DATA_X}" y="388" width="222" height="30" preserveAspectRatio="xMinYMid meet" opacity="0.92"/>` : ""}
  <line x1="${DATA_X}" y1="424" x2="322" y2="424" stroke="#7090b8" stroke-width="0.9"/>
  <text x="${DATA_X + 4}" y="436" font-family="Georgia,serif" font-size="10" fill="#4a6a9a" font-style="italic">SIGNATURE OF HOLDER</text>

  <!-- ── MRZ Zone ─────────────────────────────────────────────── -->
  <rect x="0" y="${MRZ_Y}" width="${W}" height="${H - MRZ_Y}" fill="url(#mrzBg)" clip-path="url(#card)"/>
  <rect x="0" y="${MRZ_Y}" width="${W}" height="2.5" fill="#1a5296"/>

  <!-- MRZ line 1 -->
  <text x="22" y="${MRZ_Y + 34}" font-family="Courier New,monospace" font-size="16.5" fill="#4a88c8" letter-spacing="3.2">${esc(mrz1.padEnd(30,"<"))}</text>
  <!-- MRZ line 2 -->
  <text x="22" y="${MRZ_Y + 62}" font-family="Courier New,monospace" font-size="16.5" fill="#4a88c8" letter-spacing="3.2">${esc(mrz2.padEnd(30,"<"))}</text>

  <!-- Emblem stamp bottom-right (real image) -->
  ${EMBLEM_DATA_URI
    ? `<defs><clipPath id="stampClip"><circle cx="${W - 60}" cy="${MRZ_Y + 48}" r="34"/></clipPath></defs>
  <image href="${EMBLEM_DATA_URI}" x="${W - 94}" y="${MRZ_Y + 14}" width="68" height="68"
         clip-path="url(#stampClip)" preserveAspectRatio="xMidYMid meet" opacity="0.55"/>
  <circle cx="${W - 60}" cy="${MRZ_Y + 48}" r="34" fill="none" stroke="#1e3a8a" stroke-width="1" opacity="0.4"/>`
    : `<circle cx="${W - 60}" cy="${MRZ_Y + 48}" r="34" fill="none" stroke="#1e3a8a" stroke-width="1.2" opacity="0.5"/>
  <text x="${W - 60}" y="${MRZ_Y + 43}" font-family="Georgia,serif" font-size="18" fill="#1e3a8a" text-anchor="middle" opacity="0.55">∞</text>`}
</svg>`;
}
