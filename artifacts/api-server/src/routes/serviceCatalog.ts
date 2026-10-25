import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, citizensTable, serviceListingsTable, citizenProfessionalDocumentsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { auditProfessionalOffer } from "../services/professionalOfferAudit";

const router: IRouter = Router();
const AuditPreviewBody = z.object({
  title: z.string().trim().min(4).max(100),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(20).max(2000),
  requestKey: z.string().min(8).max(100),
  lang: z.string().max(10).optional(),
});
const PublishBody = z.object({
  requestKey: z.string().min(8).max(100),
  auditToken: z.string().min(20).max(5000),
  priceDarmins: z.number().int().min(1).max(1000),
});
const AuditTokenPayload = z.object({
  citizenId: z.number().int().positive(),
  requestKey: z.string().min(8).max(100),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  expiresAt: z.number().int(),
  audit: z.object({
    suggestedAmount: z.number().int().min(1).max(1000),
    minuteRate: z.number(),
    qualificationSummary: z.string(),
    summary: z.string(),
    documentsAnalyzed: z.number().int().min(1),
  }),
});

function catalogAuditSecret(): string {
  const secret = process.env["ENCRYPTION_KEY"] ?? process.env["SESSION_SECRET"];
  if (!secret) throw new Error("Ключ проверки аудита временно недоступен");
  return secret;
}

function signAuditPayload(payload: z.infer<typeof AuditTokenPayload>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", catalogAuditSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyAuditToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const expected = Buffer.from(createHmac("sha256", catalogAuditSecret()).update(encoded).digest("base64url"));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    const payload = AuditTokenPayload.safeParse(decoded);
    if (!payload.success || payload.data.expiresAt <= Date.now()) return null;
    return payload.data;
  } catch {
    return null;
  }
}

router.get("/service-catalog", async (_req, res) => {
  const listings = await db.select({
    id: serviceListingsTable.id,
    citizenId: serviceListingsTable.citizenId,
    citizenName: citizensTable.name,
    title: serviceListingsTable.title,
    category: serviceListingsTable.category,
    description: serviceListingsTable.description,
    suggestedPriceDarmins: serviceListingsTable.suggestedPriceDarmins,
    minuteRate: serviceListingsTable.minuteRate,
    qualificationSummary: serviceListingsTable.qualificationSummary,
    createdAt: serviceListingsTable.createdAt,
  }).from(serviceListingsTable)
    .innerJoin(citizensTable, eq(serviceListingsTable.citizenId, citizensTable.id))
    .where(eq(serviceListingsTable.status, "active"))
    .orderBy(desc(serviceListingsTable.createdAt)).limit(100);
  res.json({ listings });
});

router.get("/service-catalog/visible-documents", requireAuth, async (_req, res) => {
  const documents = await db.select({
    citizenId: citizenProfessionalDocumentsTable.citizenId,
    resumeVisible: citizenProfessionalDocumentsTable.resumeVisible,
    portfolioVisible: citizenProfessionalDocumentsTable.portfolioVisible,
  }).from(citizenProfessionalDocumentsTable)
    .where(sql`${citizenProfessionalDocumentsTable.resumeVisible} = true OR ${citizenProfessionalDocumentsTable.portfolioVisible} = true`);
  res.json({ documents });
});

router.get("/service-catalog/mine", requireAuth, async (req, res) => {
  const listings = await db.select().from(serviceListingsTable)
    .where(eq(serviceListingsTable.citizenId, req.citizen!.id))
    .orderBy(desc(serviceListingsTable.createdAt)).limit(100);
  res.json({ listings });
});

router.post("/service-catalog/preview", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = AuditPreviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте название, категорию и описание услуги" }); return; }
  const { requestKey, title, category, description, lang } = parsed.data;

  try {
    const audit = await auditProfessionalOffer({
      description: `Услуга: ${title}\nКатегория: ${category}\nОписание: ${description}`,
      lang: lang ?? "ru",
      creatorId: req.citizen!.id,
    });
    if (audit.documentsAnalyzed === 0) {
      res.status(400).json({ error: "Для публикации загрузите резюме или портфолио и согласитесь на их анализ ИИ-аудитором." });
      return;
    }
    const expiresAt = Date.now() + 30 * 60 * 1000;
    const auditToken = signAuditPayload({
      citizenId: req.citizen!.id,
      requestKey,
      title,
      category,
      description,
      expiresAt,
      audit: {
        suggestedAmount: audit.suggestedAmount,
        minuteRate: audit.minuteRate,
        qualificationSummary: audit.qualificationSummary || audit.summary,
        summary: audit.summary,
        documentsAnalyzed: audit.documentsAnalyzed,
      },
    });
    res.json({
      auditToken,
      expiresAt: new Date(expiresAt).toISOString(),
      audit: {
        suggestedAmount: audit.suggestedAmount,
        minuteRate: audit.minuteRate,
        qualificationSummary: audit.qualificationSummary || audit.summary,
        summary: audit.summary,
        documentsAnalyzed: audit.documentsAnalyzed,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Service listing audit preview failed");
    const message = err instanceof Error ? err.message : "ИИ-аудитор не смог обработать услугу.";
    res.status(message.includes("временно недоступен") ? 503 : 500).json({ error: message });
  }
});

router.post("/service-catalog", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = PublishBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте цену услуги и данные аудита" }); return; }
  const { requestKey, auditToken, priceDarmins } = parsed.data;

  const [previous] = await db.select().from(serviceListingsTable).where(eq(serviceListingsTable.requestKey, requestKey)).limit(1);
  if (previous) {
    if (previous.citizenId !== req.citizen!.id) { res.status(409).json({ error: "Ключ публикации уже использован." }); return; }
    res.json({ listing: previous, feeDarmins: previous.publicationFeeDarmins, alreadyPublished: true });
    return;
  }
  const auditPayload = verifyAuditToken(auditToken);
  if (!auditPayload || auditPayload.citizenId !== req.citizen!.id || auditPayload.requestKey !== requestKey) {
    res.status(400).json({ error: "Аудит истёк или недействителен. Запустите проверку заново." });
    return;
  }
  const [documents] = await db.select({
    aiConsentAt: citizenProfessionalDocumentsTable.aiConsentAt,
    resumeEncryptedData: citizenProfessionalDocumentsTable.resumeEncryptedData,
    portfolioEncryptedData: citizenProfessionalDocumentsTable.portfolioEncryptedData,
  }).from(citizenProfessionalDocumentsTable)
    .where(eq(citizenProfessionalDocumentsTable.citizenId, req.citizen!.id))
    .limit(1);
  if (!documents?.aiConsentAt || (!documents.resumeEncryptedData && !documents.portfolioEncryptedData)) {
    res.status(400).json({ error: "Согласие на анализ документов отозвано или документы удалены. Проведите аудит заново." });
    return;
  }

  try {
    const listing = await db.transaction(async (tx) => {
      const [charged] = await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} - 1` })
        .where(and(eq(citizensTable.id, req.citizen!.id), gte(citizensTable.balanceMinutes, 2)))
        .returning({ id: citizensTable.id });
      if (!charged) throw new Error("INSUFFICIENT_DARMIN");
      const [created] = await tx.insert(serviceListingsTable).values({
        citizenId: req.citizen!.id,
        title: auditPayload.title,
        category: auditPayload.category,
        description: auditPayload.description,
        suggestedPriceDarmins: priceDarmins,
        minuteRate: auditPayload.audit.minuteRate,
        qualificationSummary: auditPayload.audit.qualificationSummary,
        publicationFeeDarmins: 1,
        requestKey,
      }).returning();
      return created;
    });
    req.log.info({ citizenId: req.citizen!.id, listingId: listing.id, feeDarmins: 1 }, "Service listing published");
    res.status(201).json({ listing, audit: auditPayload.audit, feeDarmins: 1 });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_DARMIN") {
      res.status(402).json({ error: "Для публикации нужен 1 Д сверх непередаваемой минуты." });
      return;
    }
    const [retry] = await db.select().from(serviceListingsTable).where(eq(serviceListingsTable.requestKey, requestKey)).limit(1);
    if (retry) { res.json({ listing: retry, alreadyPublished: true }); return; }
    req.log.error({ err }, "Service listing publish failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Не удалось опубликовать услугу" });
  }
});

router.delete("/service-catalog/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Неверный номер предложения" }); return; }
  const [listing] = await db.select({ id: serviceListingsTable.id })
    .from(serviceListingsTable)
    .where(and(eq(serviceListingsTable.id, id), eq(serviceListingsTable.citizenId, req.citizen!.id)))
    .limit(1);
  if (!listing) { res.status(404).json({ error: "Предложение не найдено" }); return; }
  await db.update(serviceListingsTable).set({ status: "closed", updatedAt: new Date() })
    .where(eq(serviceListingsTable.id, id));
  res.json({ ok: true });
});

export default router;
