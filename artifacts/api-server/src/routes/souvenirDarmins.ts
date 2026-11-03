import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Contract, isAddress, JsonRpcProvider, Wallet } from "ethers";
import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { db, citizensTable, souvenirDarminsTable, stateTaxLogsTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import { logSouvenirDarminToSheets } from "../lib/googleSheets";
import { sendDirectMessage } from "../services/telegramService";
import { TREASURY_CITIZEN_ID } from "../services/videoStorage";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const storage = new ObjectStorageService();
const GENESIS_IMAGE = "assets/souvenir-darmin-genesis.jpg";
const BASE_COST = 1;
const TAX_RATE = 0.02;
const NFT_ABI = [
  "function mintMinute(address to, uint256 minuteTimestamp, string uri) external",
];

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char]!);
}

function formatSerial(serial: number): string {
  return `DM ${String(serial).padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1 ")}`;
}

async function renderBanknote(serial: number, slogan: string, portrait: Buffer): Promise<Buffer> {
  const portraitPng = await sharp(portrait, { limitInputPixels: 20_000_000 })
    .rotate().resize(320, 320, { fit: "cover" }).png().toBuffer();
  const portraitData = portraitPng.toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs>
      <linearGradient id="paper" x2="1" y2="1"><stop stop-color="#07182e"/><stop offset=".48" stop-color="#17436b"/><stop offset="1" stop-color="#07172c"/></linearGradient>
      <linearGradient id="gold"><stop stop-color="#ffe6a2"/><stop offset=".5" stop-color="#c99d45"/><stop offset="1" stop-color="#fff0bd"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#3bb5e8" stop-opacity=".72"/><stop offset="1" stop-color="#142845" stop-opacity="0"/></radialGradient>
      <clipPath id="portrait"><circle cx="590" cy="354" r="178"/></clipPath>
    </defs>
    <rect width="1200" height="800" rx="24" fill="url(#paper)"/>
    <rect x="18" y="18" width="1164" height="764" rx="20" fill="none" stroke="url(#gold)" stroke-width="8"/>
    <rect x="34" y="34" width="1132" height="732" rx="14" fill="none" stroke="#8ec9e6" stroke-opacity=".6" stroke-width="2"/>
    <circle cx="590" cy="354" r="260" fill="url(#glow)"/>
    <g fill="none" stroke="#7bcbea" stroke-opacity=".42"><circle cx="590" cy="354" r="210" stroke-width="8"/><circle cx="590" cy="354" r="232" stroke-width="3"/><circle cx="590" cy="354" r="254" stroke-width="2"/></g>
    <image href="data:image/png;base64,${portraitData}" x="412" y="176" width="356" height="356" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)"/>
    <circle cx="590" cy="354" r="180" fill="none" stroke="url(#gold)" stroke-width="10"/>
    <text x="72" y="113" fill="url(#gold)" font-family="Georgia,serif" font-size="42" font-weight="bold">НАЦИЯ ВРЕМЕНИ | TIMENATION</text>
    <text x="75" y="176" fill="#f3d48b" font-family="Arial,sans-serif" font-size="72" font-weight="bold">1 DarMin</text>
    <text x="75" y="224" fill="#f6e9c4" font-family="Arial,sans-serif" font-size="26">1 Darmin: «Минута — Дар»</text>
    <text x="905" y="445" fill="url(#gold)" font-family="Georgia,serif" font-size="280" font-weight="bold">1</text>
    <rect x="42" y="641" width="1116" height="99" rx="10" fill="#061426" fill-opacity=".78" stroke="url(#gold)" stroke-width="3"/>
    <text x="78" y="701" fill="url(#gold)" font-family="monospace" font-size="42" font-weight="bold">${formatSerial(serial)}</text>
    <text x="600" y="687" text-anchor="middle" fill="#f9e6b4" font-family="Arial,sans-serif" font-size="27">${escapeXml(slogan)}</text>
    <text x="1095" y="713" text-anchor="end" fill="#83c7e8" font-family="Arial,sans-serif" font-size="18">TIME · CONSCIOUSNESS · HEALTH</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function privateObjectInfo(): { bucket: string; prefix: string } {
  const [bucket, ...prefix] = storage.getPrivateObjectDir().replace(/^\/+|\/+$/g, "").split("/");
  if (!bucket) throw new Error("Private object storage is not configured");
  return { bucket, prefix: prefix.join("/") };
}

async function saveBanknote(serial: number, png: Buffer): Promise<string> {
  const { bucket, prefix } = privateObjectInfo();
  const name = [prefix, "souvenir-darmins", `${serial}.png`].filter(Boolean).join("/");
  await objectStorageClient.bucket(bucket).file(name).save(png, {
    contentType: "image/png",
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  return name;
}

async function ensureGenesis(): Promise<void> {
  await db.insert(souvenirDarminsTable).values({
    serialNumber: 1,
    citizenId: null,
    slogan: "Минута — Дар",
    imagePath: GENESIS_IMAGE,
    status: "GENESIS",
    isGenesis: true,
  }).onConflictDoNothing();
}

router.get("/souvenir-darmins/me", requireAuth, async (req, res): Promise<void> => {
  await ensureGenesis();
  await ensureGenesis();
  const notes = await db.select({
    serialNumber: souvenirDarminsTable.serialNumber,
    slogan: souvenirDarminsTable.slogan,
    status: souvenirDarminsTable.status,
    nftTokenId: souvenirDarminsTable.nftTokenId,
    nftRecipient: souvenirDarminsTable.nftRecipient,
    nftTransactionHash: souvenirDarminsTable.nftTransactionHash,
    isGenesis: souvenirDarminsTable.isGenesis,
    createdAt: souvenirDarminsTable.createdAt,
  }).from(souvenirDarminsTable)
    .where(eq(souvenirDarminsTable.citizenId, req.citizen!.id))
    .orderBy(desc(souvenirDarminsTable.serialNumber));
  res.json(notes);
});

router.post("/souvenir-darmins", requireAuth, upload.single("portrait"), async (req, res): Promise<void> => {
  await ensureGenesis();
  const slogan = typeof req.body.slogan === "string" ? req.body.slogan.trim() : "";
  if (!req.file) { res.status(400).json({ error: "Добавьте портрет для банкноты." }); return; }
  if (!slogan || [...slogan].length > 80) { res.status(400).json({ error: "Слоган должен содержать от 1 до 80 символов." }); return; }
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected.mime)) {
    res.status(400).json({ error: "Поддерживаются JPEG, PNG и WebP." });
    return;
  }

  const fee = Number((BASE_COST * TAX_RATE).toFixed(2));
  const totalCost = BASE_COST + fee;
  let issued: typeof souvenirDarminsTable.$inferSelect;
  try {
    issued = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(74291031)`);
      const [citizen] = await tx.select({
        id: citizensTable.id,
        balance: citizensTable.balanceMinutes,
        paid: citizensTable.fiatDarminBalance,
      }).from(citizensTable).where(eq(citizensTable.id, req.citizen!.id)).for("update");
      if (!citizen || Number(citizen.paid) < totalCost || Number(citizen.balance) < totalCost) {
        throw new Error("INSUFFICIENT_PAID_DARMIN");
      }
      const [last] = await tx.select({
        value: sql<number>`COALESCE(MAX(${souvenirDarminsTable.serialNumber}), 1)`,
      }).from(souvenirDarminsTable);
      const serialNumber = Number(last?.value ?? 1) + 1;
      if (serialNumber > 999_999_999) throw new Error("SERIAL_LIMIT");
      const png = await renderBanknote(serialNumber, slogan, req.file!.buffer);
      const imagePath = await saveBanknote(serialNumber, png);
      const [note] = await tx.insert(souvenirDarminsTable).values({
        serialNumber,
        citizenId: citizen.id,
        slogan,
        imagePath,
      }).returning();
      await tx.update(citizensTable).set({
        balanceMinutes: sql`${citizensTable.balanceMinutes} - ${totalCost}`,
        fiatDarminBalance: sql`${citizensTable.fiatDarminBalance} - ${totalCost}`,
      }).where(eq(citizensTable.id, citizen.id));
      const [treasury] = await tx.update(citizensTable).set({
        balanceMinutes: sql`${citizensTable.balanceMinutes} + ${fee}`,
      }).where(eq(citizensTable.id, TREASURY_CITIZEN_ID)).returning({ id: citizensTable.id });
      if (!treasury) throw new Error("TREASURY_UNAVAILABLE");
      await tx.insert(stateTaxLogsTable).values({
        sourceType: "SOUVENIR_DARMIN_TAX",
        amount: fee,
        fromCitizenId: citizen.id,
        referenceId: serialNumber,
      });
      return note!;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INSUFFICIENT_PAID_DARMIN") {
      res.status(402).json({ error: "Для выпуска нужны 1.02 Д, купленные за фиатные деньги." });
      return;
    }
    if (message === "SERIAL_LIMIT") { res.status(409).json({ error: "Диапазон номеров сувенирных Дарминов исчерпан." }); return; }
    throw error;
  }

  const citizen = req.citizen!;
  const serial = formatSerial(issued.serialNumber);
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (adminId) void sendDirectMessage(adminId, `Выпущена сувенирная банкнота ${serial}; гражданин ${citizen.id}.`).catch((error) => req.log.warn({ error }, "Souvenir Telegram notification failed"));
  void logSouvenirDarminToSheets({
    serialNumber: issued.serialNumber,
    citizenId: citizen.id,
    citizenName: citizen.name,
    slogan,
    createdAt: issued.createdAt.toISOString(),
    status: issued.status,
  }).then((ok) => { if (!ok) req.log.warn({ serialNumber: issued.serialNumber }, "Souvenir Google Sheets sync failed"); });

  res.status(201).json({
    serialNumber: issued.serialNumber,
    formattedSerial: serial,
    slogan: issued.slogan,
    status: issued.status,
    createdAt: issued.createdAt,
    imageUrl: `/api/souvenir-darmins/${issued.serialNumber}/image`,
    baseCost: BASE_COST,
    treasuryFee: fee,
    totalCost,
  });
});

router.get("/souvenir-darmins/:serialNumber/image", requireAuth, async (req, res): Promise<void> => {
  const serialNumber = Number(req.params.serialNumber);
  const [note] = await db.select().from(souvenirDarminsTable)
    .where(eq(souvenirDarminsTable.serialNumber, serialNumber)).limit(1);
  if (!note) { res.status(404).json({ error: "Банкнота не найдена." }); return; }
  if (!note.isGenesis && note.citizenId !== req.citizen!.id && !req.citizen!.isAdmin) {
    res.status(403).json({ error: "Доступ к этой банкноте запрещён." });
    return;
  }
  if (note.isGenesis) {
    res.type("image/jpeg").sendFile(GENESIS_IMAGE, { root: process.cwd() });
    return;
  }
  const { bucket } = privateObjectInfo();
  const file = objectStorageClient.bucket(bucket).file(note.imagePath);
  const [exists] = await file.exists();
  if (!exists) { res.status(404).json({ error: "Файл банкноты недоступен." }); return; }
  res.type("image/png");
  file.createReadStream().pipe(res);
});

router.get("/admin/souvenir-darmins", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  await ensureGenesis();
  const records = await db.select({
    serialNumber: souvenirDarminsTable.serialNumber,
    citizenId: souvenirDarminsTable.citizenId,
    citizenName: citizensTable.name,
    slogan: souvenirDarminsTable.slogan,
    status: souvenirDarminsTable.status,
    nftTokenId: souvenirDarminsTable.nftTokenId,
    nftTransactionHash: souvenirDarminsTable.nftTransactionHash,
    createdAt: souvenirDarminsTable.createdAt,
  }).from(souvenirDarminsTable)
    .leftJoin(citizensTable, eq(souvenirDarminsTable.citizenId, citizensTable.id))
    .orderBy(souvenirDarminsTable.serialNumber);
  res.json(records);
});

router.post("/souvenir-darmins/:serialNumber/mint-nft", requireAuth, async (req, res): Promise<void> => {
  const serialNumber = Number(req.params.serialNumber);
  const recipient = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
  if (!Number.isInteger(serialNumber) || !isAddress(recipient)) {
    res.status(400).json({ error: "Укажите корректный номер банкноты и адрес кошелька Ethereum." });
    return;
  }
  if (!process.env.PINATA_JWT || !process.env.SEPOLIA_RPC_URL ||
      !process.env.SEPOLIA_RELAYER_PRIVATE_KEY || !process.env.TIMENAMING_CONTRACT_ADDRESS) {
    res.status(503).json({ error: "Выпуск NFT временно недоступен: не настроено хранилище или сеть Sepolia." });
    return;
  }

  const [note] = await db.select().from(souvenirDarminsTable).where(and(
    eq(souvenirDarminsTable.serialNumber, serialNumber),
    eq(souvenirDarminsTable.citizenId, req.citizen!.id),
  )).limit(1);
  if (!note) { res.status(404).json({ error: "Ваша сувенирная банкнота не найдена." }); return; }
  if (note.nftTokenId || note.status === "MINT_PENDING") {
    res.status(409).json({ error: "Для этой банкноты NFT уже выпущен или выпускается." });
    return;
  }

  const tokenId = 1_000_000_000 + serialNumber;
  const [claimed] = await db.update(souvenirDarminsTable)
    .set({ status: "MINT_PENDING" })
    .where(and(
      eq(souvenirDarminsTable.serialNumber, serialNumber),
      eq(souvenirDarminsTable.citizenId, req.citizen!.id),
      isNull(souvenirDarminsTable.nftTokenId),
      eq(souvenirDarminsTable.status, "ISSUED"),
    ))
    .returning();
  if (!claimed) { res.status(409).json({ error: "Банкнота уже участвует в операции." }); return; }

  try {
    const { bucket } = privateObjectInfo();
    const [image] = await objectStorageClient.bucket(bucket).file(note.imagePath).download();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(image)], { type: "image/png" }), `darmin-${serialNumber}.png`);
    form.append("pinataMetadata", JSON.stringify({ name: `TimeNation DarMin ${formatSerial(serialNumber)}` }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    const imageResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!imageResponse.ok) throw new Error(`Pinata image upload failed (${imageResponse.status})`);
    const imageCid = (await imageResponse.json() as { IpfsHash?: string }).IpfsHash;
    if (!imageCid || !/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{40,})$/.test(imageCid)) {
      throw new Error("Pinata returned an invalid image CID");
    }

    const metadataResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pinataContent: {
          name: `TimeNation DarMin ${formatSerial(serialNumber)}`,
          description: note.slogan,
          image: `ipfs://${imageCid}`,
          attributes: [
            { trait_type: "Serial number", value: formatSerial(serialNumber) },
            { trait_type: "Slogan", value: note.slogan },
          ],
        },
        pinataMetadata: { name: `timenation-darmin-${serialNumber}.json` },
        pinataOptions: { cidVersion: 1 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!metadataResponse.ok) throw new Error(`Pinata metadata upload failed (${metadataResponse.status})`);
    const metadataCid = (await metadataResponse.json() as { IpfsHash?: string }).IpfsHash;
    if (!metadataCid || !/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{40,})$/.test(metadataCid)) {
      throw new Error("Pinata returned an invalid metadata CID");
    }

    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, 11155111);
    const signer = new Wallet(process.env.SEPOLIA_RELAYER_PRIVATE_KEY, provider);
    const contract = new Contract(process.env.TIMENAMING_CONTRACT_ADDRESS, NFT_ABI, signer);
    const transaction = await contract.mintMinute(recipient, tokenId, `ipfs://${metadataCid}`);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Sepolia NFT mint transaction failed");
    await db.update(souvenirDarminsTable).set({
      status: "NFT_MINTED",
      nftTokenId: String(tokenId),
      nftRecipient: recipient,
      nftMetadataUri: `ipfs://${metadataCid}`,
      nftTransactionHash: transaction.hash,
    }).where(eq(souvenirDarminsTable.serialNumber, serialNumber));
    res.status(201).json({
      serialNumber,
      tokenId: String(tokenId),
      transactionHash: transaction.hash,
      explorerUrl: `https://sepolia.etherscan.io/tx/${transaction.hash}`,
      metadataUri: `ipfs://${metadataCid}`,
    });
  } catch (error) {
    await db.update(souvenirDarminsTable).set({ status: "ISSUED" })
      .where(and(eq(souvenirDarminsTable.serialNumber, serialNumber), isNull(souvenirDarminsTable.nftTokenId)));
    req.log.error({ err: error, serialNumber }, "Souvenir DarMin NFT mint failed");
    res.status(502).json({ error: "Не удалось выпустить NFT. Попробуйте ещё раз позже." });
  }
});

export default router;
