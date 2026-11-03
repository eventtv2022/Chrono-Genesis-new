import { integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const fiatDarminPurchasesTable = pgTable("fiat_darmin_purchases", {
  stripeSessionId: text("stripe_session_id").primaryKey(),
  citizenId: integer("citizen_id").notNull().references(() => citizensTable.id),
  darmins: real("darmins").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
