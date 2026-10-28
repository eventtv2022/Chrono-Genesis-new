import { pgTable, serial, integer, text, timestamp, foreignKey, uniqueIndex } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const timeBankDisclosureAcceptancesTable = pgTable("time_bank_disclosure_acceptances", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull(),
  disclosureVersion: text("disclosure_version").notNull(),
  language: text("language").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({
    name: "time_bank_disclosure_acceptances_citizen_id_fkey",
    columns: [t.citizenId],
    foreignColumns: [citizensTable.id],
  }).onDelete("cascade"),
  uniqueIndex("time_bank_disclosure_acceptances_citizen_version_uidx")
    .on(t.citizenId, t.disclosureVersion),
]);

export type TimeBankDisclosureAcceptance = typeof timeBankDisclosureAcceptancesTable.$inferSelect;
