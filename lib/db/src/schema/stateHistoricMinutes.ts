import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const stateHistoricMinutesTable = pgTable("state_historic_minutes", {
  id:            serial("id").primaryKey(),
  timelineCoord: text("timeline_coord").notNull().unique("state_historic_minutes_timeline_coord_key"),
  category:      text("category").notNull(), // SPACE | TECH_INNOVATION | SCIENCE | CULTURE_ARTS | WORLD_HISTORY | SPORTS | CENTURY_BOUNDARY | YEAR_BOUNDARY
  title:         text("title").notNull(),
  description:   text("description").notNull().default(""),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StateHistoricMinute = typeof stateHistoricMinutesTable.$inferSelect;
