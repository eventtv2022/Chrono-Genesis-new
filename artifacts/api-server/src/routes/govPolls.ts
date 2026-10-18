import { Router } from "express";
import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  governmentPollsTable,
  governmentPollBallotsTable,
} from "@workspace/db";
import { requireAdultKyc, requireAuth } from "../middleware/auth";
import { citizenMatchesPollRoles } from "../services/governmentPollService";

const router = Router();

router.get("/gov/polls", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const now = new Date();
  const citizen = req.citizen!;
  const polls = await db
    .select()
    .from(governmentPollsTable)
    .where(and(
      eq(governmentPollsTable.status, "active"),
      lte(governmentPollsTable.startsAt, now),
      gt(governmentPollsTable.endsAt, now),
    ))
    .orderBy(governmentPollsTable.startsAt);

  const eligiblePolls = polls.filter((poll) => citizenMatchesPollRoles(citizen, poll.eligibleRoles));
  const result = await Promise.all(eligiblePolls.map(async (poll) => {
    const ballots = await db
      .select({
        voterId: governmentPollBallotsTable.voterId,
        voterName: governmentPollBallotsTable.voterName,
        vote: governmentPollBallotsTable.vote,
      })
      .from(governmentPollBallotsTable)
      .where(eq(governmentPollBallotsTable.pollId, poll.id));
    const mine = ballots.find((ballot) => ballot.voterId === citizen.id);
    return {
      ...poll,
      yesCount: ballots.filter((ballot) => ballot.vote === "yes").length,
      noCount: ballots.filter((ballot) => ballot.vote === "no").length,
      myVote: mine?.vote ?? null,
      ballots: ballots.map(({ voterName, vote }) => ({ voterName, vote })),
    };
  }));
  res.json(result);
});

router.post("/gov/polls/:id/cast", requireAuth, requireAdultKyc, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const vote = req.body?.vote;
  if (!Number.isSafeInteger(id) || id < 1 || (vote !== "yes" && vote !== "no")) {
    res.status(400).json({ error: "Укажите голосование и вариант «За» или «Против»" });
    return;
  }

  const now = new Date();
  const [poll] = await db
    .select()
    .from(governmentPollsTable)
    .where(eq(governmentPollsTable.id, id))
    .limit(1);
  if (!poll || poll.status !== "active" || poll.startsAt > now || poll.endsAt <= now) {
    res.status(404).json({ error: "Голосование сейчас недоступно" });
    return;
  }

  const voter = req.citizen!;
  if (!citizenMatchesPollRoles(voter, poll.eligibleRoles)) {
    res.status(403).json({ error: "Ваша роль не допущена к этому голосованию" });
    return;
  }

  await db
    .insert(governmentPollBallotsTable)
    .values({
      pollId: id,
      voterId: voter.id,
      voterName: voter.name,
      vote,
      votedAt: now,
    })
    .onConflictDoUpdate({
      target: [governmentPollBallotsTable.pollId, governmentPollBallotsTable.voterId],
      set: { vote, votedAt: now },
    });
  res.json({ ok: true });
});

export default router;
