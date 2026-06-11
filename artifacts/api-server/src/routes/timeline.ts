import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, timelineAnchorsTable } from "@workspace/db";
import { z } from "zod";
import { logTimelineAnchorToSheets } from "../lib/googleSheets";
import { sendTransactionNotification } from "../services/telegramService";

const router: IRouter = Router();

const AnchorBody = z.object({
  citizenId: z.number().int().positive(),
  timelineCoord: z
    .string()
    .regex(
      /^\d{12}$/,
      "timelineCoord must be 12 digits: YYYYMMDDHHmm"
    ),
});

function validateCoord(coord: string): string | null {
  const year = parseInt(coord.slice(0, 4), 10);
  const month = parseInt(coord.slice(4, 6), 10);
  const day = parseInt(coord.slice(6, 8), 10);
  const hour = parseInt(coord.slice(8, 10), 10);
  const minute = parseInt(coord.slice(10, 12), 10);

  if (year < 1 || year > 9999) return "Год должен быть от 1 до 9999";
  if (month < 1 || month > 12) return "Месяц должен быть от 01 до 12";
  if (day < 1 || day > 31) return "День должен быть от 01 до 31";
  if (hour < 0 || hour > 23) return "Час должен быть от 00 до 23";
  if (minute < 0 || minute > 59) return "Минута должна быть от 00 до 59";
  return null;
}

function formatCoordHuman(coord: string): string {
  const year = coord.slice(0, 4).replace(/^0+/, "") || "1";
  const month = coord.slice(4, 6);
  const day = coord.slice(6, 8);
  const hour = coord.slice(8, 10);
  const min = coord.slice(10, 12);
  return `${day}.${month}.${year} ${hour}:${min}`;
}

router.post("/timeline/anchor", async (req, res): Promise<void> => {
  const parsed = AnchorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citizenId, timelineCoord } = parsed.data;

  const validErr = validateCoord(timelineCoord);
  if (validErr) {
    res.status(400).json({ error: validErr });
    return;
  }

  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    res.status(404).json({ error: "Citizen not found" });
    return;
  }

  const transferableBalance = citizen.balanceMinutes - 1;
  if (transferableBalance <= 0) {
    res.status(400).json({
      error: "Недостаточно минут. Родовая Минута не может быть использована для закрепления координаты.",
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(timelineAnchorsTable)
    .where(eq(timelineAnchorsTable.timelineCoord, timelineCoord))
    .limit(1);

  if (existing) {
    if (existing.citizenId === citizenId) {
      res.status(409).json({ error: "Эта координата уже закреплена за вами" });
    } else {
      res.status(409).json({ error: "Эта координата уже занята другим гражданином" });
    }
    return;
  }

  const [anchor] = await db
    .insert(timelineAnchorsTable)
    .values({ timelineCoord, citizenId, status: "active" })
    .returning();

  const [updatedCitizen] = await db
    .update(citizensTable)
    .set({ balanceMinutes: citizen.balanceMinutes - 1 })
    .where(eq(citizensTable.id, citizenId))
    .returning();

  req.log.info({ citizenId, timelineCoord }, "Timeline anchor created");

  const sheetsLogged = await logTimelineAnchorToSheets({
    timelineCoord,
    citizenId,
    citizenName: citizen.name,
    createdAt: anchor.createdAt.toISOString(),
  });

  const humanCoord = formatCoordHuman(timelineCoord);
  const tgMsg =
    `🕰 *TimeNation — Таймлайн*\n\n` +
    `⏳ Координата *${humanCoord}* успешно зафиксирована за вашим родом навсегда!\n\n` +
    `💰 Остаток баланса: *${updatedCitizen.balanceMinutes} мин*`;

  await sendTransactionNotification(citizenId, tgMsg).catch(() => {});

  res.status(201).json({
    anchor: { ...anchor, createdAt: anchor.createdAt.toISOString() },
    newBalance: updatedCitizen.balanceMinutes,
    sheetsLogged,
  });
});

router.get("/timeline/occupied", async (req, res): Promise<void> => {
  const rawYear = req.query["year"];
  const rawMonth = req.query["month"];
  const rawDay = req.query["day"];

  const year = rawYear ? String(rawYear).padStart(4, "0") : null;
  const month = rawMonth ? String(rawMonth).padStart(2, "0") : null;
  const day = rawDay ? String(rawDay).padStart(2, "0") : null;

  let coordMin: string;
  let coordMax: string;

  if (year && month && day) {
    coordMin = `${year}${month}${day}0000`;
    coordMax = `${year}${month}${day}2359`;
  } else if (year && month) {
    coordMin = `${year}${month}010000`;
    coordMax = `${year}${month}312359`;
  } else if (year) {
    coordMin = `${year}010100000`;
    coordMax = `${year}12312359`;
  } else {
    res.status(400).json({ error: "At least year is required" });
    return;
  }

  const anchors = await db
    .select()
    .from(timelineAnchorsTable)
    .where(
      and(
        gte(timelineAnchorsTable.timelineCoord, coordMin),
        lte(timelineAnchorsTable.timelineCoord, coordMax)
      )
    );

  res.json(
    anchors.map((a) => ({
      timelineCoord: a.timelineCoord,
      citizenId: a.citizenId,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

// ── GET /timeline/my-anchors?citizenId=X ─────────────────────────────────────
// Returns all timeline anchors owned by a citizen, sorted chronologically.
router.get("/timeline/my-anchors", async (req, res): Promise<void> => {
  const citizenId = parseInt(String(req.query["citizenId"] ?? ""), 10);
  if (isNaN(citizenId) || citizenId <= 0) {
    res.status(400).json({ error: "citizenId обязателен" });
    return;
  }

  const anchors = await db
    .select()
    .from(timelineAnchorsTable)
    .where(eq(timelineAnchorsTable.citizenId, citizenId))
    .orderBy(timelineAnchorsTable.timelineCoord);

  res.json(
    anchors.map((a) => ({
      timelineCoord: a.timelineCoord,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

export default router;
