import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const souvenirDarminsTable = pgTable("souvenir_darmins", {
  serialNumber: integer("serial_number").primaryKey(),
  citizenId: integer("citizen_id").references(() => citizensTable.id),
  slogan: text("slogan").notNull(),
  imagePath: text("image_path").notNull(),
  status: text("status").notNull().default("ISSUED"),
  isGenesis: boolean("is_genesis").notNull().default(false),
  nftTokenId: text("nft_token_id"),
  nftRecipient: text("nft_recipient"),
  nftMetadataUri: text("nft_metadata_uri"),
  nftTransactionHash: text("nft_transaction_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
