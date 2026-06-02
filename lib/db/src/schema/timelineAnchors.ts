import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const timelineAnchorsTable = pgTable("timeline_anchors", {
  id: serial("id").primaryKey(),
  timelineCoord: text("timeline_coord").notNull().unique(),
  citizenId: integer("citizen_id")
    .notNull()
    .references(() => citizensTable.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TimelineAnchor = typeof timelineAnchorsTable.$inferSelect;
