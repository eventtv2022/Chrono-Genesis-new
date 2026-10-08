import { pgTable, serial, integer, text, varchar, boolean, timestamp, primaryKey, real, foreignKey } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const groupChatsTable = pgTable("group_chats", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({
    name: "group_chats_created_by_fkey",
    columns: [t.createdBy],
    foreignColumns: [citizensTable.id],
  }),
]);

export const groupMembersTable = pgTable("group_members", {
  groupId: integer("group_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: "group_members_pkey", columns: [t.groupId, t.citizenId] }),
  foreignKey({
    name: "group_members_group_id_fkey",
    columns: [t.groupId],
    foreignColumns: [groupChatsTable.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "group_members_citizen_id_fkey",
    columns: [t.citizenId],
    foreignColumns: [citizensTable.id],
  }),
]);

export const groupMessagesTable = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  fromCitizenId: integer("from_citizen_id").notNull(),
  content: text("content").notNull(),
  // E2EE fields — present when the message is encrypted with the group key
  ciphertext: text("ciphertext"),
  msgNonce: text("msg_nonce"),
  msgType: text("msg_type").default("text").notNull(),
  darminAmount: real("darmin_amount"),
  forwardedFromDmId: integer("forwarded_from_dm_id"),
  replyToId: integer("reply_to_id"),
  replySenderName: text("reply_sender_name"),
  replyContent: text("reply_content"),
  attachments: text("attachments"),  // JSON-stringified AttachmentMeta[]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({
    name: "group_messages_group_id_fkey",
    columns: [t.groupId],
    foreignColumns: [groupChatsTable.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "group_messages_from_citizen_id_fkey",
    columns: [t.fromCitizenId],
    foreignColumns: [citizensTable.id],
  }),
]);

export const groupMessageReadsTable = pgTable("group_message_reads", {
  groupId: integer("group_id").notNull(),
  citizenId: integer("citizen_id").notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ name: "group_message_reads_pkey", columns: [t.groupId, t.citizenId] }),
  foreignKey({
    name: "group_message_reads_citizen_id_fkey",
    columns: [t.citizenId],
    foreignColumns: [citizensTable.id],
  }),
]);

/**
 * Per-member encrypted copy of the group symmetric key.
 * Each member receives the 32-byte group key encrypted with NaCl box
 * (creator's secret key + member's public key).
 */
export const groupKeysTable = pgTable("group_keys", {
  groupId: integer("group_id").notNull(),
  citizenId: integer("citizen_id").notNull(),         // recipient member
  creatorPublicKey: text("creator_public_key").notNull(), // needed by recipient to decrypt
  encryptedKey: text("encrypted_key").notNull(),       // nacl.box(groupKey, nonce, memberPub, creatorSec)
  encNonce: text("enc_nonce").notNull(),               // nonce for the box above
}, (t) => [
  primaryKey({ name: "group_keys_pkey", columns: [t.groupId, t.citizenId] }),
]);

export type GroupChat = typeof groupChatsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type GroupMessage = typeof groupMessagesTable.$inferSelect;
export type GroupKey = typeof groupKeysTable.$inferSelect;
