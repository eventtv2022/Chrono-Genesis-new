import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const timelineExchangeRequestsTable = pgTable("timeline_exchange_requests", {
  id: serial("id").primaryKey(),
  fromCitizenId: integer("from_citizen_id").notNull().references(() => citizensTable.id),
  toCitizenId: integer("to_citizen_id").notNull().references(() => citizensTable.id),
  fromCoord: text("from_coord").notNull(),
  toCoord: text("to_coord").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("timeline_exchange_requests_from_status_idx").on(table.fromCitizenId, table.status),
  index("timeline_exchange_requests_to_status_idx").on(table.toCitizenId, table.status),
]);

export type TimelineExchangeRequest = typeof timelineExchangeRequestsTable.$inferSelect;
