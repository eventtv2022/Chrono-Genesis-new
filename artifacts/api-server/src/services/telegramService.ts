import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { citizensTable, transactionsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";

let bot: Telegraf | null = null;
let _botUsername = "";

export function getBot(): Telegraf | null {
  return bot;
}

export function getBotUsername(): string {
  return _botUsername;
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
  bot = new Telegraf(token);

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

  bot.launch().then(async () => {
    try {
      const me = await bot!.telegram.getMe();
      _botUsername = me.username ?? "";
      logger.info({ username: _botUsername }, "Telegram bot username resolved");
    } catch (_) { /* non-fatal */ }
  }).catch((err) => {
    logger.error({ err }, "Telegram bot launch failed");
  });

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));

  logger.info("Telegram bot started");
  return bot;
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
