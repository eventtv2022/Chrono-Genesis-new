import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  getTimeBankStatus,
  borrowFromBank,
  repayLoan,
} from "../services/timeBankService";

const router: IRouter = Router();

// GET /api/timebank/status?citizenId=...
router.get("/timebank/status", async (req, res): Promise<void> => {
  const citizenId = parseInt(String(req.query["citizenId"] ?? ""), 10);
  if (isNaN(citizenId)) {
    res.status(400).json({ error: "citizenId обязателен" });
    return;
  }
  try {
    const status = await getTimeBankStatus(citizenId);
    res.json(status);
  } catch (e) {
    req.log.error(e);
    res.status(404).json({ error: (e as Error).message });
  }
});

// POST /api/timebank/borrow  { citizenId, amount }
router.post("/timebank/borrow", async (req, res): Promise<void> => {
  const schema = z.object({
    citizenId: z.number().int().positive(),
    amount: z.number().int().min(1).max(480),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные параметры", issues: parsed.error.issues });
    return;
  }
  try {
    await borrowFromBank(parsed.data.citizenId, parsed.data.amount);
    const status = await getTimeBankStatus(parsed.data.citizenId);
    res.json({ ok: true, ...status });
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "timebank borrow rejected");
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/timebank/repay  { citizenId, loanId, amount }
router.post("/timebank/repay", async (req, res): Promise<void> => {
  const schema = z.object({
    citizenId: z.number().int().positive(),
    loanId: z.number().int().positive(),
    amount: z.number().int().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Неверные параметры", issues: parsed.error.issues });
    return;
  }
  try {
    await repayLoan(parsed.data.citizenId, parsed.data.loanId, parsed.data.amount);
    const status = await getTimeBankStatus(parsed.data.citizenId);
    res.json({ ok: true, ...status });
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, "timebank repay rejected");
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
