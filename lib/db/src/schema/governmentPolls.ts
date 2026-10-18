import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const governmentPollsTable = pgTable("government_polls", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  eligibleRoles: text("eligible_roles").array().notNull(),
  createdBy: integer("created_by").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
  reminder1hSentAt: timestamp("reminder_1h_sent_at", { withTimezone: true }),
  reminder1mSentAt: timestamp("reminder_1m_sent_at", { withTimezone: true }),
  status: text("status").notNull().default("scheduled"), // scheduled | active | completed | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const governmentPollBallotsTable = pgTable("government_poll_ballots", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull(),
  voterId: integer("voter_id").notNull(),
  voterName: text("voter_name").notNull(),
  vote: text("vote").notNull(), // yes | no
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("government_poll_ballots_poll_id_voter_id_key").on(t.pollId, t.voterId),
]);

export type GovernmentPoll = typeof governmentPollsTable.$inferSelect;
export type GovernmentPollBallot = typeof governmentPollBallotsTable.$inferSelect;
