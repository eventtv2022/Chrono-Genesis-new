import { date, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const citizenActivityDaysTable = pgTable(
  "citizen_activity_days",
  {
    id: serial("id").primaryKey(),
    citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
    activityDate: date("activity_date", { mode: "string" }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("citizen_activity_days_citizen_date_unique").on(table.citizenId, table.activityDate),
  ],
);

export type CitizenActivityDay = typeof citizenActivityDaysTable.$inferSelect;
