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
  onSlotClick: (slotId: number) => void;
  onMapClick: (lat: number, lng: number) => void;
  onReady: () => void;
  style?: object;
}

// ── Leaflet HTML (dark theme, CartoDB tiles) ──────────────────────────────────

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body,#map{width:100%;height:100%;background:#0f172a;}
.leaflet-control-attribution,.leaflet-control-zoom{display:none;}
.tn-tip{background:#1e293b!important;color:#f1f5f9!important;border:1px solid #334155!important;font-size:12px!important;padding:6px 10px!important;border-radius:8px!important;white-space:nowrap!important;box-shadow:0 4px 16px rgba(0,0,0,0.6)!important;}
.tn-tip::before{display:none!important;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{center:[20,10],zoom:2,zoomControl:false,attributionControl:false,worldCopyJump:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var markers={};
var selectedSlotId=null;
var pendingMarker=null;
function send(d){var m=JSON.stringify(d);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(m);}else{try{window.parent.postMessage(m,'*');}catch(e){}}}
function makePendingIcon(){
  return L.divIcon({className:'',html:'<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;"><div style="width:22px;height:22px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(245,158,11,0.35),0 3px 14px rgba(0,0,0,0.7);"></div></div>',iconSize:[44,44],iconAnchor:[22,22]});
}
function makeIcon(count,isMine,isSelected){
  var bg=isSelected?'#f59e0b':isMine?'#00ff87':'#60a5fa';
  var label=count>1?String(count):'●';
  return L.divIcon({className:'',html:'<div style="width:36px;height:36px;background:'+bg+';border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#111;box-shadow:0 3px 12px rgba(0,0,0,0.7);cursor:pointer;">'+label+'</div>',iconSize:[36,36],iconAnchor:[18,18]});
}
function escHtml(s){return String(s||'').replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]||c;});}
function updateMarkers(slots,myId,selId){
  selectedSlotId=(selId!==undefined)?selId:selectedSlotId;
  Object.values(markers).forEach(function(m){m.remove();});
  markers={};
  (slots||[]).forEach(function(s){
    var isMine=!!s.hasMyEvent;
    var isSel=s.id===selectedSlotId;
    var m=L.marker([s.geoLat,s.geoLng],{icon:makeIcon(s.eventCount||0,isMine,isSel)}).addTo(map);
    m.bindTooltip('<b>'+escHtml(s.locationName)+'</b><br><small>'+escHtml(s.timeMarker)+'</small><br>'+(s.eventCount||0)+' мнени'+(s.eventCount===1?'е':'й'),{className:'tn-tip',direction:'top'});
    m.on('click',function(){send({type:'slotClick',slotId:s.id});});
    markers[s.id]=m;
    if(isSel){map.setView([s.geoLat,s.geoLng],13,{animate:true});setTimeout(function(){m.openTooltip();},300);}
  });
}
function setPending(lat,lng){
  if(pendingMarker){pendingMarker.remove();pendingMarker=null;}
  if(lat==null||lng==null){return;}
  pendingMarker=L.marker([lat,lng],{icon:makePendingIcon(),zIndexOffset:1000}).addTo(map);
  var z=map.getZoom();
  map.setView([lat,lng],z<8?8:z,{animate:true});
}
function centerOn(lat,lng,z){map.setView([lat,lng],z||12,{animate:true});}
function clearSelection(){selectedSlotId=null;}
function normLng(v){return(((v%360)+540)%360)-180;}
map.on('click',function(e){send({type:'mapClick',lat:parseFloat(e.latlng.lat.toFixed(6)),lng:parseFloat(normLng(e.latlng.lng).toFixed(6))});});
window.updateMarkers=updateMarkers;
window.setPending=setPending;
window.centerOn=centerOn;
window.clearSelection=clearSelection;
setTimeout(function(){send({type:'ready'});},400);
</script>
</body>
</html>`;

// ── Component ─────────────────────────────────────────────────────────────────

const ChronopediaMap = forwardRef<ChronopediaMapHandle, ChronopediaMapProps>(
  (props, ref) => {
    const { slots, myId, selectedSlotId, pendingLat, pendingLng, onSlotClick, onMapClick, onReady, style } = props;

    const webViewRef = useRef<WebView>(null);
    const [mapReady, setMapReady] = useState(false);

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

    const handleMessage = useCallback(
      (e: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(e.nativeEvent.data) as {
            type: string;
            slotId?: number;
            lat?: number;
            lng?: number;
          };
          if (msg.type === "ready") {
            setMapReady(true);
            onReady();
          } else if (msg.type === "slotClick") {
            onSlotClick(msg.slotId!);
          } else if (msg.type === "mapClick") {
            onMapClick(msg.lat!, msg.lng!);
          }
        } catch { /* ignore */ }
      },
      [onReady, onSlotClick, onMapClick]
    );

    return (
      <View style={[styles.container, style as object]}>
        <WebView
          ref={webViewRef}
          source={{ html: LEAFLET_HTML, baseUrl: "https://unpkg.com" }}
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
            <Text style={styles.loadingText}>Загрузка карты…</Text>
          </View>
        )}
      </View>
    );
  }
);

ChronopediaMap.displayName = "ChronopediaMap";

const styles = StyleSheet.create({
  container: { flex: 1, position: "relative" },
  webView: { flex: 1, backgroundColor: "#0f172a" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13, color: "#64748b" },
});

export default ChronopediaMap;
