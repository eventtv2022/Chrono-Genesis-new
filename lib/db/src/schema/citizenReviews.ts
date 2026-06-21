import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const citizenReviewsTable = pgTable("citizen_reviews", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => citizensTable.id),
  targetId: integer("target_id").notNull().references(() => citizensTable.id),
  rating: integer("rating").notNull(),         // 1–5
  reviewText: text("review_text").notNull(),
  taxPaid: real("tax_paid").notNull(),          // Дармины, ушедшие в Казначейство
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CitizenReview = typeof citizenReviewsTable.$inferSelect;
