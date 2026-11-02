import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { count, desc, eq, or, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import { transactionsTable, citizensTable, siteVisitorsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Aliases for double-join on citizens
const fromAlias = alias(citizensTable, "from_c");
const toAlias   = alias(citizensTable, "to_c");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Select shape that replaces stored names with current citizen pseudonyms
const txSelect = {
  id:                 transactionsTable.id,
  minutesTransferred: transactionsTable.minutesTransferred,
  durationSeconds:    transactionsTable.durationSeconds,
  createdAt:          transactionsTable.createdAt,
  fromCitizenNumber:  fromAlias.citizenNumber,
  toCitizenNumber:    toAlias.citizenNumber,
} as const;

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const limitRaw = req.query["limit"];
  const parsedLimit = limitRaw ? parseInt(String(limitRaw), 10) : 50;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

  const base = db
    .select(txSelect)
    .from(transactionsTable)
    .leftJoin(fromAlias, eq(transactionsTable.fromCitizenId, fromAlias.id))
    .leftJoin(toAlias,   eq(transactionsTable.toCitizenId,   toAlias.id));

  const rows = await base
    .where(or(
      eq(transactionsTable.fromCitizenId, req.citizen!.id),
      eq(transactionsTable.toCitizenId, req.citizen!.id),
    ))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);

  res.json(rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.get("/stats", async (_req, res): Promise<void> => {
  const citizens = await db.select({ status: citizensTable.status }).from(citizensTable);
  const [transactionTotals] = await db
    .select({
      total: count(),
      minutes: sum(transactionsTable.minutesTransferred),
    })
    .from(transactionsTable);
  const [visitorCount] = await db
    .select({ total: count() })
    .from(siteVisitorsTable);

  res.json({
    totalCitizens: citizens.length,
    activeCitizens: citizens.filter((citizen) => citizen.status === "active").length,
    totalTransactions: transactionTotals?.total ?? 0,
    totalMinutesTransferred: Number(transactionTotals?.minutes ?? 0),
    uniqueVisitors: visitorCount?.total ?? 0,
  });
});

router.post("/stats/visitors", async (req, res): Promise<void> => {
  const visitorId = req.body?.visitorId;
  if (typeof visitorId !== "string" || !UUID_PATTERN.test(visitorId)) {
    res.status(400).json({ error: "A valid visitor ID is required" });
    return;
  }

  const visitorHash = createHash("sha256")
    .update(visitorId.toLowerCase())
    .digest("hex");
  await db
    .insert(siteVisitorsTable)
    .values({ visitorHash })
    .onConflictDoNothing({ target: siteVisitorsTable.visitorHash });

  res.status(204).end();
});

export default router;
