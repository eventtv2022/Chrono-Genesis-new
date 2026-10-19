import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteVisitorsTable = pgTable("site_visitors", {
  visitorHash: text("visitor_hash").primaryKey(),
  firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiteVisitorSchema = createInsertSchema(siteVisitorsTable).omit({
  firstVisitedAt: true,
});
export type InsertSiteVisitor = z.infer<typeof insertSiteVisitorSchema>;
export type SiteVisitor = typeof siteVisitorsTable.$inferSelect;
