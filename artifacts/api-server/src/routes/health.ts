import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getTelegramPollingStatus } from "../services/telegramService";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    telegramPolling: getTelegramPollingStatus(),
  });
  res.json(data);
});

router.get("/system/time", (_req, res) => {
  const now = new Date();
  res.json({
    iso: now.toISOString(),
    utc: now.toISOString().slice(11, 19),
    ts: now.getTime(),
  });
});

export default router;
