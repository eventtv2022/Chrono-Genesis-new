import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, citizensTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const ONBOARDING_DURATION_MS = 60 * 60 * 1000;

function toStatus(citizen: typeof citizensTable.$inferSelect) {
  const startedAt = citizen.onboardingStartedAt;
  const remainingMs = citizen.onboardingCompleted
    ? 0
    : startedAt
      ? Math.max(0, ONBOARDING_DURATION_MS - (Date.now() - startedAt.getTime()))
      : ONBOARDING_DURATION_MS;

  return {
    completed: citizen.onboardingCompleted,
    startedAt: startedAt?.toISOString() ?? null,
    durationSeconds: ONBOARDING_DURATION_MS / 1000,
    secondsRemaining: Math.ceil(remainingMs / 1000),
  };
}

router.get("/onboarding/status", requireAuth, (req, res): void => {
  res.json(toStatus(req.citizen!));
});

router.post("/onboarding/start", requireAuth, async (req, res): Promise<void> => {
  const citizen = req.citizen!;
  if (citizen.onboardingCompleted || citizen.onboardingStartedAt) {
    res.json(toStatus(citizen));
    return;
  }

  const startedAt = new Date();
  const [updated] = await db
    .update(citizensTable)
    .set({ onboardingStartedAt: startedAt })
    .where(eq(citizensTable.id, citizen.id))
    .returning();

  res.json(toStatus(updated!));
});

router.post("/onboarding/complete", requireAuth, async (req, res): Promise<void> => {
  const citizen = req.citizen!;
  if (citizen.onboardingCompleted) {
    res.json(toStatus(citizen));
    return;
  }

  if (!citizen.onboardingStartedAt) {
    res.status(409).json({ error: "Обучение ещё не начато" });
    return;
  }

  const elapsedMs = Date.now() - citizen.onboardingStartedAt.getTime();
  if (elapsedMs < ONBOARDING_DURATION_MS) {
    res.status(409).json({
      error: "60-минутный учебный этап ещё не завершён",
      secondsRemaining: Math.ceil((ONBOARDING_DURATION_MS - elapsedMs) / 1000),
    });
    return;
  }

  const [updated] = await db
    .update(citizensTable)
    .set({ onboardingCompleted: true })
    .where(eq(citizensTable.id, citizen.id))
    .returning();

  res.json(toStatus(updated!));
});

export default router;
