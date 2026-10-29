import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const timeMatrixRewardsTable = pgTable("time_matrix_rewards", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  source: text("source").notNull(),
  amount: integer("amount").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("time_matrix_rewards_citizen_created_idx").on(table.citizenId, table.createdAt),
]);
