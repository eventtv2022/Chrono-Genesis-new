import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_MEDIA_DURATION_SEC = 60;

/** Returns the duration of an audio/video file in seconds, or null if undetectable. */
async function getFileDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      filePath,
    ], { timeout: 10_000 });
    const data = JSON.parse(stdout) as { format?: { duration?: string } };
    const duration = parseFloat(data?.format?.duration ?? "");
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}
import { db } from "@workspace/db";
import { citizensTable, timelineAnchorsTable, timelineCapsulesTable } from "@workspace/db";
import { z } from "zod";
import { logTimelineAnchorToSheets } from "../lib/googleSheets";
import { sendTransactionNotification } from "../services/telegramService";
import { isCenturyBoundaryMinute, CENTURY_STATE_PROPERTY_CODE, CENTURY_STATE_PROPERTY_MSG } from "../lib/centuryGuard";
import { isStateHeritageCoord, HERITAGE_LOCK_CODE, HERITAGE_LOCK_TITLE, HERITAGE_LOCK_MSG } from "../lib/heritageGuard";
import { requireAuth } from "../middleware/auth";

// ── Capsule media upload directory ────────────────────────────────────────────
// Computed inline (no UPLOADS_DIR import) to avoid circular-import issues at module init time
const CAPSULE_DIR = path.join(process.cwd(), "public", "uploads", "capsules");
fs.mkdirSync(CAPSULE_DIR, { recursive: true });

const capsuleUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CAPSULE_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || "";
      cb(null, `${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, _file, cb) => {
    // Accept any MIME type — server derives mediaType from mimetype after upload
    cb(null, true);
  },
});

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

// ── GET /timeline/my-anchors ──────────────────────────────────────────────────
// Returns all timeline anchors owned by the authenticated citizen.
router.get("/timeline/my-anchors", requireAuth, async (req, res): Promise<void> => {
  // citizenId comes from the authenticated session; query param is ignored
  const citizenId = req.citizen!.id;

  const anchors = await db
    .select()
    .from(timelineAnchorsTable)
    .where(eq(timelineAnchorsTable.citizenId, citizenId))
    .orderBy(timelineAnchorsTable.timelineCoord);

  // Fetch the latest capsule for each anchor in one query
  const coords = anchors.map((a) => a.timelineCoord);
  const capsuleMap = new Map<string, { text: string; mediaUrl: string | null; mediaType: string | null }>();
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
      capsuleMap.set(cap.timelineCoord, { text: cap.text, mediaUrl: cap.mediaUrl, mediaType: cap.mediaType });
    }
  }

  res.json(
    anchors.map((a) => ({
      timelineCoord: a.timelineCoord,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      capsuleText: capsuleMap.get(a.timelineCoord)?.text ?? null,
      mediaUrl: capsuleMap.get(a.timelineCoord)?.mediaUrl ?? null,
      mediaType: capsuleMap.get(a.timelineCoord)?.mediaType ?? null,
    }))
  );
});

// ── POST /timeline/capsule/upload ─────────────────────────────────────────────
// Uploads a media file (image/audio/video, ≤10 MB) for a Time Capsule.
// Requires auth token + timelineCoord body field; verifies anchor ownership before accepting.
router.post(
  "/timeline/capsule/upload",
  requireAuth,
  capsuleUpload.single("file"),
  async (req, res): Promise<void> => {
    // If multer rejected the file (wrong mime or size), req.file is undefined
    if (!req.file) {
      res.status(400).json({ error: "Файл не прикреплён или неверный формат / размер" });
      return;
    }

    const timelineCoord = String(req.body?.timelineCoord ?? "");
    if (!timelineCoord || !/^\d{12}$/.test(timelineCoord)) {
      fs.unlinkSync(req.file.path); // remove orphan
      res.status(400).json({ error: "timelineCoord обязателен (12 цифр)" });
      return;
    }

    // Verify the authenticated citizen owns this anchor
    const citizenId = req.citizen!.id;
    const anchor = await db
      .select({ id: timelineAnchorsTable.id })
      .from(timelineAnchorsTable)
      .where(and(eq(timelineAnchorsTable.citizenId, citizenId), eq(timelineAnchorsTable.timelineCoord, timelineCoord)))
      .limit(1)
      .then((r) => r[0]);

    if (!anchor) {
      fs.unlinkSync(req.file.path); // remove orphan
      res.status(403).json({ error: "Эта координата вам не принадлежит" });
      return;
    }

    let mediaType: "image" | "audio" | "video" | "document" = "document";
    if (req.file.mimetype.startsWith("image/")) mediaType = "image";
    else if (req.file.mimetype.startsWith("audio/")) mediaType = "audio";
    else if (req.file.mimetype.startsWith("video/")) mediaType = "video";

    // ── Duration guard for audio/video ────────────────────────────────────────
    if (mediaType === "audio" || mediaType === "video") {
      const duration = await getFileDurationSeconds(req.file.path);
      if (duration === null) {
        fs.unlinkSync(req.file.path); // remove unverifiable file
        res.status(400).json({
          code: "MEDIA_DURATION_UNDETECTABLE",
          error: "Не удалось проверить длительность файла. Загрузка отклонена — выберите аудио или видео в другом формате (не длиннее 60 секунд).",
        });
        return;
      }
      if (duration > MAX_MEDIA_DURATION_SEC) {
        fs.unlinkSync(req.file.path); // remove oversized file
        res.status(400).json({
          error: `Файл слишком длинный — максимальная продолжительность ${MAX_MEDIA_DURATION_SEC} секунд`,
        });
        return;
      }
    }

    // Use /api/uploads prefix so the Replit proxy (paths=["/api"]) routes
    // static-file requests to this server instead of returning 404.
    const url = `/api/uploads/capsules/${req.file.filename}`;
    res.status(201).json({ url, mediaType });
  }
);

// ── POST /timeline/capsule ────────────────────────────────────────────────────
// Saves a semantic capsule (free-text + optional media) for a citizen's anchor.
// Requires auth token; citizenId is derived from req.citizen — body citizenId is ignored.
const CapsuleBody = z.object({
  timelineCoord: z.string().regex(/^\d{12}$/, "timelineCoord must be 12 digits"),
  text: z.string().min(1).max(1000),
  mediaUrl: z.string().nullable().optional(),
  mediaType: z.enum(["image", "audio", "video", "document"]).nullable().optional(),
});

router.post("/timeline/capsule", requireAuth, async (req, res): Promise<void> => {
  const parsed = CapsuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
    return;
  }
  const { timelineCoord, text, mediaUrl, mediaType } = parsed.data;

  // citizenId comes exclusively from the authenticated session — never from the body
  const citizenId = req.citizen!.id;

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
    .values({ citizenId, timelineCoord, text, mediaUrl: mediaUrl ?? null, mediaType: mediaType ?? null })
    .returning();

  res.status(201).json({ id: capsule!.id, timelineCoord, createdAt: capsule!.createdAt.toISOString() });
});

// ── Multer error handler (size / mime type rejections) ────────────────────────
// Must be registered after the upload routes so Express picks it up as an error middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use("/timeline/capsule/upload", (err: unknown, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction): void => {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Файл слишком большой — максимум 10 МБ" });
      return;
    }
    if (code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({ error: "Неожиданное поле файла" });
      return;
    }
  }
  const message = err instanceof Error ? err.message : "Ошибка загрузки файла";
  res.status(400).json({ error: message });
});

export default router;
