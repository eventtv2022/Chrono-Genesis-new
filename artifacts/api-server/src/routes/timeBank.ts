import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { timeBankDisclosureAcceptancesTable } from "@workspace/db/schema";
import { requireAuth } from "../middleware/auth";
import {
  getTimeBankStatus,
  borrowFromBank,
  repayFromBalance,
  repayLoan,
} from "../services/timeBankService";

const router: IRouter = Router();
// Increment this whenever the pre-use disclosure text changes.
const TIME_BANK_DISCLOSURE_VERSION = "2026-10-v1";

async function hasCurrentDisclosureAcceptance(citizenId: number): Promise<boolean> {
  const [acceptance] = await db
    .select({ id: timeBankDisclosureAcceptancesTable.id })
    .from(timeBankDisclosureAcceptancesTable)
    .where(and(
      eq(timeBankDisclosureAcceptancesTable.citizenId, citizenId),
      eq(timeBankDisclosureAcceptancesTable.disclosureVersion, TIME_BANK_DISCLOSURE_VERSION),
    ))
    .limit(1);
  return Boolean(acceptance);
}

async function requireCurrentDisclosure(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]): Promise<void> {
  if (!req.citizen) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  try {
    if (!(await hasCurrentDisclosureAcceptance(req.citizen.id))) {
      res.status(428).json({ code: "TIME_BANK_DISCLOSURE_REQUIRED", error: "Перед использованием Банка времени необходимо ознакомиться с информацией и подтвердить согласие." });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ err: error }, "timebank disclosure check failed");
    res.status(500).json({ error: "Не удалось проверить подтверждение условий Банка времени." });
  }
}

// GET /api/timebank/status?citizenId=...
router.get("/timebank/disclosure", requireAuth, async (req, res): Promise<void> => {
  try {
    const accepted = await hasCurrentDisclosureAcceptance(req.citizen!.id);
    res.json({ version: TIME_BANK_DISCLOSURE_VERSION, accepted });
  } catch (error) {
    req.log.error({ err: error }, "timebank disclosure status failed");
    res.status(500).json({ error: "Не удалось проверить подтверждение условий Банка времени." });
  }
});

router.post("/timebank/disclosure/accept", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({
    version: z.literal(TIME_BANK_DISCLOSURE_VERSION),
    language: z.enum(["ru", "en"]),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Не удалось подтвердить актуальную версию информации Банка времени." });
    return;
  }
  try {
    await db.insert(timeBankDisclosureAcceptancesTable).values({
      citizenId: req.citizen!.id,
      disclosureVersion: parsed.data.version,
      language: parsed.data.language,
    }).onConflictDoNothing();
    res.json({ ok: true, version: parsed.data.version, accepted: true });
  } catch (error) {
    req.log.error({ err: error }, "timebank disclosure acceptance failed");
    res.status(500).json({ error: "Не удалось сохранить подтверждение." });
  }
});

router.get("/timebank/status", requireAuth, requireCurrentDisclosure, async (req, res): Promise<void> => {
  try {
    const status = await getTimeBankStatus(req.citizen!.id);
    res.json(status);
  } catch (e) {
    req.log.error(e);
    res.status(404).json({ error: (e as Error).message });
  }
});

// POST /api/timebank/borrow  { citizenId, amount }
router.post("/timebank/borrow", requireAuth, requireCurrentDisclosure, async (req, res): Promise<void> => {
  const schema = z.object({
    amount: z.number().positive().max(480),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные параметры", issues: parsed.error.issues });
    return;
  }
  try {
    await borrowFromBank(req.citizen!.id, parsed.data.amount);
    const status = await getTimeBankStatus(req.citizen!.id);
    res.json({ ok: true, ...status });
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "timebank borrow rejected");
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/timebank/repay  { citizenId, amount, loanId? }
// FIFO-погашение по всем активным займам. loanId опционален (для обратной совместимости).
router.post("/timebank/repay", requireAuth, requireCurrentDisclosure, async (req, res): Promise<void> => {
  const schema = z.object({
    amount: z.number().positive(),
    loanId: z.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные параметры", issues: parsed.error.issues });
    return;
  }
  try {
    if (parsed.data.loanId !== undefined) {
      await repayLoan(req.citizen!.id, parsed.data.loanId, parsed.data.amount);
    } else {
      await repayFromBalance(req.citizen!.id, parsed.data.amount);
    }
    const status = await getTimeBankStatus(req.citizen!.id);
    res.json({ ok: true, ...status });
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "timebank repay rejected");
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
