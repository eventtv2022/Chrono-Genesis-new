import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

interface AuthedSocket extends WebSocket {
  citizenId?: number;
  citizenName?: string;
  isAlive?: boolean;
  qrWaitToken?: string;        // set when client registers for QR login
}

export interface PlayAnthemPayload {
  type: "PLAY_ANTHEM";
  triggeredBy: string;
  targetType: "all" | "direct";
  message?: string;
  purpose?: string;
  scheduledFor?: string;
}

export interface WsPayload {
  type: string;
  [key: string]: unknown;
}

// ── State ──────────────────────────────────────────────────────────────────

const citizenSockets = new Map<number, Set<AuthedSocket>>();
const globalSubscribers = new Set<AuthedSocket>();

// QR login waiters: token → unauthenticated web socket waiting for login
const qrWaiters = new Map<string, AuthedSocket>();

// ── Helpers ────────────────────────────────────────────────────────────────

function send(ws: AuthedSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function addToRoom(citizenId: number, ws: AuthedSocket) {
  if (!citizenSockets.has(citizenId)) citizenSockets.set(citizenId, new Set());
  citizenSockets.get(citizenId)!.add(ws);
}

function removeFromRoom(citizenId: number, ws: AuthedSocket) {
  const room = citizenSockets.get(citizenId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) citizenSockets.delete(citizenId);
  }
  globalSubscribers.delete(ws);
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Broadcast PlayAnthem to all global subscribers */
export function broadcastToAll(payload: PlayAnthemPayload) {
  let count = 0;
  for (const ws of globalSubscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, payload);
      count++;
    }
  }
  logger.info({ count }, "Social Alarm: broadcast to all subscribers");
}

/** Broadcast PlayAnthem to specific citizens */
export function broadcastToCitizens(citizenIds: number[], payload: PlayAnthemPayload) {
  let count = 0;
  for (const id of citizenIds) {
    const room = citizenSockets.get(id);
    if (room) {
      for (const ws of room) {
        if (ws.readyState === WebSocket.OPEN) {
          send(ws, payload);
          count++;
        }
      }
    }
  }
  logger.info({ citizenIds, count }, "Social Alarm: direct broadcast");
}

/** Push any event to all active sessions of a citizen (used by API routes) */
export function pushToCitizen(citizenId: number, payload: WsPayload) {
  const room = citizenSockets.get(citizenId);
  if (!room) return;
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      send(ws, payload);
    }
  }
}

/** Push QR login payload to the web session waiting on the given token */
export function pushQrLogin(token: string, payload: WsPayload): boolean {
  const ws = qrWaiters.get(token);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    qrWaiters.delete(token);
    return false;
  }
  send(ws, payload);
  qrWaiters.delete(token);
  if (ws.qrWaitToken) ws.qrWaitToken = undefined;
  return true;
}

export function getOnlineSubscriberIds(): number[] {
  const ids: number[] = [];
  for (const ws of globalSubscribers) {
    if (ws.readyState === WebSocket.OPEN && ws.citizenId != null) {
      ids.push(ws.citizenId);
    }
  }
  return ids;
}

// ── WebSocket server setup ─────────────────────────────────────────────────

export function attachSocialAlarmWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat — drop dead connections every 30 s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((rawWs) => {
      const ws = rawWs as AuthedSocket;
      if (!ws.isAlive) {
        if (ws.citizenId != null) removeFromRoom(ws.citizenId, ws);
        if (ws.qrWaitToken) qrWaiters.delete(ws.qrWaitToken);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (rawWs: WebSocket, _req: IncomingMessage) => {
    const ws = rawWs as AuthedSocket;
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (data) => {
      let msg: unknown;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (typeof msg !== "object" || msg === null) return;
      const m = msg as Record<string, unknown>;

      // ── AUTH ─────────────────────────────────────────────────────────────
      if (m["type"] === "auth") {
        const citizenId = typeof m["citizenId"] === "number" ? m["citizenId"] : null;
        if (!citizenId) return send(ws, { type: "auth_error", reason: "missing_fields" });

        const [citizen] = await db
          .select({ id: citizensTable.id, name: citizensTable.name, socialAlarmConsent: citizensTable.socialAlarmConsent })
          .from(citizensTable)
          .where(eq(citizensTable.id, citizenId));

        if (!citizen) return send(ws, { type: "auth_error", reason: "not_found" });

        ws.citizenId = citizen.id;
        ws.citizenName = citizen.name;
        addToRoom(citizen.id, ws);

        if (citizen.socialAlarmConsent === 1) {
          globalSubscribers.add(ws);
        }

        send(ws, { type: "auth_ok", citizenId: citizen.id, subscribed: citizen.socialAlarmConsent === 1 });
        logger.info({ citizenId: citizen.id, subscribed: citizen.socialAlarmConsent === 1 }, "WS: citizen authenticated");
      }

      // ── CONSENT ──────────────────────────────────────────────────────────
      if (m["type"] === "update_consent") {
        if (!ws.citizenId) return;
        const consent = m["consent"] === true || m["consent"] === 1;
        if (consent) globalSubscribers.add(ws);
        else globalSubscribers.delete(ws);
        send(ws, { type: "consent_updated", subscribed: consent });
      }

      // ── QR LOGIN WAIT (anonymous — web registers before login) ────────────
      if (m["type"] === "qr_wait") {
        const token = typeof m["token"] === "string" ? m["token"] : null;
        if (!token) return;
        // Remove old token if re-registering
        if (ws.qrWaitToken) qrWaiters.delete(ws.qrWaitToken);
        ws.qrWaitToken = token;
        qrWaiters.set(token, ws);
        send(ws, { type: "qr_wait_ok", token });
        logger.info({ token: token.slice(0, 8) }, "WS: QR wait registered");
      }

      // ── SYNC SIGNAL from mobile → relay to all web sessions of same citizen ─
      if (m["type"] === "sync_signal") {
        if (!ws.citizenId) return;
        const payload: WsPayload = {
          type: "sync_signal",
          fromMobile: true,
          citizenId: ws.citizenId,
          triggeredBy: ws.citizenName ?? String(ws.citizenId),
          message: typeof m["message"] === "string" ? m["message"] : "",
          ts: Date.now(),
        };
        // Relay to all OTHER sessions of this citizen (web clients)
        const room = citizenSockets.get(ws.citizenId);
        if (room) {
          for (const target of room) {
            if (target !== ws && target.readyState === WebSocket.OPEN) {
              send(target, payload);
            }
          }
        }
        send(ws, { type: "sync_signal_sent" });
      }

      // ── ANTHEM from mobile → relay to all web sessions of same citizen ─────
      if (m["type"] === "anthem_mobile") {
        if (!ws.citizenId) return;
        const anthemPayload: WsPayload = {
          type: "PLAY_ANTHEM",
          triggeredBy: ws.citizenName ?? String(ws.citizenId),
          targetType: "direct",
          fromMobile: true,
          message: typeof m["message"] === "string" ? m["message"] : undefined,
        };
        pushToCitizen(ws.citizenId, anthemPayload);
        send(ws, { type: "anthem_mobile_sent" });
      }
    });

    ws.on("close", () => {
      if (ws.citizenId != null) removeFromRoom(ws.citizenId, ws);
      if (ws.qrWaitToken) { qrWaiters.delete(ws.qrWaitToken); ws.qrWaitToken = undefined; }
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "WS socket error");
      if (ws.citizenId != null) removeFromRoom(ws.citizenId, ws);
      if (ws.qrWaitToken) { qrWaiters.delete(ws.qrWaitToken); ws.qrWaitToken = undefined; }
    });
  });

  // Intercept HTTP upgrade requests on the /api/ws path
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  logger.info("Social Alarm WebSocket server attached at /api/ws");
  return wss;
}
