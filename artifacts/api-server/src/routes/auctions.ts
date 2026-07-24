import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auctionsTable, auctionLogsTable, citizensTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const CreateAuctionBody = z.object({
  amountDarmins: z.number().int().positive(),
  startingPrice: z.number().positive(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

const BidBody = z.object({
  bid: z.number().positive(),
});

// GET /api/auctions — активные лоты
router.get("/auctions", async (_req, res): Promise<void> => {
  const auctions = await db
    .select({
      id: auctionsTable.id,
      sellerId: auctionsTable.sellerId,
      sellerName: citizensTable.name,
      amountDarmins: auctionsTable.amountDarmins,
      startingPrice: auctionsTable.startingPrice,
      currentBid: auctionsTable.currentBid,
      buyerId: auctionsTable.buyerId,
      status: auctionsTable.status,
      endsAt: auctionsTable.endsAt,
      createdAt: auctionsTable.createdAt,
    })
    .from(auctionsTable)
    .leftJoin(citizensTable, eq(auctionsTable.sellerId, citizensTable.id))
    .where(eq(auctionsTable.status, "active"));

  res.json(auctions);
});

// POST /api/auctions — создать лот
router.post("/auctions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const sellerId = req.citizen!.id;
  const { amountDarmins, startingPrice, durationHours } = parsed.data;

  const seller = req.citizen!;

  // Родовая минута (1 Д) не может быть выставлена
  const transferable = seller.balanceMinutes - 1;
  if (amountDarmins > transferable) {
    res.status(400).json({ error: `Недостаточно Дарминов. Доступно: ${transferable}` });
    return;
  }

  // Блокируем Дармины продавца на время аукциона
  await db
    .update(citizensTable)
    .set({ balanceMinutes: seller.balanceMinutes - amountDarmins })
    .where(eq(citizensTable.id, sellerId));

  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const [auction] = await db
    .insert(auctionsTable)
    .values({ sellerId, amountDarmins, startingPrice, status: "active", endsAt })
    .returning();

  req.log.info({ sellerId, amountDarmins, auctionId: auction!.id }, "Auction created");
  res.status(201).json(auction);
});

// POST /api/auctions/:id/bid — сделать ставку
router.post("/auctions/:id/bid", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid auction ID" }); return; }

  const parsed = BidBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const buyerId = req.citizen!.id;
  const { bid } = parsed.data;

  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .limit(1);

  if (!auction) { res.status(404).json({ error: "Активный аукцион не найден" }); return; }
  if (new Date() > auction.endsAt) { res.status(400).json({ error: "Аукцион истёк" }); return; }
  if (auction.sellerId === buyerId) { res.status(400).json({ error: "Нельзя делать ставку на собственный лот" }); return; }

  const minBid = auction.currentBid ?? auction.startingPrice;
  if (bid <= minBid) {
    res.status(400).json({ error: `Ставка должна быть выше ${minBid}` });
    return;
  }

  await db
    .update(auctionsTable)
    .set({ currentBid: bid, buyerId })
    .where(eq(auctionsTable.id, id));

  res.json({ ok: true, currentBid: bid, buyerId });
});

// POST /api/auctions/:id/finalize — завершить аукцион и зачислить Дармины победителю
router.post("/auctions/:id/finalize", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .limit(1);

  if (!auction) { res.status(404).json({ error: "Активный аукцион не найден" }); return; }
  if (new Date() < auction.endsAt) { res.status(400).json({ error: "Аукцион ещё не завершён" }); return; }

  const finalPrice = auction.currentBid ?? auction.startingPrice;
  // 2% комиссия. Точная дробь, без округления.
  const tax = finalPrice * 0.02;

  await db.update(auctionsTable).set({ status: "completed" }).where(eq(auctionsTable.id, id));

  if (auction.buyerId) {
    // Зачислить Дармины победителю
    const [buyer] = await db.select().from(citizensTable).where(eq(citizensTable.id, auction.buyerId)).limit(1);
    if (buyer) {
      await db.update(citizensTable)
        .set({ balanceMinutes: buyer.balanceMinutes + auction.amountDarmins })
        .where(eq(citizensTable.id, auction.buyerId));
    }

    // Зачислить продавцу (finalPrice - tax) — точная дробь, без округления
    const [seller] = await db.select().from(citizensTable).where(eq(citizensTable.id, auction.sellerId)).limit(1);
    if (seller) {
      const sellerReceives = finalPrice - tax;
      await db.update(citizensTable)
        .set({ balanceMinutes: seller.balanceMinutes + sellerReceives })
        .where(eq(citizensTable.id, auction.sellerId));
    }

    await db.insert(auctionLogsTable).values({
      auctionId: id,
      buyerId: auction.buyerId,
      sellerId: auction.sellerId,
      finalPrice,
      tax2pct: tax,
    });

    req.log.info({ auctionId: id, finalPrice, tax }, "Auction finalized");
    res.json({ ok: true, finalPrice, tax, winner: auction.buyerId });
  } else {
    // Нет победителя — вернуть Дармины продавцу
    const [seller] = await db.select().from(citizensTable).where(eq(citizensTable.id, auction.sellerId)).limit(1);
    if (seller) {
      await db.update(citizensTable)
        .set({ balanceMinutes: seller.balanceMinutes + auction.amountDarmins })
        .where(eq(citizensTable.id, auction.sellerId));
    }
    res.json({ ok: true, finalPrice: 0, winner: null });
  }
});

// ── Background: auto-finalize all expired active auctions ─────────────────────
export async function finalizeExpiredAuctions(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select()
    .from(auctionsTable)
    .where(
      and(
        eq(auctionsTable.status, "active"),
        // endsAt <= now
        // Drizzle: lte not imported — use sql comparator
        sql`${auctionsTable.endsAt} <= ${now.toISOString()}`,
      ),
    );

  for (const auction of expired) {
    try {
      // Mark completed first to prevent double-finalization
      const updated = await db
        .update(auctionsTable)
        .set({ status: "completed" })
        .where(
          and(
            eq(auctionsTable.id, auction.id),
            eq(auctionsTable.status, "active"),
          ),
        )
        .returning({ id: auctionsTable.id });

      if (!updated.length) continue; // already finalized by another process

      const finalPrice = auction.currentBid ?? auction.startingPrice;
      const tax = finalPrice * 0.02;

      if (auction.buyerId) {
        // Credit Darmins to winner
        const [buyer] = await db
          .select()
          .from(citizensTable)
          .where(eq(citizensTable.id, auction.buyerId))
          .limit(1);
        if (buyer) {
          await db
            .update(citizensTable)
            .set({ balanceMinutes: buyer.balanceMinutes + auction.amountDarmins })
            .where(eq(citizensTable.id, auction.buyerId));
        }

        // Credit seller (finalPrice - 2% tax)
        const [seller] = await db
          .select()
          .from(citizensTable)
          .where(eq(citizensTable.id, auction.sellerId))
          .limit(1);
        if (seller) {
          await db
            .update(citizensTable)
            .set({ balanceMinutes: seller.balanceMinutes + (finalPrice - tax) })
            .where(eq(citizensTable.id, auction.sellerId));
        }

        await db.insert(auctionLogsTable).values({
          auctionId: auction.id,
          buyerId: auction.buyerId,
          sellerId: auction.sellerId,
          finalPrice,
          tax2pct: tax,
        });

        logger.info({ auctionId: auction.id, finalPrice, tax }, "Auction auto-finalized (winner)");
      } else {
        // No bids — return Darmins to seller
        const [seller] = await db
          .select()
          .from(citizensTable)
          .where(eq(citizensTable.id, auction.sellerId))
          .limit(1);
        if (seller) {
          await db
            .update(citizensTable)
            .set({ balanceMinutes: seller.balanceMinutes + auction.amountDarmins })
            .where(eq(citizensTable.id, auction.sellerId));
        }

        logger.info({ auctionId: auction.id }, "Auction auto-finalized (no bids, refunded)");
      }
    } catch (err) {
      logger.error({ err, auctionId: auction.id }, "Failed to auto-finalize auction");
    }
  }
}

export default router;
