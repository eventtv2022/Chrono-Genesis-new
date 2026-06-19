/**
 * Web platform version of ChronopediaMap.
 * Uses an iframe (srcdoc) with the same LEAFLET_HTML used in the native WebView.
 * This avoids all Leaflet CSS import issues: the iframe has its own document
 * where CSS is loaded synchronously before the map initialises.
 *
 * Communication:
 *   map → host : window.parent.postMessage   (already in LEAFLET_HTML)
 *   host → map : iframe.contentWindow.postMessage({ fn, args })
 *                received by the message listener inside LEAFLET_HTML
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { LEAFLET_HTML } from "./chronopedia-map-html";
import type {
  ChronopediaMapHandle,
  ChronopediaMapProps,
} from "./ChronopediaMap.native";

// ── Component ─────────────────────────────────────────────────────────────────

const ChronopediaMap = forwardRef<ChronopediaMapHandle, ChronopediaMapProps>(
  (props, ref) => {
    const { slots, myId, selectedSlotId, pendingLat, pendingLng, style } = props;

    const containerRef = useRef<View>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [mapReady, setMapReady] = useState(false);

    // Stable refs so effects don't re-fire on every render
    const onSlotClickRef = useRef(props.onSlotClick);
    const onMapClickRef = useRef(props.onMapClick);
    const onReadyRef = useRef(props.onReady);
    useEffect(() => { onSlotClickRef.current = props.onSlotClick; }, [props.onSlotClick]);
    useEffect(() => { onMapClickRef.current = props.onMapClick; }, [props.onMapClick]);
    useEffect(() => { onReadyRef.current = props.onReady; }, [props.onReady]);

    // Send a command to the iframe map via postMessage
    const sendCmd = useCallback((fn: string, ...args: unknown[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ fn, args }),
        "*"
      );
    }, []);

    useImperativeHandle(ref, () => ({
      centerOn: (lat, lng, zoom = 12) => sendCmd("centerOn", lat, lng, zoom),
    }));

    // Mount iframe once; set up postMessage listener
    useEffect(() => {
      const container = containerRef.current as unknown as HTMLElement | null;
      if (!container) return;

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#0f172a;";
      iframe.srcdoc = LEAFLET_HTML;
      // No sandbox — trusted content that needs to load external scripts/tiles.
      iframeRef.current = iframe;
      container.appendChild(iframe);

      const handler = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return;
        try {
          const msg = JSON.parse(e.data as string) as {
            type: string;
            slotId?: number;
            lat?: number;
            lng?: number;
          };
          if (msg.type === "ready") {
            setMapReady(true);
            onReadyRef.current();
          } else if (msg.type === "slotClick" && msg.slotId != null) {
            onSlotClickRef.current(msg.slotId);
          } else if (msg.type === "mapClick" && msg.lat != null && msg.lng != null) {
            onMapClickRef.current(msg.lat, msg.lng);
          }
        } catch { /* ignore malformed messages */ }
      };

      window.addEventListener("message", handler);

      // Fallback: mark ready after 4 s if the message never arrives
      const fallback = setTimeout(() => {
        setMapReady((prev) => {
          if (!prev) onReadyRef.current();
          return true;
        });
      }, 4000);

      return () => {
        clearTimeout(fallback);
        window.removeEventListener("message", handler);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        iframeRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync slot markers whenever data or selection changes
    useEffect(() => {
      if (!mapReady) return;
      sendCmd("updateMarkers", slots, myId ?? 0, selectedSlotId ?? null);
    }, [mapReady, slots, myId, selectedSlotId, sendCmd]);

    // Show / hide pending drop-pin
    useEffect(() => {
      if (!mapReady) return;
      sendCmd("setPending", pendingLat ?? null, pendingLng ?? null);
    }, [mapReady, pendingLat, pendingLng, sendCmd]);

    return (
      <View
        ref={containerRef}
        style={[styles.container, style as object]}
      >
        {!mapReady && (
          <View style={styles.loading}>
            <ActivityIndicator color="#00ff87" />
            <Text style={styles.loadingText}>Загрузка карты…</Text>
          </View>
        )}
      </View>
    );
  }
);

ChronopediaMap.displayName = "ChronopediaMap";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative" as const,
    minHeight: 200,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 10,
  },
  loadingText: { fontSize: 13, color: "#64748b" },
});

export default ChronopediaMap;
