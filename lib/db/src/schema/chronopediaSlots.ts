import { pgTable, serial, text, doublePrecision, timestamp, uniqueIndex, integer, boolean } from "drizzle-orm/pg-core";

export const chronopediaSlotsTable = pgTable(
  "chronopedia_slots",
  {
    id:             serial("id").primaryKey(),
    timeMarker:     text("time_marker").notNull(),
    placeId:        text("place_id").notNull(),
    geoLat:         doublePrecision("geo_lat").notNull(),
    geoLng:         doublePrecision("geo_lng").notNull(),
    locationName:   text("location_name").notNull(),
    // Ownership & escrow
    ownerCitizenId: integer("owner_citizen_id"),   // null = community-owned (no individual owner)
    isLocked:       boolean("is_locked").notNull().default(false),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chronopedia_unique_time_space").on(t.timeMarker, t.placeId),
  ]
);

export type ChronopediaSlot = typeof chronopediaSlotsTable.$inferSelect;
