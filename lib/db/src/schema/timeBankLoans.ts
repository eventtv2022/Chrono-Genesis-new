import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citizensTable } from "./citizens";

export const timeBankLoansTable = pgTable("time_bank_loans", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
  amount: integer("amount").notNull(),
  remainingDebt: integer("remaining_debt").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  repaidAt: timestamp("repaid_at", { withTimezone: true }),
});

export const insertTimeBankLoanSchema = createInsertSchema(timeBankLoansTable).omit({
  id: true,
  createdAt: true,
  repaidAt: true,
});
export type InsertTimeBankLoan = z.infer<typeof insertTimeBankLoanSchema>;
export type TimeBankLoan = typeof timeBankLoansTable.$inferSelect;
