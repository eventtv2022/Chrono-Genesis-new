import { Telegraf } from "telegraf";
import { db } from "@workspace/db";
import { citizensTable, transactionsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";

let bot: Telegraf | null = null;

export function getBot(): Telegraf | null {
  return bot;
}

// ─── Legacy import data ────────────────────────────────────────────────────
// amount кодирует: minutes * 100 + seconds (например, 261 = 2 мин 61 сек).
// fromName / toName сопоставляются с citizens.name в БД при импорте.
// sessionId = 0 — sentinel-маркер «импортированная запись».
// ──────────────────────────────────────────────────────────────────────────
interface LegacyTransaction {
  fromName: string;
  toName: string;
  amount: number; // minutes * 100 + seconds
  createdAt: string; // ISO 8601
}

const LEGACY_TRANSACTIONS: LegacyTransaction[] = [
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 261,  createdAt: "2026-05-27T07:31:00Z" },
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 299,  createdAt: "2026-05-27T09:05:00Z" },
  { fromName: "Gennadii Lerner", toName: "Olga Fedorova", amount: 262,  createdAt: "2026-05-27T09:42:00Z" },
  { fromName: "Gennadii Lerner", toName: "Gleb Lerner",   amount: 1160, createdAt: "2026-05-29T21:51:00Z" },
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
      try {
        // Декодируем amount: minutes * 100 + seconds
        const minutesTransferred = Math.floor(tx.amount / 100);
        const durationSeconds    = tx.amount % 100;

        // Ищем граждан по имени (без учёта регистра)
        const [fromCitizen] = await db
          .select({ id: citizensTable.id, name: citizensTable.name })
          .from(citizensTable)
          .where(ilike(citizensTable.name, tx.fromName))
          .limit(1);

        const [toCitizen] = await db
          .select({ id: citizensTable.id, name: citizensTable.name })
          .from(citizensTable)
          .where(ilike(citizensTable.name, tx.toName))
          .limit(1);

        if (!fromCitizen || !toCitizen) {
          notFound++;
          logger.warn(
            { fromName: tx.fromName, toName: tx.toName, fromFound: !!fromCitizen, toFound: !!toCitizen },
            "migratedata: citizen not found by name, skipping"
          );
          continue;
        }

        // Дедупликация по (sessionId=0, fromCitizenId, toCitizenId, minutesTransferred)
        const [existing] = await db
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.sessionId, 0),
              eq(transactionsTable.fromCitizenId, fromCitizen.id),
              eq(transactionsTable.toCitizenId, toCitizen.id),
              eq(transactionsTable.minutesTransferred, minutesTransferred),
            )
          )
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

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

// ─── State Treasury tax-pool notification ─────────────────────────────────────
// Sends a real-time alert to the admin whenever the Tax Pool receives a
// 2% contribution. Fires after the DB write — never blocks the transaction.

type TaxSourceType = "PAID_SESSION_TAX" | "AUCTION_TAX" | "ESCROW_FEE";

const TAX_SOURCE_LABELS: Record<TaxSourceType, string> = {
  PAID_SESSION_TAX: "⏱️ Платная консультация",
  AUCTION_TAX:      "🏛️ Аукцион",
  ESCROW_FEE:       "🤝 Escrow-сделка",
};

export async function notifyTaxCollected({
  amount,
  sourceType,
  fromCitizenName,
  referenceId,
}: {
  amount: number;
  sourceType: TaxSourceType;
  fromCitizenName: string;
  referenceId: number;
}): Promise<void> {
  const adminId = process.env["ADMIN_TELEGRAM_ID"] ?? "";
  if (!bot || !adminId) return;

  // Read current treasury balance (citizen #1)
  try {
    const { citizensTable: ctable } = await import("@workspace/db");
    const { eq: eqFn } = await import("drizzle-orm");
    const [treasury] = await db
      .select({ balance: ctable.balanceMinutes })
      .from(ctable)
      .where(eqFn(ctable.id, 1))
      .limit(1);

    const totalPool = Number(treasury?.balance ?? 0);

    const message =
      `🏛️ *ПОПОЛНЕНИЕ НАЛОГОВОГО ПУЛА TIMENATION*\n\n` +
      `💰 *Поступление:* +${amount.toFixed(4)} Д\n` +
      `📌 *Источник:* ${TAX_SOURCE_LABELS[sourceType] ?? sourceType}\n` +
      `👤 *Гражданин:* ${fromCitizenName}\n` +
      `🔗 *Ref ID:* #${referenceId}\n\n` +
      `📊 *Всего в Казначействе:* ${totalPool.toFixed(4)} Д`;

    await bot.telegram.sendMessage(adminId, message, { parse_mode: "Markdown" });
  } catch (err) {
    // Non-fatal — never let a notification failure bubble up to the API response
    logger.warn({ err }, "notifyTaxCollected: failed to send Telegram alert");
  }
}

export async function sendDirectMessage(
  telegramId: string,
  message: string
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
