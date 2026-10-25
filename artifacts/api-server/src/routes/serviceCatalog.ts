import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, citizensTable, serviceListingsTable, citizenProfessionalDocumentsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { auditProfessionalOffer } from "../services/professionalOfferAudit";

const router: IRouter = Router();
const PublishBody = z.object({
  title: z.string().trim().min(4).max(100),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(20).max(2000),
  requestKey: z.string().min(8).max(100),
  lang: z.string().max(10).optional(),
});

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

router.get("/service-catalog/mine", requireAuth, async (req, res) => {
  const listings = await db.select().from(serviceListingsTable)
    .where(eq(serviceListingsTable.citizenId, req.citizen!.id))
    .orderBy(desc(serviceListingsTable.createdAt)).limit(100);
  res.json({ listings });
});

router.post("/service-catalog", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = PublishBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте название, категорию и описание услуги" }); return; }
  const { requestKey, title, category, description, lang } = parsed.data;

  const [previous] = await db.select().from(serviceListingsTable).where(eq(serviceListingsTable.requestKey, requestKey)).limit(1);
  if (previous) { res.json({ listing: previous, alreadyPublished: true }); return; }

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

    const listing = await db.transaction(async (tx) => {
      const [charged] = await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} - 1` })
        .where(and(eq(citizensTable.id, req.citizen!.id), gte(citizensTable.balanceMinutes, 2)))
        .returning({ id: citizensTable.id });
      if (!charged) throw new Error("INSUFFICIENT_DARMIN");
      const [created] = await tx.insert(serviceListingsTable).values({
        citizenId: req.citizen!.id,
        title,
        category,
        description,
        suggestedPriceDarmins: audit.suggestedAmount,
        minuteRate: audit.minuteRate,
        qualificationSummary: audit.qualificationSummary || audit.summary,
        publicationFeeDarmins: 1,
        requestKey,
      }).returning();
      return created;
    });
    req.log.info({ citizenId: req.citizen!.id, listingId: listing.id, feeDarmins: 1 }, "Service listing published");
    res.status(201).json({ listing, audit, feeDarmins: 1 });
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
