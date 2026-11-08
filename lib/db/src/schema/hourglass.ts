import { date, index, integer, pgTable, real, serial, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const hourglassSettingsTable = pgTable("hourglass_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: integer("updated_by").references(() => citizensTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hourglassPrizeTiersTable = pgTable("hourglass_prize_tiers", {
  rewardAmount: integer("reward_amount").primaryKey(),
  dailyQuantity: integer("daily_quantity").notNull().default(0),
});

export const hourglassDailyInventoryTable = pgTable(
  "hourglass_daily_inventory",
  {
    id: serial("id").primaryKey(),
    prizeDate: date("prize_date", { mode: "string" }).notNull(),
    rewardAmount: integer("reward_amount").notNull(),
    initialQuantity: integer("initial_quantity").notNull(),
    remainingQuantity: integer("remaining_quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("hourglass_daily_inventory_date_reward_unique").on(table.prizeDate, table.rewardAmount),
    index("hourglass_daily_inventory_date_idx").on(table.prizeDate),
  ],
);

export const hourglassSpinsTable = pgTable(
  "hourglass_spins",
  {
    id: serial("id").primaryKey(),
    citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
    prizeDate: date("prize_date", { mode: "string" }).notNull(),
    rewardAmount: real("reward_amount").notNull(),
    spunAt: timestamp("spun_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("hourglass_spins_citizen_date_unique").on(table.citizenId, table.prizeDate),
    index("hourglass_spins_date_idx").on(table.prizeDate),
  ],
);

export type HourglassSpin = typeof hourglassSpinsTable.$inferSelect;
