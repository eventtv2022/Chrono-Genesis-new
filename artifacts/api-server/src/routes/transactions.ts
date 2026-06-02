import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { transactionsTable, citizensTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/transactions", async (req, res): Promise<void> => {
  const citizenIdRaw = req.query["citizenId"];
  const limitRaw = req.query["limit"];

  const limit = limitRaw ? parseInt(String(limitRaw), 10) : 50;
  const citizenId = citizenIdRaw ? parseInt(String(citizenIdRaw), 10) : null;

  let rows;
  if (citizenId && !isNaN(citizenId)) {
    rows = await db
      .select()
      .from(transactionsTable)
      .where(
        sql`${transactionsTable.fromCitizenId} = ${citizenId} OR ${transactionsTable.toCitizenId} = ${citizenId}`
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(Math.min(limit, 200));
  } else {
    rows = await db
      .select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(Math.min(limit, 200));
  }

  res.json(
    rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))
  );
});

router.get("/stats", async (_req, res): Promise<void> => {
  const citizens = await db.select().from(citizensTable);
  const allTransactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(200);

  const recentTransactions = allTransactions.slice(0, 10);

  const totalMinutesAll = allTransactions.reduce(
    (sum, t) => sum + t.minutesTransferred,
    0
  );

  const topGivers = [...citizens]
    .sort((a, b) => b.totalGiven - a.totalGiven)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      transferableBalance: c.balanceMinutes - 1,
      lastActivity: c.lastActivity?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

  const topReceivers = [...citizens]
    .sort((a, b) => b.totalReceived - a.totalReceived)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      transferableBalance: c.balanceMinutes - 1,
      lastActivity: c.lastActivity?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

  res.json({
    totalCitizens: citizens.length,
    activeCitizens: citizens.filter((c) => c.status === "active").length,
    totalTransactions: allTransactions.length,
    totalMinutesCirculated: totalMinutesAll,
    topGivers,
    topReceivers,
    recentTransactions: recentTransactions.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

export default router;
