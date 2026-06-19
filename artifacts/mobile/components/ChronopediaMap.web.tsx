import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { View } from "react-native";
import L from "leaflet";

// ── Shared types (must mirror ChronopediaMap.native.tsx) ──────────────────────

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
  onSlotClick: (slotId: number) => void;
  onMapClick: (lat: number, lng: number) => void;
  onReady: () => void;
  style?: object;
}

// ── CSS injection (once per page) ─────────────────────────────────────────────

let cssInjected = false;
function ensureLeafletCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = `
    .leaflet-control-attribution,.leaflet-control-zoom{display:none!important;}
    .tn-tip.leaflet-tooltip{background:#1e293b;color:#f1f5f9;border:1px solid #334155;
      font-size:12px;padding:6px 10px;border-radius:8px;white-space:nowrap;
      box-shadow:0 4px 16px rgba(0,0,0,0.6);}
    .tn-tip.leaflet-tooltip::before{display:none;}
  `;
  document.head.appendChild(style);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIcon(count: number, isMine: boolean, isSelected: boolean): L.DivIcon {
  const bg = isSelected ? "#f59e0b" : isMine ? "#00ff87" : "#60a5fa";
  const label = count > 1 ? String(count) : "●";
  return L.divIcon({
    className: "",
    html: `<div style="width:36px;height:36px;background:${bg};border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#111;box-shadow:0 3px 12px rgba(0,0,0,0.7);cursor:pointer;">${label}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function makePendingIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;"><div style="width:22px;height:22px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(245,158,11,0.35),0 3px 14px rgba(0,0,0,0.7);"></div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function escHtml(s: string): string {
  return String(s || "").replace(
    /[&<>"]/g,
    (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c] ?? c)
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const ChronopediaMap = forwardRef<ChronopediaMapHandle, ChronopediaMapProps>(
  (props, ref) => {
    // React Native Web: View ref gives us the underlying DOM element on web
    const containerRef = useRef<View>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<Record<number, L.Marker>>({});
    const pendingMarkerRef = useRef<L.Marker | null>(null);

    // Stable refs for callbacks (avoid stale closures)
    const onSlotClickRef = useRef(props.onSlotClick);
    const onMapClickRef = useRef(props.onMapClick);
    useEffect(() => { onSlotClickRef.current = props.onSlotClick; }, [props.onSlotClick]);
    useEffect(() => { onMapClickRef.current = props.onMapClick; }, [props.onMapClick]);

    useImperativeHandle(ref, () => ({
      centerOn: (lat, lng, zoom = 12) => {
        mapRef.current?.setView([lat, lng], zoom, { animate: true });
      },
    }));

    // Initialize Leaflet map
    useEffect(() => {
      ensureLeafletCSS();
      // React Native Web gives the DOM node via the View ref
      const el = containerRef.current as unknown as HTMLElement;
      if (!el || mapRef.current) return;

      const map = L.map(el, {
        center: [20, 10],
        zoom: 2,
        zoomControl: false,
        attributionControl: false,
        worldCopyJump: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 }
      ).addTo(map);

      map.on("click", (e) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6));
        const rawLng = e.latlng.lng;
        const lng = parseFloat((((rawLng % 360) + 540) % 360 - 180).toFixed(6));
        onMapClickRef.current(lat, lng);
      });

      mapRef.current = map;

      // Ensure tiles render even if container size resolved after mount
      setTimeout(() => map.invalidateSize(), 100);

      props.onReady();

      return () => {
        map.remove();
        mapRef.current = null;
        markersRef.current = {};
        pendingMarkerRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync slot markers whenever slots or selection changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Remove old markers
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};

      (props.slots || []).forEach((slot) => {
        const isMine = !!slot.hasMyEvent;
        const isSel = slot.id === props.selectedSlotId;

        const marker = L.marker([slot.geoLat, slot.geoLng], {
          icon: makeIcon(slot.eventCount || 0, isMine, isSel),
        }).addTo(map);

        marker.bindTooltip(
          `<b>${escHtml(slot.locationName)}</b><br><small>${escHtml(slot.timeMarker)}</small><br>${slot.eventCount || 0} мнени${slot.eventCount === 1 ? "е" : "й"}`,
          { className: "tn-tip", direction: "top" }
        );

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSlotClickRef.current(slot.id);
        });

        markersRef.current[slot.id] = marker;

        if (isSel) {
          map.setView([slot.geoLat, slot.geoLng], 13, { animate: true });
          setTimeout(() => marker.openTooltip(), 200);
        }
      });
    }, [props.slots, props.selectedSlotId, props.myId]);

    // Show/hide pending drop marker when user taps empty map area
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.remove();
        pendingMarkerRef.current = null;
      }

      if (props.pendingLat != null && props.pendingLng != null) {
        const marker = L.marker([props.pendingLat, props.pendingLng], {
          icon: makePendingIcon(),
          zIndexOffset: 1000,
        }).addTo(map);
        pendingMarkerRef.current = marker;
        const z = map.getZoom();
        map.setView([props.pendingLat, props.pendingLng], z < 8 ? 8 : z, { animate: true });
      }
    }, [props.pendingLat, props.pendingLng]);

    return (
      <View
        ref={containerRef}
        style={[{ flex: 1, minHeight: 200 }, props.style as object]}
      />
    );
  }
);

ChronopediaMap.displayName = "ChronopediaMap";

export default ChronopediaMap;
