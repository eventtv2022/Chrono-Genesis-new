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
  groupKeysTable,
  transactionsTable,
} from "@workspace/db";
import { z } from "zod";
import { logger } from "../lib/logger";
import { pushToCitizen, getOnlineCitizenIds, isCitizenOnline } from "../services/socialAlarmWs";
import { getBot } from "../services/telegramService";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

// ── Chat attachment vault ──────────────────────────────────────────────────
const CHAT_VAULT = path.resolve(process.cwd(), "secure_vault", "chat");
if (!fs.existsSync(CHAT_VAULT)) fs.mkdirSync(CHAT_VAULT, { recursive: true });

const chatUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_VAULT),
  filename: (_req, _file, cb) => {
    const ext = path.extname(_file.originalname).toLowerCase() || ".bin";
    cb(null, `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const chatUpload = multer({
  storage: chatUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export type AttachmentMeta = { url: string; type: "image" | "video" | "audio" | "document"; name: string; size: number };

function mimeToAttachmentType(mime: string): AttachmentMeta["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

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

// ── POST /chat/upload — upload chat attachment (max 10 MB) ────────────────
router.post("/chat/upload", chatUpload.single("file"), async (req, res): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : null;
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;
  if (!rawToken) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const [me] = await db.select({ id: citizensTable.id }).from(citizensTable)
    .where(eq(citizensTable.authToken, rawToken)).limit(1);
  if (!me) { res.status(401).json({ error: "Неверный токен" }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: "Файл не приложен" }); return; }

  const meta: AttachmentMeta = {
    url: `/api/chat/attachment/${file.filename}`,
    type: mimeToAttachmentType(file.mimetype),
    name: file.originalname,
    size: file.size,
  };
  logger.info({ citizenId: me.id, filename: file.filename, size: file.size }, "Chat attachment uploaded");
  res.json(meta);
});

// ── GET /chat/attachment/:filename — serve attachment (auth via header or ?token) ──
router.get("/chat/attachment/:filename", async (req, res): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : null;
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;
  if (!rawToken) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const [me] = await db.select({ id: citizensTable.id }).from(citizensTable)
    .where(eq(citizensTable.authToken, rawToken)).limit(1);
  if (!me) { res.status(401).json({ error: "Неверный токен" }); return; }

  const filename = req.params["filename"] ?? "";
  if (!filename || filename.includes("..") || filename.includes("/")) {
    res.status(400).json({ error: "Некорректное имя файла" }); return;
  }

  const absPath = path.resolve(CHAT_VAULT, filename);
  if (!fs.existsSync(absPath)) { res.status(404).json({ error: "Файл не найден" }); return; }

  const ext = path.extname(absPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".ogg": "audio/ogg", ".pdf": "application/pdf",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(absPath);
});

// ── POST /chat/key — upload NaCl public key ────────────────────────────────

router.post("/chat/key", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = z.object({ publicKey: z.string().min(40).max(64) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "publicKey обязателен" }); return; }

  // Register client key and clear any server-generated private key (Prekey System cleanup)
  await db.update(citizensTable)
    .set({ chatPublicKey: parsed.data.publicKey, chatServerPrivateKey: null })
    .where(eq(citizensTable.id, me.id));
  logger.info({ citizenId: me.id }, "Chat public key updated (client-registered)");
  res.json({ ok: true });
});

// ── GET /chat/key/:citizenId ───────────────────────────────────────────────
// Always returns a valid public key for any existing citizen.
// If the citizen hasn't registered a client key yet, the server auto-generates
// a NaCl keypair (Prekey System): public key is returned to callers, private key
// is stored server-side so existing encrypted messages can be decrypted later.
// When the citizen logs in and registers their own key via POST /chat/key,
// the server-generated private key is cleared.

router.get("/chat/key/:citizenId", async (req, res): Promise<void> => {
  const id = parseInt(req.params["citizenId"]!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный citizenId" }); return; }

  const [citizen] = await db
    .select({ id: citizensTable.id, chatPublicKey: citizensTable.chatPublicKey, chatServerPrivateKey: citizensTable.chatServerPrivateKey, name: citizensTable.name })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

  // If already has a key (client-registered or previously server-generated), return it
  if (citizen.chatPublicKey) {
    res.json({ citizenId: citizen.id, name: citizen.name, publicKey: citizen.chatPublicKey, serverGenerated: !!citizen.chatServerPrivateKey });
    return;
  }

  // Auto-generate a server-side keypair (Prekey System)
  const kp = nacl.box.keyPair();
  const pubB64 = encodeBase64(kp.publicKey);
  const privB64 = encodeBase64(kp.secretKey);

  await db.update(citizensTable)
    .set({ chatPublicKey: pubB64, chatServerPrivateKey: privB64 })
    .where(eq(citizensTable.id, id));

  logger.info({ citizenId: id }, "Server auto-generated E2EE keypair (Prekey System)");
  res.json({ citizenId: citizen.id, name: citizen.name, publicKey: pubB64, serverGenerated: true });
});

// ── GET /chat/online — online citizen IDs ─────────────────────────────────

router.get("/chat/online", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  res.json({ online: getOnlineCitizenIds() });
});

// ── POST /chat/transfer — direct P2P Darmin transfer from chat ────────────

const chatTransferSchema = z.object({
  toCitizenId: z.number().int().positive(),
  amount:      z.number().positive(),
  note:        z.string().max(200).optional(),
});

router.post("/chat/transfer", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = chatTransferSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { toCitizenId, amount } = parsed.data;

  if (toCitizenId === me.id) { res.status(400).json({ error: "Нельзя перевести самому себе" }); return; }

  const [sender] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes })
    .from(citizensTable).where(eq(citizensTable.id, me.id)).limit(1);
  if (!sender) { res.status(404).json({ error: "Отправитель не найден" }); return; }

  // 1 Д — родовая минута, не передаётся
  if ((sender.balanceMinutes ?? 0) - amount < 1) {
    res.status(400).json({ error: `Недостаточно Дарминов. Доступно: ${Math.max(0, (sender.balanceMinutes ?? 0) - 1)} Д` });
    return;
  }

  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes })
    .from(citizensTable).where(eq(citizensTable.id, toCitizenId)).limit(1);
  if (!recipient) { res.status(404).json({ error: "Получатель не найден" }); return; }

  // Update balances
  await db.update(citizensTable)
    .set({ balanceMinutes: (sender.balanceMinutes ?? 0) - amount })
    .where(eq(citizensTable.id, me.id));
  await db.update(citizensTable)
    .set({ balanceMinutes: (recipient.balanceMinutes ?? 0) + amount })
    .where(eq(citizensTable.id, toCitizenId));

  // Log in transactions (sessionId=0 = direct chat transfer sentinel)
  await db.insert(transactionsTable).values({
    sessionId:          0,
    fromCitizenId:      me.id,
    toCitizenId:        toCitizenId,
    fromCitizenName:    sender.name    ?? `ID ${me.id}`,
    toCitizenName:      recipient.name ?? `ID ${toCitizenId}`,
    minutesTransferred: amount,
    durationSeconds:    0,
  });

  logger.info({ from: me.id, to: toCitizenId, amount }, "Chat P2P transfer");
  res.json({ success: true, newBalance: (sender.balanceMinutes ?? 0) - amount });
});

// ── POST /chat/tip — quick +1 Д tip from chat ─────────────────────────────

const chatTipSchema = z.object({
  toCitizenId: z.number().int().positive(),
});

router.post("/chat/tip", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = chatTipSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "toCitizenId обязателен" }); return; }

  const { toCitizenId } = parsed.data;
  if (toCitizenId === me.id) { res.status(400).json({ error: "Нельзя дать чаевые самому себе" }); return; }

  let newBalance = 0;
  let senderName = "";
  let recipientName = "";

  try {
    await db.transaction(async (tx) => {
      // 1. Read sender inside transaction
      const [sender] = await tx
        .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes })
        .from(citizensTable).where(eq(citizensTable.id, me.id)).limit(1);
      if (!sender) throw Object.assign(new Error("Гражданин не найден"), { status: 404 });

      // Keep 1 Д родовой минуты — need balance > 1 to send a tip of 1 Д
      if ((sender.balanceMinutes ?? 0) - 1 < 1) {
        throw Object.assign(new Error("Недостаточно Дарминов для чаевых (нужно > 1 Д)"), { status: 400 });
      }

      // 2. Read recipient inside transaction
      const [recipient] = await tx
        .select({ id: citizensTable.id, name: citizensTable.name, balanceMinutes: citizensTable.balanceMinutes })
        .from(citizensTable).where(eq(citizensTable.id, toCitizenId)).limit(1);
      if (!recipient) throw Object.assign(new Error("Получатель не найден"), { status: 404 });

      // 3. Atomic SQL-level arithmetic — no stale-read race condition
      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} - 1` })
        .where(eq(citizensTable.id, me.id));

      await tx.update(citizensTable)
        .set({ balanceMinutes: sql`${citizensTable.balanceMinutes} + 1` })
        .where(eq(citizensTable.id, toCitizenId));

      // 4. Read back the sender's real post-update balance
      const [updated] = await tx
        .select({ balanceMinutes: citizensTable.balanceMinutes })
        .from(citizensTable).where(eq(citizensTable.id, me.id)).limit(1);
      newBalance = updated?.balanceMinutes ?? (sender.balanceMinutes ?? 1) - 1;

      // 5. Log the transaction
      await tx.insert(transactionsTable).values({
        sessionId:          0,
        fromCitizenId:      me.id,
        toCitizenId:        toCitizenId,
        fromCitizenName:    sender.name    ?? `ID ${me.id}`,
        toCitizenName:      recipient.name ?? `ID ${toCitizenId}`,
        minutesTransferred: 1,
        durationSeconds:    0,
      });

      senderName    = sender.name    ?? `ID ${me.id}`;
      recipientName = recipient.name ?? `ID ${toCitizenId}`;
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    res.status(e.status ?? 500).json({ error: e.message ?? "Внутренняя ошибка" });
    return;
  }

  // WS push — notify recipient in real-time (outside tx, non-critical)
  pushToCitizen(toCitizenId, {
    type: "tip_received",
    fromCitizenId: me.id,
    fromName: senderName,
    amount: 1,
  });

  logger.info({ from: me.id, to: toCitizenId, newBalance }, "Chat tip +1Д");
  res.json({ ok: true, newBalance });
});

// ── GET /chat/conversations ────────────────────────────────────────────────

router.get("/chat/conversations", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  // Use a CTE so that peer_id is a stable column name — avoids the
  // "DISTINCT ON expression must match initial ORDER BY expression" error
  // that occurs when Drizzle injects separate $N params for each ${me.id}.
  const myId = me.id;
  const rows = await db.execute(sql`
    WITH msgs AS (
      SELECT
        id, from_citizen_id, to_citizen_id,
        ciphertext, nonce, msg_type, darmin_amount,
        created_at, read_at, delivered_at,
        CASE WHEN from_citizen_id = ${myId} THEN to_citizen_id
             ELSE from_citizen_id END AS peer_id
      FROM dm_messages
      WHERE from_citizen_id = ${myId} OR to_citizen_id = ${myId}
    ),
    latest AS (
      SELECT DISTINCT ON (peer_id)
        id, from_citizen_id, to_citizen_id,
        ciphertext, nonce, msg_type, darmin_amount,
        created_at, read_at, delivered_at,
        peer_id
      FROM msgs
      ORDER BY peer_id, created_at DESC
    )
    SELECT
      l.peer_id,
      l.id,
      l.from_citizen_id,
      l.to_citizen_id,
      l.ciphertext,
      l.nonce,
      l.msg_type,
      l.darmin_amount,
      l.created_at,
      l.read_at,
      l.delivered_at,
      c.name            AS peer_name,
      c.rank            AS peer_rank,
      c.merit_score     AS peer_merit_score,
      c.chat_public_key AS peer_chat_public_key,
      (
        SELECT COUNT(*)
        FROM dm_messages u
        WHERE u.to_citizen_id   = ${myId}
          AND u.from_citizen_id = l.peer_id
          AND u.read_at IS NULL
      ) AS unread_count
    FROM latest l
    JOIN citizens c ON c.id = l.peer_id
    ORDER BY l.created_at DESC
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

  // Map Drizzle camelCase to snake_case expected by the mobile client
  res.json({
    messages: reversed.map((m) => ({
      id: m.id,
      from_citizen_id: m.fromCitizenId,
      to_citizen_id: m.toCitizenId,
      ciphertext: m.ciphertext,
      nonce: m.nonce,
      msg_type: m.msgType,
      darmin_amount: m.darminAmount ?? null,
      forwarded_from_id: m.forwardedFromId ?? null,
      reply_to_id: m.replyToId ?? null,
      reply_sender_name: m.replySenderName ?? null,
      reply_content: m.replyContent ?? null,
      attachments: m.attachments ? (JSON.parse(m.attachments) as AttachmentMeta[]) : null,
      created_at: m.createdAt,
      delivered_at: m.deliveredAt ?? null,
      read_at: m.readAt ?? null,
      reactions: reactionMap[m.id] ?? [],
    })),
  });
});

// ── POST /chat/messages — send encrypted message ──────────────────────────

const attachmentSchema = z.object({
  url: z.string(),
  type: z.enum(["image", "video", "audio", "document"]),
  name: z.string(),
  size: z.number(),
});

const sendMsgSchema = z.object({
  toCitizenId: z.number().int().positive(),
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  msgType: z.enum(["text", "darmin_transfer", "voice"]).default("text"),
  darminAmount: z.number().positive().optional(),
  forwardedFromId: z.number().int().positive().optional(),
  replyToId: z.number().int().positive().optional(),
  replySenderName: z.string().max(100).optional(),
  replyContent: z.string().max(500).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const parsed = sendMsgSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { toCitizenId, ciphertext, nonce, msgType, darminAmount, forwardedFromId, replyToId, replySenderName, replyContent, attachments } = parsed.data;
  const attachmentsJson = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;

  if (toCitizenId === me.id) { res.status(400).json({ error: "Нельзя отправить сообщение самому себе" }); return; }

  const [recipient] = await db
    .select({ id: citizensTable.id, name: citizensTable.name, telegramId: citizensTable.telegramId })
    .from(citizensTable)
    .where(eq(citizensTable.id, toCitizenId))
    .limit(1);

  if (!recipient) { res.status(404).json({ error: "Получатель не найден" }); return; }

  const [inserted] = await db
    .insert(dmMessagesTable)
    .values({ fromCitizenId: me.id, toCitizenId, ciphertext, nonce, msgType, darminAmount: darminAmount ?? null, forwardedFromId: forwardedFromId ?? null, replyToId: replyToId ?? null, replySenderName: replySenderName ?? null, replyContent: replyContent ?? null, attachments: attachmentsJson })
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
      reply_to_id: replyToId ?? null,
      reply_sender_name: replySenderName ?? null,
      reply_content: replyContent ?? null,
      attachments: attachments ?? null,
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
  // Map Drizzle camelCase to snake_case expected by the mobile client
  res.status(201).json({
    message: {
      id: inserted.id,
      from_citizen_id: inserted.fromCitizenId,
      to_citizen_id: inserted.toCitizenId,
      ciphertext: inserted.ciphertext,
      nonce: inserted.nonce,
      msg_type: inserted.msgType,
      darmin_amount: inserted.darminAmount ?? null,
      forwarded_from_id: inserted.forwardedFromId ?? null,
      reply_to_id: inserted.replyToId ?? null,
      reply_sender_name: inserted.replySenderName ?? null,
      reply_content: inserted.replyContent ?? null,
      attachments: inserted.attachments ? (JSON.parse(inserted.attachments) as AttachmentMeta[]) : null,
      created_at: inserted.createdAt,
      delivered_at: inserted.deliveredAt ?? null,
      read_at: inserted.readAt ?? null,
      reactions: [],
    },
  });
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
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Некорректные данные";
    logger.warn({ body: req.body, issues: parsed.error.issues }, "createGroup: validation failed");
    res.status(400).json({ error: msg });
    return;
  }

  const { name, description, memberIds } = parsed.data;

  try {
    const [group] = await db.insert(groupChatsTable).values({ name, description, createdBy: me.id }).returning();
    if (!group) { res.status(500).json({ error: "Ошибка создания группы" }); return; }

    // Add creator as admin + all members (skip unknown citizenIds gracefully)
    const allMemberIds = [...new Set([me.id, ...memberIds])];
    await db.insert(groupMembersTable).values(
      allMemberIds.map((cid) => ({ groupId: group.id, citizenId: cid, isAdmin: cid === me.id }))
    ).onConflictDoNothing();

    // Notify members (non-blocking, errors are silent)
    for (const cid of allMemberIds) {
      if (cid !== me.id) {
        try {
          pushToCitizen(cid, { type: "group_created", group: { id: group.id, name, createdBy: me.id, creatorName: me.name } });
        } catch { /* silent — WS notification is best-effort */ }
      }
    }

    logger.info({ groupId: group.id, createdBy: me.id, members: allMemberIds.length }, "Group created");
    res.status(201).json({ group });
  } catch (err) {
    logger.error({ err, body: req.body, citizenId: me.id }, "createGroup: DB error");
    res.status(500).json({ error: "Ошибка базы данных при создании группы" });
  }
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

// ── GET /chat/groups/:groupId/key — fetch my encrypted group key ──────────

router.get("/chat/groups/:groupId/key", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.citizenId, me.id))).limit(1);
  if (!membership) { res.status(403).json({ error: "Нет доступа" }); return; }

  const [row] = await db.select().from(groupKeysTable)
    .where(and(eq(groupKeysTable.groupId, groupId), eq(groupKeysTable.citizenId, me.id))).limit(1);

  if (!row) { res.status(404).json({ error: "Ключ не найден" }); return; }

  res.json({
    encryptedKey: row.encryptedKey,
    encNonce: row.encNonce,
    creatorPublicKey: row.creatorPublicKey,
  });
});

// ── POST /chat/groups/:groupId/key — store encrypted keys for members ─────

const groupKeySchema = z.object({
  keys: z.array(z.object({
    citizenId: z.number().int().positive(),
    encryptedKey: z.string().min(1),
    encNonce: z.string().min(1),
    creatorPublicKey: z.string().min(1),
  })).min(1).max(100),
});

router.post("/chat/groups/:groupId/key", async (req, res): Promise<void> => {
  const me = await getAuthCitizen(req.headers.authorization);
  if (!me) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const groupId = parseInt(req.params["groupId"]!, 10);
  if (isNaN(groupId)) { res.status(400).json({ error: "Некорректный groupId" }); return; }

  // Only the group creator can distribute keys
  const [group] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, groupId)).limit(1);
  if (!group) { res.status(404).json({ error: "Группа не найдена" }); return; }
  if (group.createdBy !== me.id) { res.status(403).json({ error: "Только создатель группы может распределять ключи" }); return; }

  const parsed = groupKeySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Некорректные данные" }); return; }

  const { keys } = parsed.data;

  // Verify all citizenIds are group members
  const members = await db.select({ citizenId: groupMembersTable.citizenId })
    .from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  const memberSet = new Set(members.map((m) => m.citizenId));

  const validKeys = keys.filter((k) => memberSet.has(k.citizenId));
  if (validKeys.length === 0) { res.status(400).json({ error: "Нет допустимых участников" }); return; }

  await db.insert(groupKeysTable)
    .values(validKeys.map((k) => ({
      groupId,
      citizenId: k.citizenId,
      creatorPublicKey: k.creatorPublicKey,
      encryptedKey: k.encryptedKey,
      encNonce: k.encNonce,
    })))
    .onConflictDoUpdate({
      target: [groupKeysTable.groupId, groupKeysTable.citizenId],
      set: { encryptedKey: sql`excluded.encrypted_key`, encNonce: sql`excluded.enc_nonce`, creatorPublicKey: sql`excluded.creator_public_key` },
    });

  logger.info({ groupId, by: me.id, count: validKeys.length }, "Group E2EE keys distributed");
  res.json({ ok: true, distributed: validKeys.length });
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
  content: z.string().max(4000).optional(),
  ciphertext: z.string().max(10000).optional(),
  msgNonce: z.string().max(200).optional(),
  msgType: z.enum(["text", "darmin_transfer", "voice"]).default("text"),
  darminAmount: z.number().positive().optional(),
  forwardedFromDmId: z.number().int().positive().optional(),
  replyToId: z.number().int().positive().optional(),
  replySenderName: z.string().max(100).optional(),
  replyContent: z.string().max(500).optional(),
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

  const { content, ciphertext, msgNonce, msgType, darminAmount, forwardedFromDmId, replyToId, replySenderName, replyContent } = parsed.data;

  // Must have either plaintext content or E2EE ciphertext+nonce
  if (!content && !(ciphertext && msgNonce)) {
    res.status(400).json({ error: "Необходимо передать content или ciphertext+msgNonce" }); return;
  }

  const [inserted] = await db.insert(groupMessagesTable)
    .values({
      groupId,
      fromCitizenId: me.id,
      content: content ?? "",  // empty string placeholder when E2EE
      ciphertext: ciphertext ?? null,
      msgNonce: msgNonce ?? null,
      msgType,
      darminAmount: darminAmount ?? null,
      forwardedFromDmId: forwardedFromDmId ?? null,
      replyToId: replyToId ?? null,
      replySenderName: replySenderName ?? null,
      replyContent: replyContent ?? null,
    })
    .returning();

  if (!inserted) { res.status(500).json({ error: "Ошибка сохранения" }); return; }

  // Push to all other members
  const members = await db.select({ citizenId: groupMembersTable.citizenId }).from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, groupId));

  // Map Drizzle camelCase to snake_case expected by the mobile client
  const msgSnake = {
    id: inserted.id,
    group_id: inserted.groupId,
    from_citizen_id: inserted.fromCitizenId,
    content: inserted.content,
    ciphertext: inserted.ciphertext ?? null,
    msg_nonce: inserted.msgNonce ?? null,
    reply_to_id: inserted.replyToId ?? null,
    reply_sender_name: inserted.replySenderName ?? null,
    reply_content: inserted.replyContent ?? null,
    msg_type: inserted.msgType,
    darmin_amount: inserted.darminAmount ?? null,
    forwarded_from_dm_id: inserted.forwardedFromDmId ?? null,
    created_at: inserted.createdAt,
    sender_name: me.name,
    sender_rank: me.rank,
  };

  const payload = { type: "group_message", message: msgSnake };

  for (const { citizenId } of members) {
    if (citizenId !== me.id) pushToCitizen(citizenId, payload);
  }

  res.status(201).json({ message: msgSnake });
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
