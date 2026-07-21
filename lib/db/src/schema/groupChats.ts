import { pgTable, serial, integer, text, varchar, boolean, timestamp, primaryKey, real } from "drizzle-orm/pg-core";

export const groupChatsTable = pgTable("group_chats", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groupMembersTable = pgTable("group_members", {
  groupId: integer("group_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.citizenId] }),
]);

export const groupMessagesTable = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  fromCitizenId: integer("from_citizen_id").notNull(),
  content: text("content").notNull(),
  msgType: text("msg_type").default("text").notNull(),
  darminAmount: real("darmin_amount"),
  forwardedFromDmId: integer("forwarded_from_dm_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groupMessageReadsTable = pgTable("group_message_reads", {
  groupId: integer("group_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.citizenId] }),
]);

export type GroupChat = typeof groupChatsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type GroupMessage = typeof groupMessagesTable.$inferSelect;
