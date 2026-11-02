import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nationalEmbassiesTable, citizensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Haversine distance in metres */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateEmbassyBody = z.object({
  citizenId: z.number().int().positive(),
  gpsLat:    z.number().min(-90).max(90),
  gpsLng:    z.number().min(-180).max(180),
  address:   z.string().max(300).optional(),
});

const SetNodeIpBody = z.object({
  nodeIp: z.union([z.ipv4(), z.ipv6()]),
});

const VerifyLocationBody = z.object({
  token:    z.string().min(32).max(128),
  phoneLat: z.number().min(-90).max(90),
  phoneLng: z.number().min(-180).max(180),
});

// ── GET /api/embassies ────────────────────────────────────────────────────────

router.get("/embassies", async (_req, res): Promise<void> => {
  const embassies = await db
    .select({
      id:                 nationalEmbassiesTable.id,
      citizenId:          nationalEmbassiesTable.citizenId,
      citizenName:        citizensTable.name,
      gpsLat:             nationalEmbassiesTable.gpsLat,
      gpsLng:             nationalEmbassiesTable.gpsLng,
      address:            nationalEmbassiesTable.address,
      nodeActive:         nationalEmbassiesTable.nodeActive,
      uptimeScore:        nationalEmbassiesTable.uptimeScore,
      status:             nationalEmbassiesTable.status,
      nodeStatus:         nationalEmbassiesTable.nodeStatus,
      lastPingMs:         nationalEmbassiesTable.lastPingMs,
      isHardwareVerified: nationalEmbassiesTable.isHardwareVerified,
      nftMetadata:        nationalEmbassiesTable.nftMetadata,
      createdAt:          nationalEmbassiesTable.createdAt,
    })
    .from(nationalEmbassiesTable)
    .leftJoin(citizensTable, eq(nationalEmbassiesTable.citizenId, citizensTable.id));

  res.json(embassies);
});

// ── GET /api/embassies/:id ────────────────────────────────────────────────────

router.get("/embassies/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid embassy ID" }); return; }

  const [embassy] = await db
    .select()
    .from(nationalEmbassiesTable)
    .where(eq(nationalEmbassiesTable.id, id))
    .limit(1);

  if (!embassy) { res.status(404).json({ error: "Embassy not found" }); return; }
  res.json(embassy);
});

// ── POST /api/embassies ───────────────────────────────────────────────────────

router.post("/embassies", async (req, res): Promise<void> => {
  const parsed = CreateEmbassyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { citizenId, gpsLat, gpsLng, address } = parsed.data;

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Citizen not found" }); return; }

  const [existing] = await db
    .select({ id: nationalEmbassiesTable.id })
    .from(nationalEmbassiesTable)
    .where(eq(nationalEmbassiesTable.citizenId, citizenId))
    .limit(1);

  if (existing) { res.status(409).json({ error: "Посольство уже зарегистрировано" }); return; }

  const nftMetadata = JSON.stringify({
    type: "Ambassador", citizen: citizen.name, citizenId,
    lat: gpsLat, lng: gpsLng, issuedAt: new Date().toISOString(), network: "TimeNation",
  });

  const [embassy] = await db
    .insert(nationalEmbassiesTable)
    .values({ citizenId, gpsLat, gpsLng, address: address ?? null, status: "active", nftMetadata })
    .returning();

  const ambassadorRanks = ["Странник", "Созидатель"];
  if (ambassadorRanks.includes(citizen.rank)) {
    await db.update(citizensTable).set({ rank: "Посол" }).where(eq(citizensTable.id, citizenId));
  }

  req.log.info({ citizenId, embassyId: embassy!.id }, "Embassy registered");
  res.status(201).json(embassy);
});

// ── PATCH /api/embassies/:id/activate ────────────────────────────────────────

router.patch("/embassies/:id/activate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [updated] = await db
    .update(nationalEmbassiesTable)
    .set({ nodeActive: true })
    .where(eq(nationalEmbassiesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Embassy not found" }); return; }
  res.json(updated);
});

// ── PATCH /api/embassies/:id/node-ip — установить IP ноды ────────────────────

router.patch("/embassies/:id/node-ip", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = SetNodeIpBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(nationalEmbassiesTable)
    .set({ nodeIp: parsed.data.nodeIp, nodeStatus: "pending_verification" })
    .where(eq(nationalEmbassiesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Embassy not found" }); return; }
  req.log.info({ embassyId: id, nodeIp: parsed.data.nodeIp }, "Node IP set");
  res.json(updated);
});

// ── GET /api/embassies/:id/node-token — генерация QR-токена ──────────────────

router.get("/embassies/:id/node-token", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [embassy] = await db
    .select()
    .from(nationalEmbassiesTable)
    .where(eq(nationalEmbassiesTable.id, id))
    .limit(1);

  if (!embassy) { res.status(404).json({ error: "Embassy not found" }); return; }

  // Generate crypto-random 48-byte token (96 hex chars)
  const token       = randomBytes(48).toString("hex");
  const expiresAt   = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db
    .update(nationalEmbassiesTable)
    .set({ verificationQrToken: token, tokenExpiresAt: expiresAt })
    .where(eq(nationalEmbassiesTable.id, id));

  // QR payload: JSON with token + embassy id so the mobile app knows which embassy to verify
  const qrPayload = JSON.stringify({ embassyId: id, token, lat: embassy.gpsLat, lng: embassy.gpsLng });

  req.log.info({ embassyId: id }, "Node QR token generated");
  res.json({
    token,
    qrPayload,
    expiresAt:    expiresAt.toISOString(),
    expiresInSec: 600,
    embassyId:    id,
    gpsLat:       embassy.gpsLat,
    gpsLng:       embassy.gpsLng,
  });
});

// ── POST /api/embassies/verify-location — мобильная верификация ───────────────

router.post("/embassies/verify-location", async (req, res): Promise<void> => {
  const parsed = VerifyLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { token, phoneLat, phoneLng } = parsed.data;

  // Find embassy with matching token
  const [embassy] = await db
    .select()
    .from(nationalEmbassiesTable)
    .where(eq(nationalEmbassiesTable.verificationQrToken, token))
    .limit(1);

  if (!embassy) {
    res.status(404).json({ error: "Токен не найден или уже использован" });
    return;
  }

  // Check token expiry
  if (!embassy.tokenExpiresAt || new Date() > embassy.tokenExpiresAt) {
    res.status(410).json({ error: "Токен истёк. Сгенерируйте новый QR-код." });
    return;
  }

  // Check GPS proximity (≤15 m)
  const distMetres = distanceM(embassy.gpsLat, embassy.gpsLng, phoneLat, phoneLng);
  const PROXIMITY_M = 15;

  if (distMetres > PROXIMITY_M) {
    res.status(422).json({
      error: `Слишком далеко от ноды: ${distMetres.toFixed(0)} м (допустимо ≤${PROXIMITY_M} м)`,
      distanceM: Math.round(distMetres),
    });
    return;
  }

  // All checks pass — activate node and clear token
  const [updated] = await db
    .update(nationalEmbassiesTable)
    .set({
      isHardwareVerified:  true,
      nodeStatus:          "online",
      nodeActive:          true,
      verificationQrToken: null,
      tokenExpiresAt:      null,
      lastValidatedAt:     new Date(),
      anomalyLog:          null,
    })
    .where(eq(nationalEmbassiesTable.id, embassy.id))
    .returning();

  req.log.info(
    { embassyId: embassy.id, distanceM: distMetres.toFixed(0) },
    "Embassy node hardware-verified — node ONLINE"
  );

  res.json({
    success:     true,
    embassyId:   embassy.id,
    nodeStatus:  "online",
    distanceM:   Math.round(distMetres),
    message:     "Нода верифицирована! Начисление Дарминов за аптайм активировано.",
  });
});

export default router;
