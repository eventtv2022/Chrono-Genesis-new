import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";
import { timelineAnchorsTable } from "./timelineAnchors";

export const minuteLicensesTable = pgTable("minute_licenses", {
  id: serial("id").primaryKey(),
  certificateId: text("certificate_id").notNull().unique(),
  timelineAnchorId: integer("timeline_anchor_id").notNull().unique().references(() => timelineAnchorsTable.id),
  timelineCoord: text("timeline_coord").notNull().unique(),
  citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
  ownerName: text("owner_name").notNull(),
  customTitle: text("custom_title").notNull(),
  customDescription: text("custom_description").notNull().default(""),
  walletAddress: text("wallet_address").notNull(),
  status: text("status").notNull().default("PENDING_PAYMENT_OR_MINT"),
  certificatePath: text("certificate_path"),
  certificateIpfsUri: text("certificate_ipfs_uri"),
  metadataUri: text("metadata_uri"),
  mediaIpfsUri: text("media_ipfs_uri"),
  mediaType: text("media_type"),
  mediaDurationSeconds: integer("media_duration_seconds"),
  transactionHash: text("transaction_hash"),
  tokenId: text("token_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MinuteLicense = typeof minuteLicensesTable.$inferSelect;
