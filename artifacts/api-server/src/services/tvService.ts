import crypto from "crypto";
import type { Request } from "express";
import { db } from "@workspace/db";
import { tvSlotsTable, tvCapsulesTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendTransactionNotification } from "./telegramService";

// ── Slot type by minute position ─────────────────────────────────────────────
// apex    : minuteIndex % 60 === 0           (:00)  → 24/day
// half    : minuteIndex % 30 === 0, ≠ :00    (:30)  → 24/day
// quarter : minuteIndex % 15 === 0, ≠ :00/:30 (:15/:45) → 48/day
// citizen : all others                                 → 1344/day
// ─────────────────────────────────────────────────────────────────────────────
export type SlotType = "citizen" | "quarter" | "half" | "apex";

export function getSlotType(minuteIndex: number): SlotType {
  const m = minuteIndex % 60;
  if (m === 0) return "apex";
  if (m === 30) return "half";
  if (m % 15 === 0) return "quarter";
  return "citizen";
}

// ── Burn Matrix ───────────────────────────────────────────────────────────────
// Pricing reflects time-position tiers (not citizen ranks):
//   Минута  (:other) →  1 Д /  1.99 €
//   Четверть (:15/:45) → 5 Д /  4.99 €
//   Половина (:30)    → 10 Д /  9.99 €
//   Ровно    (:00)    → 25 Д / 24.99 €
export const BURN_MATRIX: Record<
  SlotType,
  { eur: number; priceEurCents: number; timeltr: number; label: string }
> = {
  citizen: { eur: 1.99,  priceEurCents: 199,  timeltr: 1,  label: "Минута (:other)" },
  quarter: { eur: 4.99,  priceEurCents: 499,  timeltr: 5,  label: "Четверть (:15/:45)" },
  half:    { eur: 9.99,  priceEurCents: 999,  timeltr: 10, label: "Половина (:30)" },
  apex:    { eur: 24.99, priceEurCents: 2499, timeltr: 25, label: "Ровно (:00)" },
};

// ── Fingerprint for anti-consecutive guard ────────────────────────────────────
export function getFingerprint(req: Request): string {
  const raw = `${req.ip ?? "unknown"}:${req.headers["user-agent"] ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ── Sovereign URL ─────────────────────────────────────────────────────────────
export function generateSovereignUrl(date: string, minuteIndex: number): string {
  const hour = String(Math.floor(minuteIndex / 60)).padStart(2, "0");
  const min = String(minuteIndex % 60).padStart(2, "0");
  return `timenation.tv/moment/${date}-${hour}${min}`;
}

// ── Retro detection (slot_time < NOW) ─────────────────────────────────────────
export function isRetroSlot(date: string, minuteIndex: number): boolean {
  const hour = Math.floor(minuteIndex / 60);
  const min = minuteIndex % 60;
  const slotTime = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`
  );
  return slotTime < new Date();
}

// ── Date validation helper ────────────────────────────────────────────────────
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

// ── Generate all 1440 slots for a given date (idempotent) ────────────────────
export async function ensureSlotsForDate(date: string): Promise<void> {
  const [existing] = await db
    .select({ id: tvSlotsTable.id })
    .from(tvSlotsTable)
    .where(eq(tvSlotsTable.date, date))
    .limit(1);

  if (existing) return; // Already generated

  const rows = Array.from({ length: 1440 }, (_, i) => {
    const slotType = getSlotType(i);
    const pricing = BURN_MATRIX[slotType];
    return {
      date,
      minuteIndex: i,
      slotType,
      status: "free" as const,
      priceEur: pricing.eur,
      timeltrBurnCost: pricing.timeltr,
    };
  });

  // Insert in chunks of 200 to avoid large parameter arrays
  for (let offset = 0; offset < rows.length; offset += 200) {
    await db
      .insert(tvSlotsTable)
      .values(rows.slice(offset, offset + 200))
      .onConflictDoNothing();
  }

  logger.info({ date, count: 1440 }, "TV slots generated for date");
}

// ── Air Due Slots (runs every minute) ─────────────────────────────────────────
// Finds booked slots whose date+minuteIndex matches the current UTC minute,
// marks them "broadcast", marks their capsule "broadcast", notifies owner.
export async function airDueSlots(): Promise<number> {
  const now = new Date();
  const todayUTC = now.toISOString().slice(0, 10);
  const minuteIndex = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Check both "booked" (normal) and "broadcast" (pre-rendered before scheduled time)
  // so the owner always gets a "now live" notification at the correct minute.
  const dueSlots = await db
    .select()
    .from(tvSlotsTable)
    .where(
      and(
        eq(tvSlotsTable.date, todayUTC),
        eq(tvSlotsTable.minuteIndex, minuteIndex),
        or(
          eq(tvSlotsTable.status, "booked"),
          eq(tvSlotsTable.status, "broadcast"),
        ),
      )
    );

  if (dueSlots.length === 0) return 0;

  for (const slot of dueSlots) {
    // Promote "booked" → "broadcast"; already-broadcast slots are left untouched
    if (slot.status === "booked") {
      await db
        .update(tvSlotsTable)
        .set({ status: "broadcast" })
        .where(eq(tvSlotsTable.id, slot.id));

      await db
        .update(tvCapsulesTable)
        .set({ status: "broadcast" })
        .where(eq(tvCapsulesTable.slotId, slot.id))
        .catch(() => {});
    }

    if (slot.ownerId) {
      const hh = String(Math.floor(minuteIndex / 60)).padStart(2, "0");
      const mm = String(minuteIndex % 60).padStart(2, "0");
      sendTransactionNotification(
        slot.ownerId,
        `📡 *Ваш слот в эфире!*\n\n🗓 ${todayUTC} · ${hh}:${mm} UTC\nТип: ${slot.slotType}\n\nВаша капсула вышла в эфир TimeNation-TV.`,
      ).catch(() => {});
    }
  }

  logger.info({ todayUTC, minuteIndex, count: dueSlots.length }, "Slots aired");
  return dueSlots.length;
}
