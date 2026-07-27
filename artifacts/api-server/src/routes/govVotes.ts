/**
 * Government voting — блокировка граждан через голосование.
 *
 * Доступ: любой гражданин с govRole != 'citizen' или isAdmin = 1.
 *
 *   GET  /gov/block-votes              — список активных голосований
 *   POST /gov/block-votes/:id/cast     — проголосовать { vote: "yes"|"no" }
 *   GET  /gov/block-votes/:id          — детали одного голосования
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { citizensTable, blockVoteRequestsTable, blockVoteBallotsTable } from "@workspace/db";
import { eq, and, ne, lt } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import { getBot } from "../services/telegramService";

const router = Router();

// ── Middleware: gov member or admin ───────────────────────────────────────────
function requireGovMember(req: Request, res: Response, next: NextFunction): void {
  const c = req.citizen;
  if (!c) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (c.govRole === "citizen" && c.isAdmin !== 1) {
    res.status(403).json({ error: "Доступ только для членов правительства и судей" });
    return;
  }
  next();
}

// ── Auto-finalize expired votes ───────────────────────────────────────────────
async function finalizeExpiredVotes(): Promise<void> {
  try {
    const expired = await db
      .select({ id: blockVoteRequestsTable.id, citizenId: blockVoteRequestsTable.citizenId })
      .from(blockVoteRequestsTable)
      .where(and(
        eq(blockVoteRequestsTable.status, "pending"),
        lt(blockVoteRequestsTable.endsAt, new Date()),
      ));

    for (const req of expired) {
      const ballots = await db
        .select({ vote: blockVoteBallotsTable.vote })
        .from(blockVoteBallotsTable)
        .where(eq(blockVoteBallotsTable.requestId, req.id));

      const yesCount = ballots.filter(b => b.vote === "yes").length;
      const noCount  = ballots.filter(b => b.vote === "no").length;
      const approved = yesCount > noCount && yesCount > 0;

      await db
        .update(blockVoteRequestsTable)
        .set({ status: approved ? "approved" : "rejected" })
        .where(eq(blockVoteRequestsTable.id, req.id));

      if (approved) {
        await db
          .update(citizensTable)
          .set({ status: "banned" })
          .where(eq(citizensTable.id, req.citizenId));
        logger.info({ requestId: req.id, citizenId: req.citizenId }, "Block vote approved — citizen banned");
      } else {
        logger.info({ requestId: req.id, citizenId: req.citizenId, yesCount, noCount }, "Block vote rejected");
      }

      // Notify all who voted
      await notifyVoteResult(req.id, approved, yesCount, noCount);
    }
  } catch (err) {
    logger.error({ err }, "finalizeExpiredVotes error");
  }
}

async function notifyVoteResult(requestId: number, approved: boolean, yes: number, no: number) {
  const bot = getBot();
  if (!bot) return;
  const [req] = await db
    .select({ citizenName: blockVoteRequestsTable.citizenName, reason: blockVoteRequestsTable.reason })
    .from(blockVoteRequestsTable)
    .where(eq(blockVoteRequestsTable.id, requestId));
  if (!req) return;

  const emoji = approved ? "⛔" : "✅";
  const verdict = approved ? "БЛОКИРОВКА ОДОБРЕНА" : "Блокировка отклонена";
  const msg =
    `${emoji} *Голосование завершено*\n\n` +
    `*Гражданин:* ${req.citizenName}\n` +
    `*Причина:* ${req.reason}\n\n` +
    `*Итог:* ${verdict}\n` +
    `✅ За: ${yes} | ❌ Против: ${no}`;

  // Find all who voted on this request
  const ballots = await db
    .select({ voterId: blockVoteBallotsTable.voterId })
    .from(blockVoteBallotsTable)
    .where(eq(blockVoteBallotsTable.requestId, requestId));

  for (const ballot of ballots) {
    const [voter] = await db
      .select({ telegramId: citizensTable.telegramId })
      .from(citizensTable)
      .where(eq(citizensTable.id, ballot.voterId));
    if (voter?.telegramId) {
      bot.telegram.sendMessage(voter.telegramId, msg, { parse_mode: "Markdown" }).catch(() => {});
    }
  }
}

// ── GET /gov/block-votes ──────────────────────────────────────────────────────
router.get("/gov/block-votes", requireAuth, requireGovMember, async (req, res): Promise<void> => {
  await finalizeExpiredVotes();

  const votes = await db
    .select()
    .from(blockVoteRequestsTable)
    .orderBy(blockVoteRequestsTable.createdAt);

  // Attach ballot counts + current user's vote
  const withCounts = await Promise.all(votes.map(async (v) => {
    const ballots = await db
      .select({ vote: blockVoteBallotsTable.vote, voterId: blockVoteBallotsTable.voterId, voterName: blockVoteBallotsTable.voterName })
      .from(blockVoteBallotsTable)
      .where(eq(blockVoteBallotsTable.requestId, v.id));

    const myBallot = ballots.find(b => b.voterId === req.citizen!.id);
    return {
      ...v,
      yesCount:  ballots.filter(b => b.vote === "yes").length,
      noCount:   ballots.filter(b => b.vote === "no").length,
      myVote:    myBallot?.vote ?? null,
      ballots:   ballots.map(b => ({ voterName: b.voterName, vote: b.vote })),
    };
  }));

  res.json(withCounts);
});

// ── POST /gov/block-votes/:id/cast ────────────────────────────────────────────
router.post("/gov/block-votes/:id/cast", requireAuth, requireGovMember, async (req, res): Promise<void> => {
  await finalizeExpiredVotes();

  const requestId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(requestId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { vote } = req.body as { vote?: string };
  if (vote !== "yes" && vote !== "no") {
    res.status(400).json({ error: "vote must be 'yes' or 'no'" });
    return;
  }

  const [voteReq] = await db
    .select()
    .from(blockVoteRequestsTable)
    .where(eq(blockVoteRequestsTable.id, requestId))
    .limit(1);

  if (!voteReq) { res.status(404).json({ error: "Голосование не найдено" }); return; }
  if (voteReq.status !== "pending") {
    res.status(400).json({ error: "Голосование уже завершено" });
    return;
  }
  if (new Date() > voteReq.endsAt) {
    await finalizeExpiredVotes();
    res.status(400).json({ error: "Срок голосования истёк" });
    return;
  }

  const voter = req.citizen!;

  // Upsert ballot
  const existing = await db
    .select({ id: blockVoteBallotsTable.id })
    .from(blockVoteBallotsTable)
    .where(and(
      eq(blockVoteBallotsTable.requestId, requestId),
      eq(blockVoteBallotsTable.voterId, voter.id),
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update existing vote
    await db
      .update(blockVoteBallotsTable)
      .set({ vote, votedAt: new Date() })
      .where(and(
        eq(blockVoteBallotsTable.requestId, requestId),
        eq(blockVoteBallotsTable.voterId, voter.id),
      ));
  } else {
    await db.insert(blockVoteBallotsTable).values({
      requestId,
      voterId:   voter.id,
      voterName: voter.name ?? "—",
      vote,
      votedAt:   new Date(),
    });
  }

  logger.info({ requestId, voterId: voter.id, vote }, "Block vote cast");
  res.json({ ok: true });
});

export default router;
