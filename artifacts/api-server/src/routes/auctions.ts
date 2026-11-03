import { Router, type IRouter } from "express";
import { db, souvenirDarminsTable } from "@workspace/db";
import { auctionsTable, auctionLogsTable, citizensTable, chronopediaSlotsTable, stateTaxLogsTable, timelineAnchorsTable, timelineCapsulesTable, referralBonusLedgerTable } from "@workspace/db";
import { eq, and, sql, inArray, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { Contract, JsonRpcProvider, Wallet, isAddress } from "ethers";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import { notifyTaxCollected, notifyUserConditional } from "../services/telegramService";
import { getOnlineCitizenIds, pushToCitizen } from "../services/socialAlarmWs";
import { TREASURY_CITIZEN_ID } from "../services/videoStorage";
import { isCenturyBoundaryMinute, CENTURY_STATE_PROPERTY_CODE, CENTURY_STATE_PROPERTY_MSG } from "../lib/centuryGuard";
import { isStateHeritageCoord, HERITAGE_LOCK_CODE, HERITAGE_LOCK_TITLE, HERITAGE_LOCK_MSG } from "../lib/heritageGuard";

const router: IRouter = Router();
const SOUVENIR_NFT_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId)",
];

function getEscrowContract() {
  const address = process.env.TIMENAMING_CONTRACT_ADDRESS;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
  if (!address || !isAddress(address) || !rpcUrl || !privateKey) {
    throw new Error("Sepolia escrow is not configured");
  }
  const provider = new JsonRpcProvider(rpcUrl, 11155111);
  const signer = new Wallet(privateKey, provider);
  return { signer, contract: new Contract(address, SOUVENIR_NFT_ABI, signer) };
}

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

const CreateAnchorAuctionBody = z.object({
  assetType:      z.literal("TIME_ANCHOR"),
  timelineCoord:  z.string().regex(/^\d{12}$/, "timelineCoord must be 12 digits: YYYYMMDDHHmm"),
  startingPrice:  z.number().positive(),
  durationHours:  z.number().int().min(1).max(168).default(24),
});

const CreateAuctionBody = z.union([CreateDarminAuctionBody, CreateSlotAuctionBody, CreateAnchorAuctionBody]);

// ── GET /api/auctions ──────────────────────────────────────────────────────────
router.get("/auctions", async (_req, res): Promise<void> => {
  const auctions = await db
    .select({
      id:              auctionsTable.id,
      sellerId:        auctionsTable.sellerId,
      sellerName:      citizensTable.name,
      assetType:       auctionsTable.assetType,
      amountDarmins:   auctionsTable.amountDarmins,
      slotId:          auctionsTable.slotId,
      slotLocation:    chronopediaSlotsTable.locationName,
      slotTimeMarker:  chronopediaSlotsTable.timeMarker,
      timelineCoord:   auctionsTable.timelineCoord,
      souvenirSerialNumber: auctionsTable.souvenirSerialNumber,
      nftTransferTxHash: auctionsTable.nftTransferTxHash,
      startingPrice:   auctionsTable.startingPrice,
      currentBid:      auctionsTable.currentBid,
      buyerId:         auctionsTable.buyerId,
      status:          auctionsTable.status,
      endsAt:          auctionsTable.endsAt,
      createdAt:       auctionsTable.createdAt,
    })
    .from(auctionsTable)
    .leftJoin(citizensTable, eq(auctionsTable.sellerId, citizensTable.id))
    .leftJoin(chronopediaSlotsTable, eq(auctionsTable.slotId, chronopediaSlotsTable.id))
    .where(eq(auctionsTable.status, "active"));

  // Attach capsule text for TIME_ANCHOR lots
  const anchorCoords = auctions
    .filter(a => a.assetType === "TIME_ANCHOR" && a.timelineCoord)
    .map(a => a.timelineCoord as string);

  const capsuleMap = new Map<string, { text: string; mediaUrl: string | null; mediaType: string | null }>();
  if (anchorCoords.length > 0) {
    const capsules = await db
      .select({
        timelineCoord: timelineCapsulesTable.timelineCoord,
        text: timelineCapsulesTable.text,
        mediaUrl: timelineCapsulesTable.mediaUrl,
        mediaType: timelineCapsulesTable.mediaType,
      })
      .from(timelineCapsulesTable)
      .where(inArray(timelineCapsulesTable.timelineCoord, anchorCoords));
    for (const cap of capsules) capsuleMap.set(cap.timelineCoord, { text: cap.text, mediaUrl: cap.mediaUrl, mediaType: cap.mediaType });
  }

  const result = auctions.map(a => ({
    ...a,
    capsuleText: a.timelineCoord ? (capsuleMap.get(a.timelineCoord)?.text ?? null) : null,
    mediaUrl: a.timelineCoord ? (capsuleMap.get(a.timelineCoord)?.mediaUrl ?? null) : null,
    mediaType: a.timelineCoord ? (capsuleMap.get(a.timelineCoord)?.mediaType ?? null) : null,
  }));

  res.json(result);
});

router.get("/auctions/souvenir-darmin/:serialNumber/escrow", requireAuth, async (req, res): Promise<void> => {
  const serialNumber = Number(req.params.serialNumber);
  if (!Number.isInteger(serialNumber)) { res.status(400).json({ error: "Некорректный номер банкноты." }); return; }
  const [note] = await db.select().from(souvenirDarminsTable).where(and(
    eq(souvenirDarminsTable.serialNumber, serialNumber),
    eq(souvenirDarminsTable.citizenId, req.citizen!.id),
  )).limit(1);
  if (!note || note.status !== "NFT_MINTED" || !note.nftTokenId || !note.nftRecipient) {
    res.status(409).json({ error: "Для размещения нужен выпущенный NFT, которым вы владеете." });
    return;
  }
  try {
    const { signer, contract } = getEscrowContract();
    const owner = await contract.ownerOf(BigInt(note.nftTokenId)) as string;
    const escrowAddress = await signer.getAddress();
    if (owner.toLowerCase() !== note.nftRecipient.toLowerCase() && owner.toLowerCase() !== escrowAddress.toLowerCase()) {
      res.status(409).json({ error: "NFT сейчас не находится в исходном кошельке владельца." });
      return;
    }
    res.json({
      escrowAddress,
      contractAddress: process.env.TIMENAMING_CONTRACT_ADDRESS,
      tokenId: note.nftTokenId,
      serialNumber,
      network: "Sepolia",
      alreadyEscrowed: owner.toLowerCase() === escrowAddress.toLowerCase(),
      instruction: "Переведите этот ERC-721 в escrow-кошелёк, дождитесь подтверждения и затем подтвердите размещение.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not prepare souvenir NFT escrow");
    res.status(503).json({ error: "Escrow временно недоступен." });
  }
});

router.post("/auctions/souvenir-darmin/:serialNumber/return", requireAuth, async (req, res): Promise<void> => {
  const serialNumber = Number(req.params.serialNumber);
  const [note] = await db.select().from(souvenirDarminsTable).where(and(
    eq(souvenirDarminsTable.serialNumber, serialNumber),
    eq(souvenirDarminsTable.citizenId, req.citizen!.id),
  )).limit(1);
  if (!note?.nftTokenId || !note.nftRecipient) { res.status(404).json({ error: "NFT банкноты не найден." }); return; }
  try {
    const [pendingAuction] = await db.select().from(auctionsTable).where(and(
      eq(auctionsTable.assetType, "SOUVENIR_NFT"),
      eq(auctionsTable.souvenirSerialNumber, serialNumber),
      inArray(auctionsTable.status, ["NFT_DELIVERY_PENDING", "NFT_RETURN_PENDING"]),
    )).limit(1);
    if (pendingAuction?.status === "NFT_DELIVERY_PENDING") {
      res.status(409).json({ error: "Оплата уже проведена; передача NFT победителю выполняется повторно." });
      return;
    }
    if (pendingAuction?.status === "NFT_RETURN_PENDING") {
      await finalizeSouvenirNftAuction(pendingAuction);
      res.json({ ok: true, serialNumber });
      return;
    }
    const [activeAuction] = await db.select().from(auctionsTable).where(and(
      eq(auctionsTable.assetType, "SOUVENIR_NFT"),
      eq(auctionsTable.souvenirSerialNumber, serialNumber),
      eq(auctionsTable.status, "active"),
    )).limit(1);
    if (activeAuction) {
      if (activeAuction.sellerId !== req.citizen!.id) { res.status(403).json({ error: "Вы не владелец лота." }); return; }
      if (activeAuction.buyerId || activeAuction.currentBid !== null) {
        res.status(409).json({ error: "После первой ставки аукцион нельзя отменить." });
        return;
      }
      const [claimed] = await db.update(auctionsTable).set({ status: "NFT_RETURN_PENDING" })
        .where(and(
          eq(auctionsTable.id, activeAuction.id),
          eq(auctionsTable.status, "active"),
          isNull(auctionsTable.buyerId),
          isNull(auctionsTable.currentBid),
        )).returning({ id: auctionsTable.id });
      if (!claimed) { res.status(409).json({ error: "На аукционе уже появилась ставка." }); return; }
      const [pending] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, activeAuction.id)).limit(1);
      if (pending) await finalizeSouvenirNftAuction(pending);
    } else {
      const { signer, contract } = getEscrowContract();
      const escrow = await signer.getAddress();
      const owner = await contract.ownerOf(BigInt(note.nftTokenId)) as string;
      if (owner.toLowerCase() === escrow.toLowerCase()) {
        const tx = await contract.transferFrom(escrow, note.nftRecipient, BigInt(note.nftTokenId));
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("NFT return transfer failed");
      } else if (owner.toLowerCase() !== note.nftRecipient.toLowerCase()) {
        res.status(409).json({ error: "Escrow не владеет этим NFT." });
        return;
      }
      await db.update(souvenirDarminsTable).set({ status: "NFT_MINTED" })
        .where(eq(souvenirDarminsTable.serialNumber, serialNumber));
    }
    res.json({ ok: true, serialNumber });
  } catch (error) {
    req.log.error({ err: error, serialNumber }, "Souvenir NFT escrow return failed");
    res.status(503).json({ error: "Не удалось вернуть NFT. Он останется в escrow, пока операция не будет повторена." });
  }
});

router.post("/auctions/souvenir-darmin", requireAuth, async (req, res): Promise<void> => {
  const schema = z.object({
    serialNumber: z.number().int().positive(),
    startingPrice: z.number().positive().finite(),
    durationHours: z.number().int().min(1).max(168).default(24),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Укажите банкноту, стартовую цену и срок аукциона." }); return; }
  const { serialNumber, startingPrice, durationHours } = parsed.data;
  const [note] = await db.select().from(souvenirDarminsTable).where(and(
    eq(souvenirDarminsTable.serialNumber, serialNumber),
    eq(souvenirDarminsTable.citizenId, req.citizen!.id),
  )).limit(1);
  if (!note || note.status !== "NFT_MINTED" || !note.nftTokenId) {
    res.status(409).json({ error: "Эта банкнота не готова к размещению." });
    return;
  }
  try {
    const { signer, contract } = getEscrowContract();
    const escrowAddress = await signer.getAddress();
    const currentOwner = await contract.ownerOf(BigInt(note.nftTokenId)) as string;
    if (currentOwner.toLowerCase() !== escrowAddress.toLowerCase()) {
      res.status(409).json({ error: `Сначала переведите NFT в escrow: ${escrowAddress}` });
      return;
    }
    const auction = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(souvenirDarminsTable)
        .set({ status: "AUCTION_LISTED" })
        .where(and(
          eq(souvenirDarminsTable.serialNumber, serialNumber),
          eq(souvenirDarminsTable.citizenId, req.citizen!.id),
          eq(souvenirDarminsTable.status, "NFT_MINTED"),
        )).returning({ serialNumber: souvenirDarminsTable.serialNumber });
      if (!claimed) throw new Error("NFT_ALREADY_LISTED");
      const [created] = await tx.insert(auctionsTable).values({
        sellerId: req.citizen!.id,
        assetType: "SOUVENIR_NFT",
        amountDarmins: 0,
        souvenirSerialNumber: serialNumber,
        startingPrice,
        status: "active",
        endsAt: new Date(Date.now() + durationHours * 3_600_000),
      }).returning();
      return created!;
    });
    res.status(201).json(auction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NFT_ALREADY_LISTED") { res.status(409).json({ error: "Банкнота уже размещена на аукционе." }); return; }
    req.log.error({ err: error, serialNumber }, "Souvenir NFT auction listing failed");
    res.status(503).json({ error: "Не удалось разместить NFT. Проверьте escrow и повторите попытку." });
  }
});

// ── POST /api/auctions ─────────────────────────────────────────────────────────
router.post("/auctions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAuctionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные аукциона" }); return; }

  const seller   = req.citizen!;
  const sellerId = seller.id;
  const endsAt   = new Date(Date.now() + parsed.data.durationHours * 3_600_000);

  // 🏛️ Century boundary guard (TIME_ANCHOR only — DARMIN/SLOT don't have a coord)
  if (parsed.data.assetType === "TIME_ANCHOR") {
    if (isCenturyBoundaryMinute(parsed.data.timelineCoord)) {
      res.status(403).json({ code: CENTURY_STATE_PROPERTY_CODE, error: CENTURY_STATE_PROPERTY_MSG });
      return;
    }
    const heritage = await isStateHeritageCoord(parsed.data.timelineCoord);
    if (heritage) {
      res.status(403).json({ code: HERITAGE_LOCK_CODE, title: HERITAGE_LOCK_TITLE, eventName: heritage.title, error: HERITAGE_LOCK_MSG });
      return;
    }
  }

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
  if (parsed.data.assetType !== "HISTORICAL_SLOT") {
    // TIME_ANCHOR is handled via POST /api/auctions/anchor
    res.status(400).json({ error: "Неизвестный тип лота. Для временных координат используйте /api/auctions/anchor" });
    return;
  }
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

  return; // explicit return after slot branch ends
});

// ── POST /api/auctions (TIME_ANCHOR — inline continuation) ─────────────────────
// This is handled in the same requireAuth router above via the union type dispatch.
// The TIME_ANCHOR branch below is appended to the same route handler via a 2nd router call
// so we use a separate helper to keep things tidy.
router.post("/auctions/anchor", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAnchorAuctionBody.safeParse({ ...req.body, assetType: "TIME_ANCHOR" });
  if (!parsed.success) { res.status(400).json({ error: "Некорректные данные для временного аукциона" }); return; }

  const seller         = req.citizen!;
  const sellerId       = seller.id;
  const { timelineCoord, startingPrice, durationHours } = parsed.data;
  const endsAt         = new Date(Date.now() + durationHours * 3_600_000);

  if (isCenturyBoundaryMinute(timelineCoord)) {
    res.status(403).json({ code: CENTURY_STATE_PROPERTY_CODE, error: CENTURY_STATE_PROPERTY_MSG });
    return;
  }
  const heritageAnchor = await isStateHeritageCoord(timelineCoord);
  if (heritageAnchor) {
    res.status(403).json({ code: HERITAGE_LOCK_CODE, title: HERITAGE_LOCK_TITLE, eventName: heritageAnchor.title, error: HERITAGE_LOCK_MSG });
    return;
  }

  // Verify ownership
  const [anchor] = await db
    .select()
    .from(timelineAnchorsTable)
    .where(and(eq(timelineAnchorsTable.timelineCoord, timelineCoord), eq(timelineAnchorsTable.citizenId, sellerId)))
    .limit(1);

  if (!anchor) {
    res.status(403).json({ error: "Эта временная координата вам не принадлежит" });
    return;
  }
  if (anchor.status === "on_auction") {
    res.status(409).json({ error: "Эта координата уже выставлена на аукцион" });
    return;
  }

  // Check no other active auction for this coord
  const [existingAuction] = await db
    .select({ id: auctionsTable.id })
    .from(auctionsTable)
    .where(and(eq(auctionsTable.timelineCoord, timelineCoord), eq(auctionsTable.status, "active")))
    .limit(1);
  if (existingAuction) {
    res.status(409).json({ error: "Для этой координаты уже существует активный аукцион" });
    return;
  }

  // Atomic: lock anchor + create auction
  let auction: typeof auctionsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    await tx.update(timelineAnchorsTable)
      .set({ status: "on_auction" })
      .where(eq(timelineAnchorsTable.id, anchor.id));

    const [inserted] = await tx.insert(auctionsTable)
      .values({ sellerId, assetType: "TIME_ANCHOR", amountDarmins: 0, timelineCoord, startingPrice, status: "active", endsAt })
      .returning();
    auction = inserted;
  });

  req.log.info({ sellerId, timelineCoord, auctionId: auction!.id }, "Time anchor auction created");
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
  if (auction.assetType === "SOUVENIR_NFT" && (!buyer.walletAddress || !isAddress(buyer.walletAddress))) {
    res.status(400).json({ error: "Для ставки на NFT сначала привяжите EVM-кошелёк." });
    return;
  }

  const minBid = auction.currentBid ?? auction.startingPrice;
  if (bid <= minBid) {
    res.status(400).json({ error: `Ставка должна быть выше текущей (${minBid.toFixed(2)} Д)` });
    return;
  }

  // Balance check — buyer must keep ≥ 1 Д (Ancestral Minute)
  const bidBonusAvailable = auction.assetType === "DARMIN_CURRENCY" ? 0 : buyer.referralBonusMinutes;
  if (buyer.balanceMinutes - 1 + bidBonusAvailable < bid) {
    res.status(400).json({ error: `Недостаточно средств. Доступно: ${(Math.max(0, buyer.balanceMinutes - 1) + bidBonusAvailable).toFixed(2)} Д` });
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

  // Notify previous bidder they were outbid
  const prevBuyerId = auction.buyerId;
  if (prevBuyerId && prevBuyerId !== buyerId) {
    void notifyUserConditional(
      prevBuyerId,
      `🔔 *Вашу ставку перебили на аукционе #${id}!*\n💰 Новая ставка: ${bid.toFixed(2)} Д\n📦 _${auction.assetType}_\n\nСделайте новую ставку, пока аукцион не завершился.`,
      "dm"
    );
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

  if (auction.assetType === "SOUVENIR_NFT") {
    await finalizeSouvenirNftAuction(auction);
    return;
  }

  // Mark completed first (idempotency guard)
  const updated = await db
    .update(auctionsTable)
    .set({ status: "completed" })
    .where(and(eq(auctionsTable.id, id), eq(auctionsTable.status, "active")))
    .returning({ id: auctionsTable.id });
  if (!updated.length) return; // already finalized

  if (auction.assetType === "HISTORICAL_SLOT" && auction.slotId !== null) {
    await finalizeSlotAuction(auction, finalPrice, tax);
  } else if (auction.assetType === "TIME_ANCHOR" && auction.timelineCoord !== null) {
    await finalizeAnchorAuction(auction, finalPrice, tax);
  } else {
    await finalizeDarminAuction(auction, finalPrice, tax);
  }

  // ── Telegram notifications for buyer and seller ──────────────────────────
  if (auction.buyerId) {
    void notifyUserConditional(
      auction.buyerId,
      `🏆 *Аукцион #${id} завершён — вы победили!*\n💰 Финальная цена: ${finalPrice.toFixed(2)} Д\n📦 Тип лота: ${auction.assetType}`,
      "dm"
    );
    void notifyUserConditional(
      auction.sellerId,
      `✅ *Аукцион #${id} завершён — лот продан!*\n💰 Цена продажи: ${finalPrice.toFixed(2)} Д\n💎 Выручка: ${(finalPrice - tax).toFixed(2)} Д (−2% налог)`,
      "dm"
    );
  } else {
    // No bids — notify seller of refund
    void notifyUserConditional(
      auction.sellerId,
      `📦 *Аукцион #${id} завершён без ставок*\n🔄 Лот возвращён вам без изменений`,
      "dm"
    );
  }
}

async function finalizeSouvenirNftAuction(auction: typeof auctionsTable.$inferSelect): Promise<void> {
  const serialNumber = auction.souvenirSerialNumber;
  if (!serialNumber) throw new Error("Souvenir auction has no serial number");

  const [note] = await db.select().from(souvenirDarminsTable)
    .where(eq(souvenirDarminsTable.serialNumber, serialNumber)).limit(1);
  if (!note?.nftTokenId || !note.nftRecipient) throw new Error("Souvenir NFT metadata is missing");

  if (auction.status === "active") {
    await db.transaction(async (tx) => {
      const [lockedAuction] = await tx.select().from(auctionsTable)
        .where(eq(auctionsTable.id, auction.id)).for("update").limit(1);
      if (!lockedAuction || lockedAuction.status !== "active") return;
      if (!lockedAuction.buyerId) {
        await tx.update(auctionsTable).set({ status: "NFT_RETURN_PENDING" })
          .where(eq(auctionsTable.id, auction.id));
        return;
      }

      const [buyer] = await tx.select({
        balance: citizensTable.balanceMinutes,
        bonus: citizensTable.referralBonusMinutes,
        walletAddress: citizensTable.walletAddress,
      }).from(citizensTable).where(eq(citizensTable.id, lockedAuction.buyerId)).for("update").limit(1);
      const finalPrice = lockedAuction.currentBid ?? lockedAuction.startingPrice;
      const tax = finalPrice * 0.02;
      if (!buyer || !buyer.walletAddress || !isAddress(buyer.walletAddress)) {
        await tx.update(auctionsTable).set({ status: "NFT_RETURN_PENDING", buyerId: null })
          .where(eq(auctionsTable.id, auction.id));
        return;
      }
      const bonusPaid = Math.min(finalPrice, buyer.bonus);
      const regularPaid = finalPrice - bonusPaid;
      if (buyer.balance - regularPaid < 1) {
        await tx.update(auctionsTable).set({ status: "NFT_RETURN_PENDING", buyerId: null })
          .where(eq(auctionsTable.id, auction.id));
        return;
      }
      const bonusTax = Math.min(tax, bonusPaid * 0.02);
      const regularTax = tax - bonusTax;
      const bonusNet = bonusPaid - bonusTax;
      const regularNet = regularPaid - regularTax;
      await tx.update(citizensTable).set({
        balanceMinutes: sql`${citizensTable.balanceMinutes} - ${regularPaid}`,
        referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} - ${bonusPaid}`,
      }).where(eq(citizensTable.id, lockedAuction.buyerId));
      await tx.update(citizensTable).set({
        balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularNet}`,
        referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusNet}`,
      }).where(eq(citizensTable.id, lockedAuction.sellerId));
      await tx.update(citizensTable).set({
        balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularTax}`,
        referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusTax}`,
      }).where(eq(citizensTable.id, TREASURY_CITIZEN_ID));
      if (bonusPaid > 0) {
        await tx.insert(referralBonusLedgerTable).values([
          { citizenId: lockedAuction.buyerId, relatedCitizenId: lockedAuction.sellerId, type: "spent", amount: bonusPaid, note: `NFT сувенирного Дармина на аукционе #${auction.id}` },
          { citizenId: lockedAuction.sellerId, relatedCitizenId: lockedAuction.buyerId, type: "received", amount: bonusNet, note: `Оплата NFT на аукционе #${auction.id}` },
          ...(bonusTax > 0 ? [{ citizenId: TREASURY_CITIZEN_ID, relatedCitizenId: lockedAuction.buyerId, type: "received", amount: bonusTax, note: `Налог с NFT-аукциона #${auction.id}` }] : []),
        ]);
      }
      await tx.insert(auctionLogsTable).values({
        auctionId: auction.id,
        buyerId: lockedAuction.buyerId,
        sellerId: lockedAuction.sellerId,
        finalPrice,
        tax2pct: tax,
      });
      await tx.insert(stateTaxLogsTable).values({
        sourceType: "AUCTION_TAX",
        amount: tax,
        fromCitizenId: lockedAuction.sellerId,
        referenceId: auction.id,
      });
      await tx.update(auctionsTable).set({
        status: "NFT_DELIVERY_PENDING",
        nftRecipientAddress: buyer.walletAddress,
      }).where(eq(auctionsTable.id, auction.id));
    });
  }

  const [current] = await db.select().from(auctionsTable)
    .where(eq(auctionsTable.id, auction.id)).limit(1);
  if (!current || !["NFT_RETURN_PENDING", "NFT_DELIVERY_PENDING"].includes(current.status)) return;

  const destination = current.status === "NFT_RETURN_PENDING"
    ? note.nftRecipient
    : current.nftRecipientAddress;
  if (!destination || !isAddress(destination)) throw new Error("Souvenir NFT destination wallet is invalid");
  const { signer, contract } = getEscrowContract();
  const escrow = await signer.getAddress();
  const tokenId = BigInt(note.nftTokenId);
  const owner = await contract.ownerOf(tokenId) as string;
  let transferHash: string | null = null;
  if (owner.toLowerCase() !== destination.toLowerCase()) {
    if (owner.toLowerCase() !== escrow.toLowerCase()) {
      throw new Error(`Escrow no longer owns souvenir NFT ${tokenId}`);
    }
    const tx = await contract.transferFrom(escrow, destination, tokenId);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Souvenir NFT transfer transaction failed");
    transferHash = tx.hash as string;
  }

  const returned = current.status === "NFT_RETURN_PENDING";
  await db.transaction(async (tx) => {
    await tx.update(auctionsTable).set({
      status: "completed",
      ...(transferHash ? { nftTransferTxHash: transferHash } : {}),
    }).where(and(
      eq(auctionsTable.id, auction.id),
      eq(auctionsTable.status, current.status),
    ));
    await tx.update(souvenirDarminsTable).set({
      status: returned ? "NFT_MINTED" : "NFT_SOLD",
      ...(returned ? {} : { nftRecipient: destination }),
      ...(transferHash ? { nftTransactionHash: transferHash } : {}),
    }).where(eq(souvenirDarminsTable.serialNumber, serialNumber));
  });
  if (!returned) {
    void notifyUserConditional(current.sellerId, `NFT сувенирного Дармина DM ${String(serialNumber).padStart(9, "0")} продан на аукционе #${auction.id}.`, "dm");
    if (current.buyerId) void notifyUserConditional(current.buyerId, `NFT сувенирного Дармина DM ${String(serialNumber).padStart(9, "0")} передан в ваш кошелёк.`, "dm");
  }
  logger.info({ auctionId: auction.id, serialNumber, returned, transferHash }, "Souvenir NFT auction settled");
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

      const [buyerFunds] = await tx.select({
        balance: citizensTable.balanceMinutes,
        bonus: citizensTable.referralBonusMinutes,
      }).from(citizensTable).where(eq(citizensTable.id, auction.buyerId!)).for("update").limit(1);
      if (!buyerFunds) throw new Error("Auction buyer no longer exists");
      const bonusPaid = Math.min(finalPrice, buyerFunds.bonus);
      const regularPaid = finalPrice - bonusPaid;
      const bonusTax = Math.min(tax, parseFloat((bonusPaid * 0.02).toFixed(4)));
      const regularTax = tax - bonusTax;
      if (buyerFunds.balance - regularPaid < 1) throw new Error("Недостаточно обычных DarMin для завершения аукциона");
      const bonusNet = bonusPaid - bonusTax;
      const regularNet = regularPaid - regularTax;
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} - ${regularPaid}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} - ${bonusPaid}`,
        })
        .where(eq(citizensTable.id, auction.buyerId!));

      // Keep the paid bonus restricted when the seller receives it.
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularNet}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusNet}`,
        })
        .where(eq(citizensTable.id, auction.sellerId));

      // 2% to Treasury
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularTax}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusTax}`,
        })
        .where(eq(citizensTable.id, TREASURY_CITIZEN_ID));
      if (bonusPaid > 0) {
        await tx.insert(referralBonusLedgerTable).values([
          { citizenId: auction.buyerId!, relatedCitizenId: auction.sellerId, type: "spent", amount: bonusPaid, note: `Оплата внутреннего аукциона #${id}` },
          { citizenId: auction.sellerId, relatedCitizenId: auction.buyerId!, type: "received", amount: bonusNet, note: `Бонусная часть оплаты аукциона #${id}` },
          ...(bonusTax > 0 ? [{ citizenId: TREASURY_CITIZEN_ID, relatedCitizenId: auction.buyerId!, type: "received", amount: bonusTax, note: `Бонусный налог с аукциона #${id}` }] : []),
        ]);
      }

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

async function finalizeAnchorAuction(
  auction: typeof auctionsTable.$inferSelect,
  finalPrice: number,
  tax: number,
): Promise<void> {
  const id    = auction.id;
  const coord = auction.timelineCoord!;

  // Find anchor by coord (owner may have changed, use coord as key)
  const [anchor] = await db
    .select({ id: timelineAnchorsTable.id, citizenId: timelineAnchorsTable.citizenId })
    .from(timelineAnchorsTable)
    .where(eq(timelineAnchorsTable.timelineCoord, coord))
    .limit(1);

  if (auction.buyerId && anchor) {
    await db.transaction(async (tx) => {
      // Transfer ownership of the anchor to the winner
      await tx.update(timelineAnchorsTable)
        .set({ citizenId: auction.buyerId!, status: "active" })
        .where(eq(timelineAnchorsTable.id, anchor.id));

      const [buyerFunds] = await tx.select({
        balance: citizensTable.balanceMinutes,
        bonus: citizensTable.referralBonusMinutes,
      }).from(citizensTable).where(eq(citizensTable.id, auction.buyerId!)).for("update").limit(1);
      if (!buyerFunds) throw new Error("Auction buyer no longer exists");
      const bonusPaid = Math.min(finalPrice, buyerFunds.bonus);
      const regularPaid = finalPrice - bonusPaid;
      const bonusTax = Math.min(tax, parseFloat((bonusPaid * 0.02).toFixed(4)));
      const regularTax = tax - bonusTax;
      if (buyerFunds.balance - regularPaid < 1) throw new Error("Недостаточно обычных DarMin для завершения аукциона");
      const bonusNet = bonusPaid - bonusTax;
      const regularNet = regularPaid - regularTax;
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} - ${regularPaid}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} - ${bonusPaid}`,
        })
        .where(eq(citizensTable.id, auction.buyerId!));

      // Credit seller net (finalPrice − 2% tax)
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularNet}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusNet}`,
        })
        .where(eq(citizensTable.id, auction.sellerId));

      // 2% to Treasury
      await tx.update(citizensTable)
        .set({
          balanceMinutes: sql`${citizensTable.balanceMinutes} + ${regularTax}`,
          referralBonusMinutes: sql`${citizensTable.referralBonusMinutes} + ${bonusTax}`,
        })
        .where(eq(citizensTable.id, TREASURY_CITIZEN_ID));
      if (bonusPaid > 0) {
        await tx.insert(referralBonusLedgerTable).values([
          { citizenId: auction.buyerId!, relatedCitizenId: auction.sellerId, type: "spent", amount: bonusPaid, note: `Оплата временной координаты на аукционе #${id}` },
          { citizenId: auction.sellerId, relatedCitizenId: auction.buyerId!, type: "received", amount: bonusNet, note: `Бонусная часть оплаты аукциона #${id}` },
          ...(bonusTax > 0 ? [{ citizenId: TREASURY_CITIZEN_ID, relatedCitizenId: auction.buyerId!, type: "received", amount: bonusTax, note: `Бонусный налог с аукциона #${id}` }] : []),
        ]);
      }

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
    logger.info({ auctionId: id, coord, finalPrice, tax }, "Anchor auction finalized (sold)");
  } else {
    // No bids — just unlock the anchor
    if (anchor) {
      await db.update(timelineAnchorsTable)
        .set({ status: "active" })
        .where(eq(timelineAnchorsTable.id, anchor.id));
    }
    logger.info({ auctionId: id, coord }, "Anchor auction finalized (no bids, unlocked)");
  }
}

// ── Background: auto-finalize all expired active auctions ─────────────────────
export async function finalizeExpiredAuctions(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(auctionsTable)
    .where(or(
      and(eq(auctionsTable.status, "active"), sql`${auctionsTable.endsAt} <= ${now.toISOString()}`),
      inArray(auctionsTable.status, ["NFT_DELIVERY_PENDING", "NFT_RETURN_PENDING"]),
    ));

  for (const auction of expired) {
    try {
      await finalizeAuction(auction);
    } catch (err) {
      logger.error({ err, auctionId: auction.id }, "Failed to auto-finalize auction");
    }
  }
}

export default router;
