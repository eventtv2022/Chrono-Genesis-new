import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, timelineAnchorsTable, timelineCapsulesTable } from "@workspace/db";
import { z } from "zod";
import { logTimelineAnchorToSheets } from "../lib/googleSheets";
import { sendTransactionNotification } from "../services/telegramService";
import { isCenturyBoundaryMinute, CENTURY_STATE_PROPERTY_CODE, CENTURY_STATE_PROPERTY_MSG } from "../lib/centuryGuard";
import { isStateHeritageCoord, HERITAGE_LOCK_CODE, HERITAGE_LOCK_TITLE, HERITAGE_LOCK_MSG } from "../lib/heritageGuard";

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

  // 🏛️ Century boundary minutes are Non-Transferable State Property
  if (isCenturyBoundaryMinute(timelineCoord)) {
    res.status(403).json({ code: CENTURY_STATE_PROPERTY_CODE, error: CENTURY_STATE_PROPERTY_MSG });
    return;
  }

  // 🏛️ Heritage Registry check
  const heritage = await isStateHeritageCoord(timelineCoord);
  if (heritage) {
    res.status(403).json({
      code: HERITAGE_LOCK_CODE,
      title: HERITAGE_LOCK_TITLE,
      eventName: heritage.title,
      error: HERITAGE_LOCK_MSG,
    });
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

  // Fetch the latest capsule text for each anchor in one query
  const coords = anchors.map((a) => a.timelineCoord);
  const capsuleMap = new Map<string, string>();
  if (coords.length > 0) {
    const capsules = await db
      .select()
      .from(timelineCapsulesTable)
      .where(
        and(
          eq(timelineCapsulesTable.citizenId, citizenId),
          inArray(timelineCapsulesTable.timelineCoord, coords)
        )
      )
      .orderBy(timelineCapsulesTable.createdAt);
    // Keep the latest per coord (last wins since ordered ASC)
    for (const cap of capsules) {
      capsuleMap.set(cap.timelineCoord, cap.text);
    }
  }

  res.json(
    anchors.map((a) => ({
      timelineCoord: a.timelineCoord,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      capsuleText: capsuleMap.get(a.timelineCoord) ?? null,
    }))
  );
});

// ── POST /timeline/capsule ────────────────────────────────────────────────────
// Saves a semantic capsule (free-text meaning) for a citizen's timeline anchor.
const CapsuleBody = z.object({
  citizenId: z.number().int().positive(),
  timelineCoord: z.string().regex(/^\d{12}$/, "timelineCoord must be 12 digits"),
  text: z.string().min(1).max(1000),
});

router.post("/timeline/capsule", async (req, res): Promise<void> => {
  const parsed = CapsuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }
  const { citizenId, timelineCoord, text } = parsed.data;

  const citizen = await db
    .select({ id: citizensTable.id })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1)
    .then((r) => r[0]);

  if (!citizen) {
    res.status(404).json({ error: "Гражданин не найден" });
    return;
  }

  const anchor = await db
    .select({ id: timelineAnchorsTable.id })
    .from(timelineAnchorsTable)
    .where(and(eq(timelineAnchorsTable.citizenId, citizenId), eq(timelineAnchorsTable.timelineCoord, timelineCoord)))
    .limit(1)
    .then((r) => r[0]);

  if (!anchor) {
    res.status(403).json({ error: "Эта координата вам не принадлежит" });
    return;
  }

  // Upsert: remove any existing capsule for this anchor, then insert fresh
  await db
    .delete(timelineCapsulesTable)
    .where(
      and(
        eq(timelineCapsulesTable.citizenId, citizenId),
        eq(timelineCapsulesTable.timelineCoord, timelineCoord)
      )
    );

  const [capsule] = await db
    .insert(timelineCapsulesTable)
    .values({ citizenId, timelineCoord, text })
    .returning();

  res.status(201).json({ id: capsule!.id, timelineCoord, createdAt: capsule!.createdAt.toISOString() });
});

export default router;
