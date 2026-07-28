import { useState, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Radar, LocateFixed, Search, ChevronLeft, Layers, Activity, AlertTriangle, TrendingUp } from "lucide-react";
import { CategoryIcon, CATEGORY_COLORS, MAP_LEGEND_ITEMS, createServiceMarker, createUserLocationMarker } from "./components/serviceVisuals";
import { ChatbotWidget } from "./chatbot/ChatbotWidget.jsx";
import { FlyerPreview } from "./flyer/FlyerPreview";
import { FlyerViewModel } from "./flyer/flyerData";
import { loadDashboardData, serviceMatchesSearch } from "./lib/dashboardAdapter.js";
import { logFlyerDownload, logPageEvent, logServiceImpressions } from "./lib/analytics.js";
import { haversineKm } from "./lib/supabaseData.js";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const MONO_FONT = "ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,monospace";
// Visually enlarges the on-page flyer preview only. It measures the
// preview's natural (unscaled) height, then applies a CSS `transform:
// scale()` to an inner wrapper — transform never changes layout box size
// (offsetWidth/offsetHeight), so the FLYER_PREVIEW_ELEMENT_ID node that the
// PDF exporter grabs is still captured at its original, unscaled
// dimensions. The outer wrapper is sized to the *scaled* height so it
// still reserves the right amount of space in the flex layout below it.
function ScaledFlyerPreview({ flyer, scale = 1.16 }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [size, setSize] = useState(null); // natural (unscaled) size of the flyer
  const [containerWidth, setContainerWidth] = useState(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flyer]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Never let the scaled flyer overflow the width actually available on
  // screen — this matters most on narrow/mobile viewports, where the full
  // desired `scale` would push the flyer past the edges and get clipped.
  // Cap the effective scale at whatever ratio still fits the container.
  const effectiveScale = size && containerWidth
    ? Math.min(scale, containerWidth / size.w)
    : scale;

  return (
    <div data-testid="flyer-preview-shell" ref={outerRef} style={{ width:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", height: size ? size.h*effectiveScale : "auto", overflow:"hidden" }}>
      <div ref={innerRef} style={{ transform:`scale(${effectiveScale})`, transformOrigin:"top center", width: size ? size.w : "auto", flexShrink:0 }}>
        <FlyerPreview flyer={flyer}/>
      </div>
    </div>
  );
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 1 }); }, [center]);
  return null;
}

// Tolerates minor spelling/accent differences between borough_name as
// stored on services_master vs. on gap_score.
function boroughNamesMatch(a, b) {
  const norm = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Fits the map view to whichever points it's given — used so the "Service
// locations" panel always frames the selected area's pins instead of a
// fixed zoom that breaks once it's filtered down to a handful of points.
function FitBoundsToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = (points || []).filter(p => p && p[0] != null && p[1] != null && !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
    if (valid.length === 0) return;
    if (valid.length === 1) { map.setView(valid[0], 14); return; }
    map.fitBounds(L.latLngBounds(valid), { padding: [30,30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

const SERVICES = [
  { id:1, name:"Accueil Bonneau", type:"Shelter", dist:"0.4 km", hours:"Open 24h", address:"2050 Rue Bleury, Montréal", phone:"514-866-7222", tags:["Walk-in OK","Free","Wheelchair access","Indigenous services"], langs:["EN","FR","Inuktitut"], group:["Indigenous"], category:"Shelter", gender:"Male", lat:45.5089, lng:-73.5617 },
  { id:2, name:"Maison du Pain", type:"Food bank", dist:"0.9 km", hours:"Mon–Fri 10am–2pm", address:"1420 Rue Beaudry, Montréal", phone:"514-524-3661", tags:["Free"], langs:["EN","FR","Spanish"], group:["Immigrant"], category:"Food", gender:"All", lat:45.5195, lng:-73.5529 },
  { id:3, name:"CLSC des Faubourgs", type:"Clinic", dist:"1.2 km", hours:"Open until 5pm", address:"1705 Rue de la Visitation, Montréal", phone:"514-527-2361", tags:["Walk-in OK"], langs:["EN","FR"], group:["Indigenous","Immigrant"], category:"Medical", gender:"All", lat:45.5210, lng:-73.5480 },
  { id:4, name:"Resilience Montreal", type:"Shelter", dist:"1.3 km", hours:"Open 24h", address:"1600 Rue Notre-Dame O, Montréal", phone:"514-937-2788", tags:["Walk-in OK","Free","Indigenous services"], langs:["EN","FR","Inuktitut"], group:["Indigenous"], category:"Shelter", gender:"All", lat:45.4955, lng:-73.5602 },
  { id:5, name:"PRAIDA", type:"Legal aid", dist:"1.5 km", hours:"Mon–Fri 9am–4pm", address:"1001 Boul de Maisonneuve E", phone:"514-873-5880", tags:["Free","By appt"], langs:["EN","FR","Arabic","Spanish"], group:["Immigrant"], category:"Legal", gender:"All", lat:45.5230, lng:-73.5610 },
  { id:6, name:"Chez Doris", type:"Shelter", dist:"1.6 km", hours:"Mon–Fri 8am–4pm", address:"1430 Rue Chomedey, Montréal", phone:"514-937-2341", tags:["Walk-in OK","Free","Women only"], langs:["EN","FR"], group:["Indigenous","Immigrant"], category:"Shelter", gender:"Female", lat:45.4940, lng:-73.5710 },
  { id:7, name:"YMCA Newcomers", type:"Translation", dist:"1.8 km", hours:"Mon–Fri 8:30am–5pm", address:"1440 Rue Stanley, Montréal", phone:"514-849-8393", tags:["Free"], langs:["EN","FR","Spanish","Arabic","Mandarin"], group:["Immigrant"], category:"Translation", gender:"All", lat:45.5010, lng:-73.5720 },
];

const CATEGORIES = [
  { label:"Shelter", color:CATEGORY_COLORS.Shelter, bg:"#FEF2F2" },
  { label:"Food", color:CATEGORY_COLORS.Food, bg:"#FFFBEB" },
  { label:"Medical", color:CATEGORY_COLORS.Medical, bg:"#EEF2FF" },
  { label:"Legal", color:CATEGORY_COLORS.Legal, bg:"#ECFDF5" },
  { label:"Translation", color:CATEGORY_COLORS.Translation, bg:"#F5F3FF" },
];

const AGE_RANGES = ["Under 25","25–44","45–64","65+"];
const GENDER_OPTS = [{val:"Male",label:"Male",icon:"♂"},{val:"Female",label:"Female",icon:"♀"},{val:"All",label:"All",icon:"⚥"}];
const GENDER_LABELS_FR = { Male:"Homme", Female:"Femme", All:"Tous" };
const GROUP_LABELS_FR = { Indigenous:"Autochtone", Immigrant:"Immigrant" };
// The 5 quick-filter category chips are a fixed set we control (unlike the
// ~20 free-text "Other" values from the DB), so these can be translated.
const CATEGORY_LABELS_FR = { Shelter:"Hébergement", Food:"Nourriture", Medical:"Médical", Legal:"Juridique", Translation:"Traduction", Other:"Autre" };
function categoryLabel(label, isEN) { return isEN ? label : (CATEGORY_LABELS_FR[label] || label); }

const BACKEND = "http://localhost:8000";
async function logEvent(type, detail, meta={}) {
  try { await fetch(`${BACKEND}/log/event`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event_type:type,detail:String(detail||""),user_group:meta.group||null,user_age_range:meta.age||null})}); }
  catch(e) { console.log("📊",type,detail); }
  // Real analytics: write a row to the passive-events table in Supabase.
  logPageEvent({
    eventType: type,
    detail,
    location: meta.location,
    selectedAreaId: meta.selectedAreaId,
    service: meta.service,
    category: meta.category,
    sourceView: meta.sourceView,
  });
}
async function logFlyer(service, filters, meta={}) {
  try { await fetch(`${BACKEND}/log/flyer`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_name:service.name,service_type:service.type,service_category:service.category,group_filter:filters.group||null,gender_filter:filters.gender||null,user_group:meta.group||null,user_age_range:meta.age||null,location:filters.location||null})}); }
  catch(e) { console.log("📊 flyer",service.name); }
  // Real analytics: write a row to Supabase so the team can see which
  // filters social workers had active when they downloaded a flyer.
  logFlyerDownload({
    service,
    filters,
    location: filters.locationObj,
    language: filters.language,
    selectedAreaId: service?.areaId || meta.selectedAreaId,
    category: service?.category,
    sourceView: "flyer_download",
  });
}

// The underlying data (service descriptions, gap_drivers, etc.) only exists
// in English in the DB — this flags that clearly instead of silently
// showing English text under French labels.
function EnglishOnlyNote({ isEN }) {
  if (isEN) return null;
  return (
    <div style={{fontSize:11,fontStyle:"italic",color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:6,padding:"5px 9px",marginBottom:8,display:"inline-block"}}>
      Version anglaise seulement — traduction française à venir. (English version only — French translation coming soon.)
    </div>
  );
}

function Chip({ active, color, bg, border, onClick, children }) {
  return (
    <button onClick={onClick} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${active?border:"#E2E8F0"}`,background:active?bg:"#fff",color:active?color:"#334155",fontWeight:active?600:400,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4}}>
      {children}
    </button>
  );
}

// Checkbox-based multi-select dropdown — used for the real ~20 category
// values, which are too many to lay out as a row of chips. Includes a
// search box once there are enough options that scrolling alone gets tedious.
function MultiSelectDropdown({ label, options, selected, onChange, isEN=true, dataIsEnglishOnly=false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const toggleVal = (val) => onChange(selected.includes(val) ? selected.filter(v=>v!==val) : [...selected, val]);
  const active = selected.length > 0;
  const visibleOptions = query ? options.filter(o=>o.toLowerCase().includes(query.toLowerCase())) : options;
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${active?"#2563EB":"#E2E8F0"}`,background:active?"#EFF6FF":"#fff",color:active?"#2563EB":"#334155",fontWeight:active?600:400,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
        {label}{active?` (${selected.length})`:""} <span style={{fontSize:10}}>▾</span>
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,boxShadow:"0 8px 24px rgba(15,23,42,0.12)",padding:8,minWidth:230,maxWidth:"min(320px, 90vw)",zIndex:3000}}>
          {!isEN && dataIsEnglishOnly && (
            <div style={{fontSize:10,fontStyle:"italic",color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:5,padding:"4px 7px",marginBottom:6}}>
              Anglais seulement / English only
            </div>
          )}
          {options.length>8 && (
            <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder={isEN?"Search…":"Rechercher…"}
              style={{width:"100%",boxSizing:"border-box",padding:"6px 8px",marginBottom:6,border:"1px solid #E2E8F0",borderRadius:6,fontSize:13,outline:"none"}}/>
          )}
          <div style={{maxHeight:260,overflowY:"auto"}}>
            {visibleOptions.length===0 && <div style={{fontSize:12,color:"#475569",padding:6}}>—</div>}
            {visibleOptions.map(opt=>(
              <label key={opt} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 6px",fontSize:13,cursor:"pointer",borderRadius:6,color:"#334155"}}
                onMouseOver={e=>e.currentTarget.style.background="#F8FAFC"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                <input type="checkbox" checked={selected.includes(opt)} onChange={()=>toggleVal(opt)}/>
                {opt}
              </label>
            ))}
          </div>
          {active && (
            <button onClick={()=>onChange([])}
              style={{marginTop:6,width:"100%",padding:"6px",fontSize:12,color:"#475569",background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:6,cursor:"pointer"}}>
              {isEN?"Clear":"Effacer"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LocationBadge({ location, onChange, changeLabel="change" }) {
  if (!location) return null;

  return (
    <div style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.1)",padding:"4px 10px",borderRadius:6,display:"flex",alignItems:"center",gap:5}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:"#059669",display:"inline-block",flexShrink:0}}/>
      <span style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{location.name}</span>
      <button
        type="button"
        onClick={onChange}
        aria-label={`Change distribution location from ${location.name}`}
        style={{background:"none",border:"none",color:"#60A5FA",cursor:"pointer",fontSize:11,padding:"0 2px",fontWeight:600}}
      >
        {changeLabel}
      </button>
    </div>
  );
}

// V2 Planner View 
const BOROUGH_SCORES = {
  "Mercier-Hochelaga-Maisonneuve": { score:0.81, income:0.78, housing:0.64, immigration:0.52 },
  "Villeray-Saint-Michel-Parc-Extension": { score:0.77, income:0.74, housing:0.61, immigration:0.68 },
  "Montréal-Nord": { score:0.74, income:0.71, housing:0.58, immigration:0.62 },
  "Côte-des-Neiges--Notre-Dame-de-Grâce": { score:0.69, income:0.65, housing:0.55, immigration:0.71 },
  "Verdun--Ile-des-Soeurs": { score:0.65, income:0.58, housing:0.52, immigration:0.38 },
  "Saint-Laurent": { score:0.52, income:0.48, housing:0.44, immigration:0.59 },
  "Ahuntsic-Cartierville": { score:0.48, income:0.45, housing:0.41, immigration:0.52 },
  "Rosemont--La-Petite-Patrie": { score:0.45, income:0.42, housing:0.48, immigration:0.31 },
  "Sud-Ouest": { score:0.43, income:0.41, housing:0.46, immigration:0.29 },
  "Plateau-Mont-Royal": { score:0.36, income:0.32, housing:0.44, immigration:0.27 },
  "Ville-Marie": { score:0.34, income:0.38, housing:0.41, immigration:0.33 },
  "Anjou": { score:0.30, income:0.28, housing:0.31, immigration:0.35 },
  "LaSalle": { score:0.28, income:0.26, housing:0.29, immigration:0.32 },
  "Outremont": { score:0.16, income:0.14, housing:0.22, immigration:0.19 },
};

function scoreToColor(score) {
  if (!score) return "#E2E8F0";
  if (score >= 0.75) return "#9F1239";
  if (score >= 0.60) return "#E11D48";
  if (score >= 0.45) return "#FB7185";
  if (score >= 0.30) return "#FDA4AF";
  return "#FFE4E6";
}

function priorityFlagStyle(flag) {
  const f = (flag || "").toLowerCase();
  if (f.includes("high")) return { color:"#9F1239", background:"#FFF1F2", border:"1px solid #FECDD3" };
  if (f.includes("med")) return { color:"#B45309", background:"#FFFBEB", border:"1px solid #FDE68A" };
  if (f.includes("low")) return { color:"#065F46", background:"#ECFDF5", border:"1px solid #A7F3D0" };
  return { color:"#334155", background:"#F1F5F9", border:"1px solid #E2E8F0" };
}

const BOUNDARY_SCORE_ALIASES = {
  "Montreal-Nord": "Montréal-Nord",
  "Cote-des-Neiges-Notre-Dame-de-Grace": "Côte-des-Neiges--Notre-Dame-de-Grâce",
  "Verdun": "Verdun--Ile-des-Soeurs",
  "Le Sud-Ouest": "Sud-Ouest",
  "Le Plateau-Mont-Royal": "Plateau-Mont-Royal",
};

function boundaryScoreKey(feature, boroughScores) {
  const boroughName = feature.properties?.borough_name || "";
  const alias = BOUNDARY_SCORE_ALIASES[boroughName];
  return [boroughName, alias].find(name => name && boroughScores[name]) || alias || boroughName || null;
}

function ChoroplethMap({ selectedBorough, selectedAreaId, onSelect, boroughScores, areas=[], isEN=true }) {
  const [geojson, setGeojson] = useState(null);
  const [mapStatus, setMapStatus] = useState("loading");
  const mapRef = useRef(null);
  const areaById = new Map(areas.map(a => [a.id, a]));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/geo/areas.geojson", { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`Boundary request failed: ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!Array.isArray(data.features) || data.features.length === 0) {
          throw new Error("Boundary artifact has no features");
        }
        setGeojson(data);
        setMapStatus("ready");
      })
      .catch(error => {
        if (error.name !== "AbortError") {
          console.error("Unable to load local area boundaries", error);
          setGeojson(null);
          setMapStatus("error");
        }
      });
    return () => controller.abort();
  }, []);

  // Prefer this exact area's own gap_score (same number the Area profile
  // card shows) — only fall back to the borough-level relative average for
  // polygons whose area_id isn't in the loaded areas array yet.
  const scoreForFeature = (feature) => {
    const areaId = feature.properties?.area_id || "";
    const areaMatch = areaId ? areaById.get(areaId) : null;
    if (areaMatch?.gapScore != null) return areaMatch.gapScore;
    const name = boundaryScoreKey(feature, boroughScores);
    return name ? boroughScores[name]?.score : null;
  };

  const onEachFeature = (feature, layer) => {
    const name = boundaryScoreKey(feature, boroughScores);
    const label = feature.properties?.area_name || feature.properties?.borough_name || "";
    const boroughLabel = feature.properties?.borough_name || "";
    const areaId = feature.properties?.area_id || "";
    const score = scoreForFeature(feature);
    const isSelected = selectedAreaId ? areaId === selectedAreaId : name === selectedBorough;
    layer.setStyle({
      fillColor: scoreToColor(score),
      fillOpacity: 0.8,
      color: isSelected ? "#0F172A" : "#fff",
      weight: isSelected ? 2.5 : 1,
    });
    layer.on({
      click: () => {
        if (name && areaId) onSelect({ scoreKey: name, areaId, areaName: label });
      },
      mouseover: (e) => { e.target.setStyle({ fillOpacity: 1 }); },
      mouseout: (e) => { e.target.setStyle({ fillOpacity: 0.8 }); },
    });
    if (label) {
      layer.bindTooltip(
        `<b>${label}</b><br/>${boroughLabel}${areaId ? ` · ${areaId}` : ""}${score != null ? `<br/>Gap Score: <b>${score.toFixed(2)}</b>` : ""}`,
        { sticky: true }
      );
    }
  };

  const style = (feature) => {
    const name = boundaryScoreKey(feature, boroughScores);
    const areaId = feature.properties?.area_id || "";
    const isSelected = selectedAreaId ? areaId === selectedAreaId : name === selectedBorough;
    return {
      fillColor: scoreToColor(scoreForFeature(feature)),
      fillOpacity: 0.8,
      color: isSelected ? "#0F172A" : "#fff",
      weight: isSelected ? 2.5 : 1,
    };
  };

  return (
    <div data-testid="planner-boundary-map" style={{height:"100%",width:"100%",position:"relative",zIndex:0}}>
      <MapContainer center={[45.53,-73.65]} zoom={11} style={{height:"100%",width:"100%"}} zoomControl={true}>
        <TileLayer attribution='© CartoDB · Boundaries © Ville de Montréal, CC BY 4.0' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" opacity={0.3}/>
        {geojson && (
          <GeoJSON key={`${selectedBorough}:${selectedAreaId || "ranked"}`} data={geojson} style={style} onEachFeature={onEachFeature}/>
        )}
        {mapStatus === "loading" && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,background:"rgba(255,255,255,0.7)",fontSize:13,color:"#475569"}}>
            {isEN?"Loading map…":"Chargement de la carte…"}
          </div>
        )}
        {mapStatus === "error" && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,background:"rgba(255,255,255,0.9)",fontSize:13,color:"#9F1239"}}>
            {isEN?"Boundary map unavailable":"Carte des limites indisponible"}
          </div>
        )}
      </MapContainer>
    </div>
  );
}

function DataSourceNotice({ sourceStatus, warnings = [], onRetry, isEN }) {
  if (sourceStatus === "supabase" || sourceStatus === "loading") return null;
  return (
    <div data-testid="data-source-notice" role="status" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 16px",background:"#FFFBEB",borderBottom:"1px solid #FDE68A",color:"#92400E",fontSize:12}}>
      <span>
        {isEN
          ? "Live data is unavailable. Clearly labeled demonstration data is being shown."
          : "Les données en direct sont indisponibles. Des données de démonstration clairement identifiées sont affichées."}
        {warnings[0] ? ` ${warnings[0]}` : ""}
      </span>
      <button type="button" data-testid="retry-live-data" onClick={onRetry} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #D97706",background:"#fff",color:"#92400E",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
        {isEN ? "Retry" : "Réessayer"}
      </button>
    </div>
  );
}

function dataSourceLabel(sourceStatus, isEN) {
  if (sourceStatus === "supabase") return "Supabase";
  if (sourceStatus === "loading") return isEN ? "Loading…" : "Chargement…";
  return isEN ? "Demo data" : "Données démo";
}

function PlannerView({ lang, setLang, onSwitch, onExit, location, onChangeLocation, services, categories, boroughScores, areas=[], sourceStatus, warnings=[], onRetry }) {
  const [selectedBorough, setSelectedBorough] = useState("Mercier-Hochelaga-Maisonneuve");
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [selectedAreaLabel, setSelectedAreaLabel] = useState("Mercier-Hochelaga-Maisonneuve");
  const boroughEntries = Object.entries(boroughScores);
  useEffect(() => {
    if (boroughEntries.length > 0 && !boroughScores[selectedBorough]) {
      setSelectedBorough(boroughEntries[0][0]);
      setSelectedAreaId(null);
      setSelectedAreaLabel(boroughEntries[0][0]);
    }
  }, [boroughScores, selectedBorough]);
  // If real areas are loaded, default the selection to the highest gap_score area
  useEffect(() => {
    if (areas.length > 0 && (!selectedAreaId || !areas.some(a=>a.id===selectedAreaId))) {
      const top = areas[0]; // areas is already sorted by gapScore desc
      setSelectedBorough(top.borough);
      setSelectedAreaId(top.id);
      setSelectedAreaLabel(top.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas]);

  // Area-level richness (rank, priority flag, bilingual summary, key
  // drivers) for whichever area is currently selected — falls back to just
  // the borough-level 3-metric breakdown below if no matching area row.
  const selectedAreaData = areas.find(a => a.id === selectedAreaId) || null;

  const priorities = areas.length > 0
    ? areas.slice(0,5)
    : boroughEntries
        .sort((a,b)=>b[1].score-a[1].score)
        .slice(0,5)
        .map(([name,d])=>({ id:name, name: name.length>18?name.slice(0,16)+"…":name, borough:name, gapScore:d.score }));
  const areaData = boroughScores[selectedBorough] || { score:0, income:0, housing:0, immigration:0 };
  const isEN = lang==="EN";
  const selectMapArea = ({ scoreKey, areaId, areaName }) => {
    setSelectedBorough(scoreKey);
    setSelectedAreaId(areaId);
    setSelectedAreaLabel(areaName);
  };
  const selectRankedBorough = (boroughName) => {
    setSelectedBorough(boroughName);
    setSelectedAreaId(null);
    setSelectedAreaLabel(boroughName);
  };
  // Real KPI numbers derived from the areas array (falls back to the old
  // static placeholders only if no real area rows have loaded yet)
  const validGapScores = areas.map(a=>a.gapScore).filter(s=>s!=null);
  const avgGapScore = validGapScores.length ? (validGapScores.reduce((a,b)=>a+b,0)/validGapScores.length) : null;
  const highPriorityCount = areas.filter(a=>(a.priorityFlag||"").toLowerCase().includes("high") || (a.gapScore!=null && a.gapScore>=0.6)).length;

  // Only show the selected area's own services on the street map, instead
  // of all of them at once (with real data that's 1000+ overlapping pins).
  // Prefer an exact area_id match (precise, e.g. Saint-Michel vs Parc
  // Extension even though they share a borough) — falls back to matching
  // the whole borough if this specific area has no services tagged with
  // its area_id yet.
  const validServices = services.filter(s=>s.lat!=null && s.lng!=null);
  const areaLevelServices = selectedAreaId ? validServices.filter(s => s.areaId === selectedAreaId) : [];
  const boroughServices = areaLevelServices.length > 0
    ? areaLevelServices
    : selectedBorough
      ? validServices.filter(s => boroughNamesMatch(s.borough, selectedBorough))
      : validServices;
  return (
    <div data-testid="planner-view" style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:"system-ui,sans-serif",fontSize:14}}>
      <div style={{background:"#0B1220",padding:"10px 20px",display:"flex",flexWrap:"wrap",rowGap:8,alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1000,borderBottom:"1px solid #1E293B"}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,rowGap:6}}>
          <Radar size={20} color="#2563EB"/>
          <div style={{fontWeight:700,fontSize:16,color:"#fff",letterSpacing:0.2}}>Community Radar</div>
          <div style={{width:1,height:16,background:"#334155",margin:"0 4px"}}/>
          <div style={{fontSize:12,color:"#60A5FA",fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>{isEN?"Planner View (V2)":"Vue Planificateur (V2)"}</div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,rowGap:6,alignItems:"center"}}>
          <span data-testid="data-source-status" style={{fontSize:11,color:sourceStatus==="supabase"?"#6EE7B7":sourceStatus==="loading"?"#93C5FD":"#FCD34D",fontWeight:600}}>
            {dataSourceLabel(sourceStatus, isEN)}
          </span>
          <div style={{display:"flex",background:"rgba(255,255,255,0.08)",borderRadius:6,overflow:"hidden"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"4px 10px",border:"none",background:lang===l?"#2563EB":"transparent",color:"#fff",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:12}}>{l}</button>)}
          </div>
          <button onClick={onSwitch} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>{isEN?"Community View (V1)":"Vue Communautaire (V1)"}</button>
          <button onClick={onExit} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}><ChevronLeft size={12}/> Exit</button>
        </div>
      </div>
      <DataSourceNotice sourceStatus={sourceStatus} warnings={warnings} onRetry={onRetry} isEN={isEN}/>
      <div style={{padding:"16px 20px"}}>
        {/* KPI cards */}
        <div style={{display:"flex",flexWrap:"wrap",background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,marginBottom:16,overflow:"hidden"}}>
          {[
            { label: isEN?"Tracts analyzed":"Zones analysées", val: areas.length>0 ? String(areas.length) : "512", sub: areas.length>0 ? (isEN?`${boroughEntries.length} boroughs`:`${boroughEntries.length} arrondissements`) : (isEN?"of 512 citywide":"sur 512 dans la ville"), icon:Layers, color:"#2563EB", bg:"#EEF2FF" },
            { label: isEN?"Average gap score":"Score d'écart moyen", val: avgGapScore!=null ? avgGapScore.toFixed(2) : "0.42", sub: avgGapScore!=null ? (isEN?`across ${areas.length} areas`:`sur ${areas.length} zones`) : (isEN?"0.03 vs last quarter":"0,03 par rapport au dernier trimestre"), icon:Activity, color:"#E11D48", bg:"#FFF1F2" },
            { label: isEN?"High-priority areas":"Zones haute priorité", val: areas.length>0 ? String(highPriorityCount) : "23", sub: areas.length>0 ? {isEN?"top-ranked by gap score citywide":"les mieux classées selon le score d'écart"} : (isEN?"6 newly flagged":"6 nouvellement signalées"), icon:AlertTriangle, color:"#D97706", bg:"#FFFBEB" },
          ].map((k,i)=>(
            <div key={k.label} style={{flex:"1 1 220px",minWidth:220,padding:"14px 20px",display:"flex",gap:12,alignItems:"flex-start",borderLeft:i>0?"1px solid #E2E8F0":"none"}}>
              <div style={{width:34,height:34,borderRadius:8,background:k.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <k.icon size={18} color={k.color} strokeWidth={2.25}/>
              </div>
              <div>
                <div style={{color:"#334155",fontSize:11,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>{k.label}</div>
                <div style={{fontWeight:700,fontSize:24,color:"#0F172A",fontFamily:MONO_FONT}}>{k.val}</div>
                <div style={{fontSize:12,color:k.trend?k.color:"#475569",marginTop:2,display:"flex",alignItems:"center",gap:3}}>
                  {k.trend==="up" && <TrendingUp size={12}/>}
                  {k.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Map row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:12,marginBottom:12}}>
          {/* Real choropleth */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:600,fontSize:15}}>{isEN?"Gap Score heatmap — click a borough":"Carte de chaleur du Gap Score — cliquez un arrondissement"}</span>
              <span style={{fontSize:13,color:"#475569"}}>{isEN?"by Gap Score":"par Score d'écart"}</span>
            </div>
            <div style={{flex:1,minHeight:460}}>
              <ChoroplethMap selectedBorough={selectedBorough} selectedAreaId={selectedAreaId} onSelect={selectMapArea} boroughScores={boroughScores} areas={areas} isEN={isEN}/>
            </div>
            <div style={{padding:"10px 16px",borderTop:"1px solid #E2E8F0",display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#334155"}}>
              <span>{isEN?"Low":"Faible"}</span>
              <div style={{flex:1,height:6,borderRadius:3,background:"linear-gradient(to right,#FFE4E6,#FB7185,#E11D48,#9F1239)"}}/>
              <span>{isEN?"High":"Élevé"}</span>
            </div>
          </div>

          {/* Street map — filtered to whichever area/borough is selected */}
          <div style={{borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0",position:"relative",zIndex:0,minHeight:460}}>
            <div style={{position:"absolute",top:8,left:8,zIndex:1001,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 12px",fontSize:14,fontWeight:600,color:"#0F172A",border:"1px solid #E2E8F0",maxWidth:"70%"}}>
              {isEN?"Service locations":"Emplacements des services"}{areaLevelServices.length>0?` — ${selectedAreaLabel}`:(selectedBorough?` — ${selectedBorough}`:"")} <span style={{fontWeight:400,color:"#475569"}}>({boroughServices.length})</span>
            </div>
            <div style={{position:"absolute",top:8,right:8,zIndex:1001,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"8px 12px",border:"1px solid #E2E8F0",fontSize:12,minWidth:130}}>
              <div style={{fontWeight:600,marginBottom:5,color:"#0F172A"}}>{isEN?"Breakdown":"Répartition"}</div>
              {categories.map(c=>{
                const count = boroughServices.filter(s=>s.category===c.label).length;
                return (
                  <div key={c.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"2px 0"}}>
                    <span style={{display:"flex",alignItems:"center",gap:5,color:"#334155"}}><span style={{width:8,height:8,borderRadius:"50%",background:c.color,display:"inline-block",flexShrink:0}}/>{categoryLabel(c.label,isEN)}</span>
                    <span style={{fontWeight:600,color:"#0F172A",fontFamily:MONO_FONT}}>{count}</span>
                  </div>
                );
              })}
            </div>
            <MapContainer center={[45.5188,-73.5878]} zoom={12} style={{height:"100%",width:"100%"}} zoomControl={true}>
              <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
              <FitBoundsToPoints points={boroughServices.map(s=>[s.lat,s.lng])}/>
              {boroughServices.map(s=>(
                <Marker key={s.id} position={[s.lat,s.lng]} icon={createServiceMarker(s.category,false)} title={s.name}>
                  <Popup><div style={{fontFamily:"system-ui",minWidth:140}}><div style={{fontWeight:700,fontSize:13,color:CATEGORY_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CategoryIcon category={s.category} size={14} color={CATEGORY_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:12,color:"#475569"}}>{s.type}</div></div></Popup>
                </Marker>
              ))}
            </MapContainer>
            {boroughServices.length===0 && (
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,background:"rgba(255,255,255,0.6)",fontSize:13,color:"#475569",textAlign:"center",padding:20}}>
                {isEN?"No services matched to this borough yet.":"Aucun service associé à cet arrondissement pour l'instant."}
              </div>
            )}
            <div style={{position:"absolute",bottom:8,left:8,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 10px",border:"1px solid #E2E8F0",fontSize:12,display:"flex",gap:10,flexWrap:"wrap"}}>
              {categories.map(c=><span key={c.label} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:"50%",background:c.color,display:"inline-block"}}/>{categoryLabel(c.label,isEN)}</span>)}
            </div>
          </div>

          {/* Top priority areas — clickable */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>{isEN?"Top priority areas (by Gap Score)":"Zones prioritaires (par Score d'écart)"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
              {priorities.map((p)=>{
                const isSelected = areas.length>0 ? selectedAreaId===p.id : selectedBorough===p.borough;
                const onClick = () => areas.length>0
                  ? selectMapArea({ scoreKey:p.borough, areaId:p.id, areaName:p.name })
                  : selectRankedBorough(p.borough);
                return (
                  <button type="button" key={p.id} onClick={onClick} data-testid="priority-area"
                    style={{display:"flex",width:"100%",fontFamily:"inherit",textAlign:"left",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,cursor:"pointer",background:isSelected?"#EEF2FF":"#F1F5F9",border:`1px solid ${isSelected?"#2563EB":"#E2E8F0"}`,transition:"all 0.15s"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:isSelected?600:400,color:isSelected?"#2563EB":"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      {p.borough && p.borough!==p.name && <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.borough}</div>}
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:"#2563EB",background:"#EEF2FF",padding:"3px 8px",borderRadius:4,fontFamily:MONO_FONT,flexShrink:0,marginLeft:8}}>{p.gapScore!=null?p.gapScore.toFixed(2):"—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Area profile — updates when a borough/area is clicked */}
        <div data-testid="area-profile" style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:12}}>
            <div style={{fontWeight:600,fontSize:15}}>
              {isEN?"Area profile":"Profil de la zone"} — <span style={{color:"#2563EB"}}>{selectedAreaLabel}</span>
            </div>
            <span style={{fontSize:13,color:"#475569"}}>Gap Score: <b style={{fontFamily:MONO_FONT,color:"#0F172A"}}>{(selectedAreaData?.gapScore ?? areaData.score).toFixed(2)}</b></span>
            {selectedAreaData?.priorityFlag && (
              <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,...priorityFlagStyle(selectedAreaData.priorityFlag)}}>{selectedAreaData.priorityFlag}</span>
            )}
            {selectedAreaData?.rank!=null && (
              <span style={{fontSize:12,color:"#475569"}}>{isEN?`Rank #${selectedAreaData.rank} of ${areas.length} areas`:`Rang n°${selectedAreaData.rank} sur ${areas.length} zones`}</span>
            )}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20,marginBottom:selectedAreaData?.summaryEn||selectedAreaData?.summaryFr||selectedAreaData?.drivers?.length>0?16:0}}>
            {[
              {key:"income",label:isEN?"Low income":"Faible revenu",barValue:selectedAreaData?.income ?? areaData.income,rawPct:selectedAreaData?.incomePct ?? areaData.incomePct},
              {key:"housing",label:isEN?"Housing burden":"Charge logement",barValue:selectedAreaData?.housing ?? areaData.housing,rawPct:selectedAreaData?.housingPct ?? areaData.housingPct},
              {key:"immigration",label:isEN?"Recent immigration":"Immigration récente",barValue:selectedAreaData?.immigration ?? areaData.immigration,rawPct:selectedAreaData?.immigrationPct ?? areaData.immigrationPct},
            ].map(({key,label,barValue,rawPct})=>(
              <div key={key} data-testid={`area-profile-${key}`}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}><span>{label}</span><span style={{fontWeight:600,fontFamily:MONO_FONT}}>{Number(rawPct ?? barValue*100).toFixed(2)}%</span></div>
                <div style={{height:8,borderRadius:4,background:"#F1F5F9"}}>
                  <div style={{height:8,width:`${barValue*100}%`,borderRadius:4,background:"#2563EB",transition:"width 0.4s"}}/>
                </div>
              </div>
            ))}
          </div>

          {selectedAreaData && (selectedAreaData.summaryEn || selectedAreaData.summaryFr) && (
            <div style={{fontSize:13,color:"#312E81",lineHeight:1.5,background:"#EEF2FF",borderLeft:"3px solid #2563EB",borderRadius:6,padding:"12px 14px",marginBottom:selectedAreaData.drivers?.length>0?12:0}}>
              {isEN ? (selectedAreaData.summaryEn || selectedAreaData.summaryFr) : (selectedAreaData.summaryFr || selectedAreaData.summaryEn)}
            </div>
          )}

          {/* gap_drivers has no French column in the DB yet — shown in both
              languages, but flagged with a notice in FR mode instead of
              silently hiding it (the summary above is fully bilingual). */}
          {selectedAreaData?.drivers?.length>0 && (
            <div>
              <div style={{fontSize:11,fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>{isEN?"Key drivers":"Facteurs clés"}</div>
              <EnglishOnlyNote isEN={isEN}/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {selectedAreaData.drivers.map(d=>(
                  <span key={d} style={{padding:"4px 10px",borderRadius:20,background:"#EEF2FF",color:"#312E81",fontSize:12,fontWeight:500,border:"1px solid #BFDBFE"}}>{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <ChatbotWidget
          isEN={isEN}
          selectedAreaId={selectedAreaId}
          selectedAreaLabel={selectedAreaLabel}
        />
      </div>
    </div>
  );
}

const DIST_LOCATIONS = [
  // Côte-des-Neiges
  { id:"cdn-clsc",      name:"CLSC de Côte-des-Neiges",                      org:"CLSC (CIUSSS Centre-Ouest)", address:"5700 Chemin de la Côte-des-Neiges, Montréal, QC H3T 2A8", lat:45.498972169117216, lng:-73.62763851847538},
  { id:"cdn-outremont",  name:"CLSC Côte-des-Neiges — point de service Outremont", org:"CLSC (CIUSSS Centre-Ouest)", address:"1271 Avenue Van Horne, Outremont, QC H2V 1K5", lat:45.52199594741187, lng:-73.6136466819675},
  // Saint-Michel
  { id:"stmichel-carrefour", name:"Carrefour populaire de Saint-Michel",     org:"Community organization",     address:"3565 Rue Jarry Est, Montréal, QC H1Z 4K6 — TODO: confirm current address", lat:45.56699091388918, lng:-73.60718973778876 },
  // Parc-Extension
  { id:"parcext-culture", name:"Maison de la culture de Parc-Extension",     org:"Ville de Montréal",           address:"421 Rue Saint-Roch, Montréal, QC", lat:45.531417679703004, lng:-73.62885597550589},
  { id:"parcext-servicecanada", name:"Service Canada Centre — Parc-Extension", org:"Government of Canada",      address:"540 Avenue Beaumont, Montréal, QC H3N 1T7", lat:45.52748454540594, lng:-73.61950720285138},
  // Montréal-Nord
  { id:"mtlnord-clsc",   name:"CLSC de Montréal-Nord (Nord-Est)",            org:"CLSC (CIUSSS Nord-de-l'Île)", address:"11441 Boulevard Lacordaire, Montréal, QC H1G 4J9", lat:45.624572414872546, lng:-73.61696075999262},
  { id:"mtlnord-cje",    name:"Carrefour jeunesse-emploi Bourassa-Sauvé",     org:"Community organization (employment)", address:"11000 Boul. Saint-Vital, Montréal, QC", lat:45.58894664834177, lng:-73.64531317401347 },
  // Westmount
  { id:"westmount-contactivity", name:"Contactivity Centre",                 org:"Community organization (seniors)", address:"310 Victoria Ave, Suite 102, Westmount, QC H3Z 2M9", lat:45.477901003996365, lng:-73.60079137401802},
  { id:"westmount-library", name:"Westmount Public Library",                 org:"City of Westmount",           address:"4574 Sherbrooke Street West, Westmount, QC H3Z 1G1", lat:45.48157716401339, lng: -73.59931083168857 },
];
const DEFAULT_DIST_LOCATION = DIST_LOCATIONS[0];

// Main App 
export default function CommunityRadar() {
  const [lang, setLang] = useState("EN");
  const [step, setStep] = useState("role");
  const [role, setRole] = useState(null);
  const [distLocation, setDistLocation] = useState(null);
  const [locationReturnStep, setLocationReturnStep] = useState("main");
  const [locationBackStep, setLocationBackStep] = useState("role");
  const [dashboardData, setDashboardData] = useState({
    services: SERVICES,
    categories: CATEGORIES,
    boroughScores: BOROUGH_SCORES,
    areas: [],
    sourceStatus: "demo",
    warnings: [],
  });
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  // Passive analytics: one row the moment someone opens the app, before
  // they've clicked anything (captures browse-only / screenshot users).
  useEffect(() => { logEvent("page_view", "app_opened", {}); }, []);

  // V1 filters
  const [activeGroup, setActiveGroup] = useState([]);
  const [activeGender, setActiveGender] = useState(null);
  const [activeAge, setActiveAge] = useState([]);
  const [activeCategory, setActiveCategory] = useState([]);
  const [activeOtherCategory, setActiveOtherCategory] = useState([]);
  const [search, setSearch] = useState("");
  const [activeMaxDist, setActiveMaxDist] = useState(null); // null = no distance limit yet
  const [selected, setSelected] = useState(SERVICES[0]);
  const [showMap, setShowMap] = useState(false);
  const [flyerDone, setFlyerDone] = useState(false);
  const [isDownloadingFlyer, setIsDownloadingFlyer] = useState(false);
  const [flyerDownloadError, setFlyerDownloadError] = useState("");
  const [mapCenter, setMapCenter] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [listPage, setListPage] = useState(0);
  const PAGE_SIZE = 8;
  const [rightTab, setRightTab] = useState("info"); // "info" | "flyer"

  useEffect(() => {
    let active = true;
    setDashboardData(current => ({
      ...current,
      sourceStatus: "loading",
      warnings: [],
    }));
    loadDashboardData({ demoServices: SERVICES, demoBoroughScores: BOROUGH_SCORES }).then(data => {
      if (active) setDashboardData(data);
    });
    return () => { active = false; };
  }, [dashboardReloadKey]);

  const rawServices = dashboardData.services || SERVICES;
  const categories = dashboardData.categories || CATEGORIES;
  const boroughScores = dashboardData.boroughScores || BOROUGH_SCORES;
  const areas = dashboardData.areas || [];

  const isEN = lang === "EN";
  const selectedLocation = distLocation || DEFAULT_DIST_LOCATION;
  const meta = {
    group: activeGroup,
    age: activeAge,
    location: selectedLocation?.name,
    selectedAreaId: selected?.areaId,
    service: selected,
    category: selected?.category,
    sourceView: showMap ? "community_map" : "community_list",
  };

  // Distance was previously baked in at load time from a fixed downtown
  // point, so it never actually reflected the chosen distribution location.
  // Recompute it here, reactively, every time the location changes.
  const services = useMemo(() => {
    if (!selectedLocation?.lat || !selectedLocation?.lng) return rawServices;
    return rawServices
      .map(s => {
        if (s.lat == null || s.lng == null) return s;
        const km = haversineKm(selectedLocation.lat, selectedLocation.lng, s.lat, s.lng);
        return { ...s, dist: `${km.toFixed(1)} km`, distanceKm: Number(km.toFixed(2)) };
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [rawServices, selectedLocation?.id, selectedLocation?.lat, selectedLocation?.lng]);

  const T = {
    title:"Community Radar",
    chooseRole: isEN?"Who are you?":"Qui êtes-vous?",
    roleV1: isEN?"Social Worker / Frontline Staff":"Travailleur social / Première ligne",
    roleV1sub: isEN?"Find and generate service flyers for clients":"Trouver et générer des dépliants de services",
    roleV2: isEN?"Planner / Funder / Policymaker":"Planificateur / Bailleur de fonds",
    roleV2sub: isEN?"Analyze vulnerability and service gaps":"Analyser la vulnérabilité et les lacunes",
    filterGroup: isEN?"Group:":"Groupe:",
    filterGender: isEN?"Gender:":"Genre:",
    filterAge: isEN?"Age:":"Âge:",
    filterCat: isEN?"Category:":"Catégorie:",
    search: isEN?"Search services or address…":"Rechercher des services…",
    nearby: isEN?"Nearby services":"Services à proximité",
    viewMap: isEN?"🗺  View on map":"🗺  Voir sur la carte",
    backList: isEN?"← Back to list":"← Retour à la liste",
    generate: isEN?"Download flyer (PDF)":"Générer un dépliant (PDF)",
    flyerPreview: isEN?"Flyer preview":"Aperçu du dépliant",
    download: isEN?"⬇  Download PDF flyer":"⬇  Télécharger le dépliant PDF",
    phone: isEN?"211 or other":"211 ou autre",
    qr: isEN?"QR code (our app)":"Code QR",
    langs: isEN?"Languages:":"Langues:",
  };

  const toggleArr = (arr, setArr, val) => setArr(p => p.includes(val) ? p.filter(x=>x!==val) : [...p, val]);

  // "Other" isn't one bucket — it's whatever real primary_category values
  // don't match Shelter/Food/Medical/Legal/Translation. Computed live from
  // the loaded data, so it adapts automatically as new values show up.
  const otherCategoryOptions = [...new Set(services.filter(s=>s.category==="Other").map(s=>s.type).filter(Boolean))].sort();

  // Upper bound for the distance slider — rounds up to the nearest 0.5 km
  // past the farthest *reasonable* service currently loaded. A handful of
  // records have missing/bad coordinates (e.g. defaulting near [0,0]),
  // which computes a wildly large haversine distance and would blow the
  // whole slider range out to thousands of km — so those outliers are
  // ignored here and just excluded from the slider's max, not from the list.
  const REASONABLE_MAX_DIST_KM = 50;
  const maxAvailableDist = useMemo(() => {
    const values = services.map(s => s.distanceKm).filter(v => typeof v === "number" && !Number.isNaN(v) && v <= REASONABLE_MAX_DIST_KM);
    if (values.length === 0) return REASONABLE_MAX_DIST_KM;
    return Math.max(1, Math.ceil((Math.max(...values) + 0.001) * 2) / 2);
  }, [services]);

  // Reset the distance filter back to "no limit" whenever the underlying
  // service list changes (e.g. a new distribution location), so it can't
  // silently hide everything after the distances shift.
  useEffect(() => { setActiveMaxDist(null); }, [services]);

  const filtered = useMemo(() => services.filter(s => {
    const mg = activeGroup.length===0 || s.group.some(g=>activeGroup.includes(g));
    const mge = !activeGender || s.gender===activeGender || s.gender==="All";
    const ma = activeAge.length===0 || (s.ageGroups||[]).some(a=>activeAge.includes(a));
    const mc = (activeCategory.length===0 && activeOtherCategory.length===0)
      || activeCategory.includes(s.category)
      || activeOtherCategory.includes(s.type);
    const ms = serviceMatchesSearch(s, search);
    const md = activeMaxDist==null || typeof s.distanceKm!=="number" || s.distanceKm<=activeMaxDist;
    return mg && mge && ma && mc && ms && md;
  }), [services, activeGroup, activeGender, activeAge, activeCategory, activeOtherCategory, search, activeMaxDist]);

  // The selected centre is always one the user can see in the current result
  // list. This prevents a filter or data refresh from leaving an old service
  // in the right panel or in the next downloaded flyer.
  useEffect(() => {
    const currentService = selected && filtered.find(service => String(service.id) === String(selected.id));
    if (currentService === selected) return;

    setSelected(currentService || filtered[0] || null);
    setFlyerDone(false);
    setFlyerDownloadError("");
    setRightTab("info");
  }, [filtered, selected]);

  const flyer = useMemo(() => {
    if (!selected || !selectedLocation) return null;
    return FlyerViewModel.fromSelection({
      service: selected,
      location: selectedLocation,
      candidateServices: filtered,
      language: lang,
      updatedLabel: T.updated,
    });
  }, [selected, selectedLocation, filtered, lang, T.updated]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedFiltered = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);
  const impressionKey = pagedFiltered.map(service => service.id).join("|");
  useEffect(() => {
    logServiceImpressions({
      services: pagedFiltered,
      sourceView: showMap ? "community_map" : "community_list",
    });
  }, [impressionKey, showMap]);
  useEffect(() => { setListPage(0); }, [activeGroup, activeGender, activeAge, activeCategory, activeOtherCategory, search, activeMaxDist]);

  const handleSelect = s => {
    setSelected(s);
    setFlyerDone(false);
    setFlyerDownloadError("");
    setMapCenter([s.lat,s.lng]);
    setRightTab("info");
    logEvent("service_card_opened", "service_selected", {
      ...meta,
      selectedAreaId: s.areaId,
      service: s,
      category: s.category,
    });
  };

  const handleChangeLocation = (returnStep, backStep=returnStep) => {
    setLocationReturnStep(returnStep);
    setLocationBackStep(backStep);
    setStep("location");
  };

  const handleLocationSelected = (location) => {
    setDistLocation(location);
    setFlyerDone(false);
    setFlyerDownloadError("");
    setRightTab("info");
    logEvent("dist_location_selected", location.name, {});
    setStep(locationReturnStep);
  };

  const handleDownload = async () => {
    if (!flyer || isDownloadingFlyer) return;

    setFlyerDone(false);
    setFlyerDownloadError("");
    setIsDownloadingFlyer(true);

    try {
      const { flyerPdfExporter } = await import("./flyer/FlyerPdfExporter");
      await flyerPdfExporter.export(flyer);
      setFlyerDone(true);
      logFlyer(selected,{group:activeGroup,gender:activeGender,age:activeAge,category:[...activeCategory,...activeOtherCategory],location:selectedLocation.name,locationObj:selectedLocation,language:lang},meta);
    } catch (error) {
      console.error("Could not download the flyer PDF", error);
      setFlyerDownloadError(isEN ? "The flyer could not be downloaded. Please try again." : "Le dépliant n'a pas pu être téléchargé. Veuillez réessayer.");
    } finally {
      setIsDownloadingFlyer(false);
    }
  };

  // ROLE SELECTION 
  if (step==="role") return (
    <div data-testid="role-screen" style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem",position:"relative",overflow:"hidden"}}>
      {/* subtle tech grid lines */}
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(to right,rgba(15,23,42,0.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(15,23,42,0.045) 1px,transparent 1px)",backgroundSize:"32px 32px",pointerEvents:"none"}} />

      <div style={{maxWidth:520,width:"100%",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{marginBottom:18,display:"flex",justifyContent:"center"}}>
          <div style={{width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#2563EB,#1D4ED8)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 10px 24px rgba(37,99,235,0.28)"}}>
            <Radar size={30} color="#fff" />
          </div>
        </div>
        <h1 style={{fontSize:30,fontWeight:800,color:"#0F172A",margin:"0 0 10px",letterSpacing:-0.5}}>{T.title}</h1>
        <p style={{color:"#475569",fontSize:13,marginBottom:20,letterSpacing:0.3}}>McGill University MMA · BUSA 649 · Community Project</p>
        <div style={{display:"flex",justifyContent:"center",marginBottom:36}}>
          <div style={{display:"flex",background:"#F1F5F9",borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"6px 16px",border:"none",background:lang===l?"linear-gradient(135deg,#2563EB,#1D4ED8)":"transparent",color:lang===l?"#fff":"#334155",fontWeight:lang===l?700:500,cursor:"pointer",fontSize:13,transition:"all 0.15s"}}>{l}</button>)}
          </div>
        </div>
        <p style={{fontWeight:600,fontSize:13,color:"#334155",marginBottom:16,textTransform:"uppercase",letterSpacing:1.4}}>{T.chooseRole}</p>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button data-testid="choose-community-role" onClick={()=>{setRole("v1");logEvent("role_selected","v1",{});handleChangeLocation("main","role");}}
            style={{padding:"22px 24px 22px 28px",borderRadius:12,border:"1.5px solid #BFDBFE",background:"linear-gradient(135deg,#EFF6FF,#F0F9FF)",color:"#1E3A8A",textAlign:"left",cursor:"pointer",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:"linear-gradient(180deg,#3B82F6,#1D4ED8)"}} />
            <div style={{fontWeight:700,fontSize:16,marginBottom:4,color:"#1E3A8A"}}>V1 — {T.roleV1}</div>
            <div style={{fontSize:13,color:"#4A6FA5"}}>{T.roleV1sub}</div>
          </button>
          <button data-testid="choose-planner-role" onClick={()=>{setRole("v2");logEvent("role_selected","v2",{});setStep("v2");}}
            style={{padding:"22px 24px 22px 28px",borderRadius:12,border:"1.5px solid #FDE1B8",background:"linear-gradient(135deg,#FFF7ED,#FFFBEB)",color:"#7C2D12",textAlign:"left",cursor:"pointer",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:"linear-gradient(180deg,#F59E0B,#C2410C)"}} />
            <div style={{fontWeight:700,fontSize:16,marginBottom:4,color:"#7C2D12"}}>V2 — {T.roleV2}</div>
            <div style={{fontSize:13,color:"#9A5B33"}}>{T.roleV2sub}</div>
          </button>
        </div>
        <p data-testid="analytics-privacy-note" style={{fontSize:11,lineHeight:1.5,color:"#64748B",margin:"18px auto 0",maxWidth:470}}>
          {isEN
            ? "Anonymous session activity helps evaluate service interest. We do not record names or search text, and website activity does not change the live vulnerability score."
            : "L’activité anonyme de la session aide à évaluer l’intérêt pour les services. Nous n’enregistrons ni noms ni texte de recherche, et l’activité du site ne modifie pas l’indice de vulnérabilité en vigueur."}
        </p>
      </div>
    </div>
  );

  // V2 
  if (step==="v2") return (
    <PlannerView
      lang={lang}
      setLang={setLang}
      location={selectedLocation}
      onChangeLocation={()=>handleChangeLocation("v2")}
      onSwitch={()=>{setRole("v1");setStep("main");}}
      onExit={()=>setStep("role")}
      services={rawServices}
      categories={categories}
      boroughScores={boroughScores}
      areas={areas}
      sourceStatus={dashboardData.sourceStatus}
      warnings={dashboardData.warnings}
      onRetry={()=>setDashboardReloadKey(key=>key+1)}
    />
  );

  // LOCATION SELECTION
  if (step==="location") return (
    <div data-testid="location-screen" style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem",position:"relative",overflow:"hidden"}}>
      {/* subtle tech grid lines, consistent with the cover screen */}
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(to right,rgba(15,23,42,0.045) 1px,transparent 1px),linear-gradient(to bottom,rgba(15,23,42,0.045) 1px,transparent 1px)",backgroundSize:"32px 32px",pointerEvents:"none"}} />

      <div style={{maxWidth:520,width:"100%",textAlign:"center",position:"relative",zIndex:1}}>
        <div style={{marginBottom:14,display:"flex",justifyContent:"center"}}>
          <div style={{width:56,height:56,borderRadius:14,background:"linear-gradient(135deg,#2563EB,#1D4ED8)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 10px 24px rgba(37,99,235,0.28)"}}>
            <LocateFixed size={26} color="#fff" />
          </div>
        </div>
        <h1 style={{fontSize:26,fontWeight:800,color:"#0F172A",margin:"0 0 6px",letterSpacing:-0.4}}>{T.title}</h1>
        <p style={{color:"#475569",fontSize:13,marginBottom:12}}>McGill University MMA · BUSA 649 · Community Project</p>
        <p style={{color:"#2563EB",fontSize:12,fontWeight:700,marginBottom:28,textTransform:"uppercase",letterSpacing:1.2}}>{isEN?"Step 2 of 2":"Étape 2 de 2"}</p>
        <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:14,padding:"2rem",boxShadow:"0 8px 30px rgba(15,23,42,0.08)",textAlign:"left"}}>
          <p style={{fontWeight:700,fontSize:16,color:"#0F172A",marginBottom:4,textAlign:"center"}}>
            {isEN?"Where are you distributing from?":"D'où distribuez-vous?"}
          </p>
          <p style={{fontSize:13,color:"#475569",marginBottom:20,textAlign:"center"}}>
            {isEN?"This will be shown as 'You are here' on the flyer map":"Ce point apparaîtra comme 'Vous êtes ici' sur le dépliant"}
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {DIST_LOCATIONS.map(loc=>(
              <button data-testid="distribution-location" key={loc.id} onClick={()=>handleLocationSelected(loc)}
                style={{padding:"14px 18px",borderRadius:10,border:`1.5px solid ${selectedLocation.id===loc.id?"#2563EB":"#E2E8F0"}`,background:selectedLocation.id===loc.id?"#EFF6FF":"#fff",color:"#0F172A",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:selectedLocation.id===loc.id?"0 4px 14px rgba(37,99,235,0.14)":"none",transition:"all 0.15s"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:selectedLocation.id===loc.id?"#2563EB":"#059669",flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{loc.name}</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:2}}>{loc.org}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <button onClick={()=>setStep(locationBackStep)} style={{marginTop:16,background:"transparent",border:"none",color:"#475569",fontSize:13,cursor:"pointer"}}>
          ← {isEN?"Back":"Retour"}
        </button>
      </div>
    </div>
  );;

  // V1 MAIN 
  return (
    <div data-testid="community-view" style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:"system-ui,sans-serif",fontSize:14}}>
      {/* TOP BAR */}
      <div style={{background:"#0B1220",padding:"10px 20px",display:"flex",flexWrap:"wrap",rowGap:8,alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1000,borderBottom:"1px solid #1E293B"}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10,rowGap:6}}>
          <Radar size={20} color="#2563EB"/>
          <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{T.title} </div>
          <div style={{width:1,height:16,background:"#334155",margin:"0 4px"}}/>
          <div style={{fontSize:12,color:"#60A5FA",fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>{isEN?"Community View (V1)":"Vue Communautaire (V1)"}</div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,rowGap:6,alignItems:"center"}}>
          <span data-testid="data-source-status" style={{fontSize:11,color:dashboardData.sourceStatus==="supabase"?"#6EE7B7":dashboardData.sourceStatus==="loading"?"#93C5FD":"#FCD34D",fontWeight:600}}>
            {dataSourceLabel(dashboardData.sourceStatus, isEN)}
          </span>
          <LocationBadge location={selectedLocation} onChange={()=>handleChangeLocation("main")}/>
          <div style={{display:"flex",background:"rgba(255,255,255,0.1)",borderRadius:6,overflow:"hidden"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"4px 10px",border:"none",background:lang===l?"#2563EB":"transparent",color:"#fff",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:12}}>{l}</button>)}
          </div>
          <button onClick={()=>setStep("v2")} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:12,whiteSpace:"nowrap"}}>{isEN?"V2 Planner":"V2 Planificateur"}</button>
          <button onClick={()=>setStep("role")} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}><ChevronLeft size={12}/> Exit</button>
        </div>
      </div>
      <DataSourceNotice sourceStatus={dashboardData.sourceStatus} warnings={dashboardData.warnings} onRetry={()=>setDashboardReloadKey(key=>key+1)} isEN={isEN}/>

      <div style={{padding:"14px 20px"}}>
        {/* SEARCH */}
        <div style={{position:"relative",marginBottom:14}}>
          <Search size={16} color="#2563EB" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
          <input data-testid="service-search" aria-label={T.search} value={search}
            onChange={e=>setSearch(e.target.value)}
            onBlur={()=>logEvent("search",search?"query_entered":"query_empty",{...meta,selectedAreaId:null,service:null,category:null,sourceView:"community_search"})}
            placeholder={T.search}
            style={{width:"100%",padding:"12px 14px 12px 42px",borderRadius:8,border:"2px solid #2563EB",background:"#fff",fontSize:14,outline:"none",boxShadow:"0 2px 8px rgba(37,99,235,0.14)",boxSizing:"border-box"}}/>
        </div>

        {/* FILTERS */}
        <div style={{background:"#F1F5F9",borderRadius:8,padding:"10px 14px",marginBottom:14,border:"1px solid #E2E8F0"}}>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
          {/* Group */}
          <div style={{display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",gap:6}}>
            <span style={{color:"#475569",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterGroup}</span>
            {[{val:"Indigenous",color:"#047857",bg:"#ECFDF5",border:"#047857"},{val:"Immigrant",color:"#164E63",bg:"#ECFEFF",border:"#0891B2"}].map(g=>(
              <Chip key={g.val} active={activeGroup.includes(g.val)} color={g.color} bg={g.bg} border={g.border} onClick={()=>{toggleArr(activeGroup,setActiveGroup,g.val);logEvent("group_filter",g.val,meta);}}>
                <span style={{width:12,height:12,borderRadius:3,border:`1.5px solid ${activeGroup.includes(g.val)?g.color:"#E2E8F0"}`,background:activeGroup.includes(g.val)?g.color:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:700,flexShrink:0}}>{activeGroup.includes(g.val)?"✓":""}</span>
                {isEN?g.val:GROUP_LABELS_FR[g.val]}
              </Chip>
            ))}
          </div>
          {/* Gender */}
          <div style={{display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",gap:6}}>
            <span style={{color:"#475569",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterGender}</span>
            {GENDER_OPTS.map(g=>(
              <Chip key={g.val} active={activeGender===g.val} color="#2563EB" bg="#EFF6FF" border="#2563EB" onClick={()=>setActiveGender(activeGender===g.val?null:g.val)}>
                {g.icon} {isEN?g.label:GENDER_LABELS_FR[g.val]}
              </Chip>
            ))}
          </div>
          {/* Age */}
          <div style={{display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",gap:6}}>
            <span style={{color:"#475569",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterAge}</span>
            {AGE_RANGES.map(a=>(
              <Chip key={a} active={activeAge.includes(a)} color="#2563EB" bg="#EFF6FF" border="#2563EB" onClick={()=>{toggleArr(activeAge,setActiveAge,a);logEvent("age_filter",a,meta);}}>
                {a}
              </Chip>
            ))}
          </div>
          {/* Distance */}
          <div style={{display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",gap:10}}>
            <style>{`
              .distance-range{-webkit-appearance:none;appearance:none;width:150px;height:10px;border-radius:999px;background:#E2E8F0;outline:none;cursor:pointer;}
              .distance-range::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:transparent;}
              .distance-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,0.35);cursor:pointer;margin-top:-7px;}
              .distance-range::-moz-range-track{height:10px;border-radius:999px;background:#E2E8F0;}
              .distance-range::-moz-range-progress{height:10px;border-radius:999px 0 0 999px;background:#2563EB;}
              .distance-range::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,0.35);cursor:pointer;}
              .distance-input{width:56px;padding:4px 4px;border:1px solid #BFDBFE;border-radius:6px;font-size:14px;font-weight:600;color:#2563EB;text-align:right;background:#fff;}
              .distance-input::placeholder{color:#93C5FD;font-weight:600;}
            `}</style>
            <span style={{color:"#475569",fontSize:13,fontWeight:600,whiteSpace:"nowrap"}}>{isEN?"Distance":"Distance"}</span>
            <input data-testid="distance-filter" aria-label={isEN?"Maximum service distance":"Distance maximale du service"} type="range" className="distance-range" min={0} max={maxAvailableDist} step={0.1}
              value={activeMaxDist ?? maxAvailableDist}
              onChange={e=>setActiveMaxDist(Number(e.target.value)>=maxAvailableDist?null:Number(e.target.value))}
              onMouseUp={()=>logEvent("distance_filter",activeMaxDist,meta)}
              onTouchEnd={()=>logEvent("distance_filter",activeMaxDist,meta)}
              style={{background:`linear-gradient(to right,#2563EB ${((activeMaxDist ?? maxAvailableDist)/maxAvailableDist)*100}%,#E2E8F0 ${((activeMaxDist ?? maxAvailableDist)/maxAvailableDist)*100}%)`}}/>
            <span style={{display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600,color:"#2563EB",background:"#EFF6FF",padding:"4px 8px 4px 12px",borderRadius:20,fontFamily:MONO_FONT}}>
              ≤
              <input type="number" className="distance-input" min={0} max={maxAvailableDist} step={0.1}
                placeholder={isEN?"Any":"Toutes"}
                value={activeMaxDist==null ? "" : Number(activeMaxDist.toFixed(1))}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw==="") { setActiveMaxDist(null); return; }
                  const num = Math.min(maxAvailableDist, Math.max(0, Number(raw)));
                  if (!Number.isNaN(num)) setActiveMaxDist(num);
                }}
                onBlur={()=>logEvent("distance_filter",activeMaxDist,meta)}/>
              km
            </span>
          </div>
          {/* Category — original 5 chips untouched, plus an "Other" dropdown for everything else */}
          <div style={{display:"flex",flexWrap:"wrap",rowGap:6,alignItems:"center",gap:6}}>
            <span style={{color:"#475569",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterCat}</span>
            {categories.filter(c=>c.label!=="Other").map(c=>(
              <Chip key={c.label} active={activeCategory.includes(c.label)} color={c.color} bg={c.bg} border={c.color} onClick={()=>{toggleArr(activeCategory,setActiveCategory,c.label);logEvent("category_filter",c.label,{...meta,selectedAreaId:null,service:null,category:c.label});}}>
                <CategoryIcon category={c.label} size={13} color={c.color}/> {categoryLabel(c.label,isEN)}
              </Chip>
            ))}
            <MultiSelectDropdown label={isEN?"Other":"Autre"} options={otherCategoryOptions} selected={activeOtherCategory} onChange={vals=>{setActiveOtherCategory(vals);logEvent("other_category_filter",vals.length?"categories_selected":"categories_cleared",{...meta,selectedAreaId:null,service:null,category:"Other"});}} isEN={isEN} dataIsEnglishOnly/>
          </div>
          </div>
        </div>

        {/* MAIN: list | right panel */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:14}}>
          {/* LEFT: list or map */}
          <div data-testid="service-results-panel" style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0}}>
            {showMap ? (
              <div style={{position:"relative",flex:1,minHeight:440,zIndex:0}}>
                <button onClick={()=>setShowMap(false)} style={{position:"absolute",top:10,left:10,zIndex:1001,padding:"5px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",cursor:"pointer",fontSize:13}}>{T.backList}</button>
                <MapContainer center={[45.5088,-73.5878]} zoom={14} style={{height:"100%",width:"100%"}} zoomControl={true}>
                  <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
                  {mapCenter && <FlyTo center={mapCenter}/>}
                  {selectedLocation?.lat!=null && selectedLocation?.lng!=null && (
                    <Marker position={[selectedLocation.lat,selectedLocation.lng]} icon={createUserLocationMarker()} title={selectedLocation.name}>
                      <Popup><div style={{fontFamily:"system-ui",fontSize:12,fontWeight:600}}>{isEN?"You are here":"Vous êtes ici"}</div><div style={{fontFamily:"system-ui",fontSize:11,color:"#475569"}}>{selectedLocation.name}</div></Popup>
                    </Marker>
                  )}
                  {filtered.map(s=>(
                    <Marker key={s.id} position={[s.lat,s.lng]} icon={createServiceMarker(s.category,selected?.id===s.id)} title={s.name} eventHandlers={{click:()=>handleSelect(s)}}>
                      <Popup><div style={{fontFamily:"system-ui",minWidth:150}}><div style={{fontWeight:700,fontSize:12,color:CATEGORY_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CategoryIcon category={s.category} size={13} color={CATEGORY_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:11,color:"#475569"}}>{s.type} · {s.dist}</div><div style={{fontSize:11,color:"#475569"}}>{s.hours}</div></div></Popup>
                    </Marker>
                  ))}
                </MapContainer>
                <div aria-label="Leaflet map legend" style={{position:"absolute",bottom:10,left:10,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"4px 8px",border:"1px solid #E2E8F0",display:"flex",flexDirection:"column",gap:3}}>
                  {MAP_LEGEND_ITEMS.map(item=><div key={item.label} style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}><div style={{width:8,height:8,borderRadius:"50%",background:item.color}}/>{item.kind==="location"?(isEN?"You are here":"Vous êtes ici"):item.label}</div>)}
                </div>
              </div>
            ) : (
              <>
                <div style={{padding:"10px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontWeight:700,fontSize:16}}>{T.nearby} <span style={{fontWeight:400,color:"#475569",fontSize:13}}>({filtered.length})</span></span>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {filtered.length>0 && (
                      <span style={{fontSize:12,color:"#475569"}}>{isEN?"Page":"Page"} {listPage+1}/{totalPages}</span>
                    )}
                    <div style={{display:"flex",border:"1px solid #E2E8F0",borderRadius:6,overflow:"hidden"}}>
                      <button onClick={()=>setViewMode("list")} style={{padding:"4px 9px",border:"none",background:viewMode==="list"?"#2563EB":"#fff",color:viewMode==="list"?"#fff":"#475569",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                        ☰ {isEN?"List":"Liste"}
                      </button>
                      <button onClick={()=>setViewMode("grid")} style={{padding:"4px 9px",border:"none",background:viewMode==="grid"?"#2563EB":"#fff",color:viewMode==="grid"?"#fff":"#475569",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                        ⊞ {isEN?"Grid":"Grille"}
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{overflowY:"auto",flex:1,padding:viewMode==="grid"?"10px":"0"}}>
                  {filtered.length===0
                    ? <div style={{padding:20,color:"#475569",textAlign:"center",fontSize:14}}>{isEN?"No services match.":"Aucun service ne correspond."}</div>
                    : viewMode==="list"
                      ? pagedFiltered.map((s,i)=>(
                          <button type="button" data-testid="service-card" key={s.id} onClick={()=>handleSelect(s)}
                            style={{width:"100%",fontFamily:"inherit",textAlign:"left",padding:"12px 16px",border:"none",borderBottom:i<pagedFiltered.length-1?"1px solid #E2E8F0":"none",cursor:"pointer",background:selected?.id===s.id?"#EFF6FF":"transparent",borderLeft:selected?.id===s.id?"3px solid #2563EB":"3px solid transparent",transition:"background 0.15s"}}>
                            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                              <div style={{width:38,height:38,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><CategoryIcon category={s.category} size={19} color={selected?.id===s.id?"#fff":CATEGORY_COLORS[s.category]}/></div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600,color:selected?.id===s.id?"#2563EB":"#0F172A",fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                                <div style={{color:"#475569",fontSize:13,margin:"3px 0 6px"}}>{s.dist}{s.gender!=="All"?` · ${s.gender} only`:""}</div>
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {s.tags.slice(0,1).map(t=><span key={t} style={{padding:"2px 8px",borderRadius:4,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:12}}>{t.length>44?t.slice(0,43)+"…":t}</span>)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:8}}>
                          {pagedFiltered.map(s=>(
                            <button type="button" data-testid="service-card" key={s.id} onClick={()=>handleSelect(s)}
                              style={{width:"100%",fontFamily:"inherit",textAlign:"left",padding:"12px",borderRadius:8,border:`1.5px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,background:selected?.id===s.id?"#EFF6FF":"#fff",cursor:"pointer",transition:"all 0.15s"}}>
                              <div style={{width:36,height:36,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><CategoryIcon category={s.category} size={18} color={selected?.id===s.id?"#fff":CATEGORY_COLORS[s.category]}/></div>
                              <div style={{fontWeight:600,fontSize:13,color:selected?.id===s.id?"#2563EB":"#0F172A",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                              <div style={{fontSize:11,color:"#475569",marginBottom:6}}>{s.type}</div>
                              <div style={{fontSize:11,color:"#475569",marginBottom:6}}>{s.dist}</div>
                              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                {s.tags.slice(0,1).map(t=><span key={t} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:10}}>{t.length>30?t.slice(0,29)+"…":t}</span>)}
                              </div>
                            </button>
                          ))}
                        </div>
                  }
                </div>
                <div style={{padding:"12px 16px",borderTop:"1px solid #E2E8F0",display:"flex",flexDirection:"column",gap:8}}>
                  {totalPages > 1 && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setListPage(0)} disabled={listPage===0}
                        style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage===0?"#F8FAFC":"#fff",color:listPage===0?"#CBD5E1":"#334155",cursor:listPage===0?"default":"pointer",fontSize:13}}
                        title={isEN?"First page":"Première page"}>
                        ⇤
                      </button>
                      <button onClick={()=>setListPage(p=>Math.max(0,p-1))} disabled={listPage===0}
                        style={{flex:1,padding:"7px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage===0?"#F8FAFC":"#fff",color:listPage===0?"#CBD5E1":"#334155",cursor:listPage===0?"default":"pointer",fontSize:13}}>
                        ← {isEN?"Prev":"Précédent"}
                      </button>
                      <button data-testid="next-page" onClick={()=>setListPage(p=>Math.min(totalPages-1,p+1))} disabled={listPage>=totalPages-1}
                        style={{flex:1,padding:"7px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage>=totalPages-1?"#F8FAFC":"#fff",color:listPage>=totalPages-1?"#CBD5E1":"#334155",cursor:listPage>=totalPages-1?"default":"pointer",fontSize:13}}>
                        {isEN?"Next":"Suivant"} →
                      </button>
                      <button onClick={()=>setListPage(totalPages-1)} disabled={listPage>=totalPages-1}
                        style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage>=totalPages-1?"#F8FAFC":"#fff",color:listPage>=totalPages-1?"#CBD5E1":"#334155",cursor:listPage>=totalPages-1?"default":"pointer",fontSize:13}}
                        title={isEN?"Last page":"Dernière page"}>
                        ⇥
                      </button>
                    </div>
                  )}
                  <button data-testid="view-services-map" onClick={()=>{setShowMap(true);logEvent("map_opened","view_on_map",meta);}}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F1F5F9",color:"#0F172A",cursor:"pointer",fontSize:14,fontWeight:500}}>
                    {T.viewMap}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: tabbed panel */}
          <div style={{display:"flex",flexDirection:"column",gap:0,minWidth:0}}>
            {selected && (
              <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
                {/* Tab bar */}
                <div style={{display:"flex",borderBottom:"1px solid #E2E8F0"}}>
                  {[
                    { id:"info", label: isEN?"Service info":"Infos du service" },
                    { id:"flyer", label: isEN?"Flyer preview":"Aperçu du dépliant" },
                  ].map(tab=>(
                    <button key={tab.id} onClick={()=>setRightTab(tab.id)}
                      style={{flex:1,padding:"11px",border:"none",background:rightTab===tab.id?"#fff":"#F8FAFC",borderBottom:rightTab===tab.id?"2px solid #047857":"2px solid transparent",color:rightTab===tab.id?"#047857":"#475569",fontWeight:rightTab===tab.id?600:400,cursor:"pointer",fontSize:13,transition:"all 0.15s"}}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Service info tab */}
                {rightTab==="info" && (
                  <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
                    {/* Dark header band */}
                    <div style={{background:"#F8FAFC",padding:"18px 20px",display:"flex",alignItems:"center",gap:14,borderBottom:"1px solid #E2E8F0"}}>
                      <div style={{width:46,height:46,borderRadius:10,background:"rgba(5,150,105,0.2)",border:"1.5px solid rgba(5,150,105,0.4)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <CategoryIcon category={selected.category} size={22} color="#047857"/>
                      </div>
                      <div>
                        <div style={{fontWeight:700,fontSize:16,color:"#0F172A",lineHeight:1.3}}>{selected.name}</div>
                        <div style={{fontSize:11,color:"#047857",fontWeight:600,marginTop:3,textTransform:"uppercase",letterSpacing:0.6}}>{selected.type}</div>
                      </div>
                    </div>

                    {/* Info rows */}
                    <div style={{padding:"4px 20px",flex:1}}>
                      {[
                        selected.address && { icon:"📍", label: isEN?"Address":"Adresse", value: selected.address },
                        selected.borough && { icon:"🏙️", label: isEN?"Borough":"Arrondissement", value: selected.borough },
                        selected.hours   && { icon:"🕐", label: isEN?"Hours":"Horaires",  value: selected.hours },
                        selected.phone   && { icon:"📞", label: isEN?"Phone":"Téléphone",  value: selected.phone },
                        selected.website && { icon:"🔗", label: isEN?"Website":"Site web", value: <a href={/^https?:\/\//i.test(selected.website)?selected.website:`https://${selected.website}`} target="_blank" rel="noreferrer" style={{color:"#2563EB",wordBreak:"break-all"}}>{selected.website}</a> },
                        selected.email   && { icon:"✉️", label: isEN?"Email":"Courriel", value: <a href={`mailto:${selected.email}`} style={{color:"#2563EB",wordBreak:"break-all"}}>{selected.email}</a> },
                        selected.gender && selected.gender!=="All" && { icon:"⚥", label: isEN?"Gender focus":"Genre ciblé", value: selected.gender },
                        selected.ageGroups?.length>0 && { icon:"🎂", label: isEN?"Age groups":"Groupes d'âge", value: selected.ageGroups.join(" · ") },
                        selected.group?.length>0 && { icon:"🤝", label: isEN?"Community focus":"Communauté ciblée", value: selected.group.join(" · ") },
                        selected.langs?.length>0 && { icon:"🌐", label: isEN?"Languages":"Langues", value: selected.langs.join(" · ") },
                      ].filter(Boolean).map((row,i,arr)=>(
                        <div key={row.label} style={{display:"flex",gap:12,padding:"11px 0",borderBottom:i<arr.length-1?"1px solid #F1F5F9":"none",alignItems:"flex-start"}}>
                          <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{row.icon}</span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:10,fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:0.6,marginBottom:2}}>{row.label}</div>
                            <div style={{fontSize:13,color:"#1E293B",lineHeight:1.4}}>{row.value}</div>
                          </div>
                        </div>
                      ))}

                      {selected.tags?.length > 0 && (
                        <div style={{paddingTop:12,paddingBottom:12}}>
                          <div style={{fontSize:10,fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>{isEN?"Services offered":"Services offerts"}</div>
                          <EnglishOnlyNote isEN={isEN}/>
                          <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:7}}>
                            {selected.tags.map(t=>(
                              <li key={t} style={{fontSize:13,color:"#1E293B",lineHeight:1.5}}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{padding:"14px 20px",borderTop:"1px solid #F1F5F9",background:"#FAFAFA"}}>
                      <div style={{color:"#CBD5E1",fontSize:11,fontStyle:"italic",marginBottom:10}}>{T.updated}</div>
                      <button data-testid="preview-flyer" onClick={()=>setRightTab("flyer")}
                        style={{width:"100%",padding:"11px",borderRadius:8,border:"none",background:"#047857",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:14}}>
                        {isEN?"Preview Flyer →":"Prévisualiser le dépliant →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Flyer preview tab */}
                {rightTab==="flyer" && (
                  <div style={{flex:1,overflowY:"auto",background:"#fff",padding:"16px",display:"flex",flexDirection:"column",justifyContent:"flex-start",gap:12}}>
                    <ScaledFlyerPreview flyer={flyer}/>

                    <div style={{width:"100%",margin:"0 auto"}}>
                      {flyerDone && <div style={{marginBottom:8,padding:"7px 10px",background:"#ECFDF5",borderRadius:6,color:"#047857",fontSize:12}}>✓ {isEN?"PDF downloaded successfully":"PDF téléchargé avec succès"}</div>}
                      {flyerDownloadError && <div style={{marginBottom:8,padding:"7px 10px",background:"#FEF2F2",borderRadius:6,color:"#B91C1C",fontSize:12}}>{flyerDownloadError}</div>}
                      <button data-testid="download-flyer" onClick={handleDownload} disabled={isDownloadingFlyer}
                        style={{width:"100%",padding:"16px",borderRadius:8,border:"none",background:isDownloadingFlyer?"#64748B":"#047857",color:"#fff",fontWeight:600,cursor:isDownloadingFlyer?"wait":"pointer",fontSize:16}}>
                        {isDownloadingFlyer ? (isEN ? "Preparing flyer..." : "Préparation du dépliant...") : T.generate}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
