import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      citizen?: typeof citizensTable.$inferSelect;
    }
  }
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

    req.citizen = citizen;
    next();
  } catch (err) {
    req.log.error({ err }, "requireAuth DB error");
    res.status(500).json({ error: "Внутренняя ошибка авторизации" });
  }
}
