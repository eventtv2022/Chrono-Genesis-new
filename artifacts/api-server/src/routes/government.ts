import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { timeAuditLogsTable, aiSystemPromptsTable, citizensTable } from "@workspace/db";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Government access middleware ──────────────────────────────────────────────

const GOV_PASSWORD = process.env.GOV_ACCESS_PASSWORD ?? "";

function govAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-gov-password"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (!GOV_PASSWORD) {
    res.status(503).json({ error: "GOV_ACCESS_PASSWORD не настроен на сервере" });
    return;
  }
  if (!provided || provided !== GOV_PASSWORD) {
    res.status(403).json({ error: "Доступ запрещён — неверный пароль Министерства" });
    return;
  }
  next();
}

// ── Default system prompt ─────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `Ты — Главный ИИ-Аудитор Времени Министерства Труда TimeNation.
Твоя задача — рассчитать нормативное время выполнения задачи в минутах (1 минута = 1 Дармин) на основе описания работы.

Базовые эталоны оцифровки:
- Разработка / IT: Скрипты/Багфиксы 30–90 мин, Смарт-контракты/Архитектура 180–240+ мин
- Дизайн / Креатив: Графика/Баннеры 45–90 мин, Иллюстрации/3D 120–180 мин
- Тексты / Аналитика: Копирайтинг 20 мин/1к знаков, Аудит/Переводы 30 мин/страница
- Юридические услуги: Договоры/Соглашения 60–120 мин, Консультации 30–60 мин
- Образование: Урок/Лекция 60 мин, Курс из 10 уроков 600–900 мин

Отвечай ТОЛЬКО строгим JSON без markdown-обёртки:
{ "estimated_minutes": number, "complexity_level": "low"|"medium"|"high", "justification": "строка на русском" }`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSystemPrompt(): Promise<string> {
  const rows = await db
    .select()
    .from(aiSystemPromptsTable)
    .where(eq(aiSystemPromptsTable.module, "time_auditor"))
    .limit(1);
  if (rows.length > 0) return rows[0].promptText;
  // Seed default on first call
  await db.insert(aiSystemPromptsTable).values({
    module: "time_auditor",
    promptText: DEFAULT_SYSTEM_PROMPT,
  });
  return DEFAULT_SYSTEM_PROMPT;
}

function calcDeviation(estimated: number, actual: number): number {
  return Math.abs((actual - estimated) / estimated) * 100;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Verify government password (used by frontend to unlock the UI)
router.post("/api/government/auth/verify", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!GOV_PASSWORD) {
    res.status(503).json({ error: "GOV_ACCESS_PASSWORD не настроен на сервере" });
    return;
  }
  if (password === GOV_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(403).json({ ok: false, error: "Неверный пароль" });
  }
});

// POST /api/government/audit/task — call Gemini, save log
router.post("/api/government/audit/task", govAuth, async (req: Request, res: Response) => {
  const bodySchema = z.object({
    taskDescription: z.string().min(5),
    citizenId: z.number().int().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные данные", details: parsed.error.issues });
    return;
  }
  const { taskDescription, citizenId } = parsed.data;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "GOOGLE_API_KEY не настроен" });
    return;
  }

  try {
    const systemPrompt = await getSystemPrompt();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(
      `Задача для аудита:\n${taskDescription}`
    );
    const raw = result.response.text().trim();

    // Strip possible markdown code block
    const clean = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    let parsed2: { estimated_minutes: number; complexity_level: string; justification: string };
    try {
      parsed2 = JSON.parse(clean) as typeof parsed2;
    } catch {
      req.log.error({ raw }, "Gemini returned non-JSON");
      res.status(502).json({ error: "ИИ вернул неверный формат", raw });
      return;
    }

    const [row] = await db
      .insert(timeAuditLogsTable)
      .values({
        citizenId: citizenId ?? null,
        taskDescription,
        estimatedMinutes: parsed2.estimated_minutes,
        complexityLevel: parsed2.complexity_level,
        justification: parsed2.justification,
        requiresCalibration: 0,
      })
      .returning();

    res.json({ log: row, aiResult: parsed2 });
  } catch (err) {
    req.log.error({ err }, "government audit task error");
    res.status(500).json({ error: "Ошибка вызова ИИ-аудитора" });
  }
});

// PATCH /api/government/audit/logs/:id — record actual time, compute deviation
router.patch("/api/government/audit/logs/:id", govAuth, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (!id) { res.status(400).json({ error: "Неверный ID" }); return; }

  const bodySchema = z.object({
    actualMinutes: z.number().positive(),
    moderatedByName: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверные данные" }); return; }

  const { actualMinutes, moderatedByName } = parsed.data;

  const existing = await db
    .select()
    .from(timeAuditLogsTable)
    .where(eq(timeAuditLogsTable.id, id))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Запись не найдена" }); return; }

  const deviation = calcDeviation(existing[0].estimatedMinutes, actualMinutes);
  const requiresCalibration = deviation > 20 ? 1 : 0;

  const [updated] = await db
    .update(timeAuditLogsTable)
    .set({
      actualMinutes,
      deviationPercent: parseFloat(deviation.toFixed(2)),
      requiresCalibration,
      moderatedByName: moderatedByName ?? null,
      moderatedAt: new Date(),
    })
    .where(eq(timeAuditLogsTable.id, id))
    .returning();

  res.json({ log: updated });
});

// GET /api/government/audit/logs
router.get("/api/government/audit/logs", govAuth, async (req: Request, res: Response) => {
  const calibrationOnly = req.query.calibrationOnly === "true";
  const rows = await db
    .select()
    .from(timeAuditLogsTable)
    .where(
      calibrationOnly
        ? eq(timeAuditLogsTable.requiresCalibration, 1)
        : sql`1=1`
    )
    .orderBy(desc(timeAuditLogsTable.createdAt))
    .limit(200);
  res.json({ logs: rows });
});

// GET /api/government/system-prompt
router.get("/api/government/system-prompt", govAuth, async (_req: Request, res: Response) => {
  const prompt = await getSystemPrompt();
  res.json({ promptText: prompt });
});

// PUT /api/government/system-prompt
router.put("/api/government/system-prompt", govAuth, async (req: Request, res: Response) => {
  const bodySchema = z.object({
    promptText: z.string().min(20),
    updatedByName: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Текст промта слишком короткий" }); return; }

  const existing = await db
    .select()
    .from(aiSystemPromptsTable)
    .where(eq(aiSystemPromptsTable.module, "time_auditor"))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiSystemPromptsTable)
      .set({
        promptText: parsed.data.promptText,
        updatedByName: parsed.data.updatedByName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(aiSystemPromptsTable.module, "time_auditor"));
  } else {
    await db.insert(aiSystemPromptsTable).values({
      module: "time_auditor",
      promptText: parsed.data.promptText,
      updatedByName: parsed.data.updatedByName ?? null,
    });
  }

  res.json({ ok: true });
});

// GET /api/government/citizens — list with govRole
router.get("/api/government/citizens", govAuth, async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      citizenNumber: citizensTable.citizenNumber,
      govRole: citizensTable.govRole,
      meritScore: citizensTable.meritScore,
      rank: citizensTable.rank,
    })
    .from(citizensTable)
    .orderBy(citizensTable.id)
    .limit(500);
  res.json({ citizens: rows });
});

// PATCH /api/government/citizens/:id/gov-role
router.patch("/api/government/citizens/:id/gov-role", govAuth, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  if (!id) { res.status(400).json({ error: "Неверный ID" }); return; }

  const bodySchema = z.object({
    govRole: z.enum(["citizen", "labor_officer", "gov_admin"]),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Неверная роль" }); return; }

  await db
    .update(citizensTable)
    .set({ govRole: parsed.data.govRole })
    .where(eq(citizensTable.id, id));

  res.json({ ok: true });
});

export default router;
