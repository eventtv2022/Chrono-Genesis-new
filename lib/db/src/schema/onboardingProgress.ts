import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const onboardingProgressTable = pgTable(
  "onboarding_progress",
  {
    progressToken: text("progress_token").primaryKey(),
    citizenId: integer("citizen_id"),
    guideCurrentQuestionId: integer("guide_current_question_id").notNull().default(1),
    guideRevealedQuestionIds: integer("guide_revealed_question_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    guideCompleted: boolean("guide_completed").notNull().default(false),
    simulatorCurrentQuestionId: integer("simulator_current_question_id").notNull().default(31),
    simulatorRevealedQuestionIds: integer("simulator_revealed_question_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    simulatorCompleted: boolean("simulator_completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("onboarding_progress_citizen_id_unique").on(table.citizenId)],
);

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgressTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type OnboardingProgress = typeof onboardingProgressTable.$inferSelect;
