import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const passportEmailNotificationsTable = pgTable(
  "passport_email_notifications",
  {
    id: serial("id").primaryKey(),
    citizenId: integer("citizen_id")
      .notNull()
      .references(() => citizensTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    lastErrorCode: integer("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("passport_email_notifications_citizen_id_uidx").on(table.citizenId),
    index("passport_email_notifications_due_idx").on(table.status, table.nextAttemptAt),
  ],
);
