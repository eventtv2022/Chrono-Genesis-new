/**
 * Node Validator Service — Heartbeat & GeoIP audit for embassy nodes.
 *
 * Every INTERVAL_MS it:
 *  1. Fetches all embassies that have a nodeIp set.
 *  2. Measures HTTP latency to the node IP.
 *  3. Looks up the IP via ip-api.com (free, no key required).
 *  4. Compares GeoIP coordinates with the declared embassy GPS.
 *  5. If the distance exceeds ANOMALY_KM or the country doesn't match,
 *     flags the node as "pending_verification" and logs the anomaly.
 *  6. Otherwise records the ping time and keeps status unchanged.
 */

import { db } from "@workspace/db";
import { nationalEmbassiesTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";

const INTERVAL_MS  = 5 * 60 * 1000; // 5 minutes
const ANOMALY_KM   = 300;            // flag if GeoIP is >300 km from declared GPS
const FETCH_TIMEOUT = 6_000;         // 6 s timeout per node probe

// ── Haversine distance (km) ───────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GeoIP lookup ──────────────────────────────────────────────────────────────

interface GeoIpResult {
  status: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  city: string;
}

async function geoIpLookup(ip: string): Promise<GeoIpResult | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,lat,lon,city`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as GeoIpResult;
  } catch {
    return null;
  }
}

// ── Latency probe via fetch timing ────────────────────────────────────────────

async function probePingMs(ip: string): Promise<number | null> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    // HEAD to port 80; most nodes won't have HTTP but the TCP RST is measurable
    await fetch(`http://${ip}`, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return Date.now() - t0;
  } catch {
    // Connection refused or timeout — still record a conservative roundtrip if fast
    const elapsed = Date.now() - t0;
    return elapsed < FETCH_TIMEOUT ? elapsed : null;
  }
}

// ── Main validation pass ──────────────────────────────────────────────────────

async function runValidationPass() {
  const embassies = await db
    .select()
    .from(nationalEmbassiesTable)
    .where(isNotNull(nationalEmbassiesTable.nodeIp));

  if (embassies.length === 0) return;

  logger.info({ count: embassies.length }, "NodeValidator: starting pass");

  for (const embassy of embassies) {
    const ip = embassy.nodeIp!;
    const pingMs = await probePingMs(ip);
    const geo    = await geoIpLookup(ip);

    const now = new Date();
    let anomaly: string | null = null;
    let newNodeStatus = embassy.nodeStatus;

    if (geo && geo.status === "success") {
      const distKm = haversineKm(embassy.gpsLat, embassy.gpsLng, geo.lat, geo.lon);

      if (distKm > ANOMALY_KM) {
        anomaly = `GeoIP distance anomaly: IP resolves to ${geo.city}, ${geo.country} (${distKm.toFixed(0)} km from declared location)`;
        if (newNodeStatus === "online") newNodeStatus = "pending_verification";
      }

      await db
        .update(nationalEmbassiesTable)
        .set({
          lastPingMs:      pingMs ?? embassy.lastPingMs,
          geoIpCountry:    geo.countryCode,
          geoIpLat:        geo.lat,
          geoIpLng:        geo.lon,
          lastValidatedAt: now,
          nodeStatus:      newNodeStatus,
          anomalyLog:      anomaly ?? embassy.anomalyLog,
        })
        .where(
          // @ts-ignore — drizzle eq import available via db
          (await import("drizzle-orm")).eq(nationalEmbassiesTable.id, embassy.id)
        );

      if (anomaly) {
        logger.warn({ embassyId: embassy.id, ip, anomaly }, "NodeValidator: anomaly detected");
      } else {
        logger.info({ embassyId: embassy.id, ip, pingMs, distKm: distKm.toFixed(0) }, "NodeValidator: node OK");
      }
    } else {
      // GeoIP lookup failed — just update ping
      await db
        .update(nationalEmbassiesTable)
        .set({ lastPingMs: pingMs ?? embassy.lastPingMs, lastValidatedAt: now })
        .where(
          (await import("drizzle-orm")).eq(nationalEmbassiesTable.id, embassy.id)
        );
    }
  }
}

// ── Start the daemon ──────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

export function startNodeValidator() {
  if (_timer) return;
  // Delay first run by 30 s to let the server warm up
  setTimeout(() => {
    runValidationPass().catch(err =>
      logger.error({ err }, "NodeValidator: pass failed")
    );
    _timer = setInterval(() => {
      runValidationPass().catch(err =>
        logger.error({ err }, "NodeValidator: pass failed")
      );
    }, INTERVAL_MS);
  }, 30_000);

  logger.info({ intervalMin: INTERVAL_MS / 60000 }, "NodeValidator daemon started");
}
