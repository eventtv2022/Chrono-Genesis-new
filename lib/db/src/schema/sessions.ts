import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  fromCitizenId: integer("from_citizen_id").notNull(),
  toCitizenId: integer("to_citizen_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  minutesTransferred: real("minutes_transferred"),
  bonusMinutesTransferred: real("bonus_minutes_transferred").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  startedAt: true,
  stoppedAt: true,
  durationSeconds: true,
  minutesTransferred: true,
});
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
