import type { Request, Response, NextFunction } from "express";

// ── OFAC / International Sanctions Geo-Block ──────────────────────────────────
// Blocked per: OFAC Specially Designated Nationals list + EU/UN sanctions regimes.
// This is a best-effort layer; not a substitute for legal counsel or a dedicated
// compliance service.
const BLOCKED_COUNTRY_CODES = new Set([
  "IR", // Iran
  "KP", // North Korea (DPRK)
  "CU", // Cuba
  "SY", // Syria
  "SD", // Sudan
  "MM", // Myanmar (Burma)
  "BY", // Belarus
  "VE", // Venezuela (OFAC SDN subset)
  "RU", // Russia (per post-2022 financial sanctions scope)
]);

// Crimea is a UA/RU disputed region — harder to detect by country code alone.
// Full Crimea blocking would require city/region-level geolocation (paid APIs).

function getClientIP(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? "";
  return req.socket?.remoteAddress ?? "";
}

async function resolveCountryCode(ip: string): Promise<string | null> {
  // Skip local / private IPs in development
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("172.") ||
    ip.startsWith("192.168.")
  ) {
    return null;
  }

  try {
    // ip-api.com: free, no API key, 45 req/min for non-commercial
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,countryCode`,
      { signal: AbortSignal.timeout(3_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; countryCode?: string };
    return data.status === "success" ? (data.countryCode ?? null) : null;
  } catch {
    return null; // fail open — don't block if geolocation is unavailable
  }
}

/**
 * Express middleware: blocks requests from OFAC-sanctioned countries.
 * Fails open (passes through) if geolocation lookup fails.
 */
export async function sanctionsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = getClientIP(req);
  const countryCode = await resolveCountryCode(ip);

  if (countryCode && BLOCKED_COUNTRY_CODES.has(countryCode)) {
    res.status(403).json({
      error:
        "Access denied from this location due to regulatory compliance.",
      code: "SANCTIONS_GEO_BLOCK",
      country: countryCode,
    });
    return;
  }

  next();
}
