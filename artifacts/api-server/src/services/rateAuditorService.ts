import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const SYSTEM_PROMPT = `Ты — Главный Профильный Аудитор TimeNation.
Перед тобой профиль гражданина (навыки, опыт, услуги).
Твоя задача — определить коэффициент квалификации Kq от 0.5 (новичок) до 2.5 (эксперт высшей категории) для его отрасли.
Отрасли-ориентиры:
• IT-архитектура, сложная хирургия — Kq 1.8–2.5
• Веб-разработка, дизайн, юриспруденция — Kq 1.3–1.8
• Ремесло (сантехника, авторемонт средней сложности) — Kq 0.9–1.3
• Неквалифицированный труд — Kq 0.5–0.9
Строго верни JSON: { "kq": number, "industry": "string", "justification": "string", "depositBonus": number }
где depositBonus — рекомендованное количество бонусных Дарминов при депозите 480 минут (от 0 до 120).`;

const REVIEW_SYSTEM_PROMPT = `Ты — Главный Профильный Аудитор TimeNation.
Изучи новые платные отзывы о работе специалиста. На основе тональности и оценок скорректируй его текущий коэффициент стоимости минуты (calculatedMinuteRate).
Правила корректировки:
• Восторженные отзывы, оценки 5 — повысь на 0.05–0.15 (не выше 2.5)
• Нейтральные, оценки 3–4 — без изменений (дельта 0)
• Критические, оценки 1–2 — понизь на 0.05–0.15 (не ниже 0.5)
• Аномальная частота (>3 отзывов за сутки от одного автора) — понизь обоих на 0.1
Строго верни JSON: { "newRate": number, "delta": number, "reason": "string" }`;

export interface RateAuditResult {
  kq: number;
  industry: string;
  justification: string;
  depositBonus: number;
}

export interface ReviewAdjustResult {
  newRate: number;
  delta: number;
  reason: string;
}

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY не настроен");
  return new GoogleGenerativeAI(apiKey);
}

function parseJson<T>(raw: string): T {
  const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(clean) as T;
}

export async function auditCitizenRate(skills: string): Promise<RateAuditResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite", systemInstruction: SYSTEM_PROMPT });
  const result = await model.generateContent(`Профиль гражданина:\n${skills}`);
  return parseJson<RateAuditResult>(result.response.text().trim());
}

export async function adjustRateByReviews(
  targetId: number,
  currentRate: number,
  reviews: Array<{ rating: number; reviewText: string; authorId: number }>
): Promise<ReviewAdjustResult> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite", systemInstruction: REVIEW_SYSTEM_PROMPT });

  const reviewsText = reviews
    .map((r, i) => `Отзыв ${i + 1}: оценка ${r.rating}/5 — "${r.reviewText}"`)
    .join("\n");

  const prompt = `Текущий коэффициент специалиста: ${currentRate}\nПоследние отзывы:\n${reviewsText}`;
  const result = await model.generateContent(prompt);
  const adj = parseJson<ReviewAdjustResult>(result.response.text().trim());

  const clamped = Math.max(0.5, Math.min(2.5, adj.newRate));
  await db
    .update(citizensTable)
    .set({ calculatedMinuteRate: clamped, reviewScoreCount: reviews.length })
    .where(eq(citizensTable.id, targetId));

  logger.info({ targetId, oldRate: currentRate, newRate: clamped, delta: adj.delta }, "Rate adjusted by reviews");
  return { ...adj, newRate: clamped };
}
