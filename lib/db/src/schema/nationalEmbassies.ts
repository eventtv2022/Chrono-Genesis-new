import { pgTable, serial, integer, real, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nationalEmbassiesTable = pgTable("national_embassies", {
  id:                  serial("id").primaryKey(),
  citizenId:           integer("citizen_id").notNull(),
  gpsLat:              real("gps_lat").notNull(),
  gpsLng:              real("gps_lng").notNull(),
  address:             text("address"),
  nodeActive:          boolean("node_active").notNull().default(false),
  uptimeScore:         real("uptime_score").notNull().default(0),
  status:              text("status").notNull().default("pending"),
  nftMetadata:         text("nft_metadata"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ── Node validation fields ────────────────────────────────────────────────
  nodeIp:              text("node_ip"),
  nodeStatus:          text("node_status").notNull().default("offline"),
  lastPingMs:          integer("last_ping_ms"),
  geoIpCountry:        text("geoip_country"),
  geoIpLat:            real("geoip_lat"),
  geoIpLng:            real("geoip_lng"),
  lastValidatedAt:     timestamp("last_validated_at", { withTimezone: true }),
  verificationQrToken: text("verification_qr_token"),
  tokenExpiresAt:      timestamp("token_expires_at", { withTimezone: true }),
  isHardwareVerified:  boolean("is_hardware_verified").notNull().default(false),
  anomalyLog:          text("anomaly_log"),
});

export const insertNationalEmbassySchema = createInsertSchema(nationalEmbassiesTable).omit({
  id: true,
  nodeActive: true,
  uptimeScore: true,
  createdAt: true,
  nodeStatus: true,
  isHardwareVerified: true,
});
export type InsertNationalEmbassy = z.infer<typeof insertNationalEmbassySchema>;
export type NationalEmbassy = typeof nationalEmbassiesTable.$inferSelect;
