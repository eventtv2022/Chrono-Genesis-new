import { pgTable, serial, integer, varchar, timestamp, unique, foreignKey } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";
import { dmMessagesTable } from "./dmMessages";

export const dmReactionsTable = pgTable("dm_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  emoji: varchar("emoji", { length: 8 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("dm_reactions_message_id_citizen_id_emoji_key").on(t.messageId, t.citizenId, t.emoji),
  foreignKey({
    name: "dm_reactions_message_id_fkey",
    columns: [t.messageId],
    foreignColumns: [dmMessagesTable.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "dm_reactions_citizen_id_fkey",
    columns: [t.citizenId],
    foreignColumns: [citizensTable.id],
  }),
]);

export type DmReaction = typeof dmReactionsTable.$inferSelect;
