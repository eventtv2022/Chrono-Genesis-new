import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  senderId: integer("sender_id").notNull(),
  messageText: text("message_text"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type InsertChatMessage = typeof chatMessagesTable.$inferInsert;
