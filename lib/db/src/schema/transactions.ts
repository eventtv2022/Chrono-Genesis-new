import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  fromCitizenId: integer("from_citizen_id").notNull(),
  toCitizenId: integer("to_citizen_id").notNull(),
  fromCitizenName: text("from_citizen_name").notNull(),
  toCitizenName: text("to_citizen_name").notNull(),
  minutesTransferred: integer("minutes_transferred").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
