import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";
import { chronopediaSlotsTable } from "./chronopediaSlots";

export const chronopediaEventsTable = pgTable("chronopedia_events", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id")
    .notNull()
    .references(() => chronopediaSlotsTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id")
    .notNull()
    .references(() => citizensTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChronopediaEvent = typeof chronopediaEventsTable.$inferSelect;
