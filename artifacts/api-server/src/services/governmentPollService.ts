import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db, citizensTable, governmentPollsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { canUseAdultKycFeature } from "./ageGateService";
import { getBot } from "./telegramService";

export const GOVERNMENT_POLL_ROLES = [
  "citizen",
  "labor_officer",
  "gov_admin",
  "system_admin",
] as const;

export function citizenMatchesPollRoles(
  citizen: { govRole: string; isAdmin: number },
  roles: string[],
): boolean {
  return roles.includes(citizen.govRole) ||
    (citizen.isAdmin === 1 && roles.includes("system_admin"));
}

type PollNotice = "reminder24h" | "reminder1h" | "reminder1m" | "started";

const REMINDERS: {
  key: Exclude<PollNotice, "started">;
  field: "reminder24hSentAt" | "reminder1hSentAt" | "reminder1mSentAt";
  leadMs: number;
  label: string;
}[] = [
  { key: "reminder24h", field: "reminder24hSentAt", leadMs: 24 * 60 * 60 * 1000, label: "через 24 часа" },
  { key: "reminder1h", field: "reminder1hSentAt", leadMs: 60 * 60 * 1000, label: "через 1 час" },
  { key: "reminder1m", field: "reminder1mSentAt", leadMs: 60 * 1000, label: "через 1 минуту" },
];

async function notifyEligibleVoters(
  poll: typeof governmentPollsTable.$inferSelect,
  notice: PollNotice,
): Promise<void> {
  const bot = getBot();
  if (!bot) {
    logger.warn({ pollId: poll.id }, "Poll started without Telegram bot; notifications were not sent");
    return;
  }

  const citizens = await db
    .select({
      id: citizensTable.id,
      name: citizensTable.name,
      telegramId: citizensTable.telegramId,
      govRole: citizensTable.govRole,
      isAdmin: citizensTable.isAdmin,
      dateOfBirth: citizensTable.dateOfBirth,
      kycVerified: citizensTable.kycVerified,
      tgNotifyState: citizensTable.tgNotifyState,
    })
    .from(citizensTable)
    .where(inArray(citizensTable.govRole, poll.eligibleRoles.filter((role) => role !== "system_admin").length
      ? poll.eligibleRoles.filter((role) => role !== "system_admin")
      : ["__no_matching_role__"]));

  const systemAdmins = poll.eligibleRoles.includes("system_admin")
    ? await db
        .select({
          id: citizensTable.id,
          name: citizensTable.name,
          telegramId: citizensTable.telegramId,
          govRole: citizensTable.govRole,
          isAdmin: citizensTable.isAdmin,
          dateOfBirth: citizensTable.dateOfBirth,
          kycVerified: citizensTable.kycVerified,
          tgNotifyState: citizensTable.tgNotifyState,
        })
        .from(citizensTable)
        .where(eq(citizensTable.isAdmin, 1))
    : [];

  const recipients = [...citizens, ...systemAdmins]
    .filter((citizen, index, all) =>
      all.findIndex((candidate) => candidate.id === citizen.id) === index &&
      !!citizen.telegramId &&
      citizen.tgNotifyState === 1 &&
      canUseAdultKycFeature(citizen.dateOfBirth, citizen.kycVerified) &&
      citizenMatchesPollRoles(citizen, poll.eligibleRoles));

  const start = poll.startsAt.toLocaleString("ru-RU", { timeZone: "UTC" });
  const end = poll.endsAt.toLocaleString("ru-RU", { timeZone: "UTC" });
  const reminder = REMINDERS.find((item) => item.key === notice);
  const message =
    (reminder
      ? `⏰ Напоминание: голосование начнётся ${reminder.label}\n\n`
      : "🗳️ Голосование TimeNation началось\n\n") +
    `Тема: ${poll.title}\n` +
    (poll.description ? `Цель и подробности: ${poll.description}\n` : "") +
    `Начало: ${start} UTC\nОкончание: ${end} UTC\n\n` +
    (notice === "started"
      ? "Голосуйте «За» или «Против» до указанного времени."
      : "Интерфейс голосования откроется в назначенное время.");
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  const url = domain
    ? `https://${domain}/web/gov/polls`
    : "https://timenation.info/web/gov/polls";

  const results = await Promise.allSettled(recipients.map((recipient) =>
    bot.telegram.sendMessage(recipient.telegramId!, message, {
      reply_markup: {
        inline_keyboard: [[{ text: "🗳 Открыть голосование", url }]],
      },
    }),
  ));
  const failed = results.filter((result) => result.status === "rejected").length;
  logger.info({ pollId: poll.id, recipients: recipients.length, failed }, "Poll start notifications sent");
}

export async function processGovernmentPollSchedule(): Promise<void> {
  const now = new Date();
  const scheduledSoon = await db
    .select()
    .from(governmentPollsTable)
    .where(and(
      eq(governmentPollsTable.status, "scheduled"),
      gt(governmentPollsTable.startsAt, now),
      lte(governmentPollsTable.startsAt, new Date(now.getTime() + REMINDERS[0]!.leadMs)),
    ));

  for (const poll of scheduledSoon) {
    for (const reminder of REMINDERS) {
      if (poll.startsAt.getTime() - now.getTime() > reminder.leadMs || !getBot()) continue;
      const [claimed] = await db
        .update(governmentPollsTable)
        .set({ [reminder.field]: now })
        .where(and(
          eq(governmentPollsTable.id, poll.id),
          eq(governmentPollsTable.status, "scheduled"),
          isNull(governmentPollsTable[reminder.field]),
        ))
        .returning();
      if (claimed) await notifyEligibleVoters(claimed, reminder.key);
    }
  }

  const starting = await db
    .select()
    .from(governmentPollsTable)
    .where(and(
      eq(governmentPollsTable.status, "scheduled"),
      lte(governmentPollsTable.startsAt, now),
      gt(governmentPollsTable.endsAt, now),
    ));

  for (const poll of starting) {
    const [activated] = await db
      .update(governmentPollsTable)
      .set({ status: "active" })
      .where(and(
        eq(governmentPollsTable.id, poll.id),
        eq(governmentPollsTable.status, "scheduled"),
      ))
      .returning();
    if (activated) await notifyEligibleVoters(activated, "started");
  }

  await db
    .update(governmentPollsTable)
    .set({ status: "completed" })
    .where(and(
      eq(governmentPollsTable.status, "scheduled"),
      lte(governmentPollsTable.endsAt, now),
    ));
  await db
    .update(governmentPollsTable)
    .set({ status: "completed" })
    .where(and(
      eq(governmentPollsTable.status, "active"),
      lte(governmentPollsTable.endsAt, now),
    ));
}
