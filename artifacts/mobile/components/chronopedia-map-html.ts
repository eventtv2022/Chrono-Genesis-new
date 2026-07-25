// Leaflet map HTML — shared between native WebView and web iframe renderers.
// Native: injected via source={{ html: makeLeafletHTML(lang) }} into react-native-webview.
// Web: mounted as a srcdoc iframe via ChronopediaMap.web.tsx.
//
// Communication protocol:
//   OUT (map → host):  window.parent.postMessage / ReactNativeWebView.postMessage
//                      { type: 'ready' | 'slotClick' | 'mapClick', ... }
//   IN  (host → map):  injectJavaScript (native) OR iframe.contentWindow.postMessage
//                      { fn: string, args: unknown[] }  →  window[fn].apply(null, args)
//
// Language support:
//   The tile layer uses Google Maps `hl=` parameter for map label language.
//   Call setLang(langCode) at runtime to switch language without reloading the map.
//   The eventsLabel in marker tooltips is also updated via the inline EVENTS_LABELS map.

// "events" word in each of the 27 supported languages — used in marker tooltips.
const EVENTS_LABELS: Record<string, string> = {
  ru: "событий",
  en: "events",
  zh: "事件",
  hi: "घटनाएँ",
  es: "eventos",
  fr: "événements",
  ar: "أحداث",
  bn: "ঘটনা",
  pt: "eventos",
  ur: "واقعات",
  id: "acara",
  de: "Ereignisse",
  ja: "件",
  tr: "etkinlik",
  vi: "sự kiện",
  he: "אירועים",
  fa: "رویداد",
  ko: "건",
  it: "eventi",
  pl: "wydarzeń",
  uk: "подій",
  nl: "evenementen",
  kk: "оқиға",
  uz: "hodisa",
  el: "εκδηλώσεις",
  cs: "událostí",
  sv: "händelser",
};

/** Google Maps tile `hl=` codes — most match our codes; zh needs zh-CN. */
function toGoogleHl(lang: string): string {
  if (lang === "zh") return "zh-CN";
  return lang;
}

/**
 * Generate the full Leaflet HTML with the tile layer pre-set to `lang`.
 * Bake `lang` into the initial HTML so the map labels are correct on first load.
 * Call `setLang(newLang)` (via injectJavaScript / postMessage) for subsequent changes.
 */
export function makeLeafletHTML(lang: string): string {
  const hl = toGoogleHl(lang);
  const labelsJson = JSON.stringify(EVENTS_LABELS);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body,#map{width:100%;height:100%;background:#f5f5f5;}
.leaflet-control-attribution,.leaflet-control-zoom{display:none;}
.tn-tip{background:#fff!important;color:#111827!important;border:1px solid #d1d5db!important;font-size:12px!important;padding:6px 10px!important;border-radius:8px!important;white-space:nowrap!important;box-shadow:0 4px 16px rgba(0,0,0,0.15)!important;}
.tn-tip::before{display:none!important;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var EVENTS_LABELS=${labelsJson};
var currentLang='${lang}';
var currentEventsLabel=EVENTS_LABELS['${lang}']||'events';
var tileLayer=null;
var lastSlots=[],lastMyId=0,lastSelId=null;

var map=L.map('map',{center:[20,10],zoom:2,zoomControl:false,attributionControl:false,worldCopyJump:true});

function buildTileUrl(hl){return'https://mt1.google.com/vt/lyrs=m&hl='+hl+'&x={x}&y={y}&z={z}';}

function applyTileLayer(hl){
  if(tileLayer){map.removeLayer(tileLayer);}
  tileLayer=L.tileLayer(buildTileUrl(hl),{maxZoom:20,attribution:'&copy; Google Maps'});
  tileLayer.addTo(map);
}

function setLang(l){
  currentLang=l;
  currentEventsLabel=EVENTS_LABELS[l]||'events';
  var hl=l==='zh'?'zh-CN':l;
  applyTileLayer(hl);
  // Re-render markers so tooltip eventsLabel is updated immediately
  if(lastSlots.length){updateMarkers(lastSlots,lastMyId,lastSelId);}
}

// Initialise tile layer with baked-in language
applyTileLayer('${hl}');

var markers={};
var selectedSlotId=null;
var pendingMarker=null;
function send(d){var m=JSON.stringify(d);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(m);}else{try{window.parent.postMessage(m,'*');}catch(e){}}}
function makePendingIcon(){
  return L.divIcon({className:'',html:'<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;"><div style="width:22px;height:22px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(245,158,11,0.35),0 3px 14px rgba(0,0,0,0.7);"></div></div>',iconSize:[44,44],iconAnchor:[22,22]});
}
function makeIcon(count,isMine,isSelected){
  var bg=isSelected?'#f59e0b':isMine?'#16a34a':'#2563eb';
  var border=isSelected?'#92400e':isMine?'#14532d':'#1e3a8a';
  var label=count>1?String(count):'\u25cf';
  return L.divIcon({className:'',html:'<div style="width:36px;height:36px;background:'+bg+';border:3px solid '+border+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer;">'+label+'</div>',iconSize:[36,36],iconAnchor:[18,18]});
}
function escHtml(s){return String(s||'').replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]||c;});}
function updateMarkers(slots,myId,selId){
  // Persist for re-use by setLang
  lastSlots=slots||[];lastMyId=myId||0;lastSelId=(selId!==undefined)?selId:lastSelId;
  selectedSlotId=(selId!==undefined)?selId:selectedSlotId;
  Object.values(markers).forEach(function(m){m.remove();});
  markers={};
  lastSlots.forEach(function(s){
    // Skip null-island (0,0) — coordinates were not geocoded
    if(!s.geoLat&&!s.geoLng){return;}
    if(s.geoLat===0&&s.geoLng===0){return;}
    var isMine=!!s.hasMyEvent;
    var isSel=s.id===selectedSlotId;
    var m=L.marker([s.geoLat,s.geoLng],{icon:makeIcon(s.eventCount||0,isMine,isSel)}).addTo(map);
    m.bindTooltip('<b>'+escHtml(s.locationName)+'</b><br><small>'+escHtml(s.timeMarker)+'</small><br>'+(s.eventCount||0)+' '+escHtml(currentEventsLabel),{className:'tn-tip',direction:'top'});
    m.on('click',function(){send({type:'slotClick',slotId:s.id});});
    markers[s.id]=m;
    if(isSel){map.setView([s.geoLat,s.geoLng],13,{animate:true});setTimeout(function(){m.openTooltip();},300);}
  });
}
function normLng(v){return(((v%360)+540)%360)-180;}
function setPending(lat,lng){
  if(pendingMarker){pendingMarker.remove();pendingMarker=null;}
  if(lat==null||lng==null){return;}
  pendingMarker=L.marker([lat,lng],{icon:makePendingIcon(),zIndexOffset:1000}).addTo(map);
  var z=map.getZoom();
  map.setView([lat,lng],z<8?8:z,{animate:true});
}
function centerOn(lat,lng,z){map.setView([lat,lng],z||12,{animate:true});}
function clearSelection(){selectedSlotId=null;lastSelId=null;}
map.on('click',function(e){send({type:'mapClick',lat:parseFloat(e.latlng.lat.toFixed(6)),lng:parseFloat(normLng(e.latlng.lng).toFixed(6))});});
window.updateMarkers=updateMarkers;
window.setPending=setPending;
window.centerOn=centerOn;
window.clearSelection=clearSelection;
window.setLang=setLang;
// Receive commands from parent iframe (web environment: host → iframe via postMessage)
window.addEventListener('message',function(e){
  try{
    var cmd=JSON.parse(typeof e.data==='string'?e.data:JSON.stringify(e.data));
    if(cmd&&cmd.fn&&typeof window[cmd.fn]==='function'){window[cmd.fn].apply(null,cmd.args||[]);}
  }catch(x){}
});
setTimeout(function(){send({type:'ready'});},400);
window.onerror=function(msg,src,line,col,err){send({type:'jsError',message:String(msg),source:String(src),line:line,col:col,stack:err?String(err.stack):''}); return true;};
</script>
</body>
</html>`;
}

/** Backward-compat default (English). Use makeLeafletHTML(lang) for language-aware maps. */
export const LEAFLET_HTML = makeLeafletHTML("en");
