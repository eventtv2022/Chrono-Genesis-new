import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const focusSessionsTable = pgTable("focus_sessions", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  taskId: integer("task_id"),
  report: text("report"),
  plannedSeconds: integer("planned_seconds").notNull(),
  elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
  focusPauseCount: integer("focus_pause_count").notNull().default(0),
  runningSince: timestamp("running_since", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  textCharacters: integer("text_characters").notNull().default(0),
  rewardDarmins: integer("reward_darmins").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("focus_sessions_task_idx").on(table.taskId),
]);

export const focusQuizAttemptsTable = pgTable("focus_quiz_attempts", {
  id: text("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  questionId: text("question_id").notNull(),
  sessionId: text("session_id"),
  question: text("question"),
  acceptedAnswers: text("accepted_answers").array(),
  isCorrect: integer("is_correct"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("focus_quiz_attempts_citizen_session_idx").on(table.citizenId, table.sessionId),
  uniqueIndex("focus_quiz_attempts_session_question_unique").on(table.citizenId, table.sessionId, table.questionId),
]);
