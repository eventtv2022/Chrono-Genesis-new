import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citizensTable = pgTable("citizens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  telegramId: text("telegram_id").unique(),
  walletAddress: text("wallet_address").unique(),
  walletNonce: text("wallet_nonce"),
  walletVerified: integer("wallet_verified").notNull().default(0),
  balanceMinutes: integer("balance_minutes").notNull().default(60),
  totalGiven: integer("total_given").notNull().default(0),
  totalReceived: integer("total_received").notNull().default(0),
  status: text("status").notNull().default("active"),
  meritScore: real("merit_score").notNull().default(0),
  rank: text("rank").notNull().default("Странник"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCitizenSchema = createInsertSchema(citizensTable).omit({
  id: true,
  balanceMinutes: true,
  totalGiven: true,
  totalReceived: true,
  meritScore: true,
  rank: true,
  lastActivity: true,
  createdAt: true,
  walletAddress: true,
});
export type InsertCitizen = z.infer<typeof insertCitizenSchema>;
export type Citizen = typeof citizensTable.$inferSelect;
