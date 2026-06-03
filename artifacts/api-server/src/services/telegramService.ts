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
// Structured as the original historical records.
// Fields:
//   telegramId — Telegram user ID of the citizen
//   amount     — minutes (for deposit) or minutes debited (for withdraw)
//   type       — "deposit" | "withdraw"
//   status     — only "success" records are imported
//   createdAt  — original ISO 8601 date string
// ──────────────────────────────────────────────────────────────────────────
interface LegacyTransaction {
  telegramId: string;
  amount: number;
  type: "deposit" | "withdraw";
  status: "success" | "failed";
  createdAt: string;
}

const LEGACY_TRANSACTIONS: LegacyTransaction[] = [
  // ── Вставь сюда исторические записи ──────────────────────────────────
  // Пример структуры (замени на реальные данные):
  // { telegramId: "123456789", amount: 100, type: "deposit",  status: "success", createdAt: "2024-03-01T09:00:00Z" },
  // { telegramId: "123456789", amount: 50,  type: "withdraw", status: "success", createdAt: "2024-03-15T14:30:00Z" },
  // { telegramId: "987654321", amount: 500, type: "deposit",  status: "success", createdAt: "2024-04-10T11:00:00Z" },
  // ─────────────────────────────────────────────────────────────────────
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
    let notFound = 0;
    let errors = 0;

    for (const tx of LEGACY_TRANSACTIONS) {
      // Пропускаем неуспешные записи
      if (tx.status !== "success") {
        skipped++;
        continue;
      }

      try {
        // Ищем гражданина по telegramId
        const [citizen] = await db
          .select()
          .from(citizensTable)
          .where(eq(citizensTable.telegramId, tx.telegramId))
          .limit(1);

        if (!citizen) {
          notFound++;
          logger.warn({ telegramId: tx.telegramId }, "migratedata: citizen not found, skipping");
          continue;
        }

        // Маппинг типа операции:
        //   deposit  → Казначейство (from=0) → гражданин
        //   withdraw → гражданин → Казначейство (to=0)
        const fromCitizenId = tx.type === "deposit" ? 0 : citizen.id;
        const toCitizenId   = tx.type === "deposit" ? citizen.id : 0;
        const fromName      = tx.type === "deposit" ? "Казначейство [импорт]" : citizen.name;
        const toName        = tx.type === "deposit" ? citizen.name : "Казначейство [импорт]";
        const originalDate  = new Date(tx.createdAt);

        // Дедупликация: sessionId=0 означает «импортированная запись».
        // Проверяем, не вставлена ли уже запись с теми же параметрами.
        const [existing] = await db
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.sessionId, 0),
              eq(transactionsTable.fromCitizenId, fromCitizenId),
              eq(transactionsTable.toCitizenId, toCitizenId),
              eq(transactionsTable.minutesTransferred, tx.amount),
            )
          )
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

        await db.insert(transactionsTable).values({
          sessionId: 0,
          fromCitizenId,
          toCitizenId,
          fromCitizenName: fromName,
          toCitizenName: toName,
          minutesTransferred: tx.amount,
          durationSeconds: 0,
          createdAt: originalDate,
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
      `👤 Гражданин не найден: *${notFound}*\n` +
      `❌ Ошибок при записи: *${errors}*`;

    logger.info({ imported, skipped, notFound, errors }, "migratedata: import completed");
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
