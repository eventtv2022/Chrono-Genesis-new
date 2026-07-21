import { Router, type IRouter } from "express";
import { eq, and, or, desc, lt, inArray, ilike, sql, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  citizensTable,
  dmMessagesTable,
  dmReactionsTable,
  groupChatsTable,
  groupMembersTable,
  groupMessagesTable,
  groupMessageReadsTable,
} from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { pushToCitizen, getOnlineCitizenIds, isCitizenOnline } from "../services/socialAlarmWs";
import { getBot } from "../services/telegramService";

const router: IRouter = Router();

// ── Auth helper ────────────────────────────────────────────────────────────

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
  if (!parsed.success) { res.status(400).json({ error: "publicKey обязателен" }); return; }

  await db.update(citizensTable).set({ chatPublicKey: parsed.data.publicKey }).where(eq(citizensTable.id, me.id));
  logger.info({ citizenId: me.id }, "Chat public key updated");
  res.json({ ok: true });
});

// ── GET /chat/key/:citizenId ───────────────────────────────────────────────

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

// ── GET /chat/online — online citizen IDs ─────────────────────────────────

router.get("/chat/online", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  res.json({ online: getOnlineCitizenIds() });
});

// ── GET /chat/conversations ────────────────────────────────────────────────

router.get("/chat/conversations", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

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
      sub.delivered_at,
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
        id, from_citizen_id, to_citizen_id, ciphertext, nonce, msg_type, darmin_amount,
        created_at, read_at, delivered_at
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

// ── GET /chat/messages/:withCitizenId — with reactions ────────────────────

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

  const reversed = messages.reverse();

  // Attach reactions
  const msgIds = reversed.map((m) => m.id);
  let reactionMap: Record<number, { citizenId: number; emoji: string }[]> = {};
  if (msgIds.length > 0) {
    const reactions = await db
      .select({ messageId: dmReactionsTable.messageId, citizenId: dmReactionsTable.citizenId, emoji: dmReactionsTable.emoji })
      .from(dmReactionsTable)
      .where(inArray(dmReactionsTable.messageId, msgIds));
    for (const r of reactions) {
      if (!reactionMap[r.messageId]) reactionMap[r.messageId] = [];
      reactionMap[r.messageId].push({ citizenId: r.citizenId, emoji: r.emoji });
    }
  }

  res.json({ messages: reversed.map((m) => ({ ...m, reactions: reactionMap[m.id] ?? [] })) });
});

// ── POST /chat/messages — send encrypted message ──────────────────────────

const sendMsgSchema = z.object({
  toCitizenId: z.number().int().positive(),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  msgType: z.enum(["text", "darmin_transfer", "voice"]).default("text"),
  darminAmount: z.number().positive().optional(),
  forwardedFromId: z.number().int().positive().optional(),
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = sendMsgSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { toCitizenId, ciphertext, nonce, msgType, darminAmount, forwardedFromId } = parsed.data;

  if (toCitizenId === me.id) { res.status(400).json({ error: "Нельзя отправить сообщение самому себе" }); return; }

  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, telegramId: citizensTable.telegramId })
    .from(citizensTable)
    .where(eq(citizensTable.id, toCitizenId))
    .limit(1);

  if (!recipient) { res.status(404).json({ error: "Получатель не найден" }); return; }

  const [inserted] = await db
    .insert(dmMessagesTable)
    .values({ fromCitizenId: me.id, toCitizenId, ciphertext, nonce, msgType, darminAmount: darminAmount ?? null, forwardedFromId: forwardedFromId ?? null })
    .returning();

  if (!inserted) { res.status(500).json({ error: "Ошибка сохранения" }); return; }

  // Push via WS — returns true if delivered in real-time
  const wsDelivered = pushToCitizen(toCitizenId, {
    type: "chat_message",
    message: {
      id: inserted.id,
      from_citizen_id: me.id,
      to_citizen_id: toCitizenId,
      ciphertext,
      nonce,
      msg_type: msgType,
      darmin_amount: darminAmount ?? null,
      forwarded_from_id: forwardedFromId ?? null,
      created_at: inserted.createdAt,
      delivered_at: null,
      read_at: null,
      reactions: [],
      sender_name: me.name,
    },
  });

  if (wsDelivered) {
    // Mark as delivered immediately
    await db.update(dmMessagesTable).set({ deliveredAt: new Date() }).where(eq(dmMessagesTable.id, inserted.id));
    // Notify sender
    pushToCitizen(me.id, { type: "message_delivered", messageId: inserted.id });
  } else {
    // Recipient offline — send Telegram notification if linked
    if (recipient.telegramId) {
      const tgBot = getBot();
      if (tgBot) {
        const senderName = me.name ?? `ID ${me.id}`;
        const preview =
          msgType === "darmin_transfer" ? `💸 Перевод ${darminAmount ?? "?"} Д` :
          msgType === "voice" ? "🎤 Голосовое сообщение" :
          "🔒 Зашифрованное сообщение";
        tgBot.telegram
          .sendMessage(
            recipient.telegramId,
            `💬 *Новое сообщение*\nОт: ${senderName}\n${preview}\n\n_Откройте TimeNation для ответа_`,
            { parse_mode: "Markdown" }
          )
          .catch(() => { /* silent */ });
      }
    }
  }

  logger.info({ from: me.id, to: toCitizenId, msgType, wsDelivered }, "DM sent");
  res.status(201).json({ message: { ...inserted, reactions: [] } });
});

// ── PATCH /chat/messages/read/:withCitizenId ──────────────────────────────

router.patch("/chat/messages/read/:withCitizenId", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const peerId = parseInt(req.params["withCitizenId"]!, 10);
  if (isNaN(peerId)) { res.status(400).json({ error: "Некорректный withCitizenId" }); return; }

  await db
    .update(dmMessagesTable)
    .set({ readAt: new Date() })
    .where(and(eq(dmMessagesTable.fromCitizenId, peerId), eq(dmMessagesTable.toCitizenId, me.id), isNull(dmMessagesTable.readAt)));

  // Notify sender their messages were read
  pushToCitizen(peerId, { type: "messages_read", byId: me.id });

  res.json({ ok: true });
});

// ── POST /chat/reactions — add reaction ───────────────────────────────────

const reactionSchema = z.object({ messageId: z.number().int().positive(), emoji: z.string().min(1).max(8) });

router.post("/chat/reactions", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = reactionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "messageId и emoji обязательны" }); return; }

  const { messageId, emoji } = parsed.data;

  // Verify access to this message
  const [msg] = await db.select().from(dmMessagesTable).where(eq(dmMessagesTable.id, messageId)).limit(1);
  if (!msg || (msg.fromCitizenId !== me.id && msg.toCitizenId !== me.id)) {
    res.status(403).json({ error: "Нет доступа" }); return;
  }

  await db.insert(dmReactionsTable).values({ messageId, citizenId: me.id, emoji }).onConflictDoNothing();

  const otherId = msg.fromCitizenId === me.id ? msg.toCitizenId : msg.fromCitizenId;
  const event = { type: "reaction_added", messageId, citizenId: me.id, emoji };
  pushToCitizen(otherId, event);
  pushToCitizen(me.id, event);

  res.json({ ok: true });
});

// ── DELETE /chat/reactions/:messageId/:emoji — remove reaction ────────────

router.delete("/chat/reactions/:messageId/:emoji", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const messageId = parseInt(req.params["messageId"]!, 10);
  const emoji = decodeURIComponent(req.params["emoji"]!);
  if (isNaN(messageId)) { res.status(400).json({ error: "Некорректный messageId" }); return; }

  await db.delete(dmReactionsTable).where(
    and(eq(dmReactionsTable.messageId, messageId), eq(dmReactionsTable.citizenId, me.id), eq(dmReactionsTable.emoji, emoji))
  );

  const [msg] = await db.select({ fromCitizenId: dmMessagesTable.fromCitizenId, toCitizenId: dmMessagesTable.toCitizenId })
    .from(dmMessagesTable).where(eq(dmMessagesTable.id, messageId)).limit(1);
  if (msg) {
    const otherId = msg.fromCitizenId === me.id ? msg.toCitizenId : msg.fromCitizenId;
    const event = { type: "reaction_removed", messageId, citizenId: me.id, emoji };
    pushToCitizen(otherId, event);
    pushToCitizen(me.id, event);
  }

  res.json({ ok: true });
});

// ── GET /chat/groups — list my groups ─────────────────────────────────────

router.get("/chat/groups", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groups = await db.execute(sql`
    SELECT
      gc.id,
      gc.name,
      gc.description,
      gc.created_by,
      gc.created_at,
      (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = gc.id) AS member_count,
      (
        SELECT COUNT(*) FROM group_messages gms
        WHERE gms.group_id = gc.id
          AND gms.created_at > COALESCE(
            (SELECT gmr.last_read_at FROM group_message_reads gmr WHERE gmr.group_id = gc.id AND gmr.citizen_id = ${me.id}),
            '1970-01-01'::timestamptz
          )
          AND gms.from_citizen_id != ${me.id}
      ) AS unread_count,
      (
        SELECT row_to_json(last_msg) FROM (
          SELECT id, from_citizen_id, content, msg_type, created_at
          FROM group_messages
          WHERE group_id = gc.id
          ORDER BY created_at DESC
          LIMIT 1
        ) last_msg
      ) AS last_message,
      gm.is_admin
    FROM group_chats gc
    JOIN group_members gm ON gm.group_id = gc.id AND gm.citizen_id = ${me.id}
    ORDER BY gc.created_at DESC
  `);

  res.json({ groups: groups.rows });
});

// ── POST /chat/groups — create group ──────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.number().int().positive()).min(1).max(50),
});

router.post("/chat/groups", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { name, description, memberIds } = parsed.data;

  const [group] = await db.insert(groupChatsTable).values({ name, description, createdBy: me.id }).returning();
  if (!group) { res.status(500).json({ error: "Ошибка создания группы" }); return; }

  // Add creator as admin + all members
  const allMemberIds = [...new Set([me.id, ...memberIds])];
  await db.insert(groupMembersTable).values(
    allMemberIds.map((cid) => ({ groupId: group.id, citizenId: cid, isAdmin: cid === me.id }))
  ).onConflictDoNothing();

  // Notify all members
  for (const cid of allMemberIds) {
    if (cid !== me.id) {
      pushToCitizen(cid, { type: "group_created", group: { id: group.id, name, createdBy: me.id, creatorName: me.name } });
    }
  }

  logger.info({ groupId: group.id, createdBy: me.id, members: allMemberIds.length }, "Group created");
  res.status(201).json({ group });
});

// ── GET /chat/groups/:groupId — group info + members ─────────────────────

router.get("/chat/groups/:groupId", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
  if (!membership) { res.status(403).json({ error: "Нет доступа" }); return; }

  const [group] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, groupId)).limit(1);
  if (!group) { res.status(404).json({ error: "Группа не найдена" }); return; }

  const members = await db.execute(sql`
    SELECT gm.citizen_id, gm.is_admin, gm.joined_at, c.name, c.rank
    FROM group_members gm
    JOIN citizens c ON c.id = gm.citizen_id
    WHERE gm.group_id = ${groupId}
    ORDER BY gm.joined_at
  `);

  res.json({ group, members: members.rows });
});

// ── POST /chat/groups/:groupId/members — add member ──────────────────────

router.post("/chat/groups/:groupId/members", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
  if (!membership?.isAdmin) { res.status(403).json({ error: "Только администратор может добавлять участников" }); return; }

  const parsed = z.object({ citizenId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "citizenId обязателен" }); return; }

  await db.insert(groupMembersTable).values({ groupId, citizenId: parsed.data.citizenId, isAdmin: false }).onConflictDoNothing();

  const [group] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, groupId)).limit(1);
  pushToCitizen(parsed.data.citizenId, { type: "group_added", group: { id: groupId, name: group?.name ?? "" } });

  res.json({ ok: true });
});

// ── DELETE /chat/groups/:groupId/members/:citizenId — remove/leave ────────

router.delete("/chat/groups/:groupId/members/:citizenId", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  const targetId = parseInt(req.params["citizenId"]!, 10);
  if (isNaN(groupId) || isNaN(targetId)) { res.status(400).json({ error: "Некорректный ID" }); return; }

  // Can leave self, or admin can remove others
  if (targetId !== me.id) {
    const [membership] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
    if (!membership?.isAdmin) { res.status(403).json({ error: "Недостаточно прав" }); return; }
  }

  await db.delete(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, targetId))
  );

  res.json({ ok: true });
});

// ── GET /chat/groups/:groupId/messages ────────────────────────────────────

router.get("/chat/groups/:groupId/messages", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
  if (!membership) { res.status(403).json({ error: "Нет доступа" }); return; }

  const limitParsed = z.coerce.number().int().min(1).max(100).default(50).safeParse(req.query["limit"]);
  const limit = limitParsed.success ? limitParsed.data : 50;

  const messages = await db.execute(sql`
    SELECT gm.*, c.name AS sender_name, c.rank AS sender_rank
    FROM group_messages gm
    JOIN citizens c ON c.id = gm.from_citizen_id
    WHERE gm.group_id = ${groupId}
    ORDER BY gm.created_at DESC
    LIMIT ${limit}
  `);

  res.json({ messages: messages.rows.reverse() });
});

// ── POST /chat/groups/:groupId/messages — send group message ──────────────

const groupMsgSchema = z.object({
  content: z.string().min(1).max(4000),
  msgType: z.enum(["text", "darmin_transfer", "voice"]).default("text"),
  darminAmount: z.number().positive().optional(),
  forwardedFromDmId: z.number().int().positive().optional(),
});

router.post("/chat/groups/:groupId/messages", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
  if (!membership) { res.status(403).json({ error: "Нет доступа" }); return; }

  const parsed = groupMsgSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { content, msgType, darminAmount, forwardedFromDmId } = parsed.data;

  const [inserted] = await db.insert(groupMessagesTable)
    .values({ groupId, fromCitizenId: me.id, content, msgType, darminAmount: darminAmount ?? null, forwardedFromDmId: forwardedFromDmId ?? null })
    .returning();

  if (!inserted) { res.status(500).json({ error: "Ошибка сохранения" }); return; }

  // Push to all other members
  const members = await db.select({ citizenId: groupMembersTable.citizenId }).from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));

  const payload = {
    type: "group_message",
    message: {
      ...inserted,
      sender_name: me.name,
      sender_rank: me.rank,
    },
  };

  for (const { citizenId } of members) {
    if (citizenId !== me.id) pushToCitizen(citizenId, payload);
  }

  res.status(201).json({ message: { ...inserted, sender_name: me.name, sender_rank: me.rank } });
});

// ── PATCH /chat/groups/:groupId/read ─────────────────────────────────────

router.patch("/chat/groups/:groupId/read", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  await db.insert(groupMessageReadsTable)
    .values({ groupId, citizenId: me.id, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [groupMessageReadsTable.groupId, groupMessageReadsTable.citizenId],
      set: { lastReadAt: new Date() },
    });

  res.json({ ok: true });
});

export default router;
