import { Router } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  chronopediaSlotsTable,
  chronopediaEventsTable,
  citizensTable,
} from "@workspace/db";
import { eq, ne, desc, and, sql } from "drizzle-orm";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const CreateSlotBody = z.object({
  citizenId: z.number().int().positive(),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
  locationName: z.string().min(1).max(200),
  placeId: z.string().min(1).max(300).optional(),
  timeMarker: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
});

const AddEventBody = z.object({
  citizenId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
});

const EditEventBody = z.object({
  citizenId: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
});

// Generate synthetic placeId from coordinates (±1km grid)
function syntheticPlaceId(lat: number, lng: number): string {
  const rLat = Math.round(lat * 100) / 100;
  const rLng = Math.round(lng * 100) / 100;
  return `syn_${rLat}_${rLng}`;
}

// ── GET /api/chronopedia/slots?citizenId=X ────────────────────────────────────
// All slots with event counts and hasMyEvent flag.
router.get("/chronopedia/slots", async (req, res): Promise<void> => {
  const citizenId = parseInt(String(req.query["citizenId"] ?? ""), 10) || null;

  const rows = await db
    .select({
      id: chronopediaSlotsTable.id,
      timeMarker: chronopediaSlotsTable.timeMarker,
      placeId: chronopediaSlotsTable.placeId,
      geoLat: chronopediaSlotsTable.geoLat,
      geoLng: chronopediaSlotsTable.geoLng,
      locationName: chronopediaSlotsTable.locationName,
      createdAt: chronopediaSlotsTable.createdAt,
      eventCount: sql<number>`count(case when ${chronopediaEventsTable.status} != 'deleted' then 1 end)::int`,
      hasMyEvent: citizenId
        ? sql<boolean>`bool_or(${chronopediaEventsTable.authorId} = ${citizenId} and ${chronopediaEventsTable.status} != 'deleted')`
        : sql<boolean>`false`,
    })
    .from(chronopediaSlotsTable)
    .leftJoin(
      chronopediaEventsTable,
      eq(chronopediaEventsTable.slotId, chronopediaSlotsTable.id)
    )
    .groupBy(chronopediaSlotsTable.id)
    .orderBy(desc(chronopediaSlotsTable.createdAt))
    .limit(500);

  res.json({ slots: rows });
});

// ── GET /api/chronopedia/feed?citizenId=X&limit=50 ───────────────────────────
// Recent events across all slots (for feed view).
router.get("/chronopedia/feed", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 100);

  const events = await db
    .select({
      id: chronopediaEventsTable.id,
      slotId: chronopediaEventsTable.slotId,
      authorId: chronopediaEventsTable.authorId,
      authorName: citizensTable.name,
      authorRank: citizensTable.rank,
      title: chronopediaEventsTable.title,
      description: chronopediaEventsTable.description,
      status: chronopediaEventsTable.status,
      createdAt: chronopediaEventsTable.createdAt,
      locationName: chronopediaSlotsTable.locationName,
      timeMarker: chronopediaSlotsTable.timeMarker,
      geoLat: chronopediaSlotsTable.geoLat,
      geoLng: chronopediaSlotsTable.geoLng,
    })
    .from(chronopediaEventsTable)
    .innerJoin(
      chronopediaSlotsTable,
      eq(chronopediaSlotsTable.id, chronopediaEventsTable.slotId)
    )
    .innerJoin(citizensTable, eq(citizensTable.id, chronopediaEventsTable.authorId))
    .where(ne(chronopediaEventsTable.status, "deleted"))
    .orderBy(desc(chronopediaEventsTable.createdAt))
    .limit(limit);

  res.json({ events });
});

// ── GET /api/chronopedia/slots/:id ───────────────────────────────────────────
// Slot detail with all non-deleted events + author info.
router.get("/chronopedia/slots/:id", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const [slot] = await db
    .select()
    .from(chronopediaSlotsTable)
    .where(eq(chronopediaSlotsTable.id, slotId))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Слот не найден" }); return; }

  const events = await db
    .select({
      id: chronopediaEventsTable.id,
      authorId: chronopediaEventsTable.authorId,
      authorName: citizensTable.name,
      authorRank: citizensTable.rank,
      title: chronopediaEventsTable.title,
      description: chronopediaEventsTable.description,
      status: chronopediaEventsTable.status,
      createdAt: chronopediaEventsTable.createdAt,
      updatedAt: chronopediaEventsTable.updatedAt,
    })
    .from(chronopediaEventsTable)
    .innerJoin(citizensTable, eq(citizensTable.id, chronopediaEventsTable.authorId))
    .where(
      and(
        eq(chronopediaEventsTable.slotId, slotId),
        ne(chronopediaEventsTable.status, "deleted")
      )
    )
    .orderBy(desc(chronopediaEventsTable.createdAt));

  res.json({ slot, events });
});

// ── POST /api/chronopedia/slots ───────────────────────────────────────────────
// Create a new space-time slot + first opinion.
// If slot with same timeMarker+placeId already exists → adds event to existing slot.
router.post("/chronopedia/slots", async (req, res): Promise<void> => {
  const parsed = CreateSlotBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { citizenId, geoLat, geoLng, locationName, timeMarker, title, description } = parsed.data;
  const placeId = parsed.data.placeId ?? syntheticPlaceId(geoLat, geoLng);

  const [citizen] = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  let slotId: number;
  let created = false;

  try {
    const [inserted] = await db
      .insert(chronopediaSlotsTable)
      .values({ timeMarker, placeId, geoLat, geoLng, locationName })
      .returning({ id: chronopediaSlotsTable.id });
    slotId = inserted!.id;
    created = true;
  } catch {
    // Unique constraint violation — slot already exists, find it
    const [existing] = await db
      .select({ id: chronopediaSlotsTable.id })
      .from(chronopediaSlotsTable)
      .where(
        and(
          eq(chronopediaSlotsTable.timeMarker, timeMarker),
          eq(chronopediaSlotsTable.placeId, placeId)
        )
      )
      .limit(1);

    if (!existing) { res.status(409).json({ error: "Конфликт при создании слота" }); return; }
    slotId = existing.id;
  }

  const [event] = await db
    .insert(chronopediaEventsTable)
    .values({ slotId, authorId: citizenId, title, description, status: "approved" })
    .returning({ id: chronopediaEventsTable.id });

  req.log.info({ citizenId, slotId, created }, "Chronopedia slot/event created");
  res.status(201).json({ ok: true, slotId, eventId: event!.id, created });
});

// ── POST /api/chronopedia/slots/:id/events ────────────────────────────────────
// Add an opinion to an existing slot. Free — no Дармин cost.
router.post("/chronopedia/slots/:id/events", async (req, res): Promise<void> => {
  const slotId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(slotId)) { res.status(400).json({ error: "Invalid slot ID" }); return; }

  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { citizenId, title, description } = parsed.data;

  const [slot] = await db
    .select({ id: chronopediaSlotsTable.id })
    .from(chronopediaSlotsTable)
    .where(eq(chronopediaSlotsTable.id, slotId))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Слот не найден" }); return; }

  const [citizen] = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  const [event] = await db
    .insert(chronopediaEventsTable)
    .values({ slotId, authorId: citizenId, title, description, status: "approved" })
    .returning({ id: chronopediaEventsTable.id });

  req.log.info({ citizenId, slotId }, "Chronopedia event added");
  res.status(201).json({ ok: true, eventId: event!.id });
});

// ── PATCH /api/chronopedia/events/:id ────────────────────────────────────────
// Edit own event (title and/or description).
router.patch("/chronopedia/events/:id", async (req, res): Promise<void> => {
  const eventId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(eventId)) { res.status(400).json({ error: "Invalid event ID" }); return; }

  const parsed = EditEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { citizenId, title, description } = parsed.data;

  const [event] = await db
    .select({ id: chronopediaEventsTable.id, authorId: chronopediaEventsTable.authorId })
    .from(chronopediaEventsTable)
    .where(eq(chronopediaEventsTable.id, eventId))
    .limit(1);

  if (!event) { res.status(404).json({ error: "Запись не найдена" }); return; }
  if (event.authorId !== citizenId) {
    res.status(403).json({ error: "Только автор может редактировать запись" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates["title"] = title;
  if (description !== undefined) updates["description"] = description;

  await db
    .update(chronopediaEventsTable)
    .set(updates)
    .where(eq(chronopediaEventsTable.id, eventId));

  res.json({ ok: true });
});

// ── DELETE /api/chronopedia/events/:id ───────────────────────────────────────
// Soft-delete own event (sets status = 'deleted').
router.delete("/chronopedia/events/:id", async (req, res): Promise<void> => {
  const eventId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(eventId)) { res.status(400).json({ error: "Invalid event ID" }); return; }

  const citizenId = z.number().int().positive().safeParse(req.body?.citizenId);
  if (!citizenId.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  const [event] = await db
    .select({ id: chronopediaEventsTable.id, authorId: chronopediaEventsTable.authorId })
    .from(chronopediaEventsTable)
    .where(eq(chronopediaEventsTable.id, eventId))
    .limit(1);

  if (!event) { res.status(404).json({ error: "Запись не найдена" }); return; }
  if (event.authorId !== citizenId.data) {
    res.status(403).json({ error: "Только автор может удалить запись" });
    return;
  }

  await db
    .update(chronopediaEventsTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(chronopediaEventsTable.id, eventId));

  res.json({ ok: true });
});

// ── GET /api/chronopedia/places/search?q=TEXT ────────────────────────────────
// Proxy to Google Places Text Search API (keeps key server-side).
router.get("/chronopedia/places/search", async (req, res): Promise<void> => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q) { res.json({ places: [] }); return; }

  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) { res.json({ places: [] }); return; }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${apiKey}&language=ru`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) { res.json({ places: [] }); return; }

    const data = await upstream.json() as {
      results?: {
        place_id: string;
        name: string;
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }[];
    };

    const places = (data.results ?? []).slice(0, 5).map((r) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }));

    res.json({ places });
  } catch {
    res.json({ places: [] });
  }
});

export default router;
