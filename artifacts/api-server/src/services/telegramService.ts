import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { citizensTable, transactionsTable, timeMatrixTasksTable, timeMatrixRewardsTable } from "@workspace/db";
import { eq, and, ilike, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

let bot: Telegraf | null = null;
let _botUsername = "";

export type TelegramPollingState = "disabled" | "starting" | "polling" | "retrying" | "stopped";

export interface TelegramPollingStatus {
  state: TelegramPollingState;
  retryAttempt: number;
  lastFailureAt: string | null;
  nextRetryAt: string | null;
}

let pollingStatus: TelegramPollingStatus = {
  state: "disabled",
  retryAttempt: 0,
  lastFailureAt: null,
  nextRetryAt: null,
};
let stopRequested = false;
let pollingGeneration = 0;

const POLLING_RETRY_BASE_MS = 1_000;
const POLLING_RETRY_MAX_MS = 60_000;

export function getBot(): Telegraf | null {
  return bot;
}

export async function sendTimeMatrixRewardNotification(citizenId: number, balance: number): Promise<void> {
  if (!bot) return;
  try {
    const [citizen] = await db.select({
      telegramId: citizensTable.telegramId,
      tgNotifyState: citizensTable.tgNotifyState,
    }).from(citizensTable).where(eq(citizensTable.id, citizenId)).limit(1);
    if (citizen?.telegramId && citizen.tgNotifyState) {
      await bot.telegram.sendMessage(citizen.telegramId, `🪙 Награда получена! Начислено: +1 Дармин. Баланс: ${balance} Д.`);
    }
    if (process.env.ADMIN_TELEGRAM_ID) {
      await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, `📊 Гражданин #${citizenId} получил 1 Дармин за подтверждённую фокус-сессию.`);
    }
  } catch (err) {
    logger.warn({ err, citizenId }, "Time Matrix reward Telegram notification failed");
  }
}

export async function sendTimeMatrixSecurityAlert(citizenId: number, reason: string): Promise<void> {
  if (!bot || !process.env.ADMIN_TELEGRAM_ID) return;
  try {
    await bot.telegram.sendMessage(
      process.env.ADMIN_TELEGRAM_ID,
      `⚠️ Аномалия Time Matrix: гражданин #${citizenId}. Начисление заморожено. Причина: ${reason}.`,
      { reply_markup: { inline_keyboard: [[
        { text: "Заблокировать", callback_data: `tm_block:${citizenId}` },
        { text: "Снять флаг", callback_data: `tm_clear:${citizenId}` },
      ]] } },
    );
  } catch (err) {
    logger.warn({ err, citizenId }, "Time Matrix security Telegram alert failed");
  }
}

export async function sendTimeMatrixDailyDigests(): Promise<void> {
  if (!bot) return;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const datePart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  const start = new Date(`${today}T00:00:00+03:00`);
  const recipients = await db.select({
    id: citizensTable.id,
    telegramId: citizensTable.telegramId,
    notify: citizensTable.tgNotifyState,
    xp: citizensTable.timeXp,
    streak: citizensTable.streakDays,
    digestSentOn: citizensTable.timeMatrixDigestSentOn,
  }).from(citizensTable).where(and(
    sql`${citizensTable.telegramId} is not null`,
    eq(citizensTable.tgNotifyState, 1),
    sql`${citizensTable.timeMatrixDigestSentOn} is distinct from ${today}`,
  ));

  for (const recipient of recipients) {
    if (!recipient.telegramId || recipient.digestSentOn === today) continue;
    try {
      const tasks = await db.select({
        quadrant: timeMatrixTasksTable.quadrant,
      }).from(timeMatrixTasksTable).where(and(
        eq(timeMatrixTasksTable.citizenId, recipient.id),
        eq(timeMatrixTasksTable.status, "completed"),
        gte(timeMatrixTasksTable.completedAt, start),
      ));
      const rewardRows = await db.select({
        total: sql<number>`coalesce(sum(${timeMatrixRewardsTable.amount}), 0)`,
      }).from(timeMatrixRewardsTable).where(and(
        eq(timeMatrixRewardsTable.citizenId, recipient.id),
        gte(timeMatrixRewardsTable.createdAt, start),
      ));
      const counts = { A: 0, B: 0, C: 0, D: 0 };
      for (const task of tasks) {
        if (task.quadrant in counts) counts[task.quadrant as keyof typeof counts] += 1;
      }
      const darmins = Number(rewardRows[0]?.total ?? 0);
      await bot.telegram.sendMessage(
        recipient.telegramId,
        `📊 Ваша сводка Time Matrix за ${today}\nЗадач выполнено: ${tasks.length} (A: ${counts.A}, B: ${counts.B}, C: ${counts.C}, D: ${counts.D})\nДарминов получено: ${darmins}\nXP: ${recipient.xp} · Серия: ${recipient.streak} дн.`,
      );
      await db.update(citizensTable)
        .set({ timeMatrixDigestSentOn: today })
        .where(and(
          eq(citizensTable.id, recipient.id),
          sql`${citizensTable.timeMatrixDigestSentOn} is distinct from ${today}`,
        ));
    } catch (err) {
      logger.warn({ err, citizenId: recipient.id }, "Time Matrix daily digest delivery failed");
    }
  }
}

export function getBotUsername(): string {
  return _botUsername;
}

export function getTelegramPollingStatus(): TelegramPollingStatus {
  return { ...pollingStatus };
}

function pollingErrorDetails(error: unknown, token: string): {
  name: string;
  message: string;
  code?: number | string;
} {
  const err = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = err.response && typeof err.response === "object"
    ? err.response as Record<string, unknown>
    : {};
  const rawMessage = error instanceof Error
    ? error.message
    : typeof error === "string" ? error : "Unknown polling error";
  const message = (token ? rawMessage.split(token).join("[redacted]") : rawMessage)
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "[redacted]");
  const code = typeof err.code === "number" || typeof err.code === "string"
    ? err.code
    : typeof response.error_code === "number" ? response.error_code : undefined;

  return {
    name: error instanceof Error ? error.name : "Error",
    message,
    ...(code !== undefined ? { code } : {}),
  };
}

function isRecoverablePollingError(error: unknown): boolean {
  const err = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = err.response && typeof err.response === "object"
    ? err.response as Record<string, unknown>
    : {};
  const code = typeof err.code === "number"
    ? err.code
    : typeof response.error_code === "number" ? response.error_code : undefined;

  if (code !== undefined) {
    return code === 409 || code === 429 || code >= 500;
  }

  const networkCode = typeof err.code === "string" ? err.code : "";
  return (error instanceof TypeError && /fetch failed|network error/i.test(error.message))
    || err.name === "FetchError"
    || [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(networkCode);
}

function isInternallyRetriedPollingError(error: unknown): boolean {
  const err = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = err.response && typeof err.response === "object"
    ? err.response as Record<string, unknown>
    : {};
  const code = typeof err.code === "number"
    ? err.code
    : typeof response.error_code === "number" ? response.error_code : undefined;

  return err.name === "FetchError" || code === 429 || (code !== undefined && code >= 500);
}

function retryDelayMs(retryAttempt: number): number {
  return Math.min(
    POLLING_RETRY_MAX_MS,
    POLLING_RETRY_BASE_MS * 2 ** Math.min(retryAttempt - 1, 10),
  );
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function supervisePolling(
  launchedBot: Telegraf,
  token: string,
  generation: number,
): Promise<void> {
  while (bot === launchedBot && pollingGeneration === generation && !stopRequested) {
    pollingStatus = {
      ...pollingStatus,
      state: "starting",
      nextRetryAt: null,
    };

    try {
      await launchedBot.launch({}, () => {
        if (bot !== launchedBot || pollingGeneration !== generation || stopRequested) return;
        _botUsername = launchedBot.botInfo?.username ?? "";
        logger.info({ username: _botUsername }, "Telegram bot identity resolved");
      });

      if (stopRequested || bot !== launchedBot || pollingGeneration !== generation) return;
      throw new Error("Telegram polling stopped unexpectedly");
    } catch (error) {
      if (stopRequested || bot !== launchedBot || pollingGeneration !== generation) return;

      const retryAttempt = pollingStatus.retryAttempt + 1;
      const failedAt = new Date();
      const details = pollingErrorDetails(error, token);
      const recoverable = isRecoverablePollingError(error);

      if (!recoverable) {
        pollingStatus = {
          state: "stopped",
          retryAttempt,
          lastFailureAt: failedAt.toISOString(),
          nextRetryAt: null,
        };
        logger.error({ ...details, retryAttempt }, "Telegram bot polling stopped after a permanent failure");
        return;
      }

      const delayMs = retryDelayMs(retryAttempt);
      const nextRetryAt = new Date(failedAt.getTime() + delayMs);
      pollingStatus = {
        state: "retrying",
        retryAttempt,
        lastFailureAt: failedAt.toISOString(),
        nextRetryAt: nextRetryAt.toISOString(),
      };
      logger.warn(
        { ...details, retryAttempt, retryDelayMs: delayMs, nextRetryAt: nextRetryAt.toISOString() },
        "Telegram bot polling failed; retry scheduled",
      );
      await waitForRetry(delayMs);
    }
  }
}

// ─── Legacy import data ────────────────────────────────────────────────────
interface LegacyTransaction {
  fromName: string;
  toName: string;
  amount: number;
  createdAt: string;
}

const LEGACY_TRANSACTIONS: LegacyTransaction[] = [
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 261,  createdAt: "2026-05-27T07:31:00Z" },
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 299,  createdAt: "2026-05-27T09:05:00Z" },
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 262,  createdAt: "2026-05-27T09:42:00Z" },
  { fromName: "Gennadii Lerner", toName: "Gleb Lerner",   amount: 1160, createdAt: "2026-05-29T21:51:00Z" },
];

// ─── Admin guard ──────────────────────────────────────────────────────────
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? "";

function isAdmin(telegramId: string): boolean {
  return !!ADMIN_TELEGRAM_ID && telegramId === ADMIN_TELEGRAM_ID;
}

// ─────────────────────────────────────────────────────────────────────────

export function initBot(token: string): Telegraf {
  stopRequested = false;
  const launchedBot = new Telegraf(token);
  bot?.stop("replaced");
  bot = launchedBot;
  launchedBot.action(/^tm_clear:(\d+)$/, async (ctx) => {
    if (!ctx.from || !isAdmin(String(ctx.from.id))) {
      await ctx.answerCbQuery("Admin access required");
      return;
    }
    const citizenId = Number(ctx.match[1]);
    await db.update(citizensTable).set({ suspiciousActivity: false }).where(eq(citizensTable.id, citizenId));
    await ctx.answerCbQuery("Security flag cleared");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });
  launchedBot.action(/^tm_block:(\d+)$/, async (ctx) => {
    if (!ctx.from || !isAdmin(String(ctx.from.id))) {
      await ctx.answerCbQuery("Admin access required");
      return;
    }
    const citizenId = Number(ctx.match[1]);
    await db.update(citizensTable).set({ status: "blocked", authToken: null }).where(eq(citizensTable.id, citizenId));
    await ctx.answerCbQuery("Citizen blocked");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });
  const generation = ++pollingGeneration;
  pollingStatus = {
    state: "starting",
    retryAttempt: 0,
    lastFailureAt: pollingStatus.lastFailureAt,
    nextRetryAt: null,
  };
  const originalCallApi = launchedBot.telegram.callApi.bind(launchedBot.telegram);
  launchedBot.telegram.callApi = new Proxy(originalCallApi, {
    apply(target, thisArg, args: unknown[]) {
      const isUpdatesRequest = args[0] === "getUpdates";
      const result = Reflect.apply(target, thisArg, args);
      if (!isUpdatesRequest || !result || typeof result.then !== "function") return result;

      return Promise.resolve(result).then((value: unknown) => {
        if (
          isUpdatesRequest &&
          bot === launchedBot &&
          pollingGeneration === generation &&
          !stopRequested
        ) {
          const wasPolling = pollingStatus.state === "polling";
          pollingStatus = {
            ...pollingStatus,
            state: "polling",
            retryAttempt: 0,
            nextRetryAt: null,
          };
          if (!wasPolling) {
            logger.info({ username: _botUsername }, "Telegram bot polling started");
          }
        }
        return value;
      }).catch((error: unknown) => {
        if (
          isInternallyRetriedPollingError(error) &&
          bot === launchedBot &&
          pollingGeneration === generation &&
          !stopRequested
        ) {
          const failedAt = new Date();
          const err = error && typeof error === "object" ? error as Record<string, unknown> : {};
          const parameters = err.parameters && typeof err.parameters === "object"
            ? err.parameters as Record<string, unknown>
            : {};
          const retryAfterSeconds = typeof parameters.retry_after === "number"
            ? parameters.retry_after
            : 5;
          const nextRetryAt = new Date(failedAt.getTime() + retryAfterSeconds * 1_000);
          pollingStatus = {
            ...pollingStatus,
            state: "retrying",
            lastFailureAt: failedAt.toISOString(),
            nextRetryAt: nextRetryAt.toISOString(),
          };
          logger.warn(
            {
              ...pollingErrorDetails(error, token),
              retryDelayMs: retryAfterSeconds * 1_000,
              nextRetryAt: nextRetryAt.toISOString(),
            },
            "Telegram getUpdates request failed; Telegraf will retry",
          );
        }
        throw error;
      });
    },
  }) as typeof launchedBot.telegram.callApi;

  // ── /start — handles both plain greeting and deep-link binding ───────────
  bot.start(async (ctx) => {
    const payload = ctx.startPayload ?? ""; // e.g. "bind_42_abc123"
    const telegramId = String(ctx.from.id);
    const tgUsername = ctx.from.username ? `@${ctx.from.username}` : "";
    const firstName = ctx.from.first_name ?? "Гражданин";

    // ── QR desktop login: /start qr_<token> ─────────────────────────
    if (payload.startsWith("qr_")) {
      const qrToken = payload.slice(3); // strip 'qr_' prefix
      try {
        // Citizen must already have a linked Telegram account
        const [citizen] = await db
          .select({
            id:             citizensTable.id,
            name:           citizensTable.name,
            balanceMinutes: citizensTable.balanceMinutes,
            authToken:      citizensTable.authToken,
          })
          .from(citizensTable)
          .where(eq(citizensTable.telegramId, telegramId))
          .limit(1);

        if (!citizen || !citizen.authToken) {
          await ctx.reply(
            "❌ Ваш Telegram не привязан к аккаунту TimeNation.\n\n" +
            "Откройте приложение TimeNation → Профиль → «Подключить Telegram».",
          );
          return;
        }

        const { authorizeQrToken, isValidQrToken } = await import("./qrAuthService");
        const { pushQrLogin } = await import("./socialAlarmWs");

        if (!isValidQrToken(qrToken)) {
          await ctx.reply(
            "❌ QR-код истёк или недействителен. Обновите страницу на компьютере и попробуйте снова.",
          );
          return;
        }

        const ok = authorizeQrToken(qrToken, {
          authToken:      citizen.authToken,
          id:             citizen.id,
          name:           citizen.name,
          balanceMinutes: citizen.balanceMinutes,
        });

        if (!ok) {
          await ctx.reply("❌ Не удалось авторизовать QR-код. Попробуйте снова.");
          return;
        }

        // Push WS login event to the desktop browser waiting on this token
        pushQrLogin(qrToken, {
          type:           "qr_login",
          citizenId:      citizen.id,
          authToken:      citizen.authToken,
          name:           citizen.name,
          balanceMinutes: citizen.balanceMinutes,
        });

        await ctx.reply(
          `✅ *Вы успешно вошли в TimeNation Web на ПК!*\n\n` +
          `👤 ${citizen.name}\n💰 Баланс: *${citizen.balanceMinutes} Д*`,
          { parse_mode: "Markdown" },
        );
        logger.info({ citizenId: citizen.id, telegramId }, "QR desktop login via Telegram bot");
        return;
      } catch (err) {
        logger.error({ err, qrToken }, "QR login via bot failed");
        await ctx.reply("❌ Внутренняя ошибка. Попробуйте позже.");
        return;
      }
    }

    // ── Auth-code binding: /start <8-char HEX CODE> ──────────────────
    // New flow: citizen generates link from the app, code is looked up by value
    if (/^[0-9A-F]{8}$/.test(payload)) {
      try {
        const now = new Date();
        const [citizen] = await db
          .select()
          .from(citizensTable)
          .where(eq(citizensTable.telegramAuthCode, payload))
          .limit(1);

        if (!citizen) {
          await ctx.reply("❌ Код не найден. Сгенерируйте новую ссылку в приложении TimeNation.");
          return;
        }
        if (!citizen.telegramAuthCodeExpiresAt || citizen.telegramAuthCodeExpiresAt < now) {
          await ctx.reply(
            "❌ Срок действия кода истёк (15 минут).\n\nОткройте приложение TimeNation и нажмите «Привязать Telegram» снова.",
          );
          return;
        }

        // Bind: save telegramId + username, clear code
        await db
          .update(citizensTable)
          .set({
            telegramId:               telegramId,
            telegramUsername:         tgUsername || null,
            telegramAuthCode:         null,
            telegramAuthCodeExpiresAt: null,
          })
          .where(eq(citizensTable.id, citizen.id));

        await ctx.reply(
          `✅ *Аккаунт TimeNation успешно привязан!*\n\n` +
          `👤 Гражданин: *${citizen.name}*\n` +
          `📜 Ранг: *${citizen.rank}*\n` +
          `💰 Баланс: *${citizen.balanceMinutes} Д*\n\n` +
          `Теперь вы будете получать персональные уведомления TimeNation прямо сюда.`,
          { parse_mode: "Markdown" },
        );
        logger.info({ citizenId: citizen.id, telegramId }, "Telegram account bound via auth code");
        return;
      } catch (err) {
        logger.error({ err, payload }, "Telegram auth code bind failed");
        await ctx.reply("❌ Внутренняя ошибка. Попробуйте позже.");
        return;
      }
    }

    // ── Legacy deep-link binding: /start bind_<citizenId>_<token> ──────
    if (payload.startsWith("bind_")) {
      const parts = payload.split("_");
      // format: bind_<citizenId>_<token>  — token itself may not contain _
      if (parts.length >= 3) {
        const citizenId = parseInt(parts[1] ?? "", 10);
        const token = parts.slice(2).join("_");

        if (!isNaN(citizenId) && token) {
          try {
            const [citizen] = await db
              .select()
              .from(citizensTable)
              .where(eq(citizensTable.id, citizenId))
              .limit(1);

            if (!citizen) {
              await ctx.reply("❌ Гражданин не найден. Попробуйте снова через приложение.");
              return;
            }

            // Validate token
            if (
              citizen.tgBindToken !== token ||
              !citizen.tgBindTokenExpires ||
              citizen.tgBindTokenExpires < new Date()
            ) {
              await ctx.reply(
                "❌ Ссылка устарела или недействительна.\n\nОткройте приложение TimeNation и нажмите «Подключить Telegram» снова.",
              );
              return;
            }

            // Bind: save telegramId + username, clear token
            await db
              .update(citizensTable)
              .set({
                telegramId: telegramId,
                telegramUsername: tgUsername || null,
                tgBindToken: null,
                tgBindTokenExpires: null,
              })
              .where(eq(citizensTable.id, citizenId));

            await ctx.reply(
              `✅ *Ваш аккаунт TimeNation (ID #${citizenId}) успешно привязан!*\n\n` +
              `👤 Гражданин: *${citizen.name}*\n` +
              `📜 Ранг: *${citizen.rank}*\n` +
              `💰 Баланс: *${citizen.balanceMinutes} Д*\n\n` +
              `Теперь вы будете получать персональные уведомления TimeNation прямо сюда.`,
              { parse_mode: "Markdown" },
            );
            logger.info({ citizenId, telegramId }, "Telegram account bound via deep link");
            return;
          } catch (err) {
            logger.error({ err, citizenId }, "Telegram bind failed");
            await ctx.reply("❌ Внутренняя ошибка. Попробуйте позже.");
            return;
          }
        }
      }
    }

    // ── Plain /start — show greeting ─────────────────────────────────────
    const [citizen] = await db
      .select()
      .from(citizensTable)
      .where(eq(citizensTable.telegramId, telegramId))
      .limit(1);

    if (citizen) {
      await ctx.reply(
        `🏛 Добро пожаловать в TimeNation, ${citizen.name}!\n\n` +
        `💰 Ваш баланс: *${citizen.balanceMinutes} минут*\n` +
        `📜 Ранг: *${citizen.rank}*\n\n` +
        `Откройте приложение TimeNation, чтобы начать TiMETR-сессию.`,
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        `🏛 Добро пожаловать в TimeNation, ${firstName}!\n\n` +
        `Вы ещё не привязали Telegram к своему аккаунту.\n\n` +
        `Откройте приложение TimeNation → Профиль → «Подключить Telegram» и нажмите кнопку — бот сам всё сделает.`,
        { parse_mode: "Markdown" },
      );
    }
  });

  bot.command("link", async (ctx) => {
    const telegramId = String(ctx.from.id);
    const args = ctx.message.text.split(" ").slice(1);
    const phone = args[0]?.trim();

    if (!phone) {
      await ctx.reply("Укажите номер телефона: */link +79991234567*", { parse_mode: "Markdown" });
      return;
    }

    const [citizen] = await db
      .select()
      .from(citizensTable)
      .where(eq(citizensTable.phone, phone))
      .limit(1);

    if (!citizen) {
      await ctx.reply("❌ Гражданин с таким номером не найден. Сначала зарегистрируйтесь в приложении TimeNation.");
      return;
    }

    await db.update(citizensTable).set({ telegramId }).where(eq(citizensTable.phone, phone));

    await ctx.reply(
      `✅ Аккаунт привязан!\n\n` +
      `👤 Гражданин: *${citizen.name}*\n` +
      `💰 Баланс: *${citizen.balanceMinutes} минут*\n` +
      `📜 Ранг: *${citizen.rank}*\n\n` +
      `Теперь вы будете получать уведомления о каждой транзакции в Казначействе TimeNation.`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("balance", async (ctx) => {
    const telegramId = String(ctx.from.id);

    const [citizen] = await db
      .select()
      .from(citizensTable)
      .where(eq(citizensTable.telegramId, telegramId))
      .limit(1);

    if (!citizen) {
      await ctx.reply("❌ Аккаунт не привязан. Используйте /link <телефон>");
      return;
    }

    await ctx.reply(
      `💰 *${citizen.name}*\n\n` +
      `Баланс: *${citizen.balanceMinutes} мин*\n` +
      `📜 Ранг: *${citizen.rank}* (Merit: ${citizen.meritScore.toFixed(2)})\n` +
      `Передано: ${citizen.totalGiven} мин\n` +
      `Получено: ${citizen.totalReceived} мин`,
      { parse_mode: "Markdown" },
    );
  });

  // ─── /migratedata — только для администратора ───────────────────────────
  bot.command("migratedata", async (ctx) => {
    const senderId = String(ctx.from.id);
    if (!isAdmin(senderId)) return;

    if (LEGACY_TRANSACTIONS.length === 0) {
      await ctx.reply(
        "⚠️ Массив LEGACY\\_TRANSACTIONS пуст\\.\n\nДобавь исторические записи в telegramService\\.ts перед запуском импорта\\.",
        { parse_mode: "MarkdownV2" },
      );
      return;
    }

    await ctx.reply(
      `⏳ Начинаю импорт *${LEGACY_TRANSACTIONS.length}* исторических транзакций\\.\\.\\.`,
      { parse_mode: "MarkdownV2" },
    );

    let imported = 0, skipped = 0, notFound = 0, errors = 0;

    for (const tx of LEGACY_TRANSACTIONS) {
      try {
        const minutesTransferred = Math.floor(tx.amount / 100);
        const durationSeconds    = tx.amount % 100;

        const [fromCitizen] = await db
          .select({ id: citizensTable.id, name: citizensTable.name })
          .from(citizensTable).where(ilike(citizensTable.name, tx.fromName)).limit(1);

        const [toCitizen] = await db
          .select({ id: citizensTable.id, name: citizensTable.name })
          .from(citizensTable).where(ilike(citizensTable.name, tx.toName)).limit(1);

        if (!fromCitizen || !toCitizen) { notFound++; continue; }

        const [existing] = await db
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.sessionId, 0),
            eq(transactionsTable.fromCitizenId, fromCitizen.id),
            eq(transactionsTable.toCitizenId, toCitizen.id),
            eq(transactionsTable.minutesTransferred, minutesTransferred),
          )).limit(1);

        if (existing) { skipped++; continue; }

        await db.insert(transactionsTable).values({
          sessionId: 0,
          fromCitizenId: fromCitizen.id,
          toCitizenId: toCitizen.id,
          fromCitizenName: fromCitizen.name,
          toCitizenName: toCitizen.name,
          minutesTransferred,
          durationSeconds,
          createdAt: new Date(tx.createdAt),
        });
        imported++;
      } catch (err) {
        logger.error({ err, tx }, "migratedata: failed to insert legacy transaction");
        errors++;
      }
    }

    await ctx.reply(
      `✅ *Импорт завершён*\n\n` +
      `📥 Успешно: *${imported}*\n⏭ Дубли: *${skipped}*\n` +
      `👤 Не найдено: *${notFound}*\n❌ Ошибок: *${errors}*`,
      { parse_mode: "Markdown" },
    );
  });

  void supervisePolling(launchedBot, token, generation);

  const stopPolling = (reason: "SIGINT" | "SIGTERM") => {
    stopRequested = true;
    pollingStatus = {
      ...pollingStatus,
      state: "stopped",
      nextRetryAt: null,
    };
    bot?.stop(reason);
    logger.info({ reason }, "Telegram bot polling stopped");
  };
  process.once("SIGINT", () => stopPolling("SIGINT"));
  process.once("SIGTERM", () => stopPolling("SIGTERM"));

  return launchedBot;
}

// ─── Notification type guard ──────────────────────────────────────────────────
export type NotifType = "dm" | "capsules" | "mentions" | "state" | "all_groups";

/**
 * Send a Telegram DM to a citizen only if they have the corresponding
 * notification type enabled. Silently drops if bot is not configured,
 * citizen has no telegramId, or the toggle is off.
 */
export async function notifyUserConditional(
  citizenId: number,
  message: string,
  type: NotifType,
): Promise<void> {
  if (!bot) return;
  try {
    const [citizen] = await db
      .select({
        telegramId: citizensTable.telegramId,
        tgNotifyDm: citizensTable.tgNotifyDm,
        tgNotifyCapsules: citizensTable.tgNotifyCapsules,
        tgNotifyMentions: citizensTable.tgNotifyMentions,
        tgNotifyState: citizensTable.tgNotifyState,
        tgNotifyAllGroups: citizensTable.tgNotifyAllGroups,
      })
      .from(citizensTable)
      .where(eq(citizensTable.id, citizenId))
      .limit(1);

    if (!citizen?.telegramId) return;

    const flagMap: Record<NotifType, number | null> = {
      dm:         citizen.tgNotifyDm,
      capsules:   citizen.tgNotifyCapsules,
      mentions:   citizen.tgNotifyMentions,
      state:      citizen.tgNotifyState,
      all_groups: citizen.tgNotifyAllGroups,
    };

    if (!flagMap[type]) return; // disabled

    await bot.telegram.sendMessage(citizen.telegramId, message, { parse_mode: "Markdown" });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 403) {
      logger.warn({ citizenId }, "Citizen blocked the Telegram bot");
    } else {
      logger.error({ err, citizenId }, "notifyUserConditional: failed");
    }
  }
}

export type PassportReadyDeliveryResult =
  | { status: "delivered" }
  | { status: "retryable"; error: string; errorCode: number | null }
  | { status: "permanent"; error: string; errorCode: number | null };

function classifyPassportTelegramError(err: unknown): {
  retryable: boolean;
  error: string;
  errorCode: number | null;
} {
  const error = err as {
    message?: string;
    code?: string | number;
    response?: { error_code?: number; description?: string };
  } | null;
  const responseCode = Number(error?.response?.error_code);
  const errorCode = Number.isFinite(responseCode) && responseCode > 0
    ? responseCode
    : typeof error?.code === "number"
      ? error.code
      : null;
  const errorText = (error?.response?.description ?? error?.message ?? "Telegram delivery failed").slice(0, 500);
  const retryable =
    errorCode === null ||
    errorCode === 408 ||
    errorCode === 425 ||
    errorCode === 429 ||
    errorCode >= 500;
  return { retryable, error: errorText, errorCode };
}

/** Sends a passport-ready alert and reports whether another attempt can help. */
export async function deliverPassportReadyNotification(
  citizenId: number,
  message: string,
): Promise<PassportReadyDeliveryResult> {
  if (!bot) {
    return { status: "retryable", error: "Telegram bot is not configured", errorCode: null };
  }

  const [citizen] = await db
    .select({
      telegramId: citizensTable.telegramId,
      tgNotifyState: citizensTable.tgNotifyState,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, citizenId))
    .limit(1);

  if (!citizen) {
    return { status: "permanent", error: "Citizen no longer exists", errorCode: null };
  }
  if (!citizen.tgNotifyState) {
    return { status: "permanent", error: "State notifications are disabled", errorCode: null };
  }
  if (!citizen.telegramId) {
    return { status: "retryable", error: "Citizen has no linked Telegram account", errorCode: null };
  }

  try {
    await bot.telegram.sendMessage(citizen.telegramId, message, { parse_mode: "Markdown" });
    return { status: "delivered" };
  } catch (err) {
    const failure = classifyPassportTelegramError(err);
    return {
      status: failure.retryable ? "retryable" : "permanent",
      error: failure.error,
      errorCode: failure.errorCode,
    };
  }
}

// ─── State Treasury tax-pool notification ─────────────────────────────────────
type TaxSourceType = "PAID_SESSION_TAX" | "AUCTION_TAX" | "ESCROW_FEE";

const TAX_SOURCE_LABELS: Record<TaxSourceType, string> = {
  PAID_SESSION_TAX: "⏱️ Платная консультация",
  AUCTION_TAX:      "🏛️ Аукцион",
  ESCROW_FEE:       "🤝 Escrow-сделка",
};

export async function notifyTaxCollected({
  amount, sourceType, fromCitizenName, referenceId,
}: {
  amount: number;
  sourceType: TaxSourceType;
  fromCitizenName: string;
  referenceId: number;
}): Promise<void> {
  const adminId = process.env["ADMIN_TELEGRAM_ID"] ?? "";
  if (!bot || !adminId) return;

  try {
    const { citizensTable: ctable } = await import("@workspace/db");
    const { eq: eqFn } = await import("drizzle-orm");
    const [treasury] = await db
      .select({ balance: ctable.balanceMinutes })
      .from(ctable).where(eqFn(ctable.id, 1)).limit(1);

    const totalPool = Number(treasury?.balance ?? 0);

    await bot.telegram.sendMessage(
      adminId,
      `🏛️ *ПОПОЛНЕНИЕ НАЛОГОВОГО ПУЛА TIMENATION*\n\n` +
      `💰 *Поступление:* +${amount.toFixed(4)} Д\n` +
      `📌 *Источник:* ${TAX_SOURCE_LABELS[sourceType] ?? sourceType}\n` +
      `👤 *Гражданин:* ${fromCitizenName}\n` +
      `🔗 *Ref ID:* #${referenceId}\n\n` +
      `📊 *Всего в Казначействе:* ${totalPool.toFixed(4)} Д`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    logger.warn({ err }, "notifyTaxCollected: failed to send Telegram alert");
  }
}

export async function sendDirectMessage(
  telegramId: string,
  message: string,
): Promise<boolean> {
  if (!bot || !telegramId) return false;
  try {
    await bot.telegram.sendMessage(telegramId, message, { parse_mode: "Markdown" });
    return true;
  } catch (err) {
    logger.error({ err, telegramId }, "sendDirectMessage failed");
    return false;
  }
}

export async function sendFocusThoughtsToTelegram(
  telegramId: string,
  thoughts: string,
): Promise<boolean> {
  if (!bot || !telegramId) return false;
  const chunks: string[] = [];
  let chunk = "";
  for (const char of thoughts) {
    if (chunk.length + char.length > 3500) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const prefix = chunks.length > 1 ? `Мысли из фокус-сессии (${index + 1}/${chunks.length}):\n\n` : "Мысли из фокус-сессии:\n\n";
      await bot.telegram.sendMessage(telegramId, `${prefix}${chunks[index]}`);
    }
    return true;
  } catch (err) {
    logger.warn({ err, telegramId }, "sendFocusThoughtsToTelegram failed");
    return false;
  }
}

export type PassportLifecycleEvent = "emission_started" | "passport_issued";

interface PassportLifecycleNotice {
  event: PassportLifecycleEvent;
  citizenId: number;
  citizenName: string;
  citizenNumber: string | null;
  availableAt?: Date | null;
  ancestralMinuteGranted?: boolean;
}

export async function notifyAdminPassportLifecycle(notice: PassportLifecycleNotice): Promise<void> {
  const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
  if (!bot || !adminId) return;

  const eventText = notice.event === "emission_started"
    ? "⏳ Началась эмиссия паспорта"
    : "🎉 Паспорт выпущен";
  const expectedLine = notice.event === "emission_started" && notice.availableAt
    ? `\nОжидаемая выдача (UTC): ${notice.availableAt.toISOString()}`
    : "";
  const ancestralLine = notice.event === "passport_issued" && notice.ancestralMinuteGranted
    ? "\nНачислена родовая минута: 1 Д"
    : "";
  const text =
    `${eventText} TimeNation\n\n` +
    `Гражданин: ${notice.citizenName}\n` +
    `Номер: ${notice.citizenNumber ?? "—"}\n` +
    `ID: ${notice.citizenId}` +
    `${expectedLine}${ancestralLine}`;

  try {
    await bot.telegram.sendMessage(adminId, text);
  } catch (err) {
    logger.warn({ err, citizenId: notice.citizenId, event: notice.event }, "Passport lifecycle admin notification failed");
  }
}

export async function notifyPassportEmissionStarted(
  notice: Omit<PassportLifecycleNotice, "event">,
): Promise<void> {
  const userText =
    `⏳ Началась эмиссия паспорта TimeNation.\n` +
    `Номер гражданина: ${notice.citizenNumber ?? "—"}\n` +
    (notice.availableAt ? `Ожидаемая выдача (UTC): ${notice.availableAt.toISOString()}` : "");
  const deliveries: Promise<unknown>[] = [
    notifyAdminPassportLifecycle({ ...notice, event: "emission_started" }),
    notifyUserConditional(notice.citizenId, userText, "state"),
  ];
  await Promise.allSettled(deliveries);
}

// ─── Admin TRC20 payment notification ────────────────────────────────────────
export async function notifyAdminTrc20Payment({
  citizenId, citizenName, amountUsdt, darmins, purpose, txId, requestId,
}: {
  citizenId:   number;
  citizenName: string;
  amountUsdt:  number;
  darmins:     number;
  purpose:     string;
  txId:        string;
  requestId:   number | null;
}): Promise<void> {
  const adminId = process.env["ADMIN_TELEGRAM_ID"] ?? "";
  if (!bot || !adminId) return;

  const purposeLabel: Record<string, string> = {
    darmins:  "💰 Покупка Дарминов",
    tv_slot:  "📺 Слот TimeNation TV",
    escrow:   "🤝 Escrow-сделка",
    embassy:  "🏛 Посольство",
  };

  const shortWallet = `TJZZWW...n82XC`;
  const tronscanUrl = `https://tronscan.org/#/transaction/${txId}`;

  const text =
    `🎉 *НОВАЯ ОПЛАТА USDT TRC20 — TimeNation*\n\n` +
    `💵 *Сумма:* ${amountUsdt.toFixed(4)} USDT\n` +
    `🪙 *Дармины:* ${darmins} Д\n` +
    `📌 *Назначение:* ${purposeLabel[purpose] ?? purpose}\n` +
    `👤 *Гражданин:* ${citizenName} (ID: ${citizenId})\n` +
    `🔑 *TxID:* \`${txId}\`\n` +
    `💳 *Кошелёк:* ${shortWallet}\n` +
    (requestId ? `🆔 *Request ID:* #${requestId}\n` : "") +
    `\n🔍 [Проверить на Tronscan](${tronscanUrl})\n\n` +
    `⚠️ После подтверждения вручную зачисли ${darmins} Д гражданину ID ${citizenId}.`;

  try {
    await bot.telegram.sendMessage(adminId, text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    } as Parameters<typeof bot.telegram.sendMessage>[2]);
  } catch (err) {
    logger.warn({ err }, "notifyAdminTrc20Payment: failed to send Telegram alert");
  }
}

export async function sendTransactionNotification(
  citizenId: number,
  message: string,
): Promise<void> {
  if (!bot) return;
  try {
    const [citizen] = await db
      .select({ telegramId: citizensTable.telegramId })
      .from(citizensTable)
      .where(eq(citizensTable.id, citizenId))
      .limit(1);

    if (!citizen?.telegramId) return;

    await bot.telegram.sendMessage(citizen.telegramId, message, { parse_mode: "Markdown" });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 403) {
      logger.warn({ citizenId }, "Citizen blocked the Telegram bot");
    } else {
      logger.error({ err, citizenId }, "Failed to send Telegram notification");
    }
  }
}
