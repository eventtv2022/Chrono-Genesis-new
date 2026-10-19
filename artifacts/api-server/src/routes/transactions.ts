import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import { transactionsTable, citizensTable, siteVisitorsTable } from "@workspace/db";

const router: IRouter = Router();

// ── Deterministic time-themed pseudonym generator ─────────────────────────────
const ADJS  = ["Quantum","Eternal","Cosmic","Chrono","Swift","Future","Epochal","Matrix","Midnight","Paradox","Cyber","Retro","Infinite"] as const;
const NOUNS = ["Clock","Hour","Tick","Nomad","Keeper","Watcher","Shift","Continuum","Vertex","Pulsar","Century","Relay","Ghost","Spark"] as const;

/** Seeded with citizen ID → same citizen always gets the same nick */
function seededNick(id: number): string {
  // Simple LCG-style hash: two independent primes to spread adj / noun indices
  const a = ((id * 2654435761) >>> 0) % ADJS.length;
  const n = ((id * 2246822519) >>> 0) % NOUNS.length;
  return `${ADJS[a]}${NOUNS[n]}`;
}

/** Returns the display name for a citizen, never exposing PII */
function displayName(name: string | null | undefined, id: number): string {
  return name && name.trim() ? name.trim() : seededNick(id);
}

// Public-safe citizen fields (no PII)
type CitizenRow = typeof citizensTable.$inferSelect;
function publicCitizen(c: CitizenRow) {
  return {
    id: c.id,
    name: displayName(c.name, c.id),
    meritScore: c.meritScore,
    rank: c.rank,
    status: c.status,
    balanceMinutes: c.balanceMinutes,
    totalGiven: c.totalGiven,
    totalReceived: c.totalReceived,
    transferableBalance: c.balanceMinutes - 1,
    lastActivity: c.lastActivity?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

// Aliases for double-join on citizens
const fromAlias = alias(citizensTable, "from_c");
const toAlias   = alias(citizensTable, "to_c");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Select shape that replaces stored names with current citizen pseudonyms
const txSelect = {
  id:                 transactionsTable.id,
  sessionId:          transactionsTable.sessionId,
  fromCitizenId:      transactionsTable.fromCitizenId,
  toCitizenId:        transactionsTable.toCitizenId,
  minutesTransferred: transactionsTable.minutesTransferred,
  durationSeconds:    transactionsTable.durationSeconds,
  createdAt:          transactionsTable.createdAt,
  // Current pseudonym takes priority; system entries (no citizen row) keep stored name
  fromCitizenName: sql<string>`COALESCE(${fromAlias.name}, ${transactionsTable.fromCitizenName})`,
  toCitizenName:   sql<string>`COALESCE(${toAlias.name},   ${transactionsTable.toCitizenName})`,
} as const;

router.get("/transactions", async (req, res): Promise<void> => {
  const citizenIdRaw = req.query["citizenId"];
  const limitRaw     = req.query["limit"];

  const limit     = limitRaw     ? Math.min(parseInt(String(limitRaw),     10), 200) : 50;
  const citizenId = citizenIdRaw ? parseInt(String(citizenIdRaw), 10) : null;

  const base = db
    .select(txSelect)
    .from(transactionsTable)
    .leftJoin(fromAlias, eq(transactionsTable.fromCitizenId, fromAlias.id))
    .leftJoin(toAlias,   eq(transactionsTable.toCitizenId,   toAlias.id));

  const rows = await (citizenId && !isNaN(citizenId)
    ? base
        .where(sql`${transactionsTable.fromCitizenId} = ${citizenId} OR ${transactionsTable.toCitizenId} = ${citizenId}`)
        .orderBy(desc(transactionsTable.createdAt))
        .limit(limit)
    : base
        .orderBy(desc(transactionsTable.createdAt))
        .limit(limit));

  res.json(rows.map((t) => ({
    ...t,
    // If citizen exists (id known) → apply displayName; system entries keep stored value
    fromCitizenName: t.fromCitizenId ? displayName(t.fromCitizenName, t.fromCitizenId) : t.fromCitizenName,
    toCitizenName:   t.toCitizenId   ? displayName(t.toCitizenName,   t.toCitizenId)   : t.toCitizenName,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.get("/stats", async (_req, res): Promise<void> => {
  const citizens = await db.select().from(citizensTable);
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

  const topGivers = [...citizens]
    .sort((a, b) => b.totalGiven - a.totalGiven)
    .slice(0, 5)
    .map(publicCitizen);

  const topReceivers = [...citizens]
    .sort((a, b) => b.totalReceived - a.totalReceived)
    .slice(0, 5)
    .map(publicCitizen);

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
      fromCitizenName: t.fromCitizenId ? displayName(t.fromCitizenName, t.fromCitizenId) : t.fromCitizenName,
      toCitizenName:   t.toCitizenId   ? displayName(t.toCitizenName,   t.toCitizenId)   : t.toCitizenName,
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
