import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
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
