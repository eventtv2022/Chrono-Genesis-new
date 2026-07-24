import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auctionsTable, auctionLogsTable, citizensTable, chronopediaSlotsTable, stateTaxLogsTable } from "@workspace/db";
import { eq, and, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { notifyTaxCollected } from "../services/telegramService";
import { getOnlineCitizenIds, pushToCitizen } from "../services/socialAlarmWs";
import { TREASURY_CITIZEN_ID } from "../services/videoStorage";

const router: IRouter = Router();

const BidBody = z.object({
  bid: z.number().positive(),
});

// ── Body schemas ───────────────────────────────────────────────────────────────
const CreateDarminAuctionBody = z.object({
  assetType:     z.literal("DARMIN_CURRENCY").default("DARMIN_CURRENCY"),
  amountDarmins: z.number().int().positive(),
  startingPrice: z.number().positive(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

const CreateSlotAuctionBody = z.object({
  assetType:     z.literal("HISTORICAL_SLOT"),
  slotId:        z.number().int().positive(),
  startingPrice: z.number().positive(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

const CreateAuctionBody = z.union([CreateDarminAuctionBody, CreateSlotAuctionBody]);

// ── GET /api/auctions ──────────────────────────────────────────────────────────
router.get("/auctions", async (_req, res): Promise<void> => {
  const auctions = await db
    .select({
      id:            auctionsTable.id,
      sellerId:      auctionsTable.sellerId,
      sellerName:    citizensTable.name,
      assetType:     auctionsTable.assetType,
      amountDarmins: auctionsTable.amountDarmins,
      slotId:        auctionsTable.slotId,
      slotLocation:  chronopediaSlotsTable.locationName,
      slotTimeMarker: chronopediaSlotsTable.timeMarker,
      startingPrice: auctionsTable.startingPrice,
      currentBid:    auctionsTable.currentBid,
      buyerId:       auctionsTable.buyerId,
      status:        auctionsTable.status,
      endsAt:        auctionsTable.endsAt,
      createdAt:     auctionsTable.createdAt,
    })
    .from(auctionsTable)
    .leftJoin(citizensTable, eq(auctionsTable.sellerId, citizensTable.id))
    .leftJoin(chronopediaSlotsTable, eq(auctionsTable.slotId, chronopediaSlotsTable.id))
    .where(eq(auctionsTable.status, "active"));

  res.json(auctions);
});

// ── POST /api/auctions ─────────────────────────────────────────────────────────
router.post("/auctions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные аукциона" }); return; }

  const seller   = req.citizen!;
  const sellerId = seller.id;
  const endsAt   = new Date(Date.now() + parsed.data.durationHours * 3_600_000);

  // ── DARMIN_CURRENCY auction ─────────────────────────────────────────────────
  if (parsed.data.assetType === "DARMIN_CURRENCY") {
    const { amountDarmins, startingPrice } = parsed.data;
    const transferable = seller.balanceMinutes - 1; // Ancestral Minute reserve
    if (amountDarmins > transferable) {
      res.status(400).json({ error: `Недостаточно Дарминов. Доступно: ${transferable.toFixed(2)}` });
      return;
    }
    // Lock escrow
    await db.update(citizensTable)
      .set({ balanceMinutes: seller.balanceMinutes - amountDarmins })
      .where(eq(citizensTable.id, sellerId));

    const [auction] = await db.insert(auctionsTable)
      .values({ sellerId, assetType: "DARMIN_CURRENCY", amountDarmins, startingPrice, status: "active", endsAt })
      .returning();

    req.log.info({ sellerId, amountDarmins, auctionId: auction!.id }, "Darmin auction created");
    res.status(201).json(auction);
    return;
  }

  // ── HISTORICAL_SLOT auction ─────────────────────────────────────────────────
  const { slotId, startingPrice } = parsed.data;

  const [slot] = await db
    .select()
    .from(chronopediaSlotsTable)
    .where(eq(chronopediaSlotsTable.id, slotId))
    .limit(1);

  if (!slot) { res.status(404).json({ error: "Исторический слот не найден" }); return; }
  if (slot.ownerCitizenId !== sellerId) {
    res.status(403).json({ error: "Вы не являетесь владельцем этого исторического слота" }); return;
  }
  if (slot.isLocked) {
    res.status(409).json({ error: "Слот уже заблокирован (на аукционе или в обработке)" }); return;
  }

  // Check not already listed in another open auction
  const [existingAuction] = await db
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .where(and(eq(auctionsTable.slotId, slotId), eq(auctionsTable.status, "active")))
    .limit(1);
  if (existingAuction) {
    res.status(409).json({ error: "Этот слот уже выставлен на другой активный аукцион" }); return;
  }

  // Atomic: lock slot + create auction
  let auction: typeof auctionsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    await tx.update(chronopediaSlotsTable)
      .set({ isLocked: true })
      .where(eq(chronopediaSlotsTable.id, slotId));

    const [inserted] = await tx.insert(auctionsTable)
      .values({ sellerId, assetType: "HISTORICAL_SLOT", amountDarmins: 0, slotId, startingPrice, status: "active", endsAt })
      .returning();
    auction = inserted;
  });

  req.log.info({ sellerId, slotId, auctionId: auction!.id }, "Historical slot auction created");
  res.status(201).json(auction);
});

// ── POST /api/auctions/:id/bid ─────────────────────────────────────────────────
router.post("/auctions/:id/bid", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid auction ID" }); return; }

  const parsed = BidBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректная ставка" }); return; }

  const buyer   = req.citizen!;
  const buyerId = buyer.id;
  const { bid } = parsed.data;

  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .limit(1);

  if (!auction) { res.status(404).json({ error: "Активный аукцион не найден" }); return; }
  if (new Date() > auction.endsAt) { res.status(400).json({ error: "Аукцион уже завершён" }); return; }
  if (auction.sellerId === buyerId) { res.status(400).json({ error: "Нельзя делать ставку на собственный лот" }); return; }

  const minBid = auction.currentBid ?? auction.startingPrice;
  if (bid <= minBid) {
    res.status(400).json({ error: `Ставка должна быть выше текущей (${minBid.toFixed(2)} Д)` });
    return;
  }

  // Balance check — buyer must keep ≥ 1 Д (Ancestral Minute)
  if (buyer.balanceMinutes - bid < 1) {
    res.status(400).json({ error: `Недостаточно средств. Доступно: ${Math.max(0, buyer.balanceMinutes - 1).toFixed(2)} Д` });
    return;
  }

  // Atomic bid update
  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ currentBid: auctionsTable.currentBid, startingPrice: auctionsTable.startingPrice, status: auctionsTable.status })
        .from(auctionsTable).where(eq(auctionsTable.id, id)).limit(1);

      if (!fresh || fresh.status !== "active") throw new Error("Аукцион уже завершён");
      const freshMin = fresh.currentBid ?? fresh.startingPrice;
      if (bid <= freshMin) throw new Error(`Ставка должна быть выше текущей (${freshMin.toFixed(2)} Д)`);

      await tx.update(auctionsTable).set({ currentBid: bid, buyerId }).where(eq(auctionsTable.id, id));
    });
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Ошибка при размещении ставки";
    res.status(400).json({ error: msg });
    return;
  }

  // Broadcast to all connected clients
  const onlineIds = getOnlineCitizenIds();
  for (const cid of onlineIds) {
    pushToCitizen(cid, { type: "auction_bid_updated", auctionId: id, currentBid: bid, buyerId });
  }

  req.log.info({ auctionId: id, buyerId, bid }, "Auction bid placed");
  res.json({ ok: true, currentBid: bid, buyerId });
});

// ── POST /api/auctions/:id/finalize ───────────────────────────────────────────
router.post("/auctions/:id/finalize", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [auction] = await db
    .select()
    .from(auctionsTable)
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .limit(1);

  if (!auction) { res.status(404).json({ error: "Активный аукцион не найден" }); return; }
  if (new Date() < auction.endsAt) { res.status(400).json({ error: "Аукцион ещё не завершён" }); return; }

  await finalizeAuction(auction);
  res.json({ ok: true, winner: auction.buyerId });
});

// ── Shared finalize logic (manual + cron) ─────────────────────────────────────
async function finalizeAuction(auction: typeof auctionsTable.$inferSelect): Promise<void> {
  const id         = auction.id;
  const finalPrice = auction.currentBid ?? auction.startingPrice;
  const TAX_RATE   = 0.02;
  const tax        = parseFloat((finalPrice * TAX_RATE).toFixed(4));

  // Mark completed first (idempotency guard)
  const updated = await db
    .update(auctionsTable)
    .set({ status: "completed" })
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .returning({ id: auctionsTable.id });
  if (!updated.length) return; // already finalized

  if (auction.assetType === "HISTORICAL_SLOT" && auction.slotId !== null) {
    await finalizeSlotAuction(auction, finalPrice, tax);
  } else {
    await finalizeDarminAuction(auction, finalPrice, tax);
  }
}

async function finalizeDarminAuction(
  auction: typeof auctionsTable.$inferSelect,
  finalPrice: number,
  tax: number,
): Promise<void> {
  const id = auction.id;

  if (auction.buyerId) {
    await db.transaction(async (tx) => {
      // Give Darmins to winner
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${auction.amountDarmins}` })
        .where(eq(citizensTable.id, auction.buyerId!));

      // Credit seller net (finalPrice − 2% tax)
      const netSeller = parseFloat((finalPrice - tax).toFixed(4));
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${netSeller}` })
        .where(eq(citizensTable.id, auction.sellerId));

      // 2% to Treasury
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${tax}` })
        .where(eq(citizensTable.id, TREASURY_CITIZEN_ID));

      await tx.insert(auctionLogsTable).values({
        auctionId:  id,
        buyerId:    auction.buyerId!,
        sellerId:   auction.sellerId,
        finalPrice,
        tax2pct:    tax,
      });

      await tx.insert(stateTaxLogsTable).values({
        sourceType:    "AUCTION_TAX",
        amount:        tax,
        fromCitizenId: auction.sellerId,
        referenceId:   id,
      });
    });

    // Notify admin — fire-and-forget
    const [seller] = await db.select({ name: citizensTable.name }).from(citizensTable).where(eq(citizensTable.id, auction.sellerId)).limit(1);
    void notifyTaxCollected({ amount: tax, sourceType: "AUCTION_TAX", fromCitizenName: seller?.name ?? `ID ${auction.sellerId}`, referenceId: id });
    logger.info({ auctionId: id, finalPrice, tax }, "Darmin auction finalized (winner)");
  } else {
    // No bids — refund locked Darmins to seller
    await db.update(citizensTable)
      .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${auction.amountDarmins}` })
      .where(eq(citizensTable.id, auction.sellerId));
    logger.info({ auctionId: id }, "Darmin auction finalized (no bids, refunded)");
  }
}

async function finalizeSlotAuction(
  auction: typeof auctionsTable.$inferSelect,
  finalPrice: number,
  tax: number,
): Promise<void> {
  const id     = auction.id;
  const slotId = auction.slotId!;

  if (auction.buyerId) {
    await db.transaction(async (tx) => {
      // Transfer slot ownership to winner
      await tx.update(chronopediaSlotsTable)
        .set({ ownerCitizenId: auction.buyerId, isLocked: false })
        .where(eq(chronopediaSlotsTable.id, slotId));

      // Deduct bid amount from winner
      const netSeller = parseFloat((finalPrice - tax).toFixed(4));
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} - ${finalPrice}` })
        .where(eq(citizensTable.id, auction.buyerId!));

      // Credit seller net
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${netSeller}` })
        .where(eq(citizensTable.id, auction.sellerId));

      // 2% to Treasury
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + ${tax}` })
        .where(eq(citizensTable.id, TREASURY_CITIZEN_ID));

      await tx.insert(auctionLogsTable).values({
        auctionId:  id,
        buyerId:    auction.buyerId!,
        sellerId:   auction.sellerId,
        finalPrice,
        tax2pct:    tax,
      });

      await tx.insert(stateTaxLogsTable).values({
        sourceType:    "AUCTION_TAX",
        amount:        tax,
        fromCitizenId: auction.sellerId,
        referenceId:   id,
      });
    });

    const [seller] = await db.select({ name: citizensTable.name }).from(citizensTable).where(eq(citizensTable.id, auction.sellerId)).limit(1);
    void notifyTaxCollected({ amount: tax, sourceType: "AUCTION_TAX", fromCitizenName: seller?.name ?? `ID ${auction.sellerId}`, referenceId: id });
    logger.info({ auctionId: id, slotId, finalPrice, tax }, "Slot auction finalized (sold)");
  } else {
    // No bids — just unlock the slot
    await db.update(chronopediaSlotsTable)
      .set({ isLocked: false })
      .where(eq(chronopediaSlotsTable.id, slotId));
    logger.info({ auctionId: id, slotId }, "Slot auction finalized (no bids, unlocked)");
  }
}

// ── Background: auto-finalize all expired active auctions ─────────────────────
export async function finalizeExpiredAuctions(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(auctionsTable)
    .where(and(eq(auctionsTable.status, "active"), sql`${auctionsTable.endsAt} <= ${now.toISOString()}`));

  for (const auction of expired) {
    try {
      await finalizeAuction(auction);
    } catch (err) {
      logger.error({ err, auctionId: auction.id }, "Failed to auto-finalize auction");
    }
  }
}

export default router;
