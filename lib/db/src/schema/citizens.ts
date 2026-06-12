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
  balanceMinutes: integer("balance_minutes").notNull().default(1), // 1 родовая минута
  totalGiven: integer("total_given").notNull().default(0),
  totalReceived: integer("total_received").notNull().default(0),
  status: text("status").notNull().default("active"),
  meritScore: real("merit_score").notNull().default(0),
  rank: text("rank").notNull().default("Странник"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  ageVerified: integer("age_verified").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // ── ICAO Doc 9303 Passport fields ──────────────────────────────────────────
  citizenNumber: text("citizen_number").unique(), // 000000001 … 999999999
  surname: text("surname"),
  givenNames: text("given_names"),
  dateOfBirth: text("date_of_birth"), // YYYY-MM-DD
  photoUrl: text("photo_url"),
  idCardUrl: text("id_card_url"), // filled when issued
  // 'pending' → 'issued' | 'rejected'. NULL = legacy citizen (treated as issued)
  registrationStatus: text("registration_status"),
  availableAt: timestamp("available_at", { withTimezone: true }), // NOW + 1h

  // ── Registration contact & compliance fields ───────────────────────────────
  email: text("email"),                          // contact email (optional)
  seedThought: text("seed_thought"),             // kept for future use, not collected at registration
  privacyAgreementAccepted: integer("privacy_agreement_accepted").notNull().default(0),
  privacyAgreementDate: timestamp("privacy_agreement_date", { withTimezone: true }),
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
