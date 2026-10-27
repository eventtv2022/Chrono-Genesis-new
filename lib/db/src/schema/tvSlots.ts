import { pgTable, serial, integer, text, real, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Slot types by minute position ───────────────────────────────────────────
// apex    : minuteIndex % 60 === 0          (:00)  → 24 slots/day
// half    : minuteIndex % 30 === 0, ≠ :00   (:30)  → 24 slots/day
// quarter : minuteIndex % 15 === 0, ≠ :00/:30  (:15, :45)  → 48 slots/day
// citizen : all others                      → 1344 slots/day
// Total: 1440 slots/day
// ─────────────────────────────────────────────────────────────────────────────

export const tvSlotsTable = pgTable(
  "tv_slots",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(), // YYYY-MM-DD
    minuteIndex: integer("minute_index").notNull(), // 0–1439
    slotType: text("slot_type").notNull(), // citizen | quarter | half | apex
    status: text("status").notNull().default("free"), // free | booked | broadcast
    ownerId: integer("owner_id"), // FK citizens.id
    paymentType: text("payment_type"), // fiat | timeltr | null
    priceEur: real("price_eur").notNull(),
    timeltrBurnCost: integer("timeltr_burn_cost").notNull(),
    fingerprintHash: text("fingerprint_hash"), // anti-consecutive guard
    stripeSessionId: text("stripe_session_id"),
    cryptoPaymentUuid: text("crypto_payment_uuid"),   // Cryptomus payment UUID
    paymentStatus: text("payment_status").default("pending"), // pending | completed | refunded
    billingDescriptor: text("billing_descriptor"),    // exact label used in checkout
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tv_slots_date_minute_idx").on(t.date, t.minuteIndex)]
);

export const insertTvSlotSchema = createInsertSchema(tvSlotsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTvSlot = z.infer<typeof insertTvSlotSchema>;
export type TvSlot = typeof tvSlotsTable.$inferSelect;
