/**
 * Moderation routes — required for App Store / Google Play UGC compliance.
 *
 * POST /api/moderation/report   — report content by coord
 * POST /api/moderation/block    — block the owner of a coord
 * DELETE /api/moderation/account — hard-delete the authenticated citizen's account
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { sendDirectMessage } from "../services/telegramService";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

// ── Persistent storage (lightweight JSON file) ────────────────────────────────
// Stores reports and blocks without requiring a DB migration.
const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const REPORTS_FILE = path.join(DATA_DIR, "moderation_reports.json");
const BLOCKS_FILE = path.join(DATA_DIR, "moderation_blocks.json");

function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

interface ContentReport {
  id: number;
  reporterCitizenId: number;
  targetCoord: string;
  reason: string;
  createdAt: string;
}

interface BlockEntry {
  blockerCitizenId: number;
  targetCoord: string;
  createdAt: string;
}

// ── POST /api/moderation/report ───────────────────────────────────────────────

const ReportBody = z.object({
  coord: z.string().min(1).max(30),
  reason: z.enum(["spam", "abuse", "inappropriate"]),
});

router.post("/api/moderation/report", requireAuth, async (req, res) => {
  const citizen = (req as unknown as { citizen: { id: number; name: string } }).citizen;

  const parsed = ReportBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { coord, reason } = parsed.data;

  const reports = readJSON<ContentReport[]>(REPORTS_FILE, []);
  const newReport: ContentReport = {
    id: Date.now(),
    reporterCitizenId: citizen.id,
    targetCoord: coord,
    reason,
    createdAt: new Date().toISOString(),
  };
  reports.push(newReport);
  writeJSON(REPORTS_FILE, reports);

  // Notify admin via Telegram (best-effort)
  try {
    const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
    if (adminId) {
      await sendDirectMessage(
        adminId,
        `🚩 *Content Report*\nFrom: ${citizen.name} (#${citizen.id})\nCoord: \`${coord}\`\nReason: ${reason}`
      );
    }
  } catch {
    // Non-fatal — report is already stored
  }

  return res.json({ ok: true });
});

// ── POST /api/moderation/block ────────────────────────────────────────────────

const BlockBody = z.object({
  coord: z.string().min(1).max(30),
});

router.post("/api/moderation/block", requireAuth, async (req, res) => {
  const citizen = (req as unknown as { citizen: { id: number } }).citizen;

  const parsed = BlockBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { coord } = parsed.data;

  // Find the owner of this coord
  const { timelineAnchorsTable } = await import("@workspace/db");
  const anchor = await db
    .select({ citizenId: timelineAnchorsTable.citizenId })
    .from(timelineAnchorsTable)
    .where(eq(timelineAnchorsTable.timelineCoord, coord))
    .limit(1);

  const targetCitizenId = anchor[0]?.citizenId ?? null;

  // Self-block guard
  if (targetCitizenId === citizen.id) {
    return res.status(400).json({ error: "Cannot block yourself" });
  }

  const blocks = readJSON<BlockEntry[]>(BLOCKS_FILE, []);

  // De-duplicate: one block entry per (blocker, coord) pair
  const alreadyBlocked = blocks.some(
    (b) => b.blockerCitizenId === citizen.id && b.targetCoord === coord
  );

  if (!alreadyBlocked) {
    blocks.push({
      blockerCitizenId: citizen.id,
      targetCoord: coord,
      createdAt: new Date().toISOString(),
    });
    writeJSON(BLOCKS_FILE, blocks);
  }

  return res.json({ ok: true, targetCitizenId });
});

// ── GET /api/moderation/blocked-coords — return list of coords blocked by me ──

router.get("/api/moderation/blocked-coords", requireAuth, (req, res) => {
  const citizen = (req as unknown as { citizen: { id: number } }).citizen;
  const blocks = readJSON<BlockEntry[]>(BLOCKS_FILE, []);
  const myBlocked = blocks
    .filter((b) => b.blockerCitizenId === citizen.id)
    .map((b) => b.targetCoord);
  return res.json({ blockedCoords: myBlocked });
});

// ── DELETE /api/moderation/account ───────────────────────────────────────────

router.delete("/api/moderation/account", requireAuth, async (req, res) => {
  const citizen = (req as unknown as { citizen: { id: number; name: string } }).citizen;

  try {
    // Hard-delete the citizen row. FK cascades (if configured) handle related rows.
    // For tables without cascades, delete in dependency order below.
    const { timelineAnchorsTable, timelineCapsulesTable } = await import("@workspace/db");

    // Capsules → Anchors → Citizen
    await db
      .delete(timelineCapsulesTable)
      .where(eq(timelineCapsulesTable.citizenId, citizen.id));
    await db
      .delete(timelineAnchorsTable)
      .where(eq(timelineAnchorsTable.citizenId, citizen.id));
    await db
      .delete(citizensTable)
      .where(eq(citizensTable.id, citizen.id));

    // Notify admin
    try {
      const adminId = process.env.ADMIN_TELEGRAM_ID ?? "";
      if (adminId) {
        await sendDirectMessage(
          adminId,
          `🗑 *Account Deleted*\nCitizen: ${citizen.name} (#${citizen.id})`
        );
      }
    } catch {
      // Non-fatal
    }

    return res.json({ ok: true, deleted: citizen.id });
  } catch (err) {
    console.error("[moderation] account delete error:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
