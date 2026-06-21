import { Router, type Request, type Response } from "express";
import { eq, desc, and, gte, count } from "drizzle-orm";
import { z } from "zod";
import { db, citizensTable, citizenReviewsTable, transactionsTable } from "@workspace/db";
import { adjustRateByReviews } from "../services/rateAuditorService";

const router = Router();

const REVIEW_TAX_DARMINS = 15;
const TREASURY_CITIZEN_ID = 1;

router.post("/reviews/submit", async (req: Request, res: Response) => {
  const bodySchema = z.object({
    authorId: z.number().int().positive(),
    targetId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    reviewText: z.string().min(10).max(2000),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные данные", details: parsed.error.issues });
    return;
  }
  const { authorId, targetId, rating, reviewText } = parsed.data;

  if (authorId === targetId) {
    res.status(400).json({ error: "Нельзя оставить отзыв самому себе" });
    return;
  }

  const [[author], [target]] = await Promise.all([
    db.select().from(citizensTable).where(eq(citizensTable.id, authorId)).limit(1),
    db.select().from(citizensTable).where(eq(citizensTable.id, targetId)).limit(1),
  ]);

  if (!author) { res.status(404).json({ error: "Автор не найден" }); return; }
  if (!target) { res.status(404).json({ error: "Специалист не найден" }); return; }
  if (author.balanceMinutes < REVIEW_TAX_DARMINS + 1) {
    res.status(402).json({ error: `Недостаточно Дарминов. Требуется ${REVIEW_TAX_DARMINS} Д (сбор Казначейства)` });
    return;
  }

  const [treasury] = await db.select().from(citizensTable)
    .where(eq(citizensTable.id, TREASURY_CITIZEN_ID)).limit(1);

  await db.update(citizensTable)
    .set({ balanceMinutes: author.balanceMinutes - REVIEW_TAX_DARMINS })
    .where(eq(citizensTable.id, authorId));

  if (treasury) {
    await db.update(citizensTable)
      .set({ balanceMinutes: treasury.balanceMinutes + REVIEW_TAX_DARMINS })
      .where(eq(citizensTable.id, TREASURY_CITIZEN_ID));
  }

  const [review] = await db.insert(citizenReviewsTable).values({
    authorId,
    targetId,
    rating,
    reviewText,
    taxPaid: REVIEW_TAX_DARMINS,
  }).returning();

  req.log.info({ authorId, targetId, rating, taxPaid: REVIEW_TAX_DARMINS }, "Review submitted");

  const since24h = new Date(Date.now() - 86_400_000);
  const recentReviews = await db
    .select()
    .from(citizenReviewsTable)
    .where(
      and(
        eq(citizenReviewsTable.targetId, targetId),
        gte(citizenReviewsTable.createdAt, since24h)
      )
    )
    .orderBy(desc(citizenReviewsTable.createdAt))
    .limit(10);

  let rateAdj: Awaited<ReturnType<typeof adjustRateByReviews>> | null = null;
  try {
    rateAdj = await adjustRateByReviews(
      targetId,
      target.calculatedMinuteRate,
      recentReviews.map(r => ({ rating: r.rating, reviewText: r.reviewText, authorId: r.authorId }))
    );
  } catch (err) {
    req.log.warn({ err }, "Rate adjustment skipped (Gemini unavailable)");
  }

  res.json({ review, rateAdjustment: rateAdj });
});

router.get("/reviews/citizen/:targetId", async (req: Request, res: Response) => {
  const targetId = parseInt(req.params["targetId"] as string);
  if (isNaN(targetId)) { res.status(400).json({ error: "Неверный ID" }); return; }

  const reviews = await db
    .select()
    .from(citizenReviewsTable)
    .where(eq(citizenReviewsTable.targetId, targetId))
    .orderBy(desc(citizenReviewsTable.createdAt))
    .limit(20);

  const [target] = await db
    .select({ calculatedMinuteRate: citizensTable.calculatedMinuteRate, reviewScoreCount: citizensTable.reviewScoreCount })
    .from(citizensTable)
    .where(eq(citizensTable.id, targetId))
    .limit(1);

  res.json({ reviews, currentRate: target?.calculatedMinuteRate ?? 1.0, reviewScoreCount: target?.reviewScoreCount ?? 0 });
});

export default router;
