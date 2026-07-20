/**
 * useWsSync — unified WebSocket hook for real-time cross-device sync.
 *
 * Extends the base WS connection with:
 *  - balance_update  → triggers refreshCitizen()
 *  - transaction_notify → shows toast or callback
 *  - sync_signal     → from mobile (cross-device sync signal)
 *  - PLAY_ANTHEM     → existing social alarm
 *  - qr_login        → anonymous sessions waiting for QR login
 *  - qr_wait         → register this WS socket as a QR waiter
 */
import { useEffect, useRef, useState, useCallback } from "react";

export interface SyncSignalEvent {
  citizenId: number;
  triggeredBy: string;
  message: string;
  ts: number;
}

export interface TransactionNotify {
  fromName: string;
  toName: string;
  amount: number;
  direction: "in" | "out";
}

export interface QrLoginPayload {
  citizenId: number;
  authToken: string;
  name: string;
  balanceMinutes: number;
}

export interface PlayAnthemEvent {
  triggeredBy: string;
  targetType: "all" | "direct";
  fromMobile?: boolean;
}

interface WsSyncOptions {
  citizenId?: number;
  onBalanceUpdate?: (newBalance: number) => void;
  onTransactionNotify?: (tx: TransactionNotify) => void;
  onSyncSignal?: (event: SyncSignalEvent) => void;
  onQrLogin?: (payload: QrLoginPayload) => void;
  onPlayAnthem?: (event: PlayAnthemEvent) => void;
  onConsentUpdated?: (subscribed: boolean) => void;
  qrWaitToken?: string | null;     // if set, register WS as a QR waiter (anonymous)
}

interface WsSyncResult {
  connected: boolean;
  subscribed: boolean;
  syncSignalEvent: SyncSignalEvent | null;
  clearSyncSignal: () => void;
  playAnthemEvent: PlayAnthemEvent | null;
  clearAnthemEvent: () => void;
  updateConsent: (consent: boolean) => void;
  sendSyncSignal: (message?: string) => void;
  sendAnthemMobile: (message?: string) => void;
}

export function useWsSync(opts: WsSyncOptions): WsSyncResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [syncSignalEvent, setSyncSignalEvent] = useState<SyncSignalEvent | null>(null);
  const [playAnthemEvent, setPlayAnthemEvent] = useState<PlayAnthemEvent | null>(null);
  const reconRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const sendWs = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  const connect = useCallback(() => {
    const { citizenId, qrWaitToken } = optsRef.current;
    // Allow connection for either authenticated users OR QR waiters
    if (!citizenId && !qrWaitToken) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (citizenId) {
        ws.send(JSON.stringify({ type: "auth", citizenId }));
      }
      if (qrWaitToken) {
        ws.send(JSON.stringify({ type: "qr_wait", token: qrWaitToken }));
      }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        const t = msg["type"] as string;

        if (t === "auth_ok") {
          setSubscribed(msg["subscribed"] === true);
        }
        if (t === "consent_updated") {
          setSubscribed(msg["subscribed"] === true);
          optsRef.current.onConsentUpdated?.(msg["subscribed"] === true);
        }
        if (t === "balance_update") {
          const balance = typeof msg["balance"] === "number" ? msg["balance"] : undefined;
          optsRef.current.onBalanceUpdate?.(balance ?? 0);
        }
        if (t === "transaction_notify") {
          optsRef.current.onTransactionNotify?.({
            fromName: String(msg["fromName"] ?? ""),
            toName: String(msg["toName"] ?? ""),
            amount: Number(msg["amount"] ?? 0),
            direction: msg["direction"] === "in" ? "in" : "out",
          });
        }
        if (t === "sync_signal") {
          const ev: SyncSignalEvent = {
            citizenId: Number(msg["citizenId"] ?? 0),
            triggeredBy: String(msg["triggeredBy"] ?? ""),
            message: String(msg["message"] ?? ""),
            ts: Number(msg["ts"] ?? Date.now()),
          };
          setSyncSignalEvent(ev);
          optsRef.current.onSyncSignal?.(ev);
        }
        if (t === "PLAY_ANTHEM") {
          const ev: PlayAnthemEvent = {
            triggeredBy: String(msg["triggeredBy"] ?? "TimeNation"),
            targetType: msg["targetType"] === "all" ? "all" : "direct",
            fromMobile: msg["fromMobile"] === true,
          };
          setPlayAnthemEvent(ev);
          optsRef.current.onPlayAnthem?.(ev);
        }
        if (t === "qr_login") {
          optsRef.current.onQrLogin?.({
            citizenId: Number(msg["citizenId"] ?? 0),
            authToken: String(msg["authToken"] ?? ""),
            name: String(msg["name"] ?? ""),
            balanceMinutes: Number(msg["balanceMinutes"] ?? 0),
          });
        }
      } catch { /* bad JSON */ }
    };

    ws.onclose = () => {
      setConnected(false);
      reconRef.current = setTimeout(connect, 5000);
    };
    ws.onerror = () => ws.close();
  }, []); // no deps — reads from optsRef

  // Re-register qr_wait token when it changes
  const prevQrToken = useRef<string | null | undefined>(null);
  useEffect(() => {
    const token = opts.qrWaitToken;
    if (token && token !== prevQrToken.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "qr_wait", token }));
    }
    prevQrToken.current = token ?? null;
  }, [opts.qrWaitToken]);

  useEffect(() => {
    connect();
    return () => {
      if (reconRef.current) clearTimeout(reconRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Reconnect when citizenId changes (login/logout)
  const prevCitizenId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (opts.citizenId !== prevCitizenId.current) {
      prevCitizenId.current = opts.citizenId;
      wsRef.current?.close();
      wsRef.current = null;
      connect();
    }
  }, [opts.citizenId, connect]);

  const updateConsent = useCallback((consent: boolean) => {
    sendWs({ type: "update_consent", consent });
  }, [sendWs]);

  const sendSyncSignal = useCallback((message = "") => {
    sendWs({ type: "sync_signal", message });
  }, [sendWs]);

  const sendAnthemMobile = useCallback((message = "") => {
    sendWs({ type: "anthem_mobile", message });
  }, [sendWs]);

  return {
    connected,
    subscribed,
    syncSignalEvent,
    clearSyncSignal: useCallback(() => setSyncSignalEvent(null), []),
    playAnthemEvent,
    clearAnthemEvent: useCallback(() => setPlayAnthemEvent(null), []),
    updateConsent,
    sendSyncSignal,
    sendAnthemMobile,
  };
}
