import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nationalEmbassiesTable, citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CreateEmbassyBody = z.object({
  citizenId: z.number().int().positive(),
  gpsLat: z.number().min(-90).max(90),
  gpsLng: z.number().min(-180).max(180),
  address: z.string().max(300).optional(),
});

// GET /api/embassies — список всех посольств
router.get("/embassies", async (_req, res): Promise<void> => {
  const embassies = await db
    .select({
      id: nationalEmbassiesTable.id,
      citizenId: nationalEmbassiesTable.citizenId,
      citizenName: citizensTable.name,
      gpsLat: nationalEmbassiesTable.gpsLat,
      gpsLng: nationalEmbassiesTable.gpsLng,
      address: nationalEmbassiesTable.address,
      nodeActive: nationalEmbassiesTable.nodeActive,
      uptimeScore: nationalEmbassiesTable.uptimeScore,
      status: nationalEmbassiesTable.status,
      nftMetadata: nationalEmbassiesTable.nftMetadata,
      createdAt: nationalEmbassiesTable.createdAt,
    })
    .from(nationalEmbassiesTable)
    .leftJoin(citizensTable, eq(nationalEmbassiesTable.citizenId, citizensTable.id));

  res.json(embassies);
});

// GET /api/embassies/:id — одно посольство
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

// POST /api/embassies — зарегистрировать посольство
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

  // Каждый гражданин может иметь только одно посольство
  const [existing] = await db
    .select({ id: nationalEmbassiesTable.id })
    .from(nationalEmbassiesTable)
    .where(eq(nationalEmbassiesTable.citizenId, citizenId))
    .limit(1);

  if (existing) { res.status(409).json({ error: "Посольство уже зарегистрировано" }); return; }

  // NFT-сертификат — метаданные посла
  const nftMetadata = JSON.stringify({
    type: "Ambassador",
    citizen: citizen.name,
    citizenId,
    lat: gpsLat,
    lng: gpsLng,
    issuedAt: new Date().toISOString(),
    network: "TimeNation",
  });

  const [embassy] = await db
    .insert(nationalEmbassiesTable)
    .values({ citizenId, gpsLat, gpsLng, address: address ?? null, status: "active", nftMetadata })
    .returning();

  // Повысить ранг до «Посол» если ещё не выше
  const ambassadorRanks = ["Странник", "Созидатель"];
  if (ambassadorRanks.includes(citizen.rank)) {
    await db
      .update(citizensTable)
      .set({ rank: "Посол" })
      .where(eq(citizensTable.id, citizenId));
  }

  req.log.info({ citizenId, embassyId: embassy!.id }, "Embassy registered");
  res.status(201).json(embassy);
});

// PATCH /api/embassies/:id/activate — активировать ноду
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

export default router;
