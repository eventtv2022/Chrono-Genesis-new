import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import {
  issueDuePassports,
  retryPendingPassportEmails,
  retryPendingPassportReadyNotifications,
  warnIfEligiblePassportBacklog,
} from "./services/passportIssuanceService";
import { applyEntropy } from "./services/meritocracyService";
import { drainEmissionQueue } from "./services/emissionService";
import { airDueSlots } from "./services/tvService";
import { initBot, sendTimeMatrixDailyDigests } from "./services/telegramService";
import { rehydrateRenderQueue } from "./services/renderQueue";
import { startNodeValidator } from "./services/nodeValidatorService";
import { finalizeExpiredAuctions } from "./routes/auctions";
import { attachSocialAlarmWs } from "./services/socialAlarmWs";
import { processGovernmentPollSchedule } from "./services/governmentPollService";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Admin/notification bot — uses ADMIN_BOT_TOKEN (old bot for alerts & commands).
// Client-facing bot (@timenation_bot) token lives in TELEGRAM_BOT_TOKEN and is
// used exclusively for TWA initData validation.
const adminBotToken = process.env["ADMIN_BOT_TOKEN"] ?? process.env["TELEGRAM_BOT_TOKEN"];
if (adminBotToken) {
  initBot(adminBotToken);
} else {
  logger.info("ADMIN_BOT_TOKEN not set — Telegram admin bot disabled");
}

function scheduleDailyEntropy() {
  const now = new Date();
  const moscowOffset = 3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const totalOffset = (moscowOffset + utcOffset) * 60 * 1000;

  const next3amMoscow = new Date(now);
  next3amMoscow.setHours(0, 0, 0, 0);
  next3amMoscow.setTime(next3amMoscow.getTime() - totalOffset);
  next3amMoscow.setHours(next3amMoscow.getHours() + 3);
  if (next3amMoscow <= now) {
    next3amMoscow.setDate(next3amMoscow.getDate() + 1);
  }

  const msUntilFirst = next3amMoscow.getTime() - now.getTime();

  setTimeout(() => {
    applyEntropy().catch((err) => logger.error({ err }, "Entropy cron failed"));
    setInterval(
      () => applyEntropy().catch((err) => logger.error({ err }, "Entropy cron failed")),
      24 * 60 * 60 * 1000
    );
  }, msUntilFirst);

  logger.info(
    { nextRunMs: msUntilFirst },
    "Entropy cron scheduled (3:00 Moscow)"
  );
}

function scheduleMidnightUTCEmissionDrain() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  const msUntilFirst = nextMidnight.getTime() - now.getTime();

  setTimeout(() => {
    drainEmissionQueue().catch((err) => logger.error({ err }, "Emission drain cron failed"));
    setInterval(
      () => drainEmissionQueue().catch((err) => logger.error({ err }, "Emission drain cron failed")),
      24 * 60 * 60 * 1000
    );
  }, msUntilFirst);

  logger.info({ nextRunMs: msUntilFirst }, "Emission drain cron scheduled (00:00 UTC)");
}

function scheduleMinuteTick() {
  const now = new Date();
  const msToNextMinute =
    (60 - now.getUTCSeconds()) * 1000 - now.getUTCMilliseconds() + 200;

  const tick = () => {
    airDueSlots().catch((err) => logger.error({ err }, "airDueSlots cron failed"));
    finalizeExpiredAuctions().catch((err) => logger.error({ err }, "auctionFinalize cron failed"));
  };

  setTimeout(() => {
    tick();
    setInterval(tick, 60 * 1000);
  }, msToNextMinute);

  logger.info({ msToNextMinute }, "Minute tick cron scheduled (TV slot airing + auction finalize)");
}

function schedulePassportIssuance() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const issued = await issueDuePassports();
      if (issued > 0) logger.info({ issued }, "Eligible passports issued by scheduler");
      try {
        await warnIfEligiblePassportBacklog();
      } catch (err) {
        logger.error({ err }, "Passport issuance backlog check failed");
      }
    } catch (err) {
      logger.error({ err }, "Passport issuance scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), 15_000);
  logger.info("Passport issuance scheduler scheduled (15-second interval)");
}

function schedulePassportReadyNotificationRetries() {
  const tick = () =>
    retryPendingPassportReadyNotifications().catch((err) =>
      logger.error({ err }, "Passport-ready Telegram notification retry worker failed"),
    );
  void tick();
  setInterval(tick, 30_000);
  logger.info("Passport-ready Telegram notification retry worker scheduled (30-second interval)");
}

function schedulePassportEmailRetries() {
  const tick = () =>
    retryPendingPassportEmails().catch((err) =>
      logger.error({ err }, "Passport email retry worker failed"),
    );
  void tick();
  setInterval(tick, 30_000);
  logger.info("Passport email retry worker scheduled (30-second interval)");
}

function scheduleGovernmentPolls() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processGovernmentPollSchedule();
    } catch (err) {
      logger.error({ err }, "Government poll scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), 15_000);
  logger.info("Government poll scheduler scheduled (15-second interval)");
}

function scheduleTimeMatrixDailyDigests() {
  let running = false;
  const tick = async () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    if (parts !== "21:00" || running) return;
    running = true;
    try {
      await sendTimeMatrixDailyDigests();
    } catch (err) {
      logger.error({ err }, "Time Matrix daily digest scheduler failed");
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000);
  logger.info("Time Matrix Telegram daily digest scheduled (21:00 Moscow)");
}

// ── Async bootstrap — rehydrate render queue BEFORE accepting connections ──────
async function bootstrap(): Promise<void> {
  // Keep the fiat-origin pool aligned with the spendable wallet: any ordinary
  // DarMin debit consumes fiat-origin credits first, so received/rewarded units
  // cannot restore eligibility after a purchased DarMin has already been spent.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION consume_fiat_darmin_credits() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.balance_minutes < OLD.balance_minutes THEN
        NEW.fiat_darmin_balance := GREATEST(
          0::real,
          OLD.fiat_darmin_balance - (OLD.balance_minutes - NEW.balance_minutes)
        );
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await db.execute(sql`DROP TRIGGER IF EXISTS citizens_consume_fiat_darmin_credits ON citizens`);
  await db.execute(sql`
    CREATE TRIGGER citizens_consume_fiat_darmin_credits
    BEFORE UPDATE OF balance_minutes ON citizens
    FOR EACH ROW EXECUTE FUNCTION consume_fiat_darmin_credits()
  `);

  scheduleDailyEntropy();
  scheduleMidnightUTCEmissionDrain();
  scheduleMinuteTick();
  schedulePassportIssuance();
  schedulePassportReadyNotificationRetries();
  schedulePassportEmailRetries();
  scheduleGovernmentPolls();
  scheduleTimeMatrixDailyDigests();
  startNodeValidator();

  // ── Create HTTP server from Express app ───────────────────────────────────────
  const server = http.createServer(app);

  // ── Attach Social Alarm WebSocket server ──────────────────────────────────────
  attachSocialAlarmWs(server);

  // ── Render queue rehydration ─────────────────────────────────────────────────
  try {
    await rehydrateRenderQueue();
  } catch (err) {
    logger.error({ err }, "Render queue rehydration failed — server will start anyway");
  }

  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        return;
      }
      logger.info({ port }, "TimeNation API Server listening");
      resolve();
    });
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal bootstrap error — exiting");
  process.exit(1);
});
