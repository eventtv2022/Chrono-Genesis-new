import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Existing payment records are written through raw SQL in the API server.
 * Keep the table represented in Drizzle so schema pushes preserve its data.
 */
export const trc20PaymentsTable = pgTable("trc20_payments", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  amountUsdt: numeric("amount_usdt", { precision: 14, scale: 4 }).notNull(),
  darmins: integer("darmins").notNull(),
  purpose: text("purpose").notNull().default("darmins"),
  referenceId: integer("reference_id"),
  txId: text("tx_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});
