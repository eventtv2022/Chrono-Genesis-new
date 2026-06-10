import { pgTable, serial, integer, text, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emissionLogsTable = pgTable("emission_logs", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  dailyTotal: real("daily_total").notNull().default(0),
  isApproved: boolean("is_approved").notNull().default(true),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmissionLogSchema = createInsertSchema(emissionLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmissionLog = z.infer<typeof insertEmissionLogSchema>;
export type EmissionLog = typeof emissionLogsTable.$inferSelect;
