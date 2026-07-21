import { pgTable, serial, integer, varchar, timestamp, unique } from "drizzle-orm/pg-core";

export const dmReactionsTable = pgTable("dm_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  emoji: varchar("emoji", { length: 8 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("dm_reactions_unique").on(t.messageId, t.citizenId, t.emoji),
]);

export type DmReaction = typeof dmReactionsTable.$inferSelect;
