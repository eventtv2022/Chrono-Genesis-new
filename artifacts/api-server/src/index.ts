import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { issueDuePassports } from "./services/passportIssuanceService";
import { applyEntropy } from "./services/meritocracyService";
import { drainEmissionQueue } from "./services/emissionService";
import { airDueSlots } from "./services/tvService";
import { initBot } from "./services/telegramService";
import { rehydrateRenderQueue } from "./services/renderQueue";
import { startNodeValidator } from "./services/nodeValidatorService";
import { finalizeExpiredAuctions } from "./routes/auctions";
import { attachSocialAlarmWs } from "./services/socialAlarmWs";
import { processGovernmentPollSchedule } from "./services/governmentPollService";

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

// ── Async bootstrap — rehydrate render queue BEFORE accepting connections ──────
async function bootstrap(): Promise<void> {
  scheduleDailyEntropy();
  scheduleMidnightUTCEmissionDrain();
  scheduleMinuteTick();
  schedulePassportIssuance();
  scheduleGovernmentPolls();
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
