import { useState } from "react";
import { Bot } from "lucide-react";
import { chatBarStyle, chatIconStyle, closeButtonStyle, floatingButtonStyle } from "./chatbotStyles.js";
import {
  listServices, demandInArea, demandByArea, areaDemand,
  explainArea, areaStats, mostVulnerable, highestGap, rankBy,
} from "./groundedChatbot.js";

// Guided, no-LLM chatbot: the user picks from menus and every leaf runs a real
// Supabase query that returns { answer, source }. No API key, nothing to invent.

const CATEGORY_OPTIONS = [
  ["Shelter", "shelter"], ["Food", "food"], ["Medical", "medical"],
  ["Legal", "legal"], ["Translation", "translation"], ["Any category", null],
];
const GROUP_OPTIONS = [
  ["Anyone", {}], ["Indigenous people", { indigenous: true }],
  ["Immigrants / newcomers", { immigrant: true }], ["Women", { gender: "Female" }],
  ["Youth (under 25)", { age: "Under 25" }], ["Seniors (65+)", { age: "65+" }],
];

const btnStyle = {
  display: "block", width: "100%", textAlign: "left", margin: "4px 0", padding: "8px 10px",
  border: "1px solid #DBEAFE", borderRadius: 8, background: "#F8FAFF", color: "#1E3A8A",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export function ChatbotWidget({ isEN, selectedAreaId, selectedAreaLabel }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [screen, setScreen] = useState("root");
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const area = { areaId: selectedAreaId, areaLabel: selectedAreaLabel };
  const hasArea = Boolean(selectedAreaId);

  const reset = () => { setScreen("root"); setCategory(null); setResult(null); };
  async function run(promise) {
    setLoading(true); setScreen("result");
    try { setResult(await promise); }
    catch (e) { setResult({ answer: `Something went wrong: ${e.message}`, source: "n/a" }); }
    finally { setLoading(false); }
  }

  const Menu = ({ title, options }) => (
    <div>
      <div style={{ fontSize: 12, color: "#64748B", margin: "2px 0 8px" }}>{title}</div>
      {options.map(([label, onClick]) => (
        <button key={label} style={btnStyle} onClick={onClick}>{label}</button>
      ))}
    </div>
  );

  function Body() {
    if (loading) return <div style={{ fontSize: 13, color: "#64748B" }}>Loading…</div>;

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
        <Menu title={hasArea ? `About ${selectedAreaLabel}, or city-wide:` : "Select an area on the map for area questions, or:"}
          options={[
            ["Find services", () => setScreen("svc-cat")],
            ["Service demand", () => setScreen("dem-cat")],
            ["About this area", () => (hasArea ? setScreen("area") : null)],
            ["City-wide rankings", () => setScreen("rank")],
          ]} />
      );
    }

    if (screen === "svc-cat") {
      return <Menu title="Which service category?" options={CATEGORY_OPTIONS.map(([l, v]) =>
        [l, () => { setCategory(v); setScreen("svc-grp"); }])} />;
    }
    if (screen === "svc-grp") {
      return <Menu title="For a specific group?" options={GROUP_OPTIONS.map(([l, aud]) =>
        [l, () => run(listServices({ category, ...area, audience: aud }))])} />;
    }

    if (screen === "dem-cat") {
      return <Menu title="Demand for which category?" options={CATEGORY_OPTIONS.slice(0, 5).map(([l, v]) =>
        [l, () => { setCategory(v); setScreen("dem-metric"); }])} />;
    }
    if (screen === "dem-metric") {
      return <Menu title="What would you like?" options={[
        [hasArea ? `Visits in ${selectedAreaLabel}` : "Visits (select an area first)",
          () => (hasArea ? run(demandInArea({ category, ...area })) : null)],
        ["Which areas have the highest demand", () => run(demandByArea({ category }))],
      ]} />;
    }

    if (screen === "area") {
      return <Menu title={`About ${selectedAreaLabel}:`} options={[
        ["Overview (vulnerability + gap)", () => run(explainArea(area))],
        ["Demographics", () => run(areaStats(area))],
        ["Total service demand", () => run(areaDemand(area))],
      ]} />;
    }

    if (screen === "rank") {
      return <Menu title="Rank the 12 areas by:" options={[
        ["Most vulnerable", () => run(mostVulnerable())],
        ["Highest service gap", () => run(highestGap())],
        ["Most immigrants", () => run(rankBy({ column: "immigration_indicator", label: "immigrant concentration" }))],
        ["Lowest income", () => run(rankBy({ column: "income_indicator", label: "income pressure", ascending: true }))],
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

  return (
    <div style={{ ...chatBarStyle, display: "block", padding: 0, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "#EFF6FF", borderBottom: "1px solid #DBEAFE" }}>
        <Bot size={18} color="#2563EB" style={chatIconStyle} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A" }}>
            {isEN ? "Community Radar assistant" : "Assistant Community Radar"}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedAreaLabel || "Montreal"}
          </div>
        </div>
        {screen !== "root" && (
          <button onClick={reset} aria-label="Home" style={{ ...closeButtonStyle, marginRight: 4 }}>⌂</button>
        )}
        <button onClick={() => { setChatOpen(false); reset(); }} aria-label={isEN ? "Close chat" : "Fermer le chat"} style={closeButtonStyle}>✕</button>
      </div>
      <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", background: "#fff" }}>
        <Body />
      </div>
    </div>
  );
}
