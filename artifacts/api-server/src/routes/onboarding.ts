import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, citizensTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import {
  issueEligiblePassport,
  SIMULATOR_DURATION_MS,
} from "../services/passportIssuanceService";

const router: IRouter = Router();
const FINAL_MINUTE_MS = 60 * 1000;

async function loadStatus(citizenId: number) {
  let [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) return null;

  const now = new Date();
  if (
    citizen.registrationStatus === "pending" &&
    citizen.availableAt &&
    citizen.availableAt.getTime() <= now.getTime()
  ) {
    const issued = await issueEligiblePassport(citizen.id, now);
    if (issued) {
      citizen = issued.citizen;
    } else {
      [citizen] = await db
        .select()
        .from(citizensTable)
        .where(eq(citizensTable.id, citizenId))
        .limit(1);
      if (!citizen) return null;
    }
  }

  const availableAt = citizen.availableAt;
  const finaleAt = availableAt
    ? new Date(availableAt.getTime() - FINAL_MINUTE_MS)
    : null;
  const pending = citizen.registrationStatus === "pending";
  const secondsRemaining =
    pending && finaleAt
      ? Math.max(0, Math.ceil((finaleAt.getTime() - now.getTime()) / 1000))
      : 0;
  const secondsUntilEligibility =
    pending && availableAt
      ? Math.max(0, Math.ceil((availableAt.getTime() - now.getTime()) / 1000))
      : 0;
  const completed =
    citizen.registrationStatus === "issued" ||
    citizen.registrationStatus === "rejected" ||
    (pending && finaleAt !== null && now.getTime() >= finaleAt.getTime());

  return {
    completed,
    startedAt: availableAt
      ? new Date(availableAt.getTime() - 60 * 60 * 1000).toISOString()
      : null,
    durationSeconds: SIMULATOR_DURATION_MS / 1000,
    secondsRemaining,
    availableAt: availableAt?.toISOString() ?? null,
    secondsUntilEligibility,
    registrationStatus: citizen.registrationStatus,
    citizenNumber: citizen.citizenNumber,
    balanceMinutes: citizen.balanceMinutes,
  };
}

router.get("/onboarding/status", requireAuth, async (req, res): Promise<void> => {
  const status = await loadStatus(req.citizen!.id);
  if (!status) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }
  res.json(status);
});

router.post("/onboarding/start", requireAuth, async (req, res): Promise<void> => {
  const status = await loadStatus(req.citizen!.id);
  if (!status) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }
  res.json(status);
});

router.post("/onboarding/complete", requireAuth, async (req, res): Promise<void> => {
  const status = await loadStatus(req.citizen!.id);
  if (!status) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  if (status.registrationStatus !== "pending") {
    res.json(status);
    return;
  }

  if (status.secondsRemaining > 0) {
    res.status(409).json({
      error: "Симуляция завершится за минуту до выдачи паспорта",
      secondsRemaining: status.secondsRemaining,
    });
    return;
  }

  await db
    .update(citizensTable)
    .set({ onboardingCompleted: true })
    .where(eq(citizensTable.id, req.citizen!.id));
  const updatedStatus = await loadStatus(req.citizen!.id);
  res.json(updatedStatus);
});

export default router;
