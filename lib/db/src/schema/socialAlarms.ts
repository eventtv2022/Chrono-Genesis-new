import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const socialAlarmsTable = pgTable("social_alarms", {
  id: serial("id").primaryKey(),
  initiatedBy: integer("initiated_by").notNull().references(() => citizensTable.id),
  targetType: text("target_type").notNull(), // 'all' | 'direct'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialAlarmTargetsTable = pgTable("social_alarm_targets", {
  id: serial("id").primaryKey(),
  alarmId: integer("alarm_id").notNull().references(() => socialAlarmsTable.id),
  targetCitizenId: integer("target_citizen_id").notNull().references(() => citizensTable.id),
});

export type SocialAlarm = typeof socialAlarmsTable.$inferSelect;
export type SocialAlarmTarget = typeof socialAlarmTargetsTable.$inferSelect;
