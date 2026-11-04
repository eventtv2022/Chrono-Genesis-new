import crypto from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import {
  apiRateLimitBucketsTable,
  citizensTable,
  darminSecurityEventsTable,
  db,
} from "@workspace/db";
import { sendTimeMatrixSecurityAlert } from "./telegramService";

export type RateLimitSubject = (req: Request) => string | null;

let lastCleanupHour = -1;

function hashSubject(action: string, subject: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for abuse controls");
  return crypto.createHmac("sha256", secret).update(`${action}:${subject}`).digest("hex");
}

export async function recordDarminSecurityEvent(input: {
  citizenId?: number | null;
  subjectHash?: string | null;
  source: string;
  reason: string;
}): Promise<void> {
  await db.insert(darminSecurityEventsTable).values({
    citizenId: input.citizenId ?? null,
    subjectHash: input.subjectHash ?? null,
    source: input.source,
    reason: input.reason,
  });
}

export async function consumeRateLimit(input: {
  action: string;
  subject: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<{ allowed: boolean; count: number; subjectHash: string }> {
  const now = input.now ?? Date.now();
  const windowStart = new Date(Math.floor(now / input.windowMs) * input.windowMs);
  const key = hashSubject(input.action, input.subject);
  const [bucket] = await db.insert(apiRateLimitBucketsTable).values({
    key,
    windowStartedAt: windowStart,
    requestCount: 1,
    updatedAt: new Date(now),
  }).onConflictDoUpdate({
    target: apiRateLimitBucketsTable.key,
    set: {
      requestCount: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} = ${windowStart} THEN ${apiRateLimitBucketsTable.requestCount} + 1 ELSE 1 END`,
      windowStartedAt: sql`CASE WHEN ${apiRateLimitBucketsTable.windowStartedAt} = ${windowStart} THEN ${apiRateLimitBucketsTable.windowStartedAt} ELSE ${windowStart} END`,
      updatedAt: new Date(now),
    },
  }).returning({ requestCount: apiRateLimitBucketsTable.requestCount });

  const currentHour = Math.floor(now / 3_600_000);
  if (currentHour !== lastCleanupHour) {
    lastCleanupHour = currentHour;
    void db.delete(apiRateLimitBucketsTable)
      .where(lt(apiRateLimitBucketsTable.updatedAt, new Date(now - 48 * 60 * 60 * 1000)))
      .catch(() => {});
  }

  const count = bucket?.requestCount ?? 0;
  return { allowed: count <= input.limit, count, subjectHash: key };
}

export function rateLimit(
  action: string,
  limit: number,
  windowMs: number,
  getSubject: RateLimitSubject,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const subject = getSubject(req);
    if (!subject) {
      res.status(400).json({ error: "Не удалось проверить частоту запроса" });
      return;
    }

    try {
      const result = await consumeRateLimit({ action, subject, limit, windowMs });
      if (result.allowed) {
        next();
        return;
      }

      const citizenId = req.citizen?.id ?? null;
      if (result.count === limit + 1 || (citizenId && result.count === limit + 5)) {
        await recordDarminSecurityEvent({
          citizenId,
          subjectHash: result.subjectHash,
          source: action,
          reason: "rate_limit_exceeded",
        });
      }
      if (citizenId && result.count >= limit + 5) {
        await db.update(citizensTable).set({ suspiciousActivity: true })
          .where(eq(citizensTable.id, citizenId));
        if (result.count === limit + 5) {
          await sendTimeMatrixSecurityAlert(citizenId, `${action}:rate_limit_exceeded`);
        }
      }
      res.status(429).json({ error: "Слишком много запросов. Попробуйте позже." });
    } catch (error) {
      req.log.error({ err: error, action }, "Darmin abuse-control check failed");
      res.status(503).json({ error: "Проверка безопасности временно недоступна. Попробуйте позже." });
    }
  };
}
