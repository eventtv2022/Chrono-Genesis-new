import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const aiSystemPromptsTable = pgTable("ai_system_prompts", {
  id: serial("id").primaryKey(),
  module: text("module").notNull().unique(),
  promptText: text("prompt_text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByName: text("updated_by_name"),
});

export type AiSystemPrompt = typeof aiSystemPromptsTable.$inferSelect;
