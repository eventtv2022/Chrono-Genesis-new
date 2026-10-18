import { and, eq, inArray, lte, gt } from "drizzle-orm";
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

async function notifyEligibleVoters(poll: typeof governmentPollsTable.$inferSelect): Promise<void> {
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
  const message =
    `🗳️ Голосование TimeNation началось\n\n` +
    `Тема: ${poll.title}\n` +
    (poll.description ? `Цель и подробности: ${poll.description}\n` : "") +
    `Начало: ${start} UTC\nОкончание: ${end} UTC\n\n` +
    `Голосуйте «За» или «Против» до указанного времени.`;
  const url = process.env["REPLIT_DOMAINS"]?.split(",")[0]
    ? `https://${process.env["REPLIT_DOMAINS"]!.split(",")[0]}/web/gov/polls`
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
    if (activated) await notifyEligibleVoters(activated);
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
