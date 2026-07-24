import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { stateHistoricMinutesTable } from "@workspace/db";
import { eq, asc, ilike, or, sql } from "drizzle-orm";
import { buildHeritageRegistry } from "../seeds/historicMinutes";
import { invalidateHeritageCache } from "../lib/heritageGuard";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /api/heritage ── public list of all state-protected minutes
router.get("/heritage", async (req, res): Promise<void> => {
  const { category, q, limit = "100", offset = "0" } = req.query as Record<string, string>;

  let baseQuery = db
    .select({
      id:            stateHistoricMinutesTable.id,
      timelineCoord: stateHistoricMinutesTable.timelineCoord,
      category:      stateHistoricMinutesTable.category,
      title:         stateHistoricMinutesTable.title,
      description:   stateHistoricMinutesTable.description,
    })
    .from(stateHistoricMinutesTable)
    .$dynamic();

  const conditions: ReturnType<typeof eq>[] = [];
  if (category && category !== "ALL") {
    conditions.push(eq(stateHistoricMinutesTable.category, category) as ReturnType<typeof eq>);
  }
  if (q) {
    conditions.push(
      or(
        ilike(stateHistoricMinutesTable.title, `%${q}%`),
        ilike(stateHistoricMinutesTable.description, `%${q}%`),
      ) as ReturnType<typeof eq>
    );
  }

  // Apply conditions via raw SQL concat to avoid drizzle dynamic-filter issues
  const rows = await db
    .select({
      id:            stateHistoricMinutesTable.id,
      timelineCoord: stateHistoricMinutesTable.timelineCoord,
      category:      stateHistoricMinutesTable.category,
      title:         stateHistoricMinutesTable.title,
      description:   stateHistoricMinutesTable.description,
    })
    .from(stateHistoricMinutesTable)
    .where(
      conditions.length === 0 ? undefined
      : conditions.length === 1 ? conditions[0]
      : sql`(${conditions[0]} AND ${conditions[1]})` as ReturnType<typeof eq>
    )
    .orderBy(asc(stateHistoricMinutesTable.timelineCoord))
    .limit(parseInt(limit, 10) || 100)
    .offset(parseInt(offset, 10) || 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stateHistoricMinutesTable);

  res.json({ total: count, rows });
});

// ── POST /api/admin/heritage/seed ── (re)seeds the registry
router.post("/heritage/seed", async (_req, res): Promise<void> => {
  try {
    const entries = buildHeritageRegistry();
    logger.info({ count: entries.length }, "Seeding heritage registry…");

    // Batch insert with upsert (ignore conflicts on timeline_coord)
    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      await db
        .insert(stateHistoricMinutesTable)
        .values(batch.map(e => ({
          timelineCoord: e.coord,
          category:      e.category,
          title:         e.title,
          description:   e.description,
        })))
        .onConflictDoNothing();
      inserted += batch.length;
    }

    invalidateHeritageCache();
    logger.info({ inserted }, "Heritage registry seeded");
    res.json({ ok: true, inserted, total: entries.length });
  } catch (err) {
    logger.error({ err }, "Heritage seed failed");
    res.status(500).json({ error: "Ошибка при заполнении реестра" });
  }
});

export default router;
