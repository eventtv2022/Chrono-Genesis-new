import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Three independent capsule dimensions ────────────────────────────────────
// A. broadcastPolicy : echo | noise | private
//    echo    = Retro-капсула врывается в LIVE (доп. оплата)
//    noise   = Бесплатно, рандомный пул пустых минут
//    private = Только по прямой ссылке, никогда в эфире
// B. contentState    : filled | empty
//    filled  = Seed + Manifesto → рендер
//    empty   = Silent cyber-minimalist timer overlay (доказательство владения)
// C. hasSovereignLink: bool
//    true    = Уникальный постоянный URL timenation.tv/moment/YYYY-MM-DD-HHmm
// ─────────────────────────────────────────────────────────────────────────────

export const tvCapsulesTable = pgTable("tv_capsules", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull().unique(),
  citizenId: integer("citizen_id").notNull(),
  seedText: text("seed_text"), // ≤500 chars, nullable for empty capsules
  manifestoText: text("manifesto_text"), // LLM-expanded or raw
  mode: text("mode").notNull().default("a"), // a=AI-Packaging | b=Conscious Citizen
  renderPath: text("render_path").notNull().default("light"), // light | heavy
  broadcastPolicy: text("broadcast_policy").notNull().default("noise"), // echo | noise | private
  contentState: text("content_state").notNull().default("filled"), // filled | empty
  hasSovereignLink: boolean("has_sovereign_link").notNull().default(false),
  sovereignUrl: text("sovereign_url").unique(), // timenation.tv/moment/YYYY-MM-DD-HHmm
  // Shariah / anti-Gharar: theme chosen BEFORE render to make service deterministic.
  // Values: space | cyberpunk | abstract | nature | minimal  (null = not yet chosen)
  visualStyle: text("visual_style"),
  mediaUrl: text("media_url"), // local rendered MP4 path
  // ── Catcast.tv publishing ─────────────────────────────────────────────────
  catcastVideoId: text("catcast_video_id"), // Catcast internal video ID
  catcastUrl: text("catcast_url"), // public Catcast video URL (video_url in meaning_containers)
  // ── Compliance & Moderation ───────────────────────────────────────────────
  isReported: boolean("is_reported").notNull().default(false), // DMCA / takedown flag
  reportStatus: text("report_status").notNull().default("active"), // active | suspended | removed
  reportReason: text("report_reason"), // reason from reporter
  status: text("status").notNull().default("draft"), // draft | pending_render | rendered | scheduled | broadcast
  isRetro: boolean("is_retro").notNull().default(false), // slot_time < NOW
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTvCapsuleSchema = createInsertSchema(tvCapsulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTvCapsule = z.infer<typeof insertTvCapsuleSchema>;
export type TvCapsule = typeof tvCapsulesTable.$inferSelect;
