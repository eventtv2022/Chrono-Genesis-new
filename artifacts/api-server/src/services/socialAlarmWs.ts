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
}

export interface PlayAnthemPayload {
  type: "PLAY_ANTHEM";
  triggeredBy: string;   // pseudonym or "TimeNation Government"
  targetType: "all" | "direct";
  message?: string;
  purpose?: string;
  scheduledFor?: string;
}

// ── State ──────────────────────────────────────────────────────────────────

const citizenSockets = new Map<number, Set<AuthedSocket>>();
const globalSubscribers = new Set<AuthedSocket>();

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

      if (m["type"] === "update_consent") {
        if (!ws.citizenId) return;
        const consent = m["consent"] === true || m["consent"] === 1;
        if (consent) {
          globalSubscribers.add(ws);
        } else {
          globalSubscribers.delete(ws);
        }
        send(ws, { type: "consent_updated", subscribed: consent });
      }
    });

    ws.on("close", () => {
      if (ws.citizenId != null) removeFromRoom(ws.citizenId, ws);
    });

    ws.on("error", (err) => {
      logger.warn({ err }, "WS socket error");
      if (ws.citizenId != null) removeFromRoom(ws.citizenId, ws);
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
