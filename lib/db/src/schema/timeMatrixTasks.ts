import { boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const timeMatrixTasksTable = pgTable("time_matrix_tasks", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  title: text("title").notNull(),
  quadrant: text("quadrant").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  rewardDarmins: integer("reward_darmins").notNull().default(0),
  quickChecklist: boolean("quick_checklist").notNull().default(false),
}, (table) => [
  index("time_matrix_tasks_citizen_created_idx").on(table.citizenId, table.createdAt),
  index("time_matrix_tasks_citizen_status_idx").on(table.citizenId, table.status),
]);
