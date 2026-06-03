import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { citizensTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

let bot: Telegraf | null = null;

export function getBot(): Telegraf | null {
  return bot;
}

// ─── Legacy import data ────────────────────────────────────────────────────
// TiMETR-транзакции из старой базы данных.
// Поля прямо соответствуют таблице transactions.
// sessionId = 0 — маркер «импортированная запись» (sentinel-значение).
// ──────────────────────────────────────────────────────────────────────────
interface LegacyTransaction {
  fromCitizenId: number;
  toCitizenId: number;
  fromCitizenName: string;
  toCitizenName: string;
  minutesTransferred: number;
  durationSeconds: number;
  createdAt: string; // ISO 8601
}

// Данные из CSV TimeNationCitizens – Transactions (строки с реальными гражданами).
// Тестовые записи (test_sender / usr_… / amount < 1) исключены.
const LEGACY_TRANSACTIONS: LegacyTransaction[] = [
  {
    fromCitizenId: 1,
    toCitizenId: 2,
    fromCitizenName: "Gennadii Lerner",
    toCitizenName: "Olga Fedorova",
    minutesTransferred: 2,
    durationSeconds: 61,
    createdAt: "2026-05-27T07:31:56.574Z",
  },
  {
    fromCitizenId: 1,
    toCitizenId: 2,
    fromCitizenName: "Gennadii Lerner",
    toCitizenName: "Olga Fedorova",
    minutesTransferred: 2,
    durationSeconds: 99,
    createdAt: "2026-05-27T09:05:28.819Z",
  },
  {
    fromCitizenId: 1,
    toCitizenId: 2,
    fromCitizenName: "Gennadii Lerner",
    toCitizenName: "Olga Fedorova",
    minutesTransferred: 2,
    durationSeconds: 62,
    createdAt: "2026-05-27T09:42:46.313Z",
  },
  {
    fromCitizenId: 1,
    toCitizenId: 4,
    fromCitizenName: "Gennadii Lerner",
    toCitizenName: "Gleb Lerner",
    minutesTransferred: 11,
    durationSeconds: 601,
    createdAt: "2026-05-29T21:51:27.538Z",
  },
];

// ─── Admin guard ──────────────────────────────────────────────────────────
// Установи ADMIN_TELEGRAM_ID в Replit Secrets — числовой ID твоего аккаунта.
// Узнать свой ID можно у @userinfobot в Telegram.
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? "";

function isAdmin(telegramId: string): boolean {
  return !!ADMIN_TELEGRAM_ID && telegramId === ADMIN_TELEGRAM_ID;
}

// ─────────────────────────────────────────────────────────────────────────

export function initBot(token: string): Telegraf {
  bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const telegramId = String(ctx.from.id);
    const firstName = ctx.from.first_name ?? "Гражданин";

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
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        `🏛 Добро пожаловать в TimeNation, ${firstName}!\n\n` +
        `Вы ещё не привязали Telegram к своему аккаунту.\n\n` +
        `Чтобы привязать аккаунт, отправьте команду:\n` +
        `*/link <ваш_номер_телефона>*\n\n` +
        `Например: \`/link +79991234567\``,
        { parse_mode: "Markdown" }
      );
    }
  });

  bot.command("link", async (ctx) => {
    const telegramId = String(ctx.from.id);
    const args = ctx.message.text.split(" ").slice(1);
    const phone = args[0]?.trim();

    if (!phone) {
      await ctx.reply(
        "Укажите номер телефона: */link +79991234567*",
        { parse_mode: "Markdown" }
      );
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

    await db
      .update(citizensTable)
      .set({ telegramId })
      .where(eq(citizensTable.phone, phone));

    await ctx.reply(
      `✅ Аккаунт привязан!\n\n` +
      `👤 Гражданин: *${citizen.name}*\n` +
      `💰 Баланс: *${citizen.balanceMinutes} минут*\n` +
      `📜 Ранг: *${citizen.rank}*\n\n` +
      `Теперь вы будете получать уведомления о каждой транзакции в Казначействе TimeNation.`,
      { parse_mode: "Markdown" }
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
      { parse_mode: "Markdown" }
    );
  });

  // ─── /migratedata — только для администратора ───────────────────────────
  bot.command("migratedata", async (ctx) => {
    const senderId = String(ctx.from.id);

    // Полностью игнорировать для всех не-администраторов
    if (!isAdmin(senderId)) return;

    if (LEGACY_TRANSACTIONS.length === 0) {
      await ctx.reply(
        "⚠️ Массив LEGACY\\_TRANSACTIONS пуст\\.\n\nДобавь исторические записи в telegramService\\.ts перед запуском импорта\\.",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    await ctx.reply(
      `⏳ Начинаю импорт *${LEGACY_TRANSACTIONS.length}* исторических транзакций\\.\\.\\.`,
      { parse_mode: "MarkdownV2" }
    );

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const tx of LEGACY_TRANSACTIONS) {
      try {
        // Дедупликация: sessionId=0 — маркер импортированных записей.
        // Уникальность определяем по комбинации участников + минут + длительности.
        const [existing] = await db
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.sessionId, 0),
              eq(transactionsTable.fromCitizenId, tx.fromCitizenId),
              eq(transactionsTable.toCitizenId, tx.toCitizenId),
              eq(transactionsTable.minutesTransferred, tx.minutesTransferred),
              eq(transactionsTable.durationSeconds, tx.durationSeconds),
            )
          )
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

        await db.insert(transactionsTable).values({
          sessionId: 0,
          fromCitizenId: tx.fromCitizenId,
          toCitizenId: tx.toCitizenId,
          fromCitizenName: tx.fromCitizenName,
          toCitizenName: tx.toCitizenName,
          minutesTransferred: tx.minutesTransferred,
          durationSeconds: tx.durationSeconds,
          createdAt: new Date(tx.createdAt),
        });

        imported++;
      } catch (err) {
        logger.error({ err, tx }, "migratedata: failed to insert legacy transaction");
        errors++;
      }
    }

    const report =
      `✅ *Импорт завершён*\n\n` +
      `📥 Успешно импортировано: *${imported}* транзакций\n` +
      `⏭ Пропущено (дубли): *${skipped}*\n` +
      `❌ Ошибок при записи: *${errors}*`;

    logger.info({ imported, skipped, errors }, "migratedata: import completed");
    await ctx.reply(report, { parse_mode: "Markdown" });
  });
  // ─────────────────────────────────────────────────────────────────────────

  bot.launch().catch((err) => {
    logger.error({ err }, "Telegram bot launch failed");
  });

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));

  logger.info("Telegram bot started");
  return bot;
}

export async function sendTransactionNotification(
  citizenId: number,
  message: string
): Promise<void> {
  if (!bot) return;

  try {
    const [citizen] = await db
      .select({ telegramId: citizensTable.telegramId })
      .from(citizensTable)
      .where(eq(citizensTable.id, citizenId))
      .limit(1);

    if (!citizen?.telegramId) return;

    await bot.telegram.sendMessage(citizen.telegramId, message, {
      parse_mode: "Markdown",
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 403) {
      logger.warn({ citizenId }, "Citizen blocked the Telegram bot");
    } else {
      logger.error({ err, citizenId }, "Failed to send Telegram notification");
    }
  }
}
