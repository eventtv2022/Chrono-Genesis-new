import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { citizensTable, socialAlarmsTable, socialAlarmTargetsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { broadcastToAll, broadcastToCitizens } from "../services/socialAlarmWs";

const router: IRouter = Router();

// ── GET /api/citizens/social-alarm-subscribers ─────────────────────────────
// Returns all citizens who have consent enabled (for target picker UI)
router.get("/citizens/social-alarm-subscribers", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: citizensTable.id, name: citizensTable.name, rank: citizensTable.rank })
      .from(citizensTable)
      .where(eq(citizensTable.socialAlarmConsent, 1));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "social-alarm-subscribers error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── PATCH /api/citizens/:id/social-alarm-consent ───────────────────────────
const consentSchema = z.object({ consent: z.boolean() });

router.patch("/citizens/:id/social-alarm-consent", async (req: Request, res: Response) => {
  const citizenId = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(citizenId)) { res.status(400).json({ error: "invalid_id" }); return; }

  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_body" }); return; }

  try {
    await db
      .update(citizensTable)
      .set({ socialAlarmConsent: parsed.data.consent ? 1 : 0 })
      .where(eq(citizensTable.id, citizenId));
    res.json({ ok: true, consent: parsed.data.consent });
  } catch (err) {
    req.log.error({ err }, "social-alarm-consent update error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/system/trigger-alarm ─────────────────────────────────────────
const triggerSchema = z.object({
  initiatedBy: z.number().int().positive(),
  targetCitizenIds: z.array(z.number().int().positive()).optional(), // empty/missing = admin global
});

router.post("/system/trigger-alarm", async (req: Request, res: Response) => {
  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_body" }); return; }

  const { initiatedBy, targetCitizenIds } = parsed.data;

  try {
    // Fetch initiator
    const [initiator] = await db
      .select({ id: citizensTable.id, name: citizensTable.name, govRole: citizensTable.govRole })
      .from(citizensTable)
      .where(eq(citizensTable.id, initiatedBy));

    if (!initiator) { res.status(404).json({ error: "initiator_not_found" }); return; }

    const isAdmin = initiator.govRole === "admin";
    const isGlobal = isAdmin && (!targetCitizenIds || targetCitizenIds.length === 0);

    // Log the alarm
    const [alarm] = await db.insert(socialAlarmsTable).values({
      initiatedBy,
      targetType: isGlobal ? "all" : "direct",
    }).returning();

    if (!alarm) throw new Error("alarm insert returned no row");

    if (isGlobal) {
      // Admin global broadcast
      broadcastToAll({
        type: "PLAY_ANTHEM",
        triggeredBy: "TimeNation Government",
        targetType: "all",
      });
      res.json({ ok: true, targetType: "all" });
      logger.info({ initiatedBy }, "Social Alarm: global broadcast by admin");
    } else {
      // Direct broadcast — only to citizens with consent
      const ids = targetCitizenIds ?? [];
      let eligibleIds = ids;

      if (ids.length > 0) {
        const consenting = await db
          .select({ id: citizensTable.id })
          .from(citizensTable)
          .where(inArray(citizensTable.id, ids));
        // Filter to those who have consent (this is enforced by UI, but double-check server-side)
        eligibleIds = consenting.map(c => c.id);

        // Insert targets
        if (eligibleIds.length > 0) {
          await db.insert(socialAlarmTargetsTable).values(
            eligibleIds.map(id => ({ alarmId: alarm.id, targetCitizenId: id }))
          );
        }
      }

      broadcastToCitizens(eligibleIds, {
        type: "PLAY_ANTHEM",
        triggeredBy: initiator.name,
        targetType: "direct",
      });

      res.json({ ok: true, targetType: "direct", reached: eligibleIds.length });
      logger.info({ initiatedBy, eligibleIds }, "Social Alarm: direct broadcast");
    }
  } catch (err) {
    req.log.error({ err }, "trigger-alarm error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
