import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { chatBarStyle, chatIconStyle, closeButtonStyle, floatingButtonStyle } from "./chatbotStyles.js";
import {
  listAreas, listServices, demandInArea, demandByArea, areaDemand,
  explainArea, areaStats, mostVulnerable, highestGap, rankBy,
} from "./groundedChatbot.js";

// Guided, no-LLM chatbot: the user picks from menus and every leaf runs a real
// Supabase query that returns { answer, source }. No API key, nothing to invent.
// The area is chosen inside the chat (not only from the map), and closing the
// chat shows a summary of the session plus a friendly goodbye.

const CATEGORY_OPTIONS = [
  ["Shelter", "shelter"], ["Food", "food"], ["Medical", "medical"],
  ["Legal", "legal"], ["Translation", "translation"], ["Any category", null],
];
const GROUP_OPTIONS = [
  ["Anyone", {}], ["Indigenous people", { indigenous: true }],
  ["Immigrants / newcomers", { immigrant: true }], ["Women", { gender: "Female" }],
  ["Youth (under 25)", { age: "Under 25" }], ["Seniors (65+)", { age: "65+" }],
];

const catText = v => CATEGORY_OPTIONS.find(o => o[1] === v)?.[0] ?? "Any category";
const areaText = pa => (pa?.areaId ? ` in ${pa.areaLabel}` : " (city-wide)");

const btnStyle = {
  display: "block", width: "100%", textAlign: "left", margin: "4px 0", padding: "8px 10px",
  border: "1px solid #DBEAFE", borderRadius: 8, background: "#F8FAFF", color: "#1E3A8A",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export function ChatbotWidget({ isEN, selectedAreaId, selectedAreaLabel }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [screen, setScreen] = useState("root");
  const [category, setCategory] = useState(null);
  const [pickedArea, setPickedArea] = useState(null);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const hasMapArea = Boolean(selectedAreaId);

  // Load the 12 areas once the chat is opened, so area questions can be answered
  // by picking from the menu rather than requiring a click on the map.
  useEffect(() => {
    if (chatOpen && areas.length === 0) {
      listAreas().then(setAreas).catch(() => setAreas([]));
    }
  }, [chatOpen, areas.length]);

  const reset = () => { setScreen("root"); setCategory(null); setPickedArea(null); setResult(null); };
  const doClose = () => {
    setChatOpen(false); setScreen("root"); setCategory(null);
    setPickedArea(null); setResult(null); setHistory([]);
  };
  const requestClose = () => (history.length ? setScreen("bye") : doClose());

  async function run(label, promise) {
    setLoading(true); setScreen("result");
    let r;
    try { r = await promise; }
    catch (e) { r = { answer: `Something went wrong: ${e.message}`, source: "n/a" }; }
    setResult(r);
    setHistory(h => [...h, { q: label, a: r.answer }]);
    setLoading(false);
  }

  const Menu = ({ title, options }) => (
    <div>
      <div style={{ fontSize: 12, color: "#64748B", margin: "2px 0 8px" }}>{title}</div>
      {options.map(([label, onClick]) => (
        <button key={label} style={btnStyle} onClick={onClick}>{label}</button>
      ))}
    </div>
  );

  // Area chooser used by every area-dependent branch.
  const AreaMenu = ({ title, includeAnywhere, onPick }) => {
    const opts = [];
    if (hasMapArea) {
      opts.push([`\u{1F4CD} ${selectedAreaLabel} (selected on map)`,
        () => onPick({ areaId: selectedAreaId, areaLabel: selectedAreaLabel })]);
    }
    if (includeAnywhere) opts.push(["Anywhere in the city", () => onPick({ areaId: null, areaLabel: null })]);
    areas.forEach(a => opts.push([a.areaLabel, () => onPick(a)]));
    if (opts.length === 0) {
      return <div style={{ fontSize: 12.5, color: "#64748B" }}>Loading areas…</div>;
    }
    return <Menu title={title} options={opts} />;
  };

  function Body() {
    if (loading) return <div style={{ fontSize: 13, color: "#64748B" }}>Loading…</div>;

    if (screen === "bye") {
      return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A", marginBottom: 8 }}>
            Summary of this session
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#64748B" }}>No questions asked.</div>
          ) : (
            history.map((h, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1E3A8A" }}>{i + 1}. {h.q}</div>
                <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "pre-wrap" }}>
                  {String(h.a).split("\n")[0]}{String(h.a).includes("\n") ? " …" : ""}
                </div>
              </div>
            ))
          )}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", margin: "12px 0 10px" }}>
            Goodbye! Thank you for using our service! {"\u{1F44B}"}
          </div>
          <button style={btnStyle} onClick={doClose}>Close</button>
        </div>
      );
    }

    if (screen === "result") {
      return (
        <div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, color: "#1E293B" }}>
            {result?.answer}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748B" }}>
            📊 Source (table): {result?.source}
          </div>
          <button style={{ ...btnStyle, marginTop: 10 }} onClick={reset}>← Ask another question</button>
        </div>
      );
    }

    if (screen === "root") {
      return (
        <Menu title="What would you like to know?"
          options={[
            ["Find services", () => setScreen("svc-cat")],
            ["Service demand", () => setScreen("dem-cat")],
            ["About an area", () => setScreen("area-pick")],
            ["City-wide rankings", () => setScreen("rank")],
          ]} />
      );
    }

    // --- Find services: category -> area -> group ---
    if (screen === "svc-cat") {
      return <Menu title="Which service category?" options={CATEGORY_OPTIONS.map(([l, v]) =>
        [l, () => { setCategory(v); setScreen("svc-area"); }])} />;
    }
    if (screen === "svc-area") {
      return <AreaMenu title="In which area?" includeAnywhere
        onPick={a => { setPickedArea(a); setScreen("svc-grp"); }} />;
    }
    if (screen === "svc-grp") {
      return <Menu title="For a specific group?" options={GROUP_OPTIONS.map(([l, aud]) =>
        [l, () => run(
          `Services: ${catText(category)}${areaText(pickedArea)}${l === "Anyone" ? "" : `, ${l}`}`,
          listServices({ category, ...pickedArea, audience: aud }),
        )])} />;
    }

    // --- Service demand: category -> metric (-> area for visits) ---
    if (screen === "dem-cat") {
      return <Menu title="Demand for which category?" options={CATEGORY_OPTIONS.slice(0, 5).map(([l, v]) =>
        [l, () => { setCategory(v); setScreen("dem-metric"); }])} />;
    }
    if (screen === "dem-metric") {
      return <Menu title="What would you like?" options={[
        ["Visits in a specific area", () => setScreen("dem-area")],
        ["Which areas have the highest demand", () => run(
          `Demand: areas that need ${catText(category)} most`, demandByArea({ category }))],
      ]} />;
    }
    if (screen === "dem-area") {
      return <AreaMenu title="Visits in which area?" includeAnywhere={false}
        onPick={a => run(`Demand: ${catText(category)} visits in ${a.areaLabel}`,
          demandInArea({ category, ...a }))} />;
    }

    // --- About an area: pick area -> sub-question ---
    if (screen === "area-pick") {
      return <AreaMenu title="About which area?" includeAnywhere={false}
        onPick={a => { setPickedArea(a); setScreen("area-menu"); }} />;
    }
    if (screen === "area-menu") {
      return <Menu title={`About ${pickedArea?.areaLabel}:`} options={[
        ["Overview (vulnerability + gap)", () => run(`${pickedArea.areaLabel}: overview`, explainArea(pickedArea))],
        ["Demographics", () => run(`${pickedArea.areaLabel}: demographics`, areaStats(pickedArea))],
        ["Total service demand", () => run(`${pickedArea.areaLabel}: total demand`, areaDemand(pickedArea))],
      ]} />;
    }

    if (screen === "rank") {
      return <Menu title="Rank the 12 areas by:" options={[
        ["Most vulnerable", () => run("Ranking: most vulnerable areas", mostVulnerable())],
        ["Highest service gap", () => run("Ranking: highest service gap", highestGap())],
        ["Most immigrants", () => run("Ranking: most immigrants",
          rankBy({ column: "immigration_indicator", label: "immigrant concentration" }))],
        ["Lowest income", () => run("Ranking: lowest income",
          rankBy({ column: "income_indicator", label: "income pressure", ascending: true }))],
      ]} />;
    }
    return null;
  }

  if (!chatOpen) {
    return (
      <button onClick={() => setChatOpen(true)} aria-label={isEN ? "Open chat" : "Ouvrir le chat"} style={floatingButtonStyle}>
        <Bot size={24} color="#fff" />
      </button>
    );
  }

  const subtitle = pickedArea?.areaLabel || selectedAreaLabel || "Montreal";
  const showHome = screen !== "root" && screen !== "bye";

  return (
    <div style={{ ...chatBarStyle, display: "block", padding: 0, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#EFF6FF", borderBottom: "1px solid #DBEAFE" }}>
        <Bot size={18} color="#2563EB" style={chatIconStyle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A" }}>
            {isEN ? "Community Radar assistant" : "Assistant Community Radar"}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        </div>
        {showHome && (
          <button onClick={reset} aria-label="Home" style={{ ...closeButtonStyle, marginRight: 4 }}>⌂</button>
        )}
        <button onClick={requestClose} aria-label={isEN ? "Close chat" : "Fermer le chat"} style={closeButtonStyle}>✕</button>
      </div>
      <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", background: "#fff" }}>
        <Body />
      </div>
    </div>
  );
}
