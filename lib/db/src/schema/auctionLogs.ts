import { pgTable, serial, integer, real, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auctionLogsTable = pgTable("auction_logs", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  finalPrice: real("final_price").notNull(),
  tax2pct: real("tax_2pct").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuctionLogSchema = createInsertSchema(auctionLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuctionLog = z.infer<typeof insertAuctionLogSchema>;
export type AuctionLog = typeof auctionLogsTable.$inferSelect;

// ─── Auctions (лоты на продажу) ──────────────────────────────────────────────

export const auctionsTable = pgTable("auctions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  amountDarmins: integer("amount_darmins").notNull(),
  startingPrice: real("starting_price").notNull(),
  currentBid: real("current_bid"),
  buyerId: integer("buyer_id"),
  status: text("status").notNull().default("active"),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuctionSchema = createInsertSchema(auctionsTable).omit({
  id: true,
  currentBid: true,
  buyerId: true,
  createdAt: true,
});
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Auction = typeof auctionsTable.$inferSelect;
