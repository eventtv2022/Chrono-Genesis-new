import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

// TiMETR Escrow — task-based citizen-to-citizen time transfer
// Flow: Sender creates deal → minutes locked → Receiver accepts + submits proof →
//       Sender approves → minutes released to Receiver (or declined → returned to Sender)
export const dealsTable = pgTable("deals", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id"),            // null = open marketplace deal
  amount: integer("amount").notNull(),           // TiMETR minutes locked in escrow
  description: text("description").notNull(),
  // Statuses: open → accepted → proof_submitted → completed | declined | disputed
  //           open → cancelled (sender cancels before accepted)
  status: text("status").notNull().default("open"),
  proofUrl: text("proof_url"),                   // receiver-supplied link to evidence
  proofText: text("proof_text"),                 // receiver-supplied text description
  disputeClaimText: text("dispute_claim_text"),  // claimant's description of the dispute
  aiVerdict: text("ai_verdict"),                  // Gemini arbitration verdict
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Deal = typeof dealsTable.$inferSelect;
export type InsertDeal = typeof dealsTable.$inferInsert;
