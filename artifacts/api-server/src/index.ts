import app from "./app";
import { logger } from "./lib/logger";
import { applyEntropy } from "./services/meritocracyService";
import { drainEmissionQueue } from "./services/emissionService";
import { airDueSlots } from "./services/tvService";
import { initBot } from "./services/telegramService";

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

if (process.env["TELEGRAM_BOT_TOKEN"]) {
  initBot(process.env["TELEGRAM_BOT_TOKEN"]);
} else {
  logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
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

scheduleDailyEntropy();

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

scheduleMidnightUTCEmissionDrain();

// ── Minute tick: air due TV slots ─────────────────────────────────────────────
function scheduleMinuteTick() {
  const now = new Date();
  const msToNextMinute =
    (60 - now.getUTCSeconds()) * 1000 - now.getUTCMilliseconds() + 200;

  setTimeout(() => {
    airDueSlots().catch((err) => logger.error({ err }, "airDueSlots cron failed"));
    setInterval(
      () => airDueSlots().catch((err) => logger.error({ err }, "airDueSlots cron failed")),
      60 * 1000,
    );
  }, msToNextMinute);

  logger.info({ msToNextMinute }, "Minute tick cron scheduled (TV slot airing)");
}

scheduleMinuteTick();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "TimeNation API Server listening");
});
