import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

// ── State Treasury / Tax Pool ──────────────────────────────────────────────────
// All 2% system taxes flow into this log. The state treasury (citizen #1)
// accumulates the funds; this table provides the audit trail.
export const stateTaxLogsTable = pgTable("state_tax_logs", {
  id:            serial("id").primaryKey(),
  sourceType:    text("source_type").notNull(), // 'AUCTION_TAX' | 'PAID_SESSION_TAX' | 'ESCROW_FEE'
  amount:        real("amount").notNull(),       // Darmins collected
  fromCitizenId: integer("from_citizen_id").notNull(), // expert/seller who paid the tax
  referenceId:   integer("reference_id").notNull(),    // deal / auction / session ID
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StateTaxLog = typeof stateTaxLogsTable.$inferSelect;
export type InsertStateTaxLog = typeof stateTaxLogsTable.$inferInsert;
