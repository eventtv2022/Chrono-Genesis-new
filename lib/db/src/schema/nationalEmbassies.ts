import { pgTable, serial, integer, real, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nationalEmbassiesTable = pgTable("national_embassies", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  gpsLat: real("gps_lat").notNull(),
  gpsLng: real("gps_lng").notNull(),
  address: text("address"),
  nodeActive: boolean("node_active").notNull().default(false),
  uptimeScore: real("uptime_score").notNull().default(0),
  status: text("status").notNull().default("pending"),
  nftMetadata: text("nft_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNationalEmbassySchema = createInsertSchema(nationalEmbassiesTable).omit({
  id: true,
  nodeActive: true,
  uptimeScore: true,
  createdAt: true,
});
export type InsertNationalEmbassy = z.infer<typeof insertNationalEmbassySchema>;
export type NationalEmbassy = typeof nationalEmbassiesTable.$inferSelect;
