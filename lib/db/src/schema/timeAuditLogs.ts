import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeAuditLogsTable = pgTable("time_audit_logs", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id"),
  taskDescription: text("task_description").notNull(),
  estimatedMinutes: real("estimated_minutes").notNull(),
  actualMinutes: real("actual_minutes"),
  deviationPercent: real("deviation_percent"),
  complexityLevel: text("complexity_level").notNull(),
  justification: text("justification").notNull(),
  requiresCalibration: integer("requires_calibration").notNull().default(0),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  moderatedByName: text("moderated_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTimeAuditLogSchema = createInsertSchema(timeAuditLogsTable).omit({
  id: true,
  createdAt: true,
});

export type TimeAuditLog = typeof timeAuditLogsTable.$inferSelect;
export type InsertTimeAuditLog = z.infer<typeof insertTimeAuditLogSchema>;
