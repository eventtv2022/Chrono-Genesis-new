import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const focusSessionsTable = pgTable("focus_sessions", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  plannedSeconds: integer("planned_seconds").notNull(),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  runningSince: timestamp("running_since", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  textCharacters: integer("text_characters").notNull().default(0),
  rewardDarmins: integer("reward_darmins").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const focusQuizAttemptsTable = pgTable("focus_quiz_attempts", {
  id: text("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  questionId: text("question_id").notNull(),
  isCorrect: integer("is_correct"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
