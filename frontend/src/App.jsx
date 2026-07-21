import { useState, useRef, Fragment } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, CircleMarker } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import jsPDF from "jspdf";
import { Radar, LocateFixed, Home, UtensilsCrossed, Stethoscope, Scale, Globe, Search, Phone, QrCode, Bot, ChevronLeft, Layers, Activity, AlertTriangle, TrendingUp, X } from "lucide-react";
import html2canvas from "html2canvas";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://nzjpstjiqlwbyxznonss.supabase.co",
  "sb_publishable_gDeb-sdg02CCgVoN75-IgA__s-yD9Ce"
);

const SUPABASE_TABLE = "services_master";

// primary_category values from the DB are free text and don't line up 1:1
// with our 5 chip colors — bucket them by keyword, default to "Other".
function normalizeCat(...parts) {
  const r = parts.filter(Boolean).join(" ").toLowerCase();
  if (!r) return "Other";
  if (r.includes("shelter") || r.includes("housing") || r.includes("homeless")) return "Shelter";
  if (r.includes("food") || r.includes("meal") || r.includes("bank") || r.includes("nutrition")) return "Food";
  if (r.includes("health") || r.includes("medical") || r.includes("clinic") || r.includes("clsc") || r.includes("mental") || r.includes("psycho")) return "Medical";
  if (r.includes("legal") || r.includes("law") || r.includes("justice") || r.includes("immigration")) return "Legal";
  if (r.includes("translat") || r.includes("language") || r.includes("interpret") || r.includes("culture")) return "Translation";
  return "Other";
}

// Some rows come from the DB in ALL CAPS ("(VILLE-MARIE EST), ÎLE ...") or
// wrapped in stray parentheses ("(PRAIDA)"). Names that are already
// mixed-case are left completely untouched — this only fixes the shouty
// all-caps ones so the list doesn't look like it's yelling.
function cleanServiceName(raw) {
  if (!raw) return raw;
  let name = raw.trim();
  if (/^\(.*\)$/.test(name)) name = name.slice(1, -1).trim();
  const hasLower = /[a-zà-ÿ]/.test(name);
  const hasUpper = /[A-ZÀ-Ÿ]/.test(name);
  if (hasUpper && !hasLower) {
    name = name.toLowerCase().replace(/(^|[\s\-'’"(])([a-zà-ÿ])/g, (m, pre, ch) => pre + ch.toUpperCase());
  }
  return name;
}
function truncateText(str, n) {
  if (!str) return str;
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// Free text that's either "* item.* item.* item." bullet-style, or a plain
// comma/semicolon separated list. Splits it into a clean, capped array.
function parseBulletList(raw, maxItems = 6, maxLen = 60) {
  if (!raw) return [];
  const parts = raw.includes("*")
    ? raw.split("*").map(t => t.trim().replace(/\.$/, "").trim())
    : raw.split(/[,;]/).map(t => t.trim());
  return parts
    .filter(Boolean)
    .slice(0, maxItems)
    .map(t => (t.length > maxLen ? t.slice(0, maxLen - 3) + "…" : t));
}
function parseTags(raw) { return parseBulletList(raw, 6, 60); }

// gap_drivers specifically: same splitting as parseBulletList, but also
// drops stray numeric/score fragments like "access score 10.59" that are
// metric readouts, not categorical driver labels.
function parseDrivers(raw, maxItems = 6, maxLen = 50) {
  return parseBulletList(raw, 20, maxLen).filter(t => !/\bscore\b.*\d/i.test(t)).slice(0, maxItems);
}

// Converts one row from the Supabase table into the same shape the rest of
// the app already expects (same shape as FALLBACK_SERVICES below).
function rowToService(row, idx) {
  const category = normalizeCat(row.primary_category, row.service_categories, row.services, row.name);
  return {
    id: row.service_id || `db-${idx}`,
    name: cleanServiceName(row.name) || "Unnamed service",
    type: row.primary_category || category,
    dist: row.borough_name || "", // no live distance calc yet — borough as stand-in
    hours: row.hours || "Hours not listed",
    address: row.address || "",
    phone: row.phone || "",
    tags: parseTags(row.services),
    langs: [], // not in DB yet
    group: [], // not in DB yet
    category,
    gender: "All", // not in DB yet
    lat: row.latitude != null ? Number(row.latitude) : null,
    lng: row.longitude != null ? Number(row.longitude) : null,
    website: row.website || "",
  };
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const MONO_FONT = "ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,monospace";
const CAT_COLORS = { Shelter:"#DC2626", Food:"#D97706", Medical:"#2563EB", Legal:"#059669", Translation:"#9333EA", Other:"#64748B" };

function makeIcon(category, isSelected) {
  const color = CAT_COLORS[category] || "#888";
  const size = isSelected ? 36 : 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="${isSelected?2.5:2}"/><circle cx="12" cy="12" r="${isSelected?5:3.5}" fill="white"/></svg>`;
  return L.divIcon({ html: svg, className: "", iconSize:[size,size], iconAnchor:[size/2,size/2], popupAnchor:[0,-size/2] });
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 1 }); }, [center]);
  return null;
}

// Real service locations can be anywhere across Greater Montreal, so a fixed
// zoom level breaks as soon as "you are here" and the selected service are
// far apart. This fits the view to whatever points it's given instead.
function FitFlyerBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = (points || []).filter(p => p && p[0] != null && p[1] != null && !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView(valid[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(valid), { padding: [28, 28], maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);
  return null;
}

const FALLBACK_SERVICES = [
  { id:1, name:"Accueil Bonneau", type:"Shelter", dist:"0.4 km", hours:"Open 24h", address:"2050 Rue Bleury, Montréal", phone:"514-866-7222", tags:["Walk-in OK","Free","Wheelchair access","Indigenous services"], langs:["EN","FR","Inuktitut"], group:["Indigenous"], category:"Shelter", gender:"Male", lat:45.5089, lng:-73.5617 },
  { id:2, name:"Maison du Pain", type:"Food bank", dist:"0.9 km", hours:"Mon–Fri 10am–2pm", address:"1420 Rue Beaudry, Montréal", phone:"514-524-3661", tags:["Free"], langs:["EN","FR","Spanish"], group:["Immigrant"], category:"Food", gender:"All", lat:45.5195, lng:-73.5529 },
  { id:3, name:"CLSC des Faubourgs", type:"Clinic", dist:"1.2 km", hours:"Open until 5pm", address:"1705 Rue de la Visitation, Montréal", phone:"514-527-2361", tags:["Walk-in OK"], langs:["EN","FR"], group:["Indigenous","Immigrant"], category:"Medical", gender:"All", lat:45.5210, lng:-73.5480 },
  { id:4, name:"Resilience Montreal", type:"Shelter", dist:"1.3 km", hours:"Open 24h", address:"1600 Rue Notre-Dame O, Montréal", phone:"514-937-2788", tags:["Walk-in OK","Free","Indigenous services"], langs:["EN","FR","Inuktitut"], group:["Indigenous"], category:"Shelter", gender:"All", lat:45.4955, lng:-73.5602 },
  { id:5, name:"PRAIDA", type:"Legal aid", dist:"1.5 km", hours:"Mon–Fri 9am–4pm", address:"1001 Boul de Maisonneuve E", phone:"514-873-5880", tags:["Free","By appt"], langs:["EN","FR","Arabic","Spanish"], group:["Immigrant"], category:"Legal", gender:"All", lat:45.5230, lng:-73.5610 },
  { id:6, name:"Chez Doris", type:"Shelter", dist:"1.6 km", hours:"Mon–Fri 8am–4pm", address:"1430 Rue Chomedey, Montréal", phone:"514-937-2341", tags:["Walk-in OK","Free","Women only"], langs:["EN","FR"], group:["Indigenous","Immigrant"], category:"Shelter", gender:"Female", lat:45.4940, lng:-73.5710 },
  { id:7, name:"YMCA Newcomers", type:"Translation", dist:"1.8 km", hours:"Mon–Fri 8:30am–5pm", address:"1440 Rue Stanley, Montréal", phone:"514-849-8393", tags:["Free"], langs:["EN","FR","Spanish","Arabic","Mandarin"], group:["Immigrant"], category:"Translation", gender:"All", lat:45.5010, lng:-73.5720 },
];

const CATEGORIES = [
  { label:"Shelter", color:"#DC2626", bg:"#FEF2F2" },
  { label:"Food", color:"#D97706", bg:"#FFFBEB" },
  { label:"Medical", color:"#2563EB", bg:"#EFF6FF" },
  { label:"Legal", color:"#059669", bg:"#ECFDF5" },
  { label:"Translation", color:"#9333EA", bg:"#F5F3FF" },
  { label:"Other", color:"#64748B", bg:"#F8FAFC" },
];

const ICON_MAP = { Shelter:Home, Food:UtensilsCrossed, Medical:Stethoscope, Legal:Scale, Translation:Globe, Other:Layers };
function CatIcon({ category, size=14, color, style }) {
  const Icon = ICON_MAP[category] || Home;
  return <Icon size={size} color={color} strokeWidth={2.25} style={{flexShrink:0,verticalAlign:"middle",...style}}/>;
}
const AGE_RANGES = ["Under 25","25–44","45–64","65+"];
const GENDER_OPTS = [{val:"Male",label:"Male",icon:"♂"},{val:"Female",label:"Female",icon:"♀"},{val:"All",label:"All",icon:"⚥"}];

const BACKEND = "http://localhost:8000";
async function logEvent(type, detail, meta={}) {
  try { await fetch(`${BACKEND}/log/event`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event_type:type,detail:String(detail||""),user_group:meta.group||null,user_age_range:meta.age||null})}); }
  catch(e) { console.log("📊",type,detail); }
}
async function logFlyer(service, filters, meta={}) {
  try { await fetch(`${BACKEND}/log/flyer`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_name:service.name,service_type:service.type,service_category:service.category,group_filter:filters.group||null,gender_filter:filters.gender||null,user_group:meta.group||null,user_age_range:meta.age||null,location:"fixed-point"})}); }
  catch(e) { console.log("📊 flyer",service.name); }
}

function generatePDF(service, lang, otherServices) {
  const isEN = lang === "EN";
  const doc = new jsPDF({ unit:"mm", format:"a5" });
  const W = 148, pad = 10;
  let y = pad;

  // Header
  doc.setFillColor(239,246,255); doc.rect(0,0,W,18,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(15,23,42);
  doc.text("Community Radar", pad, 8);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text(isEN?"Services near this location":"Services près de cet endroit", pad, 14);
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(30,58,138);
  doc.text(lang, W-pad, 8, {align:"right"});
  y = 24;

  // Map placeholder box
  doc.setDrawColor(37,99,235); doc.setFillColor(239,246,255);
  doc.roundedRect(pad, y, W-2*pad, 40, 3,3,"FD");
  doc.setFontSize(20); doc.text("🗺", W/2, y+18, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(37,99,235);
  doc.text(`${service.name} — ${service.dist}`, W/2, y+26, {align:"center"});
  doc.setFillColor(239,246,255); doc.roundedRect(W-pad-28, y+32, 28, 5, 2,2,"F");
  doc.setFontSize(7); doc.setTextColor(30,58,138);
  doc.text(isEN?"📍 You are here":"📍 Vous êtes ici", W-pad-14, y+35.5, {align:"center"});
  y += 46;

  // Featured service card
  doc.setFillColor(239,246,255); doc.setDrawColor(37,99,235);
  doc.roundedRect(pad, y, W-2*pad, 38, 3,3,"FD");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(30,58,138);
  doc.text(`${service.type} — ${service.name}`, pad+4, y+8);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(71,85,105);
  doc.text(`${service.dist} · ${service.hours}`, pad+4, y+14);
  doc.text(service.address, pad+4, y+19);
  // tags
  let tx = pad+4; const ty = y+25;
  service.tags.forEach(tag => {
    const tw = doc.getTextWidth(tag)+4;
    doc.setDrawColor(37,99,235); doc.setFillColor(255,255,255);
    doc.roundedRect(tx, ty-3.5, tw, 5.5, 1.5,1.5,"FD");
    doc.setFontSize(7); doc.setTextColor(30,58,138); doc.text(tag, tx+2, ty+0.5);
    tx += tw+3;
  });
  doc.setFontSize(7); doc.setTextColor(71,85,105);
  doc.text(`${isEN?"Languages":"Langues"}: ${service.langs.join(" / ")}`, pad+4, y+33);
  y += 44;

  // Other nearby services
  otherServices.slice(0,3).forEach(s => {
    doc.setDrawColor(226,232,240); doc.line(pad, y, W-pad, y);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(15,23,42);
    doc.text(`${s.type} — ${s.name}`, pad+2, y+5);
    doc.setTextColor(100,116,139);
    doc.text(`${s.dist} · ${s.hours}`, W-pad-2, y+5, {align:"right"});
    y += 9;
  });

  // Freshness
  y += 3;
  doc.setFontSize(7); doc.setTextColor(100,116,139); doc.setFont("helvetica","italic");
  doc.text(isEN?"Info updated June 2026":"Info mise à jour juin 2026 — confirmer en appelant le 211", pad, y);
  y += 8;

  // Footer
  const fw = (W-2*pad-4)/2;
  doc.setFont("helvetica","normal"); doc.setTextColor(15,23,42);
  doc.setDrawColor(226,232,240); doc.setFillColor(255,255,255);
  doc.roundedRect(pad, y, fw, 8, 2,2,"FD");
  doc.setFontSize(8); doc.text(isEN?"📞 211 or other":"📞 211 ou autre", pad+fw/2, y+5, {align:"center"});
  doc.roundedRect(pad+fw+4, y, fw, 8, 2,2,"FD");
  doc.text(isEN?"QR code (our app)":"Code QR (appli)", pad+fw+4+fw/2, y+5, {align:"center"});

  doc.save(`flyer-${service.name.replace(/\s+/g,"-").toLowerCase()}.pdf`);
}

function Chip({ active, color, bg, border, onClick, children }) {
  return (
    <button onClick={onClick} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${active?border:"#E2E8F0"}`,background:active?bg:"#fff",color:active?color:"#334155",fontWeight:active?600:400,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4}}>
      {children}
    </button>
  );
}

// V2 Planner View
// Real gap_score schema (confirmed from Supabase):
// area_id, area_name, borough_name, latitude, longitude, vulnerability_score,
// overall_accessibility_score, gap_score, gap_rank, priority_flag,
// gap_drivers, summary_en, summary_fr — all at the AREA level (multiple
// areas share a borough_name).

// Fallback/demo data — only used while the Supabase fetch is loading or if
// it fails, so the V2 dashboard is never completely blank.
const FALLBACK_AREAS = [
  { id:"demo-1", name:"Mercier-Hochelaga-Maisonneuve", borough:"Mercier-Hochelaga-Maisonneuve", lat:null, lng:null, gapScore:0.81, vulnerability:0.78, accessibility:0.22, rank:1, priorityFlag:"High", drivers:[], summaryEn:"Demo data — connect Supabase to see the real area summary.", summaryFr:"Données de démonstration — connectez Supabase pour le vrai résumé." },
  { id:"demo-2", name:"Villeray-Saint-Michel-Parc-Extension", borough:"Villeray-Saint-Michel-Parc-Extension", lat:null, lng:null, gapScore:0.77, vulnerability:0.74, accessibility:0.28, rank:2, priorityFlag:"High", drivers:[], summaryEn:"Demo data — connect Supabase to see the real area summary.", summaryFr:"Données de démonstration — connectez Supabase pour le vrai résumé." },
  { id:"demo-3", name:"Montréal-Nord", borough:"Montréal-Nord", lat:null, lng:null, gapScore:0.74, vulnerability:0.71, accessibility:0.31, rank:3, priorityFlag:"High", drivers:[], summaryEn:"Demo data — connect Supabase to see the real area summary.", summaryFr:"Données de démonstration — connectez Supabase pour le vrai résumé." },
  { id:"demo-4", name:"Ville-Marie", borough:"Ville-Marie", lat:null, lng:null, gapScore:0.34, vulnerability:0.38, accessibility:0.62, rank:12, priorityFlag:"Low", drivers:[], summaryEn:"Demo data — connect Supabase to see the real area summary.", summaryFr:"Données de démonstration — connectez Supabase pour le vrai résumé." },
];

// vulnerability_score / overall_accessibility_score / gap_score all come
// back on a 0–100 scale (e.g. 62.87) while the UI (bars, choropleth
// thresholds) expects 0–1. Anything clearly >1.5 is treated as a 0–100
// score and divided down; anything else is passed through as-is.
function norm01(v) {
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n > 1.5 ? n / 100 : n;
}

// Converts one raw gap_score row into a clean shape for the UI.
function rowToArea(row, idx) {
  return {
    id: row.area_id || `area-${idx}`,
    name: row.area_name || row.area_id || "Unnamed area",
    borough: row.borough_name || "",
    lat: row.latitude != null ? Number(row.latitude) : null,
    lng: row.longitude != null ? Number(row.longitude) : null,
    gapScore: norm01(row.gap_score),
    vulnerability: norm01(row.vulnerability_score),
    accessibility: norm01(row.overall_accessibility_score),
    rank: row.gap_rank ?? null,
    priorityFlag: row.priority_flag || "",
    drivers: parseDrivers(row.gap_drivers, 6, 50),
    summaryEn: row.summary_en || "",
    summaryFr: row.summary_fr || "",
  };
}

// The geojson's borough names ("Côte-des-Neiges–Notre-Dame-de-Grâce", "Le
// Plateau-Mont-Royal") don't match the DB's plain-text borough_name
// ("Cote-des-Neiges-Notre-Dame-de-Grace", "Plateau Mont-Royal") — different
// accents, articles, dash characters. Normalize both sides before comparing.
function normalizeBoroughName(name) {
  if (!name) return "";
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/^(le|la|les)\s+/, "")                    // strip leading article
    .replace(/[–—]/g, "-")                             // normalize dash characters
    .replace(/[^a-z0-9]+/g, "")                         // drop spaces/hyphens/punctuation entirely
    .trim();
}

// Beyond accents/casing, official borough names sometimes carry extra
// suffixes depending on the source ("Verdun" vs "Verdun–Île-des-Soeurs",
// a short DB name vs the geojson's full compound name). Treat two names as
// the same borough if either one contains the other after normalizing.
function boroughNamesMatch(a, b) {
  const na = normalizeBoroughName(a), nb = normalizeBoroughName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// The choropleth colors whole boroughs, so average every area's gap_score
// into one number per borough (used for the KPI cards' "N boroughs" count —
// the Area profile panel below uses one specific area's own numbers, since
// text fields like summary/drivers can't be meaningfully averaged).
function aggregateBoroughGapScore(areas) {
  const groups = {};
  areas.forEach(a => {
    if (!a.borough || a.gapScore == null) return;
    const key = normalizeBoroughName(a.borough);
    if (!groups[key]) groups[key] = { sum:0, n:0, label:a.borough };
    groups[key].sum += a.gapScore;
    groups[key].n++;
  });
  const out = {};
  Object.entries(groups).forEach(([key,g]) => { out[key] = { score: g.sum / g.n, label:g.label }; });
  return out;
}


function priorityFlagColor(flag) {
  const f = (flag || "").toLowerCase();
  if (f.includes("high")) return { color:"#9F1239", bg:"#FFF1F2", border:"#FECDD3" };
  if (f.includes("med")) return { color:"#B45309", bg:"#FFFBEB", border:"#FDE68A" };
  if (f.includes("low")) return { color:"#065F46", bg:"#ECFDF5", border:"#A7F3D0" };
  return { color:"#334155", bg:"#F1F5F9", border:"#E2E8F0" };
}


function scoreToColor(score) {
  if (!score) return "#E2E8F0";
  if (score >= 0.75) return "#9F1239";
  if (score >= 0.60) return "#E11D48";
  if (score >= 0.45) return "#FB7185";
  if (score >= 0.30) return "#FDA4AF";
  return "#FFE4E6";
}

function ChoroplethMap({ areas=FALLBACK_AREAS, onSelectArea, selectedAreaId }) {
  const validAreas = areas.filter(a => a.lat != null && a.lng != null && !Number.isNaN(a.lat) && !Number.isNaN(a.lng));

  return (
    <div style={{height:"100%",width:"100%",position:"relative",zIndex:0}}>
      <MapContainer center={[45.53,-73.65]} zoom={11} style={{height:"100%",width:"100%"}} zoomControl={true}>
        <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
        {validAreas.map(a => {
          const isSelected = a.id===selectedAreaId;
          return (
            <Fragment key={a.id}>
              {/* soft glow halo */}
              <Circle center={[a.lat,a.lng]} radius={850} pathOptions={{ fillColor:scoreToColor(a.gapScore), fillOpacity:0.30, stroke:false }} eventHandlers={{ click:()=>onSelectArea?.(a) }}/>
              {/* solid pin at the exact lat/lng from gap_score — selected one gets a black ring */}
              <CircleMarker center={[a.lat,a.lng]} radius={isSelected?12:8} pathOptions={{ fillColor:scoreToColor(a.gapScore), fillOpacity:0.95, color:isSelected?"#0F172A":"#fff", weight:isSelected?3:2 }} eventHandlers={{ click:()=>onSelectArea?.(a) }}>
                <Popup><div style={{fontFamily:"system-ui",minWidth:150}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#0F172A"}}>{a.name}</div>
                  {a.borough && a.borough!==a.name && <div style={{fontSize:11,color:"#64748B"}}>{a.borough}</div>}
                  <div style={{fontSize:12,color:"#334155",marginTop:4}}>Gap Score: <b>{a.gapScore!=null?a.gapScore.toFixed(2):"—"}</b></div>
                </div></Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

function PlannerView({ lang, setLang, onSwitch, services=[] }) {
  const [chat, setChat] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);

  // Live gap_score data from Supabase — one row per area (area_id/area_name),
  // multiple areas share a borough_name.
  const [gapAreas, setGapAreas] = useState([]);
  const [gapLoading, setGapLoading] = useState(true);
  const [gapError, setGapError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from("gap_score").select("*").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to load gap_score:", error);
        setGapError(error.message);
      } else {
        setGapAreas((data || []).map(rowToArea));
      }
      setGapLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const areas = gapAreas.length > 0 ? gapAreas : FALLBACK_AREAS;
  const boroughScores = aggregateBoroughGapScore(areas);

  // Default the selected area to the highest gap_score once data arrives
  useEffect(() => {
    if (areas.length > 0 && !selectedArea) {
      const top = [...areas].sort((a,b)=>(b.gapScore||0)-(a.gapScore||0))[0];
      setSelectedArea(top);
    }
  }, [areas, selectedArea]);

  const selectedBorough = selectedArea?.borough || "";

  // Services (from services_master, via the "dist" field which holds
  // borough_name) filtered down to whichever borough is currently selected.
  const validServices = services.filter(s=>s.lat!=null && s.lng!=null);
  const boroughServices = selectedBorough
    ? validServices.filter(s => boroughNamesMatch(s.dist, selectedBorough))
    : validServices;

  const priorities = [...areas]
    .sort((a,b)=>(b.gapScore||0)-(a.gapScore||0))
    .slice(0,5);

  // Real KPI numbers derived from gap_score (falls back to demo numbers if not loaded yet)
  const validScores = areas.map(a=>a.gapScore).filter(s=>s!=null);
  const avgGapScore = validScores.length ? (validScores.reduce((a,b)=>a+b,0)/validScores.length) : 0;
  const highPriorityCount = areas.filter(a=>(a.priorityFlag||"").toLowerCase().includes("high") || (a.gapScore!=null && a.gapScore>=0.6)).length;
  const tractsAnalyzed = areas.length;
  const flagStyle = selectedArea?.priorityFlag ? priorityFlagColor(selectedArea.priorityFlag) : null;

  const isEN = lang==="EN";
  return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:"system-ui,sans-serif",fontSize:14}}>
      <div style={{background:"#0B1220",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1000,borderBottom:"1px solid #1E293B"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Radar size={20} color="#2563EB"/>
          <div style={{fontWeight:700,fontSize:16,color:"#fff",letterSpacing:0.2}}>Community Radar</div>
          <div style={{width:1,height:16,background:"#334155",margin:"0 4px"}}/>
          <div style={{fontSize:12,color:"#60A5FA",fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Planner View (V2)</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{display:"flex",background:"rgba(255,255,255,0.08)",borderRadius:6,overflow:"hidden"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"4px 10px",border:"none",background:lang===l?"#2563EB":"transparent",color:"#fff",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:12}}>{l}</button>)}
          </div>
          <button onClick={onSwitch} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:12}}>Community View (V1)</button>
          <button onClick={()=>setStep("role")} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:11}}><ChevronLeft size={12}/> Exit</button>
        </div>
      </div>
      <div style={{padding:"16px 20px"}}>
        {gapError && (
          <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",color:"#92400E",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12}}>
            {isEN?"Couldn't load gap_score from Supabase (":"Impossible de charger gap_score ("}{gapError}{isEN?"). Showing demo data instead.":"). Affichage des données de démonstration."}
          </div>
        )}
        {/* KPI cards */}
        <div style={{display:"flex",background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,marginBottom:16,overflow:"hidden"}}>
          {[
            { label:"Tracts analyzed", val:gapLoading?"…":String(tractsAnalyzed), sub:gapLoading?"loading…":(isEN?"areas from gap_score":"zones de gap_score"), icon:Layers, color:"#4F46E5", bg:"#EEF2FF" },
            { label:"Average gap score", val:gapLoading?"…":avgGapScore.toFixed(2), sub:gapLoading?"loading…":(isEN?`across ${Object.keys(boroughScores).length} boroughs`:`sur ${Object.keys(boroughScores).length} arrondissements`), icon:Activity, color:"#E11D48", bg:"#FFF1F2" },
            { label:"High-priority areas", val:gapLoading?"…":String(highPriorityCount), sub:gapLoading?"loading…":(isEN?"flagged high / gap score ≥ 0.60":"signalées haute priorité / score ≥ 0,60"), icon:AlertTriangle, color:"#D97706", bg:"#FFFBEB" },
          ].map((k,i)=>(
            <div key={k.label} style={{flex:1,padding:"14px 20px",display:"flex",gap:12,alignItems:"flex-start",borderLeft:i>0?"1px solid #E2E8F0":"none"}}>
              <div style={{width:34,height:34,borderRadius:8,background:k.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <k.icon size={18} color={k.color} strokeWidth={2.25}/>
              </div>
              <div>
                <div style={{color:"#334155",fontSize:11,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>{k.label}</div>
                <div style={{fontWeight:700,fontSize:24,color:"#0F172A",fontFamily:MONO_FONT}}>{k.val}</div>
                <div style={{fontSize:12,color:k.trend?k.color:"#64748B",marginTop:2,display:"flex",alignItems:"center",gap:3}}>
                  {k.trend==="up" && <TrendingUp size={12}/>}
                  {k.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Map row */}
        <div style={{display:"grid",gridTemplateColumns:"1.15fr 1fr 300px",gap:12,marginBottom:12}}>
          {/* Real choropleth */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:600,fontSize:15}}>{isEN?"Gap Score heatmap — click an area":"Carte de chaleur du Gap Score — cliquez une zone"}</span>
           
            </div>
            <div style={{flex:1,minHeight:460}}>
              <ChoroplethMap areas={areas} onSelectArea={setSelectedArea} selectedAreaId={selectedArea?.id}/>
            </div>
            <div style={{padding:"10px 16px",borderTop:"1px solid #E2E8F0",display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#334155"}}>
              <span>{isEN?"Low":"Faible"}</span>
              <div style={{flex:1,height:6,borderRadius:3,background:"linear-gradient(to right,#FFE4E6,#FB7185,#E11D48,#9F1239)"}}/>
              <span>{isEN?"High":"Élevé"}</span>
            </div>
          </div>

          {/* Street map — filtered to whichever borough is selected */}
          <div style={{borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0",position:"relative",zIndex:0,minHeight:460}}>
            <div style={{position:"absolute",top:8,left:8,zIndex:1001,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 12px",fontSize:14,fontWeight:600,color:"#0F172A",border:"1px solid #E2E8F0",maxWidth:"70%"}}>
              {isEN?"Service locations":"Emplacements des services"}{selectedBorough?` — ${selectedBorough}`:""} <span style={{fontWeight:400,color:"#64748B"}}>({boroughServices.length})</span>
            </div>
            <MapContainer center={[45.5188,-73.5878]} zoom={12} style={{height:"100%",width:"100%"}} zoomControl={true}>
              <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
              <FitFlyerBounds points={boroughServices.map(s=>[s.lat,s.lng])}/>
              {boroughServices.map(s=>(
                <Marker key={s.id} position={[s.lat,s.lng]} icon={makeIcon(s.category,false)}>
                  <Popup><div style={{fontFamily:"system-ui",minWidth:140}}><div style={{fontWeight:700,fontSize:13,color:CAT_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CatIcon category={s.category} size={14} color={CAT_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:12,color:"#64748B"}}>{s.type} · {s.dist}</div></div></Popup>
                </Marker>
              ))}
            </MapContainer>
            {boroughServices.length===0 && (
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,background:"rgba(255,255,255,0.6)",fontSize:13,color:"#64748B",textAlign:"center",padding:20}}>
                {isEN?"No services_master rows matched to this borough yet.":"Aucun service de services_master associé à cet arrondissement pour l'instant."}
              </div>
            )}
            <div style={{position:"absolute",bottom:8,left:8,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 10px",border:"1px solid #E2E8F0",fontSize:12,display:"flex",gap:10,flexWrap:"wrap"}}>
              {CATEGORIES.map(c=><span key={c.label} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:"50%",background:c.color,display:"inline-block"}}/>{c.label}</span>)}
            </div>
          </div>

          {/* Top priority areas — clickable */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>{isEN?"Top priority areas (by Gap Score)":"Zones prioritaires (par Score d'écart)"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
              {priorities.map((a)=>(
                <div key={a.id} onClick={()=>setSelectedArea(a)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,cursor:"pointer",background:selectedArea?.id===a.id?"#EFF6FF":"#F1F5F9",border:`1px solid ${selectedArea?.id===a.id?"#2563EB":"#E2E8F0"}`,transition:"all 0.15s"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:selectedArea?.id===a.id?600:400,color:selectedArea?.id===a.id?"#2563EB":"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                    {a.borough && a.borough!==a.name && <div style={{fontSize:11,color:"#94A3B8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.borough}</div>}
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:"#2563EB",background:"#EFF6FF",padding:"3px 8px",borderRadius:4,fontFamily:MONO_FONT,flexShrink:0,marginLeft:8}}>{a.gapScore!=null?a.gapScore.toFixed(2):"—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Area profile — updates when an area/borough is clicked */}
        <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",marginBottom:12}}>
          {selectedArea && (<>
            <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}>
              <div style={{fontWeight:600,fontSize:15}}>
                {isEN?"Area profile":"Profil de la zone"} — <span style={{color:"#2563EB"}}>{selectedArea.name}</span>
                {selectedArea.borough && selectedArea.borough!==selectedArea.name && <span style={{color:"#94A3B8",fontWeight:400}}> ({selectedArea.borough})</span>}
              </div>
              <span style={{fontSize:13,color:"#64748B"}}>Gap Score: <b style={{fontFamily:MONO_FONT,color:"#0F172A"}}>{selectedArea.gapScore!=null?selectedArea.gapScore.toFixed(2):"—"}</b></span>
              {selectedArea.priorityFlag && (
                <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,color:flagStyle.color,background:flagStyle.bg,border:`1px solid ${flagStyle.border}`}}>{selectedArea.priorityFlag}</span>
              )}
              {selectedArea.rank!=null && (
                <span style={{fontSize:12,color:"#94A3B8"}}>{isEN?`Rank #${selectedArea.rank} of ${tractsAnalyzed} areas`:`Rang n°${selectedArea.rank} sur ${tractsAnalyzed} zones`}</span>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:20,marginBottom:selectedArea.summaryEn||selectedArea.summaryFr||(isEN&&selectedArea.drivers.length>0)?16:0}}>
              {[
                [isEN?"Vulnerability score":"Score de vulnérabilité", selectedArea.vulnerability],
                [isEN?"Service accessibility":"Accessibilité aux services", selectedArea.accessibility],
              ].map(([label,pct])=>(
                <div key={label}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}><span>{label}</span><span style={{fontWeight:600,fontFamily:MONO_FONT}}>{pct!=null?pct.toFixed(2):"—"}</span></div>
                  <div style={{height:8,borderRadius:4,background:"#F1F5F9"}}>
                    <div style={{height:8,width:`${(pct||0)*100}%`,borderRadius:4,background:"#2563EB",transition:"width 0.4s"}}/>
                  </div>
                </div>
              ))}
            </div>

            {(selectedArea.summaryEn || selectedArea.summaryFr) && (
              <div style={{fontSize:13,color:"#1E3A8A",lineHeight:1.5,background:"#EFF6FF",borderLeft:"3px solid #2563EB",borderRadius:6,padding:"12px 14px",marginBottom:(isEN&&selectedArea.drivers.length>0)?12:0}}>
                {(isEN ? (selectedArea.summaryEn || selectedArea.summaryFr) : (selectedArea.summaryFr || selectedArea.summaryEn))}
              </div>
            )}

            {/* gap_drivers has no French column in the DB yet, so only show
                this in EN mode rather than mixing untranslated English chips
                into the French UI. The summary paragraph above is fully
                bilingual (summary_en / summary_fr) and already covers the
                "why" in French. */}
            {isEN && selectedArea.drivers.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Key drivers</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedArea.drivers.map(d=>(
                    <span key={d} style={{padding:"4px 10px",borderRadius:20,background:"#EFF6FF",color:"#1E3A8A",fontSize:12,fontWeight:500,border:"1px solid #BFDBFE"}}>{d}</span>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>

      {/* Chatbot — floating widget, bottom-right corner (UI placeholder until the real chatbot is built) */}
      {chatOpen ? (
        <div style={{position:"fixed",bottom:20,right:20,zIndex:2000,display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #E2E8F0",borderRadius:24,padding:"10px 10px 10px 16px",boxShadow:"0 6px 24px rgba(15,23,42,0.15)",width:340,maxWidth:"calc(100vw - 40px)"}}>
          <Bot size={18} color="#2563EB" style={{flexShrink:0}}/>
          <input autoFocus value={chat} onChange={e=>setChat(e.target.value)} placeholder={isEN?`Ask about ${selectedArea?.name||selectedBorough||"an area"}…`:`Poser une question sur ${selectedArea?.name||selectedBorough||"une zone"}…`}
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",minWidth:0}}/>
          <button onClick={()=>setChatOpen(false)} aria-label={isEN?"Close chat":"Fermer le chat"}
            style={{flexShrink:0,width:26,height:26,borderRadius:"50%",border:"none",background:"#F1F5F9",color:"#64748B",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <X size={14}/>
          </button>
        </div>
      ) : (
        <button onClick={()=>setChatOpen(true)} aria-label={isEN?"Open chat":"Ouvrir le chat"}
          style={{position:"fixed",bottom:20,right:20,zIndex:2000,width:52,height:52,borderRadius:"50%",border:"none",background:"#2563EB",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 20px rgba(37,99,235,0.4)"}}>
          <Bot size={24} color="#fff"/>
        </button>
      )}
    </div>
  );
}

const DIST_LOCATIONS = [
  { id:"cabot",   name:"Cabot Square",           org:"Resilience Montreal",  lat:45.4943, lng:-73.5779 },
  { id:"milton",  name:"Milton Park",             org:"PAQ Office",           lat:45.5106, lng:-73.5783 },
  { id:"cdn",     name:"CLSC Côte-des-Neiges",   org:"CLSC",                 lat:45.4889, lng:-73.6241 },
  { id:"parcext", name:"Parc-Extension",          org:"BIPE",                 lat:45.5356, lng:-73.6219 },
];

function makeYouIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#059669" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
  return L.divIcon({ html: svg, className: "", iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-16] });
}

// Main App 
export default function CommunityRadar() {
  const [lang, setLang] = useState("EN");
  const [step, setStep] = useState("role");
  const [role, setRole] = useState(null);
  const [distLocation, setDistLocation] = useState(null);

  // V1 filters
  const [activeGroup, setActiveGroup] = useState([]);
  const [activeGender, setActiveGender] = useState(null);
  const [activeAge, setActiveAge] = useState([]);
  const [activeCategory, setActiveCategory] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [flyerDone, setFlyerDone] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [rightTab, setRightTab] = useState("info"); // "info" | "flyer"

  // Live data from Supabase
  const [services, setServices] = useState(FALLBACK_SERVICES);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(null);
  const [listPage, setListPage] = useState(0);
  const PAGE_SIZE = 8;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from(SUPABASE_TABLE)
      .select("service_id,name,primary_category,service_categories,address,latitude,longitude,phone,hours,services,borough_name,website")
      .eq("mappable", 1)
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load services from Supabase:", error);
          setServicesError(error.message);
          setServices(FALLBACK_SERVICES);
        } else {
          const mapped = (data || [])
            .map(rowToService)
            .filter(s => s.lat != null && s.lng != null && !Number.isNaN(s.lat) && !Number.isNaN(s.lng));
          setServices(mapped.length ? mapped : FALLBACK_SERVICES);
        }
        setServicesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (services.length > 0 && !selected) setSelected(services[0]); }, [services, selected]);

  const meta = { group: activeGroup, age: activeAge };
  const isEN = lang === "EN";

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
    updated: isEN?"Info updated June 2026":"Info juin 2026",
    phone: isEN?"211 or other":"211 ou autre",
    qr: isEN?"QR code (our app)":"Code QR",
    langs: isEN?"Languages:":"Langues:",
  };

  const toggleArr = (arr, setArr, val) => setArr(p => p.includes(val) ? p.filter(x=>x!==val) : [...p, val]);

  const filtered = services.filter(s => {
    const mg = activeGroup.length===0 || s.group.some(g=>activeGroup.includes(g));
    const mge = !activeGender || s.gender===activeGender || s.gender==="All";
    const mc = activeCategory.length===0 || activeCategory.includes(s.category);
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.type.toLowerCase().includes(search.toLowerCase());
    return mg && mge && mc && ms;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedFiltered = filtered.slice(listPage * PAGE_SIZE, (listPage + 1) * PAGE_SIZE);

  useEffect(() => { setListPage(0); }, [activeGroup, activeGender, activeAge, activeCategory, search]);

  const handleSelect = s => { setSelected(s); setFlyerDone(false); setMapCenter([s.lat,s.lng]); setRightTab("info"); logEvent("service_card_opened",s.name,meta); };

  const handleDownload = () => {
    const others = services.filter(s=>s.id!==selected.id);
    generatePDF(selected, lang, others);
    logFlyer(selected,{group:activeGroup,gender:activeGender,location:distLocation?.name||"unknown"},meta);
    setFlyerDone(true);
  };

  // ROLE SELECTION 
  if (step==="role") return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem"}}>
      <div style={{maxWidth:520,width:"100%",textAlign:"center"}}>
        <div style={{marginBottom:8}}>
            <Radar size={44} color="#2563EB" />
        </div>
        <h1 style={{fontSize:28,fontWeight:700,color:"#0F172A",margin:"0 0 16px"}}>{T.title}</h1>
        <p style={{color:"#64748B",fontSize:13,marginBottom:16}}>McGill University MMA · BUSA 649 · Community Project</p>
        <div style={{display:"flex",justifyContent:"center",marginBottom:32}}>
          <div style={{display:"flex",background:"#F1F5F9",borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"5px 14px",border:"none",background:lang===l?"#2563EB":"transparent",color:lang===l?"#fff":"#334155",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:13}}>{l}</button>)}
          </div>
        </div>
        <p style={{fontWeight:600,fontSize:17,color:"#0F172A",marginBottom:16}}>{T.chooseRole}</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>{setRole("v1");logEvent("role_selected","v1",{});setStep("location");}}
            style={{padding:"20px 24px",borderRadius:8,border:"1.5px solid #0891B2",background:"#ECFEFF",color:"#164E63",textAlign:"left",cursor:"pointer"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>V1 — {T.roleV1}</div>
            <div style={{fontSize:13,opacity:0.8}}>{T.roleV1sub}</div>
          </button>
          <button onClick={()=>{setRole("v2");logEvent("role_selected","v2",{});setStep("v2");}}
            style={{padding:"20px 24px",borderRadius:8,border:"1.5px solid #059669",background:"#ECFDF5",color:"#059669",textAlign:"left",cursor:"pointer"}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>V2 — {T.roleV2}</div>
            <div style={{fontSize:13,opacity:0.8}}>{T.roleV2sub}</div>
          </button>
        </div>
      </div>
    </div>
  );

  // V2 
  if (step==="v2") return <PlannerView lang={lang} setLang={setLang} services={services} onSwitch={()=>{setRole("v1");setStep("main");}}/>;

  // LOCATION SELECTION (V1 only)
  if (step==="location") return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"2rem"}}>
      <div style={{maxWidth:520,width:"100%",textAlign:"center"}}>
        <div style={{marginBottom:8}}>
            <LocateFixed size={44} color="#2563EB" />
        </div>
        <h1 style={{fontSize:28,fontWeight:700,color:"#0F172A",margin:"0 0 6px"}}>{T.title}</h1>
        <p style={{color:"#64748B",fontSize:13,marginBottom:16}}>McGill University MMA · BUSA 649 · Community Project</p>
        <p style={{color:"#64748B",fontSize:14,marginBottom:32}}>{isEN?"Step 2 of 2":"Étape 2 de 2"}</p>
        <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"2rem",boxShadow:"0 2px 16px rgba(0,0,0,0.06)",textAlign:"left"}}>
          <p style={{fontWeight:600,fontSize:16,color:"#0F172A",marginBottom:4,textAlign:"center"}}>
            {isEN?"Where are you distributing from?":"D'où distribuez-vous?"}
          </p>
          <p style={{fontSize:13,color:"#64748B",marginBottom:20,textAlign:"center"}}>
            {isEN?"This will be shown as 'You are here' on the flyer map":"Ce point apparaîtra comme 'Vous êtes ici' sur le dépliant"}
          </p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {DIST_LOCATIONS.map(loc=>(
              <button key={loc.id} onClick={()=>{setDistLocation(loc);logEvent("dist_location_selected",loc.name,{});setStep("main");}}
                style={{padding:"14px 18px",borderRadius:8,border:`1.5px solid ${distLocation?.id===loc.id?"#2563EB":"#E2E8F0"}`,background:distLocation?.id===loc.id?"#EFF6FF":"#fff",color:"#0F172A",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#059669",flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{loc.name}</div>
                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>{loc.org}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <button onClick={()=>setStep("role")} style={{marginTop:16,background:"transparent",border:"none",color:"#64748B",fontSize:13,cursor:"pointer"}}>
          ← {isEN?"Back":"Retour"}
        </button>
      </div>
    </div>
  );;

  // V1 MAIN 
  return (
    <div style={{minHeight:"100vh",background:"#FFFFFF",fontFamily:"system-ui,sans-serif",fontSize:14}}>
      {/* TOP BAR */}
      <div style={{background:"#0B1220",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:1000,borderBottom:"1px solid #1E293B"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Radar size={20} color="#2563EB"/>
          <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>{T.title} </div>
          <div style={{width:1,height:16,background:"#334155",margin:"0 4px"}}/>
          <div style={{fontSize:12,color:"#60A5FA",fontWeight:600,textTransform:"uppercase",letterSpacing:0.6}}>Community View (V1)</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {distLocation && (
            <div style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.1)",padding:"4px 10px",borderRadius:6,display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#059669",display:"inline-block"}}/>
              {distLocation.name}
              <button onClick={()=>setStep("location")} style={{background:"none",border:"none",color:"#60A5FA",cursor:"pointer",fontSize:11,padding:"0 2px"}}>change</button>
            </div>
          )}
          <div style={{display:"flex",background:"rgba(255,255,255,0.1)",borderRadius:6,overflow:"hidden"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"4px 10px",border:"none",background:lang===l?"#2563EB":"transparent",color:"#fff",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:12}}>{l}</button>)}
          </div>
          <button onClick={()=>setStep("v2")} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:12}}>V2 Planner</button>
          <button onClick={()=>setStep("role")} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:11}}><ChevronLeft size={12}/> Exit</button>
        </div>
      </div>

      <div style={{padding:"14px 20px"}}>
        {/* SEARCH */}
        <div style={{position:"relative",marginBottom:14}}>
          <Search size={16} color="#2563EB" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)"}}/>
          <input value={search} onChange={e=>{setSearch(e.target.value);logEvent("search",e.target.value,meta);}}
            placeholder={T.search}
            style={{width:"100%",padding:"12px 14px 12px 42px",borderRadius:8,border:"2px solid #2563EB",background:"#fff",fontSize:14,outline:"none",boxShadow:"0 2px 8px rgba(37,99,235,0.12)",boxSizing:"border-box"}}/>
        </div>

        {/* FILTERS */}
        <div style={{background:"#F1F5F9",borderRadius:8,padding:"10px 14px",marginBottom:14,border:"1px solid #E2E8F0"}}>
          <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center"}}>
          {/* Group */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#64748B",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterGroup}</span>
            {[{val:"Indigenous",color:"#059669",bg:"#ECFDF5",border:"#059669"},{val:"Immigrant",color:"#164E63",bg:"#ECFEFF",border:"#0891B2"}].map(g=>(
              <Chip key={g.val} active={activeGroup.includes(g.val)} color={g.color} bg={g.bg} border={g.border} onClick={()=>{toggleArr(activeGroup,setActiveGroup,g.val);logEvent("group_filter",g.val,meta);}}>
                <span style={{width:12,height:12,borderRadius:3,border:`1.5px solid ${activeGroup.includes(g.val)?g.color:"#E2E8F0"}`,background:activeGroup.includes(g.val)?g.color:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:8,fontWeight:700,flexShrink:0}}>{activeGroup.includes(g.val)?"✓":""}</span>
                {g.val}
              </Chip>
            ))}
          </div>
          {/* Gender */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#64748B",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterGender}</span>
            {GENDER_OPTS.map(g=>(
              <Chip key={g.val} active={activeGender===g.val} color="#2563EB" bg="#EFF6FF" border="#2563EB" onClick={()=>setActiveGender(activeGender===g.val?null:g.val)}>
                {g.icon} {g.label}
              </Chip>
            ))}
          </div>
          {/* Age */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#64748B",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterAge}</span>
            {AGE_RANGES.map(a=>(
              <Chip key={a} active={activeAge.includes(a)} color="#2563EB" bg="#EFF6FF" border="#2563EB" onClick={()=>{toggleArr(activeAge,setActiveAge,a);logEvent("age_filter",a,meta);}}>
                {a}
              </Chip>
            ))}
          </div>
          {/* Category */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#64748B",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>{T.filterCat}</span>
            {CATEGORIES.map(c=>(
              <Chip key={c.label} active={activeCategory.includes(c.label)} color={c.color} bg={c.bg} border={c.color} onClick={()=>{toggleArr(activeCategory,setActiveCategory,c.label);logEvent("category_filter",c.label,meta);}}>
                <CatIcon category={c.label} size={13} color={c.color}/> {c.label}
              </Chip>
            ))}
          </div>
          </div>
        </div>

        {/* MAIN: list | right panel */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* LEFT: list or map */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {showMap ? (
              <div style={{position:"relative",flex:1,minHeight:440,zIndex:0}}>
                <button onClick={()=>setShowMap(false)} style={{position:"absolute",top:10,left:10,zIndex:1001,padding:"5px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",cursor:"pointer",fontSize:13}}>{T.backList}</button>
                <MapContainer center={[45.5088,-73.5878]} zoom={14} style={{height:"100%",width:"100%"}} zoomControl={true}>
                  <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
                  {mapCenter && <FlyTo center={mapCenter}/>}
                  {filtered.map(s=>(
                    <Marker key={s.id} position={[s.lat,s.lng]} icon={makeIcon(s.category,selected?.id===s.id)} eventHandlers={{click:()=>handleSelect(s)}}>
                      <Popup><div style={{fontFamily:"system-ui",minWidth:150}}><div style={{fontWeight:700,fontSize:12,color:CAT_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CatIcon category={s.category} size={13} color={CAT_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:11,color:"#64748B"}}>{s.type} · {s.dist}</div><div style={{fontSize:11,color:"#64748B"}}>{s.hours}</div></div></Popup>
                    </Marker>
                  ))}
                </MapContainer>
                <div style={{position:"absolute",bottom:10,left:10,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"4px 8px",border:"1px solid #E2E8F0",display:"flex",flexDirection:"column",gap:3}}>
                  {CATEGORIES.map(c=><div key={c.label} style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}><div style={{width:8,height:8,borderRadius:"50%",background:c.color}}/>{c.label}</div>)}
                </div>
              </div>
            ) : (
              <>
                <div style={{padding:"10px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontWeight:700,fontSize:16}}>{T.nearby} <span style={{fontWeight:400,color:"#64748B",fontSize:13}}>({servicesLoading?"…":filtered.length})</span></span>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {!servicesLoading && filtered.length>0 && (
                      <span style={{fontSize:12,color:"#94A3B8"}}>{isEN?"Page":"Page"} {listPage+1}/{totalPages}</span>
                    )}
                    <div style={{display:"flex",border:"1px solid #E2E8F0",borderRadius:6,overflow:"hidden"}}>
                      <button onClick={()=>setViewMode("list")} style={{padding:"4px 9px",border:"none",background:viewMode==="list"?"#2563EB":"#fff",color:viewMode==="list"?"#fff":"#64748B",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                        ☰ List
                      </button>
                      <button onClick={()=>setViewMode("grid")} style={{padding:"4px 9px",border:"none",background:viewMode==="grid"?"#2563EB":"#fff",color:viewMode==="grid"?"#fff":"#64748B",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                        ⊞ Grid
                      </button>
                    </div>
                  </div>
                </div>
                {servicesError && (
                  <div style={{padding:"8px 16px",background:"#FFFBEB",borderBottom:"1px solid #FDE68A",color:"#92400E",fontSize:11}}>
                    {isEN?"Couldn't load live data — showing demo data.":"Impossible de charger les données — affichage des données de démonstration."}
                  </div>
                )}
                <div style={{overflowY:"auto",flex:1,padding:viewMode==="grid"?"10px":"0"}}>
                  {filtered.length===0
                    ? <div style={{padding:20,color:"#64748B",textAlign:"center",fontSize:14}}>{servicesLoading?(isEN?"Loading services…":"Chargement des services…"):(isEN?"No services match.":"Aucun service trouvé.")}</div>
                    : viewMode==="list"
                      ? pagedFiltered.map((s,i)=>(
                          <div key={s.id} onClick={()=>handleSelect(s)}
                            style={{padding:"12px 16px",borderBottom:i<pagedFiltered.length-1?"1px solid #E2E8F0":"none",cursor:"pointer",background:selected?.id===s.id?"#EFF6FF":"transparent",borderLeft:selected?.id===s.id?"3px solid #2563EB":"3px solid transparent",transition:"background 0.15s"}}>
                            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                              <div style={{width:38,height:38,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><CatIcon category={s.category} size={19} color={selected?.id===s.id?"#fff":CAT_COLORS[s.category]}/></div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600,color:selected?.id===s.id?"#2563EB":"#0F172A",fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                                <div style={{color:"#64748B",fontSize:13,margin:"3px 0 6px"}}>{s.dist} · {s.hours}{s.gender!=="All"?` · ${s.gender} only`:""}</div>
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {s.tags.slice(0,1).map(t=><span key={t} style={{padding:"2px 8px",borderRadius:4,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:12}}>{truncateText(t,44)}</span>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {pagedFiltered.map(s=>(
                            <div key={s.id} onClick={()=>handleSelect(s)}
                              style={{padding:"12px",borderRadius:8,border:`1.5px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,background:selected?.id===s.id?"#EFF6FF":"#fff",cursor:"pointer",transition:"all 0.15s"}}>
                              <div style={{width:36,height:36,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><CatIcon category={s.category} size={18} color={selected?.id===s.id?"#fff":CAT_COLORS[s.category]}/></div>
                              <div style={{fontWeight:600,fontSize:13,color:selected?.id===s.id?"#2563EB":"#0F172A",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                              <div style={{fontSize:11,color:"#64748B",marginBottom:6}}>{s.type}</div>
                              <div style={{fontSize:11,color:"#64748B",marginBottom:6}}>{s.dist} · {s.hours}</div>
                              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                {s.tags.slice(0,1).map(t=><span key={t} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:10}}>{truncateText(t,30)}</span>)}
                              </div>
                            </div>
                          ))}
                        </div>
                  }
                </div>
                <div style={{padding:"12px 16px",borderTop:"1px solid #E2E8F0",display:"flex",flexDirection:"column",gap:8}}>
                  {totalPages > 1 && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setListPage(p=>Math.max(0,p-1))} disabled={listPage===0}
                        style={{flex:1,padding:"7px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage===0?"#F8FAFC":"#fff",color:listPage===0?"#CBD5E1":"#334155",cursor:listPage===0?"default":"pointer",fontSize:13}}>
                        ← {isEN?"Prev":"Précédent"}
                      </button>
                      <button onClick={()=>setListPage(p=>Math.min(totalPages-1,p+1))} disabled={listPage>=totalPages-1}
                        style={{flex:1,padding:"7px",borderRadius:8,border:"1px solid #E2E8F0",background:listPage>=totalPages-1?"#F8FAFC":"#fff",color:listPage>=totalPages-1?"#CBD5E1":"#334155",cursor:listPage>=totalPages-1?"default":"pointer",fontSize:13}}>
                        {isEN?"Next":"Suivant"} →
                      </button>
                    </div>
                  )}
                  <button onClick={()=>{setShowMap(true);logEvent("map_opened","view_on_map",meta);}}
                    style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F1F5F9",color:"#0F172A",cursor:"pointer",fontSize:14,fontWeight:500}}>
                    {T.viewMap}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: tabbed panel */}
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {selected && (
              <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%"}}>
                {/* Tab bar */}
                <div style={{display:"flex",borderBottom:"1px solid #E2E8F0"}}>
                  {[
                    { id:"info", label: isEN?"Service info":"Infos du service" },
                    { id:"flyer", label: isEN?"Flyer preview":"Aperçu du dépliant" },
                  ].map(tab=>(
                    <button key={tab.id} onClick={()=>setRightTab(tab.id)}
                      style={{flex:1,padding:"11px",border:"none",background:rightTab===tab.id?"#fff":"#F8FAFC",borderBottom:rightTab===tab.id?"2px solid #059669":"2px solid transparent",color:rightTab===tab.id?"#059669":"#64748B",fontWeight:rightTab===tab.id?600:400,cursor:"pointer",fontSize:13,transition:"all 0.15s"}}>
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
                        <CatIcon category={selected.category} size={22} color="#34D399"/>
                      </div>
                      <div>
                        <div style={{fontWeight:700,fontSize:16,color:"#0F172A",lineHeight:1.3}}>{selected.name}</div>
                        <div style={{fontSize:11,color:"#34D399",fontWeight:600,marginTop:3,textTransform:"uppercase",letterSpacing:0.6}}>{selected.type}</div>
                      </div>
                    </div>

                    {/* Info rows */}
                    <div style={{padding:"4px 20px",flex:1}}>
                      {[
                        selected.address && { icon:"📍", label: isEN?"Address":"Adresse", value: selected.address },
                        selected.hours   && { icon:"🕐", label: isEN?"Hours":"Horaires",  value: selected.hours },
                        selected.phone   && { icon:"📞", label: isEN?"Phone":"Téléphone",  value: selected.phone },
                        selected.langs?.length>0 && { icon:"🌐", label: isEN?"Languages":"Langues", value: selected.langs.join(" · ") },
                      ].filter(Boolean).map((row,i,arr)=>(
                        <div key={row.label} style={{display:"flex",gap:12,padding:"11px 0",borderBottom:i<arr.length-1?"1px solid #F1F5F9":"none",alignItems:"flex-start"}}>
                          <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{row.icon}</span>
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:2}}>{row.label}</div>
                            <div style={{fontSize:13,color:"#1E293B",lineHeight:1.4}}>{row.value}</div>
                          </div>
                        </div>
                      ))}

                      {selected.tags?.length > 0 && (
                        <div style={{paddingTop:12,paddingBottom:12}}>
                          <div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>{isEN?"Services offered":"Services offerts"}</div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {selected.tags.map(t=>(
                              <span key={t} style={{padding:"4px 10px",borderRadius:20,background:"#ECFDF5",color:"#059669",fontSize:12,fontWeight:500,border:"1px solid #A7F3D0"}}>{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div style={{padding:"14px 20px",borderTop:"1px solid #F1F5F9",background:"#FAFAFA"}}>
                      <div style={{color:"#CBD5E1",fontSize:11,fontStyle:"italic",marginBottom:10}}>{T.updated}</div>
                      <button onClick={()=>setRightTab("flyer")}
                        style={{width:"100%",padding:"11px",borderRadius:8,border:"none",background:"#059669",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:14}}>
                        {isEN?"Preview Flyer →":"Prévisualiser le dépliant →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Flyer preview tab — A5 flyer layout */}
                {rightTab==="flyer" && (
                  <div style={{flex:1,overflowY:"auto",background:"#F1F5F9",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
                    {/* The actual flyer — this is what gets screenshot-ed for PDF */}
                    <div id="flyer-preview-content" style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 4px 20px rgba(0,0,0,0.10)",fontFamily:"system-ui,sans-serif"}}>
                      {/* Flyer header */}
                      <div style={{background:CAT_COLORS[selected.category]||"#2563EB",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Community Radar · {isEN?"Community Services":"Services communautaires"}</div>
                          <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{selected.name}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",marginTop:2}}>{selected.type}</div>
                        </div>
                        <div style={{width:36,height:36,borderRadius:8,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <CatIcon category={selected.category} size={20} color="#fff"/>
                        </div>
                      </div>

                      {/* Map */}
                      <div style={{height:160,position:"relative",zIndex:0}}>
                        <MapContainer key={selected.id+"-"+(distLocation?.id||"gps")} center={[selected.lat,selected.lng]} zoom={15} style={{height:"100%",width:"100%"}} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}>
                          <TileLayer attribution="" url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
                          <FitFlyerBounds points={distLocation ? [[distLocation.lat,distLocation.lng],[selected.lat,selected.lng]] : [[selected.lat,selected.lng]]}/>
                          {distLocation && <Marker position={[distLocation.lat,distLocation.lng]} icon={makeYouIcon()}/>}
                          <Marker position={[selected.lat,selected.lng]} icon={makeIcon(selected.category,true)}/>
                        </MapContainer>
                        {distLocation && (
                          <div style={{position:"absolute",bottom:6,left:6,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:4,padding:"3px 7px",fontSize:10,border:"1px solid #E2E8F0",display:"flex",gap:8}}>
                            <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:7,height:7,borderRadius:"50%",background:"#059669",display:"inline-block"}}/>{isEN?"You are here":"Vous êtes ici"}</span>
                            <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[selected.category],display:"inline-block"}}/>{selected.type}</span>
                          </div>
                        )}
                      </div>

                      {/* Service details */}
                      <div style={{padding:"12px 16px"}}>
                        {selected.address && <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}><span style={{fontSize:13}}>📍</span><span style={{fontSize:12,color:"#334155",lineHeight:1.4}}>{selected.address}</span></div>}
                        {selected.hours   && <div style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}><span style={{fontSize:13}}>🕐</span><span style={{fontSize:12,color:"#334155"}}>{selected.hours}</span></div>}
                        {selected.phone   && <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}><span style={{fontSize:13}}>📞</span><span style={{fontSize:12,color:"#334155"}}>{selected.phone}</span></div>}
                        {selected.tags?.length>0 && (
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                            {selected.tags.slice(0,4).map(t=><span key={t} style={{padding:"2px 8px",borderRadius:10,background:`${CAT_COLORS[selected.category]}15`,color:CAT_COLORS[selected.category],fontSize:10,fontWeight:600,border:`1px solid ${CAT_COLORS[selected.category]}40`}}>{t}</span>)}
                          </div>
                        )}
                        {selected.langs?.length>0 && <div style={{fontSize:10,color:"#94A3B8",marginBottom:10}}>🌐 {selected.langs.join(" · ")}</div>}

                        {/* Other nearby */}
                        {services.filter(s=>s.id!==selected.id).length>0 && (
                          <div style={{borderTop:"1px solid #F1F5F9",paddingTop:8,marginTop:4}}>
                            <div style={{fontSize:9,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>{isEN?"Also nearby":"Aussi à proximité"}</div>
                            {services.filter(s=>s.id!==selected.id).slice(0,2).map(s=>(
                              <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                                <span style={{width:6,height:6,borderRadius:"50%",background:CAT_COLORS[s.category],flexShrink:0}}/>
                                <span style={{fontSize:11,color:"#334155"}}>{s.name}</span>
                                {s.dist && <span style={{fontSize:10,color:"#94A3B8"}}>· {s.dist}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Flyer footer */}
                      <div style={{background:"#F8FAFC",borderTop:"1px solid #E2E8F0",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:10,color:"#64748B",fontStyle:"italic"}}>{T.updated}</div>
                        <div style={{display:"flex",gap:8}}>
                          <div style={{padding:"4px 10px",borderRadius:5,border:"1px solid #E2E8F0",background:"#fff",fontSize:10,color:"#334155",display:"flex",alignItems:"center",gap:4}}><Phone size={10} color="#64748B"/> 211</div>
                          <div style={{padding:"4px 10px",borderRadius:5,border:"1px solid #E2E8F0",background:"#fff",fontSize:10,color:"#334155",display:"flex",alignItems:"center",gap:4}}><QrCode size={10} color="#64748B"/> App</div>
                        </div>
                      </div>
                    </div>

                    {/* Generate button outside the flyer */}
                    <div>
                      {flyerDone && <div style={{marginBottom:8,padding:"7px 10px",background:"#ECFDF5",borderRadius:6,color:"#059669",fontSize:12}}>✓ PDF downloaded successfully</div>}
                      <button onClick={handleDownload}
                        style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:"#059669",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:15}}>
                        {T.generate}
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
