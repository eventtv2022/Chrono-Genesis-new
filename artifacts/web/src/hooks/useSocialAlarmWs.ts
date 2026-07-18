import { useEffect, useRef, useState, useCallback } from "react";

export interface PlayAnthemEvent {
  triggeredBy: string;
  targetType: "all" | "direct";
}

interface UseSocialAlarmWsResult {
  connected: boolean;
  subscribed: boolean;
  playAnthemEvent: PlayAnthemEvent | null;
  clearAnthemEvent: () => void;
  updateConsent: (consent: boolean) => void;
}

export function useSocialAlarmWs(citizenId: number | undefined): UseSocialAlarmWsResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [playAnthemEvent, setPlayAnthemEvent] = useState<PlayAnthemEvent | null>(null);
  const reconRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!citizenId) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "auth", citizenId }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        if (msg["type"] === "auth_ok") {
          setSubscribed(msg["subscribed"] === true);
        }
        if (msg["type"] === "consent_updated") {
          setSubscribed(msg["subscribed"] === true);
        }
        if (msg["type"] === "PLAY_ANTHEM") {
          setPlayAnthemEvent({
            triggeredBy: String(msg["triggeredBy"] ?? "TimeNation"),
            targetType: msg["targetType"] === "all" ? "all" : "direct",
          });
        }
      } catch { /* bad JSON */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 5 s
      reconRef.current = setTimeout(connect, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [citizenId]);

  useEffect(() => {
    if (!citizenId) return;
    connect();
    return () => {
      if (reconRef.current) clearTimeout(reconRef.current);
      wsRef.current?.close();
    };
  }, [citizenId, connect]);

  const clearAnthemEvent = useCallback(() => setPlayAnthemEvent(null), []);

  const updateConsent = useCallback((consent: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "update_consent", consent }));
    }
  }, []);

  return { connected, subscribed, playAnthemEvent, clearAnthemEvent, updateConsent };
}
