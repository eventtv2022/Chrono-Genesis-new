import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";

export const dmMessagesTable = pgTable("dm_messages", {
  id: serial("id").primaryKey(),
  fromCitizenId: integer("from_citizen_id").notNull(),
  toCitizenId: integer("to_citizen_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  msgType: text("msg_type").default("text").notNull(),
  darminAmount: real("darmin_amount"),
  forwardedFromId: integer("forwarded_from_id"),
  replyToId: integer("reply_to_id"),
  replySenderName: text("reply_sender_name"),
  replyContent: text("reply_content"),
  attachments: text("attachments"), // JSON: [{url,type,name,size}]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export type DmMessage = typeof dmMessagesTable.$inferSelect;
export type InsertDmMessage = typeof dmMessagesTable.$inferInsert;
