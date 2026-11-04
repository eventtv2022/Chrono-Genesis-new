import { integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

export const apiRateLimitBucketsTable = pgTable("api_rate_limit_buckets", {
  key: text("key").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.key] })]);

export const darminSecurityEventsTable = pgTable("darmin_security_events", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id"),
  subjectHash: text("subject_hash"),
  source: text("source").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
});
