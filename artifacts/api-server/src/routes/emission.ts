import { Router, type IRouter } from "express";
import { getDailyApprovedTotal, getQueueSize, DAILY_EMISSION_LIMIT } from "../services/emissionService";

const router: IRouter = Router();

// GET /api/emission/status — дневной остаток лимита и FIFO-очередь
router.get("/emission/status", async (_req, res): Promise<void> => {
  const [approved, queueSize] = await Promise.all([
    getDailyApprovedTotal(),
    getQueueSize(),
  ]);

  res.json({
    dailyLimit: DAILY_EMISSION_LIMIT,
    approvedToday: approved,
    remaining: Math.max(0, DAILY_EMISSION_LIMIT - approved),
    queueSize,
  });
});

export default router;
