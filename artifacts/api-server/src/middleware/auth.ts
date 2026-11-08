import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { citizenActivityDaysTable, citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { canPublishUnmoderatedContent, canUseAdultKycFeature, deriveAgeTier } from "../services/ageGateService";

declare global {
  namespace Express {
    interface Request {
      citizen?: typeof citizensTable.$inferSelect;
    }
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.citizen) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  if (req.citizen.isAdmin !== 1) {
    res.status(403).json({ error: "Доступ запрещён — требуются права администратора" });
    return;
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Требуется авторизация (отсутствует токен)" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Пустой токен" });
    return;
  }

  try {
    const [citizen] = await db
      .select()
      .from(citizensTable)
      .where(eq(citizensTable.authToken, token))
      .limit(1);

    if (!citizen) {
      res.status(401).json({ error: "Неверный или просроченный токен авторизации" });
      return;
    }
    if (citizen.status === "blocked") {
      res.status(403).json({ error: "Доступ временно заблокирован администратором" });
      return;
    }

    const ageTier = deriveAgeTier(citizen.dateOfBirth ?? "");
    if (ageTier && ageTier !== "UNDER_13" && citizen.ageTier !== ageTier) {
      await db.update(citizensTable).set({ ageTier }).where(eq(citizensTable.id, citizen.id));
      citizen.ageTier = ageTier;
    }
    req.citizen = citizen;
    const requestPath = req.originalUrl.split("?")[0];
    const isHourglassRequest = /\/(?:admin\/)?hourglass(?:\/spin|\/refill)?\/?$/.test(requestPath);
    const isProfileRefresh = req.method === "GET" && /\/citizens\/\d+\/?$/.test(requestPath);
    if (!isHourglassRequest && !isProfileRefresh) {
      try {
        await db.insert(citizenActivityDaysTable).values({
          citizenId: citizen.id,
          activityDate: new Date().toISOString().slice(0, 10),
        }).onConflictDoUpdate({
          target: [citizenActivityDaysTable.citizenId, citizenActivityDaysTable.activityDate],
          set: { lastActivityAt: new Date() },
        });
      } catch (activityError) {
        req.log.error({ err: activityError, citizenId: citizen.id }, "citizen activity tracking failed");
      }
    }
    next();
  } catch (err) {
    req.log.error({ err }, "requireAuth DB error");
    res.status(500).json({ error: "Внутренняя ошибка авторизации" });
  }
}

export function requireAdultKyc(req: Request, res: Response, next: NextFunction): void {
  const citizen = req.citizen;
  if (!citizen) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  if (!canUseAdultKycFeature(citizen.dateOfBirth, citizen.kycVerified)) {
    res.status(403).json({
      error: "Функция доступна только совершеннолетним гражданам после подтверждения KYC",
      code: "ADULT_KYC_REQUIRED",
    });
    return;
  }
  next();
}

export function requireAdult(req: Request, res: Response, next: NextFunction): void {
  const citizen = req.citizen;
  if (!citizen) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  if (!canPublishUnmoderatedContent(citizen.dateOfBirth)) {
    res.status(403).json({
      error: "Публикация доступна только совершеннолетним гражданам",
      code: "ADULT_REQUIRED",
    });
    return;
  }
  next();
}
