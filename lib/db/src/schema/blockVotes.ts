import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

// ── Block vote requests ───────────────────────────────────────────────────────
// Created when an admin initiates a block. The citizen is NOT immediately
// banned — they remain active until the 24-hour vote concludes.
export const blockVoteRequestsTable = pgTable("block_vote_requests", {
  id:            serial("id").primaryKey(),
  citizenId:     integer("citizen_id").notNull(),
  citizenName:   text("citizen_name").notNull(),
  reason:        text("reason").notNull(),
  initiatedById: integer("initiated_by_id").notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt:        timestamp("ends_at",    { withTimezone: true }).notNull(),
  // pending | approved | rejected | cancelled
  status:        text("status").notNull().default("pending"),
});

// ── Individual ballots ────────────────────────────────────────────────────────
// One row per eligible voter per request. UNIQUE prevents double-voting.
export const blockVoteBallotsTable = pgTable("block_vote_ballots", {
  id:        serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  voterId:   integer("voter_id").notNull(),
  voterName: text("voter_name").notNull(),
  vote:      text("vote").notNull(), // "yes" | "no"
  votedAt:   timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("block_vote_ballots_request_id_voter_id_key").on(t.requestId, t.voterId),
]);
