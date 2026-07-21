import { Router, type IRouter } from "express";
import { eq, and, or, desc, lt, sql, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { citizensTable, dmMessagesTable } from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { pushToCitizen } from "../services/socialAlarmWs";

const router: IRouter = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthCitizen(authHeader: string | undefined) {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const [citizen] = await db
    .select()
    .from(citizensTable)
    .where(eq(citizensTable.authToken, token))
    .limit(1);
  return citizen ?? null;
}

// ── POST /chat/key — upload NaCl public key ────────────────────────────────

router.post("/chat/key", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = z.object({ publicKey: z.string().min(40).max(64) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "publicKey обязателен (base64 32 байта)" }); return; }

  await db
    .update(citizensTable)
    .set({ chatPublicKey: parsed.data.publicKey })
    .where(eq(citizensTable.id, me.id));

  logger.info({ citizenId: me.id }, "Chat public key updated");
  res.json({ ok: true });
});

// ── GET /chat/key/:citizenId — get citizen's public key ───────────────────

router.get("/chat/key/:citizenId", async (req, res): Promise<void> => {
  const id = parseInt(req.params["citizenId"]!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный citizenId" }); return; }

  const [citizen] = await db
    .select({ id: citizensTable.id, chatPublicKey: citizensTable.chatPublicKey, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }
  if (!citizen.chatPublicKey) { res.status(404).json({ error: "Публичный ключ не зарегистрирован" }); return; }

  res.json({ citizenId: citizen.id, name: citizen.name, publicKey: citizen.chatPublicKey });
});

// ── GET /chat/conversations — list all DM threads ─────────────────────────

router.get("/chat/conversations", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  // Latest message per peer + unread count
  const rows = await db.execute(sql`
    SELECT
      sub.peer_id,
      sub.id,
      sub.from_citizen_id,
      sub.to_citizen_id,
      sub.ciphertext,
      sub.nonce,
      sub.msg_type,
      sub.darmin_amount,
      sub.created_at,
      sub.read_at,
      c.name           AS peer_name,
      c.rank           AS peer_rank,
      c.merit_score    AS peer_merit_score,
      c.chat_public_key AS peer_chat_public_key,
      (
        SELECT COUNT(*)
        FROM dm_messages u
        WHERE u.to_citizen_id = ${me.id}
          AND u.from_citizen_id = sub.peer_id
          AND u.read_at IS NULL
      ) AS unread_count
    FROM (
      SELECT DISTINCT ON (
        CASE WHEN from_citizen_id = ${me.id} THEN to_citizen_id ELSE from_citizen_id END
      )
        CASE WHEN from_citizen_id = ${me.id} THEN to_citizen_id ELSE from_citizen_id END AS peer_id,
        id, from_citizen_id, to_citizen_id, ciphertext, nonce, msg_type, darmin_amount, created_at, read_at
      FROM dm_messages
      WHERE from_citizen_id = ${me.id} OR to_citizen_id = ${me.id}
      ORDER BY
        CASE WHEN from_citizen_id = ${me.id} THEN to_citizen_id ELSE from_citizen_id END,
        created_at DESC
    ) sub
    JOIN citizens c ON c.id = sub.peer_id
    ORDER BY sub.created_at DESC
  `);

  res.json({ conversations: rows.rows });
});

// ── GET /chat/messages/:withCitizenId — get thread messages ───────────────

router.get("/chat/messages/:withCitizenId", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const peerId = parseInt(req.params["withCitizenId"]!, 10);
  if (isNaN(peerId)) { res.status(400).json({ error: "Некорректный withCitizenId" }); return; }

  const limitParsed = z.coerce.number().int().min(1).max(100).default(50).safeParse(req.query["limit"]);
  const limit = limitParsed.success ? limitParsed.data : 50;

  const beforeParsed = z.coerce.number().int().positive().optional().safeParse(req.query["before"]);
  const beforeId = beforeParsed.success ? beforeParsed.data : undefined;

  const conditions = [
    or(
      and(eq(dmMessagesTable.fromCitizenId, me.id), eq(dmMessagesTable.toCitizenId, peerId)),
      and(eq(dmMessagesTable.fromCitizenId, peerId), eq(dmMessagesTable.toCitizenId, me.id)),
    )!,
  ];
  if (beforeId) conditions.push(lt(dmMessagesTable.id, beforeId));

  const messages = await db
    .select()
    .from(dmMessagesTable)
    .where(and(...conditions))
    .orderBy(desc(dmMessagesTable.createdAt))
    .limit(limit);

  res.json({ messages: messages.reverse() });
});

// ── POST /chat/messages — send encrypted message ──────────────────────────

const sendMsgSchema = z.object({
  toCitizenId: z.number().int().positive(),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  msgType: z.enum(["text", "darmin_transfer"]).default("text"),
  darminAmount: z.number().positive().optional(),
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = sendMsgSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { toCitizenId, ciphertext, nonce, msgType, darminAmount } = parsed.data;

  if (toCitizenId === me.id) { res.status(400).json({ error: "Нельзя отправить сообщение самому себе" }); return; }

  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, toCitizenId))
    .limit(1);

  if (!recipient) { res.status(404).json({ error: "Получатель не найден" }); return; }

  const [inserted] = await db
    .insert(dmMessagesTable)
    .values({
      fromCitizenId: me.id,
      toCitizenId,
      ciphertext,
      nonce,
      msgType,
      darminAmount: darminAmount ?? null,
    })
    .returning();

  if (!inserted) { res.status(500).json({ error: "Ошибка сохранения" }); return; }

  // Real-time push to recipient
  pushToCitizen(toCitizenId, {
    type: "chat_message",
    message: {
      id: inserted.id,
      fromCitizenId: me.id,
      toCitizenId,
      ciphertext,
      nonce,
      msgType,
      darminAmount: darminAmount ?? null,
      createdAt: inserted.createdAt,
      readAt: null,
      senderName: me.name,
    },
  });

  logger.info({ from: me.id, to: toCitizenId, msgType }, "DM sent");
  res.status(201).json({ message: inserted });
});

// ── PATCH /chat/messages/read/:withCitizenId — mark as read ──────────────

router.patch("/chat/messages/read/:withCitizenId", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const peerId = parseInt(req.params["withCitizenId"]!, 10);
  if (isNaN(peerId)) { res.status(400).json({ error: "Некорректный withCitizenId" }); return; }

  await db
    .update(dmMessagesTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(dmMessagesTable.fromCitizenId, peerId),
        eq(dmMessagesTable.toCitizenId, me.id),
        isNull(dmMessagesTable.readAt),
      ),
    );

  res.json({ ok: true });
});

export default router;
