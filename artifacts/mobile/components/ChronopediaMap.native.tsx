import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { makeLeafletHTML } from "./chronopedia-map-html";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface SlotMarker {
  id: number;
  geoLat: number;
  geoLng: number;
  locationName: string;
  timeMarker: string;
  eventCount: number;
  hasMyEvent: boolean;
}

export interface ChronopediaMapHandle {
  centerOn: (lat: number, lng: number, zoom?: number) => void;
}

export interface ChronopediaMapProps {
  slots: SlotMarker[];
  myId?: number;
  selectedSlotId: number | null;
  pendingLat?: number | null;
  pendingLng?: number | null;
  /** BCP-47 language code — drives map tile labels and tooltip text. */
  lang?: string;
  /** Text shown in the loading overlay. */
  loadingText?: string;
  onSlotClick: (slotId: number) => void;
  onMapClick: (lat: number, lng: number) => void;
  onReady: () => void;
  style?: object;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ChronopediaMap = forwardRef<ChronopediaMapHandle, ChronopediaMapProps>(
  (props, ref) => {
    const {
      slots, myId, selectedSlotId, pendingLat, pendingLng,
      lang, loadingText, onSlotClick, onMapClick, onReady, style,
    } = props;

    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);

    // Generate HTML once from the initial lang so the tile layer is correct
    // on first load — no WebView reload needed for subsequent lang changes.
    const initialLang = useRef(lang || "en");
    const htmlSource = useRef({
      html: makeLeafletHTML(initialLang.current),
      baseUrl: "https://unpkg.com",
    });

    useImperativeHandle(ref, () => ({
      centerOn: (lat, lng, zoom = 12) => {
        webViewRef.current?.injectJavaScript(`centerOn(${lat},${lng},${zoom}); true;`);
      },
    }));

    // Push marker data + selection whenever they change
    useEffect(() => {
      if (!mapReady) return;
      const selId = selectedSlotId === null ? "null" : String(selectedSlotId);
      const js = `updateMarkers(${JSON.stringify(slots)}, ${myId ?? 0}, ${selId}); true;`;
      webViewRef.current?.injectJavaScript(js);
    }, [mapReady, slots, myId, selectedSlotId]);

    // Show/hide pending drop marker
    useEffect(() => {
      if (!mapReady) return;
      const lat = pendingLat ?? "null";
      const lng = pendingLng ?? "null";
      webViewRef.current?.injectJavaScript(`setPending(${lat},${lng}); true;`);
    }, [mapReady, pendingLat, pendingLng]);

    // Sync tile language + tooltip eventsLabel when lang prop changes.
    // Skip if this is the initial lang (already baked into the HTML).
    const prevLang = useRef<string | undefined>(undefined);
    useEffect(() => {
      const newLang = lang || "en";
      if (!mapReady) return;
      if (prevLang.current === newLang) return;
      prevLang.current = newLang;
      webViewRef.current?.injectJavaScript(
        `setLang(${JSON.stringify(newLang)}); true;`
      );
    }, [mapReady, lang]);

    const handleMessage = useCallback(
      (e: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(e.nativeEvent.data) as {
            type: string;
            slotId?: number;
            lat?: number;
            lng?: number;
            message?: string;
            stack?: string;
          };
          if (msg.type === "ready") {
            setMapReady(true);
            onReady();
          } else if (msg.type === "slotClick") {
            onSlotClick(msg.slotId!);
          } else if (msg.type === "mapClick") {
            onMapClick(msg.lat!, msg.lng!);
          } else if (msg.type === "jsError") {
            console.warn("[ChronopediaMap JS]", msg.message, "| stack:", msg.stack);
          }
        } catch { /* ignore */ }
      },
      [onReady, onSlotClick, onMapClick]
    );

    return (
      <View style={[styles.container, style as object]}>
        <WebView
          ref={webViewRef}
          source={htmlSource.current}
          style={styles.webView}
          javaScriptEnabled
          originWhitelist={["*"]}
          domStorageEnabled
          allowUniversalAccessFromFileURLs
          onMessage={handleMessage}
          onLoadEnd={() => {
            setTimeout(() => setMapReady((v) => { if (!v) { onReady(); return true; } return v; }), 1500);
          }}
          onError={() => { setMapReady(true); onReady(); }}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
        {!mapReady && (
          <View style={styles.loading}>
            <ActivityIndicator color="#00ff87" />
            <Text style={styles.loadingText}>{loadingText ?? "…"}</Text>
          </View>
        )}
      </View>
    );
  }
);

ChronopediaMap.displayName = "ChronopediaMap";

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
  webView: { flex: 1, backgroundColor: "#f5f5f5" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13, color: "#64748b" },
});

export default ChronopediaMap;
