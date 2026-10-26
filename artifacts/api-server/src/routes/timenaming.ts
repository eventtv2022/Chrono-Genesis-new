import { Router, type IRouter } from "express";
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
const LEGAL_DRAFT = "DRAFT — pending legal review. “exclusive non-exclusive” content indexing rights on the TimeNation platform. This license does not constitute financial equity, currency emission, or ownership of real-world physical time.";
const NFT_ABI = [
  "function mintMinute(address to, uint256 minuteTimestamp, string uri) external",
];
const CERTIFICATE_FONT_CANDIDATES = [
  path.join(process.cwd(), "assets", "fonts", "DejaVuSans.ttf"),
  path.join(process.cwd(), "artifacts", "api-server", "assets", "fonts", "DejaVuSans.ttf"),
];
const CERTIFICATE_FONT = CERTIFICATE_FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

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
  doc.fillColor("#a33b32").fontSize(8).text(LEGAL_DRAFT, { width: 455 });
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
    contractConfigured: Boolean(process.env.TIMENAMING_CONTRACT_ADDRESS && process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RELAYER_PRIVATE_KEY),
    legalTextStatus: "DRAFT_PENDING_REVIEW",
  });
});

router.get("/timenaming/check/:timestamp", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.timestamp) ? req.params.timestamp[0] : req.params.timestamp;
  const coord = raw?.replaceAll("-", "").replaceAll(":", "").replace("T", "").replace(" ", "");
  if (!coord || !validateCoord(coord)) {
    res.status(400).json({ error: "Use YYYYMMDDHHmm or YYYY-MM-DD HH:mm" });
    return;
  }
  const [license] = await db.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.timelineCoord, coord)).limit(1);
  const [anchor] = license ? [] : await db.select({ id: timelineAnchorsTable.id }).from(timelineAnchorsTable).where(eq(timelineAnchorsTable.timelineCoord, coord)).limit(1);
  res.json({
    timestamp: coord,
    available: !license && !anchor && !isCenturyBoundaryMinute(coord) && !(await isStateHeritageCoord(coord)),
    reserved: Boolean(anchor || license),
    ...(license ? { license: { ownerName: license.ownerName, customTitle: license.customTitle, status: license.status, certificateId: license.certificateId } } : {}),
  });
});

router.post("/timenaming/reserve", requireAuth, async (req, res): Promise<void> => {
  const { ownerName, customTitle, customDescription = "", walletAddress } = req.body ?? {};
  const coord = coordFromInput(req.body?.minuteTimestamp);
  if (!coord || typeof ownerName !== "string" || !ownerName.trim() || ownerName.length > 120 ||
      typeof customTitle !== "string" || !customTitle.trim() || customTitle.length > 160 ||
      typeof customDescription !== "string" || customDescription.length > 2000 ||
      typeof walletAddress !== "string" || !isAddress(walletAddress)) {
    res.status(400).json({ error: "Invalid minute, licensee, content details, or EVM wallet address" });
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
      if (!lockedCitizen || lockedCitizen.balanceMinutes - 1 <= 0) throw new Error("INSUFFICIENT_MINUTES");
      const [existingAnchor] = await tx.select({ id: timelineAnchorsTable.id }).from(timelineAnchorsTable).where(eq(timelineAnchorsTable.timelineCoord, coord)).limit(1);
      if (existingAnchor) throw new Error("MINUTE_TAKEN");
      const [anchor] = await tx.insert(timelineAnchorsTable).values({ timelineCoord: coord, citizenId: citizen.id, status: "active" }).returning();
      const certificateId = randomUUID();
      const [created] = await tx.insert(minuteLicensesTable).values({
        certificateId, timelineAnchorId: anchor!.id, timelineCoord: coord, citizenId: citizen.id,
        ownerName: ownerName.trim(), customTitle: customTitle.trim(), customDescription: customDescription.trim(),
        walletAddress,
      }).returning();
      await tx.update(citizensTable).set({ balanceMinutes: lockedCitizen.balanceMinutes - 1 }).where(eq(citizensTable.id, citizen.id));
      return { license: created!, newBalance: lockedCitizen.balanceMinutes - 1 };
    });
    res.status(201).json(reserved);
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

router.get("/timenaming/mine", requireAuth, async (req, res): Promise<void> => {
  const licenses = await db.select().from(minuteLicensesTable).where(eq(minuteLicensesTable.citizenId, req.citizen!.id)).orderBy(minuteLicensesTable.createdAt);
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
  if (license.status === "ACTIVE_NFT") { res.status(409).json({ error: "This minute has already been minted", transactionHash: license.transactionHash }); return; }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
  const contractAddress = process.env.TIMENAMING_CONTRACT_ADDRESS;
  if (!rpcUrl || !privateKey || !contractAddress || !isAddress(contractAddress)) {
    res.status(503).json({ code: "SEPOLIA_RELAYER_NOT_CONFIGURED", error: "Sepolia minting is not enabled yet. Reservation and PDF certificate remain available." });
    return;
  }
  try {
    const epochMinute = Math.floor(Date.UTC(Number(license.timelineCoord.slice(0, 4)), Number(license.timelineCoord.slice(4, 6)) - 1, Number(license.timelineCoord.slice(6, 8)), Number(license.timelineCoord.slice(8, 10)), Number(license.timelineCoord.slice(10, 12))) / 60_000);
    const metadata = {
      name: license.customTitle, description: license.customDescription || `TimeNation placement license for ${formatCoord(license.timelineCoord)}.`,
      image: "", external_url: `/api/timenaming/${license.certificateId}/certificate`,
      attributes: [
        { trait_type: "Timeline minute", value: formatCoord(license.timelineCoord) },
        { trait_type: "Licensee", value: license.ownerName },
        { trait_type: "Royalty", value: "2%" },
        { trait_type: "Royalty recipient", value: ROYALTY_RECIPIENT },
      ],
    };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
    const provider = new JsonRpcProvider(rpcUrl, 11155111);
    const signer = new Wallet(privateKey, provider);
    const contract = new Contract(contractAddress, NFT_ABI, signer);
    const tx = await contract.mintMinute(license.walletAddress, epochMinute, uri);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Mint transaction did not succeed");
    await db.update(minuteLicensesTable).set({ status: "ACTIVE_NFT", transactionHash: tx.hash, tokenId: String(epochMinute) }).where(eq(minuteLicensesTable.id, license.id));
    res.json({ status: "ACTIVE_NFT", transactionHash: tx.hash, tokenId: String(epochMinute), explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}` });
  } catch (error) {
    req.log.error({ err: error, certificateId: license.certificateId }, "Sepolia mint failed");
    res.status(502).json({ error: "Sepolia mint transaction failed; the license remains reserved and can be retried" });
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
