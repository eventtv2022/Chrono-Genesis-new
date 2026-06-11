import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timelineCapsulesTable = pgTable("timeline_capsules", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  timelineCoord: text("timeline_coord").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTimelineCapsuleSchema = createInsertSchema(timelineCapsulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimelineCapsule = z.infer<typeof insertTimelineCapsuleSchema>;
export type TimelineCapsule = typeof timelineCapsulesTable.$inferSelect;
