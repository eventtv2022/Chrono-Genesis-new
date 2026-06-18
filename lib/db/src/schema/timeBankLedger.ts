import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";
import { timeBankLoansTable } from "./timeBankLoans";

export const timeBankLedgerTable = pgTable("time_bank_ledger", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
  loanId: integer("loan_id").references(() => timeBankLoansTable.id),
  type: text("type").notNull(), // loan_issued | manual_repayment | auto_repayment | collateral_released
  amount: integer("amount").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TimeBankLedgerEntry = typeof timeBankLedgerTable.$inferSelect;
