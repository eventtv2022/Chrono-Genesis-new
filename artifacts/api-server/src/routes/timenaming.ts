import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { Contract, JsonRpcProvider, Wallet, isAddress } from "ethers";
import PDFDocument from "pdfkit";
import { db, citizensTable, minuteLicensesTable, timelineAnchorsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { isCenturyBoundaryMinute, CENTURY_STATE_PROPERTY_CODE, CENTURY_STATE_PROPERTY_MSG } from "../lib/centuryGuard";
import { isStateHeritageCoord, HERITAGE_LOCK_CODE, HERITAGE_LOCK_TITLE, HERITAGE_LOCK_MSG } from "../lib/heritageGuard";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const ROYALTY_RECIPIENT = "0x4a290953E0A4c9374901939D5612AFDAAf99312b";
const LEGAL_TERMS_RU = [
  "1. Правовой статус и предмет: Настоящий документ подтверждает приобретение неисключительного права на размещение и индексацию цифрового контента (информационной метки времени) в рамках программного обеспечения как услуги (SaaS) платформы TimeNation.",
  "2. Отказ от финансовых гарантий: Данная лицензия является исключительно утилитарным цифровым правом доступа к функционалу платформы. Она не является ценной бумагой, долей в уставном капитале, финансовым инструментом, инвестиционным контрактом, средством платежа, цифровой валютой или обязательством по обратному выкупу (buyback).",
  "3. Отсутствие прав на физические объекты: Лицензия не предоставляет никаких прав собственности, владения или распоряжения реальным физическим временем, астрономическими объектами или материальными активами в реальном мире.",
  "4. Условия возврата и прекращения: Все платежи за лицензии и внутренние расчетные единицы (DarMin) являются окончательными, невозвратными (non-refundable) и направляются на покрытие операционных расходов по поддержанию SaaS-инфраструктуры.",
  "5. Ограничение ответственности: Администрация платформы не несет ответственности за изменение рыночной стоимости прав на индексацию или действия третьих лиц на вторичном рынке. Документ носит информационный характер и не является юридической, финансовой или инвестиционной консультацией.",
].join("\n\n");
const NFT_ABI = [
  "function mintMinute(address to, uint256 minuteTimestamp, string uri) external",
];
const CERTIFICATE_FONT_CANDIDATES = [
  path.join(process.cwd(), "assets", "fonts", "DejaVuSans.ttf"),
  path.join(process.cwd(), "artifacts", "api-server", "assets", "fonts", "DejaVuSans.ttf"),
];
const CERTIFICATE_FONT = CERTIFICATE_FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

async function attachOptionalCitizen(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { next(); return; }
  try {
    const [citizen] = await db.select().from(citizensTable).where(eq(citizensTable.authToken, header.slice(7).trim())).limit(1);
    if (citizen) req.citizen = citizen;
    next();
  } catch (error) {
    next(error);
  }
}

function validateCoord(coord: string): boolean {
  if (!/^\d{12}$/.test(coord)) return false;
  const y = Number(coord.slice(0, 4)), m = Number(coord.slice(4, 6)), d = Number(coord.slice(6, 8));
  const h = Number(coord.slice(8, 10)), min = Number(coord.slice(10, 12));
  if (y < 1 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function coordFromInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const coord = match.slice(1).join("");
  return validateCoord(coord) ? coord : null;
}

function formatCoord(coord: string): string {
  return `${coord.slice(0, 4)}-${coord.slice(4, 6)}-${coord.slice(6, 8)} ${coord.slice(8, 10)}:${coord.slice(10, 12)} UTC`;
}

function isSepoliaMintConfigured(): boolean {
  return Boolean(
    process.env.TIMENAMING_CONTRACT_ADDRESS &&
    process.env.SEPOLIA_RPC_URL &&
    process.env.SEPOLIA_RELAYER_PRIVATE_KEY &&
    isAddress(process.env.TIMENAMING_CONTRACT_ADDRESS),
  );
}

function isIpfsPinningConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT);
}

type PinataResponse = { IpfsHash?: unknown };

function readPinnedCid(payload: PinataResponse): string {
  const cid = payload.IpfsHash;
  if (typeof cid !== "string" || !/^(bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{40,})$/.test(cid)) {
    throw new Error("Pinata returned an invalid content identifier");
  }
  return cid;
}

async function pinFileToIpfs(bytes: Buffer, filename: string, contentType: string): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("IPFS pinning is not configured");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`IPFS file pin failed (${response.status})`);
  return readPinnedCid(await response.json() as PinataResponse);
}

async function pinJsonToIpfs(value: unknown, name: string): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("IPFS pinning is not configured");

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pinataContent: value,
      pinataMetadata: { name },
      pinataOptions: { cidVersion: 1 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`IPFS metadata pin failed (${response.status})`);
  return readPinnedCid(await response.json() as PinataResponse);
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[char]!);
}

async function finishPaidMint(
  req: import("express").Request,
  res: import("express").Response,
  license: typeof minuteLicensesTable.$inferSelect,
  directBundle: boolean,
  balanceAfterCharge: number,
): Promise<void> {
  let txHash: string | null = null;
  let receiptFailed = false;
  try {
    const certificate = await renderCertificate(license);
    const certificatePath = await savePrivatePdf(license.certificateId, certificate);
    const certificateCid = await pinFileToIpfs(
      certificate,
      `timenation-license-${license.certificateId}.pdf`,
      "application/pdf",
    );
    const certificateIpfsUri = `ipfs://${certificateCid}`;

    const epochMinute = Math.floor(Date.UTC(
      Number(license.timelineCoord.slice(0, 4)),
      Number(license.timelineCoord.slice(4, 6)) - 1,
      Number(license.timelineCoord.slice(6, 8)),
      Number(license.timelineCoord.slice(8, 10)),
      Number(license.timelineCoord.slice(10, 12)),
    ) / 60_000);
    const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#101d34"/><text x="50%" y="42%" fill="#dbc58e" font-family="sans-serif" font-size="42" text-anchor="middle">${xmlEscape(license.customTitle)}</text><text x="50%" y="58%" fill="#f4f1e9" font-family="sans-serif" font-size="26" text-anchor="middle">${xmlEscape(formatCoord(license.timelineCoord))}</text><text x="50%" y="82%" fill="#c6a55e" font-family="sans-serif" font-size="20" text-anchor="middle">TIMENATION · MINUTE LICENSE</text></svg>`;
    const metadata = {
      name: license.customTitle,
      description: license.customDescription || `TimeNation placement license for ${formatCoord(license.timelineCoord)}.`,
      image: `data:image/svg+xml;base64,${Buffer.from(imageSvg).toString("base64")}`,
      attributes: [
        { trait_type: "Timeline minute", value: formatCoord(license.timelineCoord) },
        { trait_type: "Licensee", value: license.ownerName },
        { trait_type: "Royalty", value: "2%" },
        { trait_type: "Royalty recipient", value: ROYALTY_RECIPIENT },
      ],
      properties: {
        certificate: {
          name: `TimeNation placement license ${license.certificateId}`,
          type: "application/pdf",
          uri: certificateIpfsUri,
        },
      },
    };
    const metadataCid = await pinJsonToIpfs(metadata, `timenation-minute-${license.certificateId}.json`);
    const uri = `ipfs://${metadataCid}`;
    await db.update(minuteLicensesTable).set({
      status: "MINT_PENDING",
      certificatePath,
      certificateIpfsUri,
      metadataUri: uri,
    }).where(eq(minuteLicensesTable.id, license.id));
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, 11155111);
    const signer = new Wallet(process.env.SEPOLIA_RELAYER_PRIVATE_KEY!, provider);
    const contract = new Contract(process.env.TIMENAMING_CONTRACT_ADDRESS!, NFT_ABI, signer);
    const tx = await contract.mintMinute(license.walletAddress, epochMinute, uri);
    txHash = tx.hash;
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      receiptFailed = true;
      throw new Error("Mint transaction did not succeed");
    }
    await db.transaction(async (txDb) => {
      await txDb.update(minuteLicensesTable).set({
        status: "MINTED", transactionHash: tx.hash, tokenId: String(epochMinute), certificatePath,
      }).where(eq(minuteLicensesTable.id, license.id));
      await txDb.update(timelineAnchorsTable).set({ status: "MINTED" }).where(eq(timelineAnchorsTable.id, license.timelineAnchorId));
    });
    res.status(201).json({
      status: "MINTED", transactionHash: tx.hash, tokenId: String(epochMinute),
      explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
      certificateId: license.certificateId, newBalance: balanceAfterCharge,
    });
  } catch (error) {
    req.log.error({ err: error, certificateId: license.certificateId, txHash }, "Paid Sepolia mint failed");
    if (txHash && !receiptFailed) {
      await db.update(minuteLicensesTable).set({ status: "MINT_PENDING", transactionHash: txHash }).where(eq(minuteLicensesTable.id, license.id));
      res.status(202).json({ status: "MINT_PENDING", transactionHash: txHash, certificateId: license.certificateId, message: "Transaction submitted; its final status is being confirmed." });
      return;
    }
    await db.transaction(async (txDb) => {
      const [citizen] = await txDb.select({ balance: citizensTable.balanceMinutes })
        .from(citizensTable).where(eq(citizensTable.id, license.citizenId)).for("update").limit(1);
      if (citizen) {
        await txDb.update(citizensTable).set({ balanceMinutes: citizen.balance + 2 }).where(eq(citizensTable.id, license.citizenId));
      }
      if (directBundle) {
        await txDb.delete(minuteLicensesTable).where(eq(minuteLicensesTable.id, license.id));
        await txDb.delete(timelineAnchorsTable).where(eq(timelineAnchorsTable.id, license.timelineAnchorId));
      } else {
        await txDb.update(minuteLicensesTable).set({ status: "CLAIMED", transactionHash: null, tokenId: null })
          .where(eq(minuteLicensesTable.id, license.id));
      }
    });
    res.status(502).json({ error: "Mint failed; 2 Д were refunded. Your original Timeline claim remains if this was an upgrade." });
  }
}

async function renderCertificate(license: typeof minuteLicensesTable.$inferSelect): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: "Digital Content Placement License", Author: "TimeNation SaaS Framework" } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  if (!CERTIFICATE_FONT) throw new Error("Certificate Unicode font asset is missing");
  doc.font(CERTIFICATE_FONT);
  doc.rect(28, 28, 539, 786).lineWidth(2).stroke("#b99951");
  doc.fillColor("#182337").fontSize(10).text("TIMENATION  /  DIGITAL ARCHIVE", 56, 62, { characterSpacing: 2 });
  doc.moveDown(3);
  doc.fillColor("#b99951").fontSize(25).text("Digital Content", { align: "center" });
  doc.fontSize(25).text("Placement License", { align: "center" });
  doc.moveDown(1);
  doc.fillColor("#546175").fontSize(11).text("CERTIFICATE OF HISTORICAL MINUTE RESERVATION", { align: "center", characterSpacing: 1 });
  doc.moveDown(3);
  doc.fillColor("#182337").fontSize(11).text("Certificate ID", 64);
  doc.fontSize(13).text(license.certificateId);
  doc.moveDown();
  doc.fontSize(11).text("Reserved timeline minute", 64);
  doc.fontSize(16).fillColor("#b08428").text(formatCoord(license.timelineCoord));
  doc.moveDown();
  doc.fillColor("#182337").fontSize(11).text("Licensee", 64);
  doc.fontSize(15).text(license.ownerName);
  doc.moveDown();
  doc.fontSize(11).text("Content title", 64);
  doc.fontSize(15).text(license.customTitle);
  if (license.customDescription) {
    doc.moveDown().fontSize(11).text("Description", 64);
    doc.fontSize(11).fillColor("#546175").text(license.customDescription, { width: 455 });
  }
  doc.moveDown(2);
  doc.fillColor("#182337").fontSize(10).text("Issuer: TimeNation SaaS Framework");
  doc.text(`EVM wallet: ${license.walletAddress}`);
  doc.moveDown(2);
  doc.fillColor("#334155").fontSize(7).text(LEGAL_TERMS_RU, { width: 455, lineGap: 2 });
  doc.moveDown();
  doc.fillColor("#687386").fontSize(8).text("SaaS utility content license. Non-refundable. This certificate records a platform placement license and is not legal advice.", { width: 455 });
  doc.end();
  return completed;
}

async function savePrivatePdf(id: string, bytes: Buffer): Promise<string> {
  const privateDir = storage.getPrivateObjectDir().replace(/^\/+|\/+$/g, "");
  const [bucketName, ...prefix] = privateDir.split("/");
  if (!bucketName) throw new Error("Invalid private object storage directory");
  const objectName = [...prefix, "timenaming", `${id}.pdf`].filter(Boolean).join("/");
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(bytes, { contentType: "application/pdf", resumable: false, metadata: { cacheControl: "private, max-age=3600" } });
  return `/objects/timenaming/${id}.pdf`;
}

router.get("/timenaming/config", (_req, res): void => {
  res.json({
    network: "Sepolia",
    chainId: 11155111,
    royaltyBps: 200,
    royaltyRecipient: ROYALTY_RECIPIENT,
    contractConfigured: isSepoliaMintConfigured(),
    ipfsPinningConfigured: isIpfsPinningConfigured(),
    legalTextStatus: "SOURCE_PROVIDED_MACHINE_TRANSLATIONS_REVIEW_REQUIRED",
  });
});

router.get("/timenaming/check/:timestamp", attachOptionalCitizen, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.timestamp) ? req.params.timestamp[0] : req.params.timestamp;
  const coord = raw?.replaceAll("-", "").replaceAll(":", "").replace("T", "").replace(" ", "");
  if (!coord || !validateCoord(coord)) {
    res.status(400).json({ error: "Use YYYYMMDDHHmm or YYYY-MM-DD HH:mm" });
    return;
  }
  const [license] = await db.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.timelineCoord, coord)).limit(1);
  const [anchor] = await db.select().from(timelineAnchorsTable).where(eq(timelineAnchorsTable.timelineCoord, coord)).limit(1);
  const ownedByMe = Boolean(anchor && req.citizen?.id === anchor.citizenId);
  const minted = license?.status === "MINTED" || license?.status === "ACTIVE_NFT" || anchor?.status === "MINTED";
  const pending = license?.status === "MINT_PENDING";
  res.json({
    timestamp: coord,
    available: !anchor && !license && !isCenturyBoundaryMinute(coord) && !(await isStateHeritageCoord(coord)),
    reserved: Boolean(anchor || license),
    ownedByMe,
    minuteStatus: minted ? "MINTED" : pending ? "MINT_PENDING" : anchor ? "CLAIMED" : "FREE",
    ...(license ? { license: { ownerName: license.ownerName, customTitle: license.customTitle, status: license.status, certificateId: license.certificateId } } : {}),
  });
});

router.post("/timenaming/reserve", requireAuth, async (req, res): Promise<void> => {
  const { ownerName = "", customTitle = "", customDescription = "", walletAddress = "", purchaseType = "TIMELINE_ONLY" } = req.body ?? {};
  const coord = coordFromInput(req.body?.minuteTimestamp);
  if (!coord || !["TIMELINE_ONLY", "ALL_INCLUSIVE"].includes(purchaseType) ||
      (purchaseType === "ALL_INCLUSIVE" && (typeof ownerName !== "string" || !ownerName.trim() || ownerName.length > 120 ||
      typeof customTitle !== "string" || !customTitle.trim() || customTitle.length > 160 ||
      typeof customDescription !== "string" || customDescription.length > 2000 ||
      typeof walletAddress !== "string" || !isAddress(walletAddress)))) {
    res.status(400).json({ error: "Invalid minute, licensee, content details, or EVM wallet address" });
    return;
  }
  if (purchaseType === "ALL_INCLUSIVE" && !isSepoliaMintConfigured()) {
    res.status(503).json({ code: "SEPOLIA_RELAYER_NOT_CONFIGURED", error: "The all-inclusive package is unavailable until Sepolia minting is configured. No DarMin was charged." });
    return;
  }
  if (isCenturyBoundaryMinute(coord)) {
    res.status(403).json({ code: CENTURY_STATE_PROPERTY_CODE, error: CENTURY_STATE_PROPERTY_MSG });
    return;
  }
  const heritage = await isStateHeritageCoord(coord);
  if (heritage) {
    res.status(403).json({ code: HERITAGE_LOCK_CODE, title: HERITAGE_LOCK_TITLE, eventName: heritage.title, error: HERITAGE_LOCK_MSG });
    return;
  }
  const citizen = req.citizen!;
  try {
    const reserved = await db.transaction(async (tx) => {
      const [lockedCitizen] = await tx.select().from(citizensTable).where(eq(citizensTable.id, citizen.id)).for("update").limit(1);
      const cost = purchaseType === "ALL_INCLUSIVE" ? 2 : 1;
      if (!lockedCitizen || lockedCitizen.balanceMinutes - cost < 1) throw new Error("INSUFFICIENT_MINUTES");
      const [existingAnchor] = await tx.select({ id: timelineAnchorsTable.id }).from(timelineAnchorsTable).where(eq(timelineAnchorsTable.timelineCoord, coord)).limit(1);
      if (existingAnchor) throw new Error("MINUTE_TAKEN");
      const [anchor] = await tx.insert(timelineAnchorsTable).values({ timelineCoord: coord, citizenId: citizen.id, status: "active" }).returning();
      let license: typeof minuteLicensesTable.$inferSelect | null = null;
      if (purchaseType === "ALL_INCLUSIVE") {
        const [created] = await tx.insert(minuteLicensesTable).values({
          certificateId: randomUUID(), timelineAnchorId: anchor!.id, timelineCoord: coord, citizenId: citizen.id,
          ownerName: ownerName.trim(), customTitle: customTitle.trim(), customDescription: customDescription.trim(),
          walletAddress, status: "CLAIMED",
        }).returning();
        license = created!;
      }
      await tx.update(citizensTable).set({ balanceMinutes: lockedCitizen.balanceMinutes - cost }).where(eq(citizensTable.id, citizen.id));
      return { license, anchor: anchor!, newBalance: lockedCitizen.balanceMinutes - cost, purchaseType };
    });
    if (reserved.purchaseType === "ALL_INCLUSIVE" && reserved.license) {
      await finishPaidMint(req, res, reserved.license, true, reserved.newBalance);
      return;
    }
    res.status(201).json({ ...reserved, status: "CLAIMED" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "MINUTE_TAKEN" || (error as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "This minute has already been reserved on the TimeNation timeline" });
      return;
    }
    if (message === "INSUFFICIENT_MINUTES") {
      res.status(402).json({ error: "Reserve requires 1 Darmin beyond the protected ancestral minute" });
      return;
    }
    req.log.error({ err: error, citizenId: citizen.id, coord }, "Could not reserve Timenaming minute");
    res.status(500).json({ error: "Could not reserve this minute" });
  }
});

router.post("/timenaming/upgrade", requireAuth, async (req, res): Promise<void> => {
  const { ownerName, customTitle, customDescription = "", walletAddress } = req.body ?? {};
  const coord = coordFromInput(req.body?.minuteTimestamp);
  if (!coord || typeof ownerName !== "string" || !ownerName.trim() || ownerName.length > 120 ||
      typeof customTitle !== "string" || !customTitle.trim() || customTitle.length > 160 ||
      typeof customDescription !== "string" || customDescription.length > 2000 ||
      typeof walletAddress !== "string" || !isAddress(walletAddress)) {
    res.status(400).json({ error: "Invalid minute, licensee, content details, or EVM wallet address" });
    return;
  }
  if (!isSepoliaMintConfigured()) {
    res.status(503).json({ code: "SEPOLIA_RELAYER_NOT_CONFIGURED", error: "Sepolia minting is not configured. No DarMin was charged." });
    return;
  }
  if (!isIpfsPinningConfigured()) {
    res.status(503).json({ code: "IPFS_PINNING_NOT_CONFIGURED", error: "IPFS pinning is not configured. No DarMin was charged." });
    return;
  }
  const citizenId = req.citizen!.id;
  try {
    const purchase = await db.transaction(async (tx) => {
      const [citizen] = await tx.select().from(citizensTable).where(eq(citizensTable.id, citizenId)).for("update").limit(1);
      if (!citizen || citizen.balanceMinutes - 2 < 1) throw new Error("INSUFFICIENT_MINUTES");
      const [anchor] = await tx.select().from(timelineAnchorsTable).where(eq(timelineAnchorsTable.timelineCoord, coord)).for("update").limit(1);
      if (!anchor) throw new Error("MINUTE_NOT_CLAIMED");
      if (anchor.citizenId !== citizenId) throw new Error("MINUTE_TAKEN");
      const [existing] = await tx.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.timelineCoord, coord)).for("update").limit(1);
      if (existing?.status === "MINTED" || existing?.status === "ACTIVE_NFT") throw new Error("ALREADY_MINTED");
      if (existing?.status === "MINT_PENDING") throw new Error("MINT_IN_PROGRESS");
      const licenseValues = {
        ownerName: ownerName.trim(), customTitle: customTitle.trim(), customDescription: customDescription.trim(),
        walletAddress, status: "CLAIMED",
      };
      const [license] = existing
        ? await tx.update(minuteLicensesTable).set(licenseValues).where(eq(minuteLicensesTable.id, existing.id)).returning()
        : await tx.insert(minuteLicensesTable).values({
            ...licenseValues, certificateId: randomUUID(), timelineAnchorId: anchor.id,
            timelineCoord: coord, citizenId,
          }).returning();
      const newBalance = citizen.balanceMinutes - 2;
      await tx.update(citizensTable).set({ balanceMinutes: newBalance }).where(eq(citizensTable.id, citizenId));
      return { license: license!, newBalance };
    });
    await finishPaidMint(req, res, purchase.license, false, purchase.newBalance);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflicts: Record<string, string> = {
      INSUFFICIENT_MINUTES: "You need 2 transferable Д in addition to the protected ancestral minute.",
      MINUTE_NOT_CLAIMED: "Reserve this minute on Timeline before upgrading it.",
      MINUTE_TAKEN: "This minute is reserved by another citizen.",
      ALREADY_MINTED: "This minute has already been minted.",
      MINT_IN_PROGRESS: "The NFT transaction is still being confirmed.",
    };
    if (conflicts[message]) {
      const status = message === "INSUFFICIENT_MINUTES" ? 402 : message === "MINUTE_NOT_CLAIMED" ? 409 : 409;
      res.status(status).json({ code: message, error: conflicts[message] });
      return;
    }
    req.log.error({ err: error, citizenId, coord }, "Could not upgrade Timeline minute");
    res.status(500).json({ error: "Could not upgrade this minute" });
  }
});

async function reconcilePendingMint(license: typeof minuteLicensesTable.$inferSelect): Promise<void> {
  if (license.status !== "MINT_PENDING" || !license.transactionHash || !process.env.SEPOLIA_RPC_URL) return;
  try {
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL, 11155111);
    const receipt = await provider.getTransactionReceipt(license.transactionHash);
    if (!receipt) return;
    const epochMinute = Math.floor(Date.UTC(
      Number(license.timelineCoord.slice(0, 4)),
      Number(license.timelineCoord.slice(4, 6)) - 1,
      Number(license.timelineCoord.slice(6, 8)),
      Number(license.timelineCoord.slice(8, 10)),
      Number(license.timelineCoord.slice(10, 12)),
    ) / 60_000);
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.id, license.id)).for("update").limit(1);
      if (!current || current.status !== "MINT_PENDING") return;
      if (receipt.status === 1) {
        await tx.update(minuteLicensesTable).set({ status: "MINTED", tokenId: String(epochMinute) }).where(eq(minuteLicensesTable.id, license.id));
        await tx.update(timelineAnchorsTable).set({ status: "MINTED" }).where(eq(timelineAnchorsTable.id, license.timelineAnchorId));
        return;
      }
      const [anchor] = await tx.select().from(timelineAnchorsTable).where(eq(timelineAnchorsTable.id, license.timelineAnchorId)).limit(1);
      const isDirectBundle = Boolean(anchor && anchor.createdAt.getTime() === current.createdAt.getTime());
      const [citizen] = await tx.select({ balance: citizensTable.balanceMinutes }).from(citizensTable).where(eq(citizensTable.id, current.citizenId)).for("update").limit(1);
      if (citizen) await tx.update(citizensTable).set({ balanceMinutes: citizen.balance + 2 }).where(eq(citizensTable.id, current.citizenId));
      if (isDirectBundle) {
        await tx.delete(minuteLicensesTable).where(eq(minuteLicensesTable.id, current.id));
        await tx.delete(timelineAnchorsTable).where(eq(timelineAnchorsTable.id, current.timelineAnchorId));
      } else {
        await tx.update(minuteLicensesTable).set({ status: "CLAIMED", transactionHash: null, tokenId: null }).where(eq(minuteLicensesTable.id, current.id));
      }
    });
  } catch {
    // The transaction state remains pending until the RPC can confirm its receipt.
  }
}

router.get("/timenaming/mine", requireAuth, async (req, res): Promise<void> => {
  let licenses = await db.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.citizenId, req.citizen!.id)).orderBy(minuteLicensesTable.createdAt);
  for (const license of licenses) await reconcilePendingMint(license);
  licenses = await db.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.citizenId, req.citizen!.id)).orderBy(minuteLicensesTable.createdAt);
  res.json({ licenses });
});

async function handleCertificateGeneration(req: import("express").Request, res: import("express").Response): Promise<void> {
  const certificateId = String(req.params.certificateId ?? req.body?.certificateId ?? "");
  const [license] = await db.select().from(minuteLicensesTable).where(and(eq(minuteLicensesTable.certificateId, certificateId), eq(minuteLicensesTable.citizenId, req.citizen!.id))).limit(1);
  if (!license) { res.status(404).json({ error: "License not found" }); return; }
  try {
    const bytes = await renderCertificate(license);
    const certificatePath = await savePrivatePdf(license.certificateId, bytes);
    await db.update(minuteLicensesTable).set({ certificatePath }).where(eq(minuteLicensesTable.id, license.id));
    res.json({ downloadUrl: `/api/timenaming/${license.certificateId}/certificate`, certificateId: license.certificateId });
  } catch (error) {
    req.log.error({ err: error, certificateId: license.certificateId }, "Certificate generation failed");
    res.status(503).json({ error: "Certificate storage is unavailable. Try again later." });
  }
}

router.post("/timenaming/generate-certificate", requireAuth, handleCertificateGeneration);
router.post("/timenaming/:certificateId/generate-certificate", requireAuth, handleCertificateGeneration);

router.get("/timenaming/:certificateId/certificate", requireAuth, async (req, res): Promise<void> => {
  const [license] = await db.select().from(minuteLicensesTable).where(and(eq(minuteLicensesTable.certificateId, String(req.params.certificateId)), eq(minuteLicensesTable.citizenId, req.citizen!.id))).limit(1);
  if (!license?.certificatePath) { res.status(404).json({ error: "Certificate not found" }); return; }
  try {
    const file = await storage.getObjectEntityFile(license.certificatePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="timenation-license-${license.certificateId}.pdf"`);
    file.createReadStream().pipe(res);
  } catch {
    res.status(404).json({ error: "Certificate file is unavailable" });
  }
});

async function handleMintNft(req: import("express").Request, res: import("express").Response): Promise<void> {
  const certificateId = String(req.params.certificateId ?? req.body?.certificateId ?? "");
  const [license] = await db.select().from(minuteLicensesTable).where(and(eq(minuteLicensesTable.certificateId, certificateId), eq(minuteLicensesTable.citizenId, req.citizen!.id))).limit(1);
  if (!license) { res.status(404).json({ error: "License not found" }); return; }
  if (license.status === "MINTED" || license.status === "ACTIVE_NFT") { res.status(409).json({ error: "This minute has already been minted", transactionHash: license.transactionHash }); return; }
  if (license.status === "MINT_PENDING") { res.status(409).json({ error: "This minute already has a mint transaction pending", transactionHash: license.transactionHash }); return; }
  if (!isSepoliaMintConfigured()) {
    res.status(503).json({ code: "SEPOLIA_RELAYER_NOT_CONFIGURED", error: "Sepolia minting is not enabled. No DarMin was charged." });
    return;
  }
  if (!isIpfsPinningConfigured()) {
    res.status(503).json({ code: "IPFS_PINNING_NOT_CONFIGURED", error: "IPFS pinning is not configured. No DarMin was charged." });
    return;
  }
  try {
    const purchase = await db.transaction(async (txDb) => {
      const [citizen] = await txDb.select().from(citizensTable).where(eq(citizensTable.id, req.citizen!.id)).for("update").limit(1);
      if (!citizen || citizen.balanceMinutes - 2 < 1) throw new Error("INSUFFICIENT_MINUTES");
      const [current] = await txDb.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.id, license.id)).for("update").limit(1);
      if (!current || current.status === "MINTED" || current.status === "ACTIVE_NFT") throw new Error("ALREADY_MINTED");
      if (current.status === "MINT_PENDING") throw new Error("MINT_IN_PROGRESS");
      const newBalance = citizen.balanceMinutes - 2;
      await txDb.update(citizensTable).set({ balanceMinutes: newBalance }).where(eq(citizensTable.id, citizen.id));
      await txDb.update(minuteLicensesTable).set({ status: "CLAIMED" }).where(eq(minuteLicensesTable.id, license.id));
      return newBalance;
    });
    await finishPaidMint(req, res, { ...license, status: "CLAIMED" }, false, purchase);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INSUFFICIENT_MINUTES") { res.status(402).json({ error: "Upgrade requires 2 Д beyond the protected ancestral minute." }); return; }
    if (message === "ALREADY_MINTED" || message === "MINT_IN_PROGRESS") { res.status(409).json({ error: "This minute is already minted or a mint is pending." }); return; }
    req.log.error({ err: error, certificateId: license.certificateId }, "Paid Sepolia mint failed");
    res.status(500).json({ error: "Could not start the paid upgrade." });
  }
}

router.post("/timenaming/mint-nft", requireAuth, handleMintNft);
router.post("/timenaming/:certificateId/mint-nft", requireAuth, handleMintNft);

router.get("/timenaming/metadata/:timestamp", async (req, res): Promise<void> => {
  const timestamp = Array.isArray(req.params.timestamp) ? req.params.timestamp[0] : req.params.timestamp;
  const [license] = await db.select().from(minuteLicensesTable).where(and(eq(minuteLicensesTable.tokenId, timestamp), eq(minuteLicensesTable.status, "ACTIVE_NFT"))).limit(1);
  if (!license) { res.status(404).json({ error: "Minted minute not found" }); return; }
  res.json({
    name: license.customTitle,
    description: license.customDescription || `TimeNation placement license for ${formatCoord(license.timelineCoord)}.`,
    attributes: [{ trait_type: "Timeline minute", value: formatCoord(license.timelineCoord) }, { trait_type: "Licensee", value: license.ownerName }],
  });
});

export default router;
