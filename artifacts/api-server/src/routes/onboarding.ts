import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { db, citizensTable, onboardingProgressTable, type OnboardingProgress } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import {
  issueEligiblePassport,
  SIMULATOR_DURATION_MS,
} from "../services/passportIssuanceService";

const router: IRouter = Router();
const FINAL_MINUTE_MS = 60 * 1000;
const ProgressActionSchema = z.object({
  phase: z.enum(["guide", "simulator"]),
  action: z.enum(["reveal", "continue", "back"]),
  questionId: z.number().int(),
});

function serializeProgress(progress: OnboardingProgress) {
  return {
    guideCurrentQuestionId: progress.guideCurrentQuestionId,
    guideRevealedQuestionIds: progress.guideRevealedQuestionIds,
    guideCompleted: progress.guideCompleted,
    simulatorCurrentQuestionId: progress.simulatorCurrentQuestionId,
    simulatorRevealedQuestionIds: progress.simulatorRevealedQuestionIds,
    simulatorCompleted: progress.simulatorCompleted,
  };
}

async function ensureCitizenProgress(citizenId: number): Promise<OnboardingProgress> {
  const [existing] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.citizenId, citizenId))
    .limit(1);
  if (existing) return existing;

  const progressToken = crypto.randomBytes(32).toString("hex");
  const [created] = await db
    .insert(onboardingProgressTable)
    .values({
      progressToken,
      citizenId,
      guideCompleted: true,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.citizenId, citizenId))
    .limit(1);
  if (!raced) throw new Error("Could not initialize citizen onboarding progress");
  return raced;
}

async function updateProgress(
  progressToken: string,
  citizenId: number | null,
  input: z.infer<typeof ProgressActionSchema>,
): Promise<OnboardingProgress | null> {
  return db.transaction(async (tx) => {
    const [progress] = await tx
      .select()
      .from(onboardingProgressTable)
      .where(eq(onboardingProgressTable.progressToken, progressToken))
      .for("update")
      .limit(1);
    if (!progress || progress.citizenId !== citizenId) return null;

    const guide = input.phase === "guide";
    if (guide && citizenId !== null) return null;
    if (!guide && citizenId === null) return null;

    const firstQuestionId = guide ? 1 : 31;
    const lastQuestionId = guide ? 30 : 60;
    const currentQuestionId = guide
      ? progress.guideCurrentQuestionId
      : progress.simulatorCurrentQuestionId;
    const revealedQuestionIds = guide
      ? progress.guideRevealedQuestionIds
      : progress.simulatorRevealedQuestionIds;
    if (input.questionId !== currentQuestionId) return null;

    let nextQuestionId = currentQuestionId;
    let nextRevealedQuestionIds = revealedQuestionIds;
    let completed = guide ? progress.guideCompleted : progress.simulatorCompleted;

    if (input.action === "reveal") {
      nextRevealedQuestionIds = [...new Set([...revealedQuestionIds, currentQuestionId])].sort((a, b) => a - b);
    } else if (input.action === "back") {
      nextQuestionId = Math.max(firstQuestionId, currentQuestionId - 1);
    } else {
      if (!revealedQuestionIds.includes(currentQuestionId)) return null;
      if (currentQuestionId === lastQuestionId) {
        completed = true;
      } else {
        nextQuestionId = currentQuestionId + 1;
      }
    }

    const updates = guide
      ? {
          guideCurrentQuestionId: nextQuestionId,
          guideRevealedQuestionIds: nextRevealedQuestionIds,
          guideCompleted: completed,
          updatedAt: new Date(),
        }
      : {
          simulatorCurrentQuestionId: nextQuestionId,
          simulatorRevealedQuestionIds: nextRevealedQuestionIds,
          simulatorCompleted: completed,
          updatedAt: new Date(),
        };

    const [updated] = await tx
      .update(onboardingProgressTable)
      .set(updates)
      .where(eq(onboardingProgressTable.progressToken, progressToken))
      .returning();
    return updated ?? null;
  });
}

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

  const progress = await ensureCitizenProgress(citizen.id);

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
    simulatorCurrentQuestionId: progress.simulatorCurrentQuestionId,
    simulatorRevealedQuestionIds: progress.simulatorRevealedQuestionIds,
    simulatorCompleted: progress.simulatorCompleted,
  };
}

router.post("/onboarding/progress/sessions", async (_req, res): Promise<void> => {
  const progressToken = crypto.randomBytes(32).toString("hex");
  const [progress] = await db
    .insert(onboardingProgressTable)
    .values({ progressToken })
    .returning();
  res.status(201).json({ progressToken, ...serializeProgress(progress!) });
});

router.get("/onboarding/progress/sessions/:progressToken", async (req, res): Promise<void> => {
  const [progress] = await db
    .select()
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.progressToken, String(req.params.progressToken)))
    .limit(1);
  if (!progress) {
    res.status(404).json({ error: "Прогресс знакомства не найден" });
    return;
  }
  res.json({ progressToken: progress.progressToken, ...serializeProgress(progress) });
});

router.patch("/onboarding/progress/sessions/:progressToken", async (req, res): Promise<void> => {
  const parsed = ProgressActionSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.phase !== "guide") {
    res.status(400).json({ error: "Неверное действие для этапа знакомства" });
    return;
  }
  const progressToken = String(req.params.progressToken);
  const progress = await updateProgress(progressToken, null, parsed.data);
  if (!progress) {
    res.status(409).json({ error: "Порядок вопросов изменился или сессия уже привязана" });
    return;
  }
  res.json({ progressToken, ...serializeProgress(progress) });
});

router.get("/onboarding/progress", requireAuth, async (req, res): Promise<void> => {
  const progress = await ensureCitizenProgress(req.citizen!.id);
  res.json(serializeProgress(progress));
});

router.patch("/onboarding/progress", requireAuth, async (req, res): Promise<void> => {
  const parsed = ProgressActionSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.phase !== "simulator") {
    res.status(400).json({ error: "Неверное действие для симуляции паспорта" });
    return;
  }
  const progress = await ensureCitizenProgress(req.citizen!.id);
  const updated = await updateProgress(progress.progressToken, req.citizen!.id, parsed.data);
  if (!updated) {
    res.status(409).json({ error: "Порядок вопросов изменился или действие не разрешено" });
    return;
  }
  res.json(serializeProgress(updated));
});

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
