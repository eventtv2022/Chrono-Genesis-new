import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import { transactionsTable, citizensTable, siteVisitorsTable } from "@workspace/db";

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

router.get("/transactions", async (req, res): Promise<void> => {
  const limitRaw = req.query["limit"];
  const parsedLimit = limitRaw ? parseInt(String(limitRaw), 10) : 50;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

  const base = db
    .select(txSelect)
    .from(transactionsTable)
    .leftJoin(fromAlias, eq(transactionsTable.fromCitizenId, fromAlias.id))
    .leftJoin(toAlias,   eq(transactionsTable.toCitizenId,   toAlias.id));

  const rows = await base.orderBy(desc(transactionsTable.createdAt)).limit(limit);

  res.json(rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.get("/stats", async (_req, res): Promise<void> => {
  const citizens = await db
    .select({
      citizenNumber: citizensTable.citizenNumber,
      status: citizensTable.status,
      totalGiven: citizensTable.totalGiven,
      totalReceived: citizensTable.totalReceived,
    })
    .from(citizensTable);
  const [visitorCount] = await db
    .select({ total: count() })
    .from(siteVisitorsTable);

  const recentRows = await db
    .select(txSelect)
    .from(transactionsTable)
    .leftJoin(fromAlias, eq(transactionsTable.fromCitizenId, fromAlias.id))
    .leftJoin(toAlias,   eq(transactionsTable.toCitizenId,   toAlias.id))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  const totalMinutesAll = recentRows.reduce((sum, t) => sum + t.minutesTransferred, 0);

  const citizensWithPassport = citizens.filter(
    (citizen): citizen is typeof citizen & { citizenNumber: string } => citizen.citizenNumber !== null,
  );
  const topGivers = [...citizensWithPassport]
    .sort((a, b) => b.totalGiven - a.totalGiven)
    .slice(0, 5)
    .map(({ citizenNumber, totalGiven, totalReceived }) => ({ citizenNumber, totalGiven, totalReceived }));

  const topReceivers = [...citizensWithPassport]
    .sort((a, b) => b.totalReceived - a.totalReceived)
    .slice(0, 5)
    .map(({ citizenNumber, totalGiven, totalReceived }) => ({ citizenNumber, totalGiven, totalReceived }));

  res.json({
    totalCitizens:          citizens.length,
    activeCitizens:         citizens.filter((c) => c.status === "active").length,
    totalTransactions:      recentRows.length,
    totalMinutesCirculated: totalMinutesAll,
    uniqueVisitors:         visitorCount?.total ?? 0,
    topGivers,
    topReceivers,
    recentTransactions: recentRows.slice(0, 10).map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
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
