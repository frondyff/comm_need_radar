import { useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Radar, LocateFixed, Search, Bot, ChevronLeft, Layers, Activity, AlertTriangle, TrendingUp } from "lucide-react";
import { CategoryIcon, CATEGORY_COLORS, createServiceMarker } from "./components/serviceVisuals";
import { FlyerPreview } from "./flyer/FlyerPreview";
import { flyerPdfExporter } from "./flyer/FlyerPdfExporter";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const MONO_FONT = "ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,monospace";
function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 1 }); }, [center]);
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
  { label:"Medical", color:CATEGORY_COLORS.Medical, bg:"#EFF6FF" },
  { label:"Legal", color:CATEGORY_COLORS.Legal, bg:"#ECFDF5" },
  { label:"Translation", color:CATEGORY_COLORS.Translation, bg:"#F5F3FF" },
];

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

function Chip({ active, color, bg, border, onClick, children }) {
  return (
    <button onClick={onClick} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${active?border:"#E2E8F0"}`,background:active?bg:"#fff",color:active?color:"#334155",fontWeight:active?600:400,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4}}>
      {children}
    </button>
  );
}

function LocationBadge({ location, onChange, changeLabel="change" }) {
  if (!location) return null;

  return (
    <div style={{fontSize:12,color:"#fff",background:"rgba(255,255,255,0.1)",padding:"4px 10px",borderRadius:6,display:"flex",alignItems:"center",gap:5}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:"#059669",display:"inline-block",flexShrink:0}}/>
      <span style={{fontWeight:600,whiteSpace:"nowrap"}}>{location.name}</span>
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

function ChoroplethMap({ selectedBorough, onSelect }) {
  const [geojson, setGeojson] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/blackmad/neighborhoods/master/montreal.geojson")
      .then(r => r.json())
      .then(data => setGeojson(data))
      .catch(() => setGeojson(null));
  }, []);

  const onEachFeature = (feature, layer) => {
    const name = feature.properties?.name || "";
    const data = BOROUGH_SCORES[name];
    const score = data?.score;
    layer.setStyle({
      fillColor: scoreToColor(score),
      fillOpacity: 0.8,
      color: name === selectedBorough ? "#0F172A" : "#fff",
      weight: name === selectedBorough ? 2.5 : 1,
    });
    layer.on({
      click: () => onSelect(name),
      mouseover: (e) => { e.target.setStyle({ fillOpacity: 1 }); },
      mouseout: (e) => { e.target.setStyle({ fillOpacity: 0.8 }); },
    });
    if (name) {
      layer.bindTooltip(`<b>${name}</b>${score ? `<br/>Gap Score: <b>${score}</b>` : ""}`, { sticky: true });
    }
  };

  const style = (feature) => {
    const name = feature.properties?.name || "";
    return {
      fillColor: scoreToColor(BOROUGH_SCORES[name]?.score),
      fillOpacity: 0.8,
      color: name === selectedBorough ? "#0F172A" : "#fff",
      weight: name === selectedBorough ? 2.5 : 1,
    };
  };

  return (
    <div style={{height:"100%",width:"100%",position:"relative",zIndex:0}}>
      <MapContainer center={[45.53,-73.65]} zoom={11} style={{height:"100%",width:"100%"}} zoomControl={true}>
        <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" opacity={0.3}/>
        {geojson && (
          <GeoJSON key={selectedBorough} data={geojson} style={style} onEachFeature={onEachFeature}/>
        )}
        {!geojson && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,background:"rgba(255,255,255,0.7)",fontSize:13,color:"#64748B"}}>
            Loading map…
          </div>
        )}
      </MapContainer>
    </div>
  );
}

function PlannerView({ lang, setLang, onSwitch, onExit, location, onChangeLocation }) {
  const [chat, setChat] = useState("");
  const [selectedBorough, setSelectedBorough] = useState("Mercier-Hochelaga-Maisonneuve");
  const priorities = Object.entries(BOROUGH_SCORES)
    .sort((a,b)=>b[1].score-a[1].score)
    .slice(0,5)
    .map(([name,d])=>({ name: name.length>18?name.slice(0,16)+"…":name, fullName:name, score:d.score }));
  const areaData = BOROUGH_SCORES[selectedBorough] || { score:0, income:0, housing:0, immigration:0 };
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
          <LocationBadge location={location} onChange={onChangeLocation}/>
          <div style={{display:"flex",background:"rgba(255,255,255,0.08)",borderRadius:6,overflow:"hidden"}}>
            {["EN","FR"].map(l=><button key={l} onClick={()=>setLang(l)} style={{padding:"4px 10px",border:"none",background:lang===l?"#2563EB":"transparent",color:"#fff",fontWeight:lang===l?700:400,cursor:"pointer",fontSize:12}}>{l}</button>)}
          </div>
          <button onClick={onSwitch} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:12}}>Community View (V1)</button>
          <button onClick={onExit} style={{display:"flex",alignItems:"center",gap:3,padding:"4px 10px",borderRadius:6,border:"none",color:"#CBD5E1",background:"transparent",cursor:"pointer",fontSize:11}}><ChevronLeft size={12}/> Exit</button>
        </div>
      </div>
      <div style={{padding:"16px 20px"}}>
        {/* KPI cards */}
        <div style={{display:"flex",background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,marginBottom:16,overflow:"hidden"}}>
          {[
            { label:"Tracts analyzed", val:"512", sub:"of 512 citywide", icon:Layers, color:"#4F46E5", bg:"#EEF2FF" },
            { label:"Average gap score", val:"0.42", sub:"0.03 vs last quarter", trend:"up", icon:Activity, color:"#E11D48", bg:"#FFF1F2" },
            { label:"High-priority areas", val:"23", sub:"6 newly flagged", icon:AlertTriangle, color:"#D97706", bg:"#FFFBEB" },
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
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.1fr 240px",gap:12,marginBottom:12}}>
          {/* Real choropleth */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #E2E8F0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:600,fontSize:15}}>{isEN?"Vulnerability heatmap — click a borough":"Carte de vulnérabilité — cliquez un arrondissement"}</span>
              <span style={{fontSize:13,color:"#64748B"}}>{isEN?"by Gap Score":"par Score d'écart"}</span>
            </div>
            <div style={{flex:1,minHeight:460}}>
              <ChoroplethMap selectedBorough={selectedBorough} onSelect={setSelectedBorough}/>
            </div>
            <div style={{padding:"10px 16px",borderTop:"1px solid #E2E8F0",display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#334155"}}>
              <span>{isEN?"Low":"Faible"}</span>
              <div style={{flex:1,height:6,borderRadius:3,background:"linear-gradient(to right,#FFE4E6,#FB7185,#E11D48,#9F1239)"}}/>
              <span>{isEN?"High":"Élevé"}</span>
            </div>
          </div>

          {/* Street map */}
          <div style={{borderRadius:8,overflow:"hidden",border:"1px solid #E2E8F0",position:"relative",zIndex:0,minHeight:460}}>
            <div style={{position:"absolute",top:8,left:8,zIndex:1001,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 12px",fontSize:14,fontWeight:600,color:"#0F172A",border:"1px solid #E2E8F0"}}>
              {isEN?"Service locations":"Emplacements des services"}
            </div>
            <MapContainer center={[45.5188,-73.5878]} zoom={12} style={{height:"100%",width:"100%"}} zoomControl={true}>
              <TileLayer attribution='© CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
              {SERVICES.map(s=>(
                <Marker key={s.id} position={[s.lat,s.lng]} icon={createServiceMarker(s.category,false)}>
                  <Popup><div style={{fontFamily:"system-ui",minWidth:140}}><div style={{fontWeight:700,fontSize:13,color:CATEGORY_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CategoryIcon category={s.category} size={14} color={CATEGORY_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:12,color:"#64748B"}}>{s.type} · {s.dist}</div></div></Popup>
                </Marker>
              ))}
            </MapContainer>
            <div style={{position:"absolute",bottom:8,left:8,zIndex:1000,background:"rgba(255,255,255,0.95)",borderRadius:6,padding:"5px 10px",border:"1px solid #E2E8F0",fontSize:12,display:"flex",gap:10,flexWrap:"wrap"}}>
              {CATEGORIES.map(c=><span key={c.label} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:"50%",background:c.color,display:"inline-block"}}/>{c.label}</span>)}
            </div>
          </div>

          {/* Top priority areas — clickable */}
          <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>{isEN?"Top priority areas (by Gap Score)":"Zones prioritaires (par Score d'écart)"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
              {priorities.map((p,i)=>(
                <div key={p.name} onClick={()=>setSelectedBorough(p.fullName)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,cursor:"pointer",background:selectedBorough===p.fullName?"#EFF6FF":"#F1F5F9",border:`1px solid ${selectedBorough===p.fullName?"#2563EB":"#E2E8F0"}`,transition:"all 0.15s"}}>
                  <span style={{fontSize:13,fontWeight:selectedBorough===p.fullName?600:400,color:selectedBorough===p.fullName?"#2563EB":"#0F172A"}}>{p.name}</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#2563EB",background:"#EFF6FF",padding:"3px 8px",borderRadius:4,fontFamily:MONO_FONT}}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Area profile — updates when borough clicked */}
        <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"16px",marginBottom:12}}>
          <div style={{fontWeight:600,fontSize:15,marginBottom:12}}>
            {isEN?"Area profile":"Profil de la zone"} — <span style={{color:"#2563EB"}}>{selectedBorough}</span>
            <span style={{marginLeft:10,fontSize:13,color:"#64748B",fontWeight:400}}>Gap Score: <b style={{fontFamily:MONO_FONT}}>{areaData.score}</b></span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
            {[
              [isEN?"Low income":"Faible revenu", areaData.income],
              [isEN?"Housing burden":"Charge logement", areaData.housing],
              [isEN?"Recent immigration":"Immigration récente", areaData.immigration],
            ].map(([label,pct])=>(
              <div key={label}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}><span>{label}</span><span style={{fontWeight:600,fontFamily:MONO_FONT}}>{pct.toFixed(2)}</span></div>
                <div style={{height:8,borderRadius:4,background:"#F1F5F9"}}>
                  <div style={{height:8,width:`${pct*100}%`,borderRadius:4,background:"#2563EB",transition:"width 0.4s"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const DIST_LOCATIONS = [
  { id:"cabot",   name:"Cabot Square",           org:"Resilience Montreal",  lat:45.4943, lng:-73.5779 },
  { id:"milton",  name:"Milton Park",             org:"PAQ Office",           lat:45.5106, lng:-73.5783 },
  { id:"cdn",     name:"CLSC Côte-des-Neiges",   org:"CLSC",                 lat:45.4889, lng:-73.6241 },
  { id:"parcext", name:"Parc-Extension",          org:"BIPE",                 lat:45.5356, lng:-73.6219 },
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

  // V1 filters
  const [activeGroup, setActiveGroup] = useState([]);
  const [activeGender, setActiveGender] = useState(null);
  const [activeAge, setActiveAge] = useState([]);
  const [activeCategory, setActiveCategory] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(SERVICES[0]);
  const [showMap, setShowMap] = useState(false);
  const [flyerDone, setFlyerDone] = useState(false);
  const [isDownloadingFlyer, setIsDownloadingFlyer] = useState(false);
  const [flyerDownloadError, setFlyerDownloadError] = useState("");
  const [mapCenter, setMapCenter] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [rightTab, setRightTab] = useState("info"); // "info" | "flyer"

  const meta = { group: activeGroup, age: activeAge };
  const isEN = lang === "EN";
  const selectedLocation = distLocation || DEFAULT_DIST_LOCATION;

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

  const filtered = SERVICES.filter(s => {
    const mg = activeGroup.length===0 || s.group.some(g=>activeGroup.includes(g));
    const mge = !activeGender || s.gender===activeGender || s.gender==="All";
    const mc = activeCategory.length===0 || activeCategory.includes(s.category);
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.type.toLowerCase().includes(search.toLowerCase());
    return mg && mge && mc && ms;
  });

  const handleSelect = s => { setSelected(s); setFlyerDone(false); setFlyerDownloadError(""); setMapCenter([s.lat,s.lng]); setRightTab("info"); logEvent("service_card_opened",s.name,meta); };

  const handleChangeLocation = (returnStep, backStep=returnStep) => {
    setLocationReturnStep(returnStep);
    setLocationBackStep(backStep);
    setStep("location");
  };

  const handleLocationSelected = (location) => {
    setDistLocation(location);
    logEvent("dist_location_selected", location.name, {});
    setStep(locationReturnStep);
  };

  const handleDownload = async () => {
    if (!selected || isDownloadingFlyer) return;

    setFlyerDone(false);
    setFlyerDownloadError("");
    setIsDownloadingFlyer(true);

    try {
      await flyerPdfExporter.export(selected);
      setFlyerDone(true);
      logFlyer(selected,{group:activeGroup,gender:activeGender,location:selectedLocation.name},meta);
    } catch (error) {
      console.error("Could not download the flyer PDF", error);
      setFlyerDownloadError(isEN ? "The flyer could not be downloaded. Please try again." : "Le dépliant n'a pas pu être téléchargé. Veuillez réessayer.");
    } finally {
      setIsDownloadingFlyer(false);
    }
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
          <button onClick={()=>{setRole("v1");logEvent("role_selected","v1",{});handleChangeLocation("main","role");}}
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
  if (step==="v2") return (
    <PlannerView
      lang={lang}
      setLang={setLang}
      location={selectedLocation}
      onChangeLocation={()=>handleChangeLocation("v2")}
      onSwitch={()=>{setRole("v1");setStep("main");}}
      onExit={()=>setStep("role")}
    />
  );

  // LOCATION SELECTION
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
              <button key={loc.id} onClick={()=>handleLocationSelected(loc)}
                style={{padding:"14px 18px",borderRadius:8,border:`1.5px solid ${selectedLocation.id===loc.id?"#2563EB":"#E2E8F0"}`,background:selectedLocation.id===loc.id?"#EFF6FF":"#fff",color:"#0F172A",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#059669",flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{loc.name}</div>
                  <div style={{fontSize:12,color:"#64748B",marginTop:2}}>{loc.org}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <button onClick={()=>setStep(locationBackStep)} style={{marginTop:16,background:"transparent",border:"none",color:"#64748B",fontSize:13,cursor:"pointer"}}>
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
          <LocationBadge location={selectedLocation} onChange={()=>handleChangeLocation("main")}/>
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
                <CategoryIcon category={c.label} size={13} color={c.color}/> {c.label}
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
                    <Marker key={s.id} position={[s.lat,s.lng]} icon={createServiceMarker(s.category,selected?.id===s.id)} eventHandlers={{click:()=>handleSelect(s)}}>
                      <Popup><div style={{fontFamily:"system-ui",minWidth:150}}><div style={{fontWeight:700,fontSize:12,color:CATEGORY_COLORS[s.category],display:"flex",alignItems:"center",gap:5}}><CategoryIcon category={s.category} size={13} color={CATEGORY_COLORS[s.category]}/> {s.name}</div><div style={{fontSize:11,color:"#64748B"}}>{s.type} · {s.dist}</div><div style={{fontSize:11,color:"#64748B"}}>{s.hours}</div></div></Popup>
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
                  <span style={{fontWeight:700,fontSize:16}}>{T.nearby} <span style={{fontWeight:400,color:"#64748B",fontSize:13}}>({filtered.length})</span></span>
                  <div style={{display:"flex",border:"1px solid #E2E8F0",borderRadius:6,overflow:"hidden"}}>
                    <button onClick={()=>setViewMode("list")} style={{padding:"4px 9px",border:"none",background:viewMode==="list"?"#2563EB":"#fff",color:viewMode==="list"?"#fff":"#64748B",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                      ☰ List
                    </button>
                    <button onClick={()=>setViewMode("grid")} style={{padding:"4px 9px",border:"none",background:viewMode==="grid"?"#2563EB":"#fff",color:viewMode==="grid"?"#fff":"#64748B",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                      ⊞ Grid
                    </button>
                  </div>
                </div>
                <div style={{overflowY:"auto",flex:1,padding:viewMode==="grid"?"10px":"0"}}>
                  {filtered.length===0
                    ? <div style={{padding:20,color:"#64748B",textAlign:"center",fontSize:14}}>No services match.</div>
                    : viewMode==="list"
                      ? filtered.map((s,i)=>(
                          <div key={s.id} onClick={()=>handleSelect(s)}
                            style={{padding:"12px 16px",borderBottom:i<filtered.length-1?"1px solid #E2E8F0":"none",cursor:"pointer",background:selected?.id===s.id?"#EFF6FF":"transparent",borderLeft:selected?.id===s.id?"3px solid #2563EB":"3px solid transparent",transition:"background 0.15s"}}>
                            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                              <div style={{width:38,height:38,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><CategoryIcon category={s.category} size={19} color={selected?.id===s.id?"#fff":CATEGORY_COLORS[s.category]}/></div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:600,color:selected?.id===s.id?"#2563EB":"#0F172A",fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                                <div style={{color:"#64748B",fontSize:13,margin:"3px 0 6px"}}>{s.dist} · {s.hours}{s.gender!=="All"?` · ${s.gender} only`:""}</div>
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {s.tags.slice(0,2).map(t=><span key={t} style={{padding:"2px 8px",borderRadius:4,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:12}}>{t}</span>)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          {filtered.map(s=>(
                            <div key={s.id} onClick={()=>handleSelect(s)}
                              style={{padding:"12px",borderRadius:8,border:`1.5px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,background:selected?.id===s.id?"#EFF6FF":"#fff",cursor:"pointer",transition:"all 0.15s"}}>
                              <div style={{width:36,height:36,borderRadius:"50%",background:selected?.id===s.id?"#2563EB":"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><CategoryIcon category={s.category} size={18} color={selected?.id===s.id?"#fff":CATEGORY_COLORS[s.category]}/></div>
                              <div style={{fontWeight:600,fontSize:13,color:selected?.id===s.id?"#2563EB":"#0F172A",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                              <div style={{fontSize:11,color:"#64748B",marginBottom:6}}>{s.type}</div>
                              <div style={{fontSize:11,color:"#64748B",marginBottom:6}}>{s.dist} · {s.hours}</div>
                              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                {s.tags.slice(0,1).map(t=><span key={t} style={{padding:"2px 6px",borderRadius:3,border:`1px solid ${selected?.id===s.id?"#2563EB":"#E2E8F0"}`,color:selected?.id===s.id?"#2563EB":"#334155",fontSize:10}}>{t}</span>)}
                              </div>
                            </div>
                          ))}
                        </div>
                  }
                </div>
                <div style={{padding:"12px 16px",borderTop:"1px solid #E2E8F0"}}>
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
                        <CategoryIcon category={selected.category} size={22} color="#34D399"/>
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

                {/* Flyer preview tab */}
                {rightTab==="flyer" && (
                  <div style={{flex:1,overflowY:"auto",background:"#F1F5F9",padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
                    <FlyerPreview service={selected} location={selectedLocation} services={SERVICES} language={lang} updatedLabel={T.updated}/>

                    <div>
                      {flyerDone && <div style={{marginBottom:8,padding:"7px 10px",background:"#ECFDF5",borderRadius:6,color:"#059669",fontSize:12}}>✓ PDF downloaded successfully</div>}
                      {flyerDownloadError && <div style={{marginBottom:8,padding:"7px 10px",background:"#FEF2F2",borderRadius:6,color:"#B91C1C",fontSize:12}}>{flyerDownloadError}</div>}
                      <button onClick={handleDownload} disabled={isDownloadingFlyer}
                        style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:isDownloadingFlyer?"#94A3B8":"#059669",color:"#fff",fontWeight:600,cursor:isDownloadingFlyer?"wait":"pointer",fontSize:15}}>
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
