import { pgTable, serial, integer, text, timestamp, foreignKey } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const socialAlarmsTable = pgTable("social_alarms", {
  id: serial("id").primaryKey(),
  initiatedBy: integer("initiated_by").notNull(),
  targetType: text("target_type").notNull(), // 'all' | 'direct'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "social_alarms_initiated_by_fkey",
    columns: [t.initiatedBy],
    foreignColumns: [citizensTable.id],
  }),
]);

export const socialAlarmTargetsTable = pgTable("social_alarm_targets", {
  id: serial("id").primaryKey(),
  alarmId: integer("alarm_id").notNull(),
  targetCitizenId: integer("target_citizen_id").notNull(),
}, (t) => [
  foreignKey({
    name: "social_alarm_targets_alarm_id_fkey",
    columns: [t.alarmId],
    foreignColumns: [socialAlarmsTable.id],
  }),
  foreignKey({
    name: "social_alarm_targets_target_citizen_id_fkey",
    columns: [t.targetCitizenId],
    foreignColumns: [citizensTable.id],
  }),
]);

export type SocialAlarm = typeof socialAlarmsTable.$inferSelect;
export type SocialAlarmTarget = typeof socialAlarmTargetsTable.$inferSelect;
