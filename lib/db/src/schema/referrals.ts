import { pgTable, serial, integer, real, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredCitizenId: integer("referred_citizen_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
}, (table) => ({
  referredCitizenUnique: uniqueIndex("referrals_referred_citizen_id_unique").on(table.referredCitizenId),
}));

export const referralBonusLedgerTable = pgTable("referral_bonus_ledger", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  relatedCitizenId: integer("related_citizen_id"),
  referralId: integer("referral_id"),
  type: text("type").notNull(), // earned | spent | received
  amount: real("amount").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
