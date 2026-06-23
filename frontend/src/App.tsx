import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  FileText,
  Layers,
  Loader2,
  MapPinned,
  MessageSquare,
  Route,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Users
} from "lucide-react";
import {
  type AreaMetricKey,
  type AppData,
  type VulnerabilityKey,
  addServiceDistances,
  areaMetricLabel,
  catchmentSummary,
  categoryAccessRows,
  enrichAreaPolygons,
  loadAppData,
  policyAssistantResponse,
  resolveAreaSearch,
  scenarioImpact,
  servicesForVulnerability,
  topVulnerability,
  vulnerabilityLevel,
  vulnerabilityRank,
  vulnerabilityTypes
} from "@/lib/data";

const InteractiveMap = lazy(() => import("@/components/InteractiveMap"));

type Mode = "planner" | "frontline";
type ChatMessage = { role: "assistant" | "user"; content: string };

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
}

function serviceCategories(data: AppData | null): string[] {
  if (!data) return ["All"];
  return ["All", ...Array.from(new Set(data.services.map((service) => service.service_category))).sort()];
}

const areaMetricOptions: { key: AreaMetricKey; label: string }[] = [
  { key: "gap_score", label: "Gap score" },
  { key: "vulnerability_score", label: "Vulnerability" },
  { key: "overall_accessibility_score", label: "Access deficit" }
];

function MetricCard({
  label,
  value,
  detail,
  icon: Icon
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: typeof ShieldAlert;
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

function Table({
  rows,
  columns
}: {
  rows: Record<string, string | number | undefined>[];
  columns: { key: string; label: string }[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[columns[0].key]}-${index}`}>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlannerView({
  data,
  selectedAreaId,
  setSelectedAreaId
}: {
  data: AppData;
  selectedAreaId: string;
  setSelectedAreaId: (areaId: string) => void;
}) {
  const [borough, setBorough] = useState("All");
  const [minGap, setMinGap] = useState(0);
  const [category, setCategory] = useState("All");
  const [radius, setRadius] = useState(2.5);
  const [mapMetric, setMapMetric] = useState<AreaMetricKey>("gap_score");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ask about top priority areas, service gaps, borough comparisons, ranking drivers, or funding actions."
    }
  ]);

  const filtered = useMemo(() => {
    return data.gap.filter((row) => {
      const boroughMatch = borough === "All" || row.borough_name === borough;
      return boroughMatch && row.gap_score >= minGap;
    });
  }, [borough, data.gap, minGap]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((area) => area.area_id === selectedAreaId)) {
      setSelectedAreaId(filtered[0].area_id);
    }
  }, [filtered, selectedAreaId, setSelectedAreaId]);

  const selected = filtered.find((area) => area.area_id === selectedAreaId) ?? filtered[0];
  const nearby = selected ? addServiceDistances(selected, data.services) : [];
  const filteredNearby = category === "All" ? nearby : nearby.filter((service) => service.service_category === category);
  const withinRadius = filteredNearby.filter((service) => (service.distance_km ?? 0) <= radius);
  const enrichedPolygons = useMemo(() => enrichAreaPolygons(data.areaPolygons, filtered, mapMetric), [data.areaPolygons, filtered, mapMetric]);
  const accessRows = selected
    ? categoryAccessRows(data, selected.area_id)
        .filter((row) => category === "All" || row.service_category === category)
    : [];
  const catchment = catchmentSummary(filteredNearby, radius);
  const scenario = scenarioImpact(accessRows);
  const filteredAreaIds = new Set(filtered.map((area) => area.area_id));
  const lowAccessRows = data.accessibility.filter((row) => {
    return filteredAreaIds.has(row.area_id) && (category === "All" || row.service_category === category) && row.accessibility_score < 30;
  });

  const promptSuggestions = selected
    ? ["What are the top priority areas?", `Why is ${selected.area_name} a priority?`, `What should policymakers fund in ${selected.area_name}?`]
    : [];

  function submitChat(prompt: string) {
    if (!prompt.trim() || !selected) return;
    setMessages((current) => [
      ...current,
      { role: "user", content: prompt },
      { role: "assistant", content: policyAssistantResponse(prompt, data, selected.area_name, category) }
    ]);
    setChatInput("");
  }

  if (!selected) {
    return <EmptyState message="No areas match the selected filters." />;
  }

  return (
    <main className="workspace">
      <aside className="control-rail">
        <div className="section-title">
          <SlidersHorizontal size={18} />
          <h2>Planner Filters</h2>
        </div>
        <label>
          Borough
          <select value={borough} onChange={(event) => setBorough(event.target.value)}>
            {["All", ...Array.from(new Set(data.gap.map((area) => area.borough_name))).sort()].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Minimum gap score
          <input type="range" min="0" max="100" value={minGap} onChange={(event) => setMinGap(Number(event.target.value))} />
          <span className="range-value">{minGap}</span>
        </label>
        <label>
          Service category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {serviceCategories(data).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Catchment radius
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
          <span className="range-value">{radius.toFixed(1)} km</span>
        </label>
        <label>
          Polygon layer
          <select value={mapMetric} onChange={(event) => setMapMetric(event.target.value as AreaMetricKey)}>
            {areaMetricOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <section className="main-stage">
        <div className="metrics-grid">
          <MetricCard label="Areas" value={filtered.length} icon={MapPinned} />
          <MetricCard
            label="High priority"
            value={filtered.filter((area) => area.priority_flag === "High priority").length}
            icon={ShieldAlert}
          />
          <MetricCard
            label="Avg vulnerability"
            value={(filtered.reduce((sum, area) => sum + area.vulnerability_score, 0) / filtered.length).toFixed(1)}
            icon={Users}
          />
          <MetricCard
            label="Avg access"
            value={(filtered.reduce((sum, area) => sum + area.overall_accessibility_score, 0) / filtered.length).toFixed(1)}
            icon={Building2}
          />
        </div>

        <section className="map-panel">
          <div className="panel-heading">
            <div>
              <h2>Polygon Priority Map</h2>
              <p>Click a polygon or marker to inspect area profile and service access.</p>
            </div>
            <select value={selected.area_id} onChange={(event) => setSelectedAreaId(event.target.value)}>
              {filtered.map((area) => (
                <option key={area.area_id} value={area.area_id}>
                  {area.area_name}
                </option>
              ))}
            </select>
          </div>
          <div className="map-legend">
            <span>{areaMetricLabel(mapMetric)}</span>
            <i className="legend-ramp" />
            <small>Lower pressure</small>
            <small>Higher pressure</small>
          </div>
          <Suspense fallback={<div className="map-loading">Loading map</div>}>
            <InteractiveMap
              variant="areas"
              points={filtered}
              selectedId={selected.area_id}
              polygons={enrichedPolygons}
              metric={mapMetric}
              onSelect={setSelectedAreaId}
            />
          </Suspense>
        </section>

        <section className="analysis-grid">
          <div className="analysis-panel">
            <div className="panel-heading compact">
              <div>
                <h2>{selected.area_name}</h2>
                <p>{selected.borough_name}</p>
              </div>
              <span className="status-pill">{selected.priority_flag}</span>
            </div>
            <p className="body-copy">{selected.summary_en}</p>
            <div className="mini-metrics">
              <MetricCard label="Gap score" value={selected.gap_score.toFixed(1)} detail={`Rank ${selected.gap_rank}`} icon={Layers} />
              <MetricCard label="Services in radius" value={withinRadius.length} detail={`${radius.toFixed(1)} km`} icon={MapPinned} />
              <MetricCard
                label="Nearest service"
                value={filteredNearby[0]?.distance_km?.toFixed(1) ?? "n/a"}
                detail={filteredNearby[0] ? "km" : undefined}
                icon={Building2}
              />
            </div>
            <h3>Weakest Access Categories</h3>
            <Table
              rows={accessRows.slice(0, 6).map((row) => ({
                category: row.service_category,
                nearest: `${row.nearest_service_distance_km.toFixed(1)} km`,
                count: row.service_count_within_threshold,
                score: row.accessibility_score.toFixed(1)
              }))}
              columns={[
                { key: "category", label: "Category" },
                { key: "nearest", label: "Nearest" },
                { key: "count", label: "Count" },
                { key: "score", label: "Access" }
              ]}
            />
          </div>

          <div className="analysis-panel">
            <div className="section-title">
              <MessageSquare size={18} />
              <h2>Policymaker Assistant</h2>
            </div>
            <div className="prompt-row">
              {promptSuggestions.map((prompt) => (
                <button key={prompt} className="ghost-button" onClick={() => submitChat(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <div className="chat-log">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                  {message.content}
                </div>
              ))}
            </div>
            <form
              className="chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitChat(chatInput);
              }}
            >
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about priorities or service gaps"
              />
              <button aria-label="Send message" type="submit">
                <Send size={18} />
              </button>
            </form>
          </div>
        </section>

        <section className="analysis-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Advanced Geospatial Analysis</h2>
              <p>Current calculations use synthetic points, polygon envelopes, and radius catchments.</p>
            </div>
            <Route size={18} aria-hidden="true" />
          </div>
          <div className="geo-grid">
            <MetricCard label="Catchment services" value={catchment.serviceCount} detail={`${radius.toFixed(1)} km radius`} icon={MapPinned} />
            <MetricCard label="Categories covered" value={catchment.categoryCount} detail={category === "All" ? "all categories" : category} icon={Layers} />
            <MetricCard
              label="Nearest walk"
              value={catchment.nearestWalkMinutes ?? "n/a"}
              detail={catchment.nearestWalkMinutes ? `${catchment.nearestTravelBurden} burden, minutes` : undefined}
              icon={Route}
            />
            <MetricCard label="Low-access rows" value={lowAccessRows.length} detail="score below 30" icon={ShieldAlert} />
          </div>
          {scenario ? (
            <div className="scenario-panel">
              <div>
                <h3>Scenario: add a service point in {selected.area_name}</h3>
                <p>
                  Weakest category is <strong>{scenario.serviceCategory}</strong>. Placing a synthetic service point near the area centroid
                  changes nearest distance from {scenario.currentNearestKm.toFixed(1)} km to {scenario.proposedNearestKm.toFixed(1)} km.
                </p>
              </div>
              <div className="scenario-score">
                <span>{scenario.currentScore.toFixed(1)}</span>
                <strong>{scenario.proposedScore.toFixed(1)}</strong>
                <small>+{scenario.scoreLift.toFixed(1)} access score</small>
              </div>
            </div>
          ) : null}
        </section>

        <section className="analysis-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Priority Ranking</h2>
              <p>Sorted by highest synthetic gap score.</p>
            </div>
            <Download size={18} aria-hidden="true" />
          </div>
          <Table
            rows={filtered.slice(0, 10).map((row) => ({
              rank: row.gap_rank,
              area: row.area_name,
              borough: row.borough_name,
              vulnerability: row.vulnerability_score.toFixed(1),
              access: row.overall_accessibility_score.toFixed(1),
              gap: row.gap_score.toFixed(1),
              flag: row.priority_flag
            }))}
            columns={[
              { key: "rank", label: "Rank" },
              { key: "area", label: "Area" },
              { key: "borough", label: "Borough" },
              { key: "vulnerability", label: "Need" },
              { key: "access", label: "Access" },
              { key: "gap", label: "Gap" },
              { key: "flag", label: "Flag" }
            ]}
          />
        </section>
      </section>
    </main>
  );
}

function FrontlineView({
  data,
  selectedAreaId,
  setSelectedAreaId
}: {
  data: AppData;
  selectedAreaId: string;
  setSelectedAreaId: (areaId: string) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [matchedLabel, setMatchedLabel] = useState("");
  const [category, setCategory] = useState("All");
  const [language, setLanguage] = useState("English");
  const [radius, setRadius] = useState(5);
  const [selectedVulnerability, setSelectedVulnerability] = useState<VulnerabilityKey>("income_indicator");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const selectedGap = data.gap.find((area) => area.area_id === selectedAreaId) ?? data.gap[0];
  const selectedArea = data.areas.find((area) => area.area_id === selectedGap.area_id) ?? data.areas[0];
  const primaryVulnerability = topVulnerability(selectedArea);

  useEffect(() => {
    setSelectedVulnerability(primaryVulnerability.key);
  }, [primaryVulnerability.key, selectedAreaId]);

  const allServicesByDistance = addServiceDistances(selectedGap, data.services);
  const vulnerability = vulnerabilityTypes.find((item) => item.key === selectedVulnerability) ?? primaryVulnerability;
  const relatedServices = servicesForVulnerability(allServicesByDistance, vulnerability).slice(0, 5);
  const selectedScore = selectedArea[selectedVulnerability];
  const averageScore = data.areas.reduce((sum, area) => sum + area[selectedVulnerability], 0) / data.areas.length;
  const rank = vulnerabilityRank(data.areas, selectedVulnerability, selectedArea.area_id);
  const filteredServices = allServicesByDistance.filter((service) => category === "All" || service.service_category === category);
  const mappedServices = filteredServices.filter((service) => (service.distance_km ?? 0) <= radius);
  const servicesToShow = mappedServices.length > 0 ? mappedServices : filteredServices.slice(0, 10);

  useEffect(() => {
    if (servicesToShow.length > 0 && !servicesToShow.some((service) => service.service_id === selectedServiceId)) {
      setSelectedServiceId(servicesToShow[0].service_id);
    }
  }, [selectedServiceId, servicesToShow]);

  const selectedService = servicesToShow.find((service) => service.service_id === selectedServiceId) ?? servicesToShow[0];
  const generatedDate = new Date().toISOString().slice(0, 10);

  function handleSearch(value: string) {
    setSearchText(value);
    const match = resolveAreaSearch(value, data.gap);
    if (match) {
      const area = data.gap.find((row) => row.area_name === match.areaName);
      if (area) {
        setSelectedAreaId(area.area_id);
        setMatchedLabel(match.label);
      }
    } else {
      setMatchedLabel(value.trim() ? "No synthetic area match found." : "");
    }
  }

  const flyerTitle = language === "English" ? "Nearby Community Services" : "Services communautaires proches";
  const flyerDisclaimer =
    language === "English"
      ? "Synthetic MVP data. Confirm service details before referral. For emergencies, call local emergency services."
      : "Donnees synthetiques MVP. Confirmez les details avant une reference. En cas d'urgence, appelez les services d'urgence locaux.";
  const flyerText = [
    flyerTitle,
    `Area: ${selectedGap.area_name}`,
    `Vulnerability: ${vulnerability.fullLabel} (${selectedScore.toFixed(0)}/100)`,
    "",
    ...servicesToShow.slice(0, 5).map((service) => {
      return `${service.service_name} | ${service.service_category} | ${service.address} | ${service.phone} | ${(service.distance_km ?? 0).toFixed(1)} km`;
    }),
    "",
    flyerDisclaimer
  ].join("\n");

  function generatePdfHandout() {
    window.print();
  }

  return (
    <main className="frontline">
      <section className="frontline-toolbar">
        <div className="search-shell">
          <Search size={18} aria-hidden="true" />
          <input
            value={searchText}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Postal code or community area"
          />
        </div>
        <select value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.target.value)}>
          {data.gap
            .slice()
            .sort((a, b) => a.area_name.localeCompare(b.area_name))
            .map((area) => (
              <option key={area.area_id} value={area.area_id}>
                {area.area_name}
              </option>
            ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {serviceCategories(data).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option>English</option>
          <option>French</option>
        </select>
      </section>
      {matchedLabel ? <p className="match-caption">{matchedLabel}</p> : null}

      <section className="area-summary">
        <div>
          <h2>{selectedGap.area_name}</h2>
          <p>{selectedGap.summary_en}</p>
        </div>
        <MetricCard label="Primary type" value={primaryVulnerability.shortLabel} detail={vulnerabilityLevel(selectedArea[primaryVulnerability.key])} icon={ShieldAlert} />
        <MetricCard label="Gap score" value={selectedGap.gap_score.toFixed(1)} detail={`Rank ${selectedGap.gap_rank}`} icon={Layers} />
        <MetricCard label="Population" value={formatNumber(selectedArea.population)} detail={selectedArea.borough_name} icon={Users} />
      </section>

      <section className="vulnerability-cards">
        {vulnerabilityTypes.map((item) => {
          const score = selectedArea[item.key];
          const isSelected = item.key === selectedVulnerability;
          return (
            <button
              key={item.key}
              className={isSelected ? "vulnerability-card selected" : "vulnerability-card"}
              onClick={() => setSelectedVulnerability(item.key)}
            >
              <span>{item.shortLabel}</span>
              <strong>{score.toFixed(0)}</strong>
              <div className="score-track">
                <i style={{ width: `${score}%` }} />
              </div>
              <small>
                {vulnerabilityLevel(score)} | {item.fullLabel}
              </small>
            </button>
          );
        })}
      </section>

      <section className="frontline-grid">
        <div className="analysis-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Card Detail</h2>
              <p>{vulnerability.fullLabel}</p>
            </div>
            <span className="status-pill">{vulnerabilityLevel(selectedScore)}</span>
          </div>
          <p className="body-copy">{vulnerability.description}</p>
          <div className="mini-metrics">
            <MetricCard label="Area score" value={`${selectedScore.toFixed(0)}/100`} icon={ShieldAlert} />
            <MetricCard label="Synthetic avg" value={`${averageScore.toFixed(0)}/100`} detail={`${(selectedScore - averageScore).toFixed(1)}`} icon={Users} />
            <MetricCard label="Area rank" value={`${rank} of ${data.areas.length}`} icon={Layers} />
          </div>
          <h3>Analysis Focus</h3>
          <p className="body-copy">{vulnerability.analysisFocus}</p>
          <h3>Frontline Questions</h3>
          <p className="body-copy">{vulnerability.questions}</p>
          <h3>Relevant Service Categories</h3>
          <div className="chip-row">
            {vulnerability.serviceCategories.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <Table
            rows={relatedServices.map((service) => ({
              service: service.service_name,
              category: service.service_category,
              distance: `${(service.distance_km ?? 0).toFixed(1)} km`
            }))}
            columns={[
              { key: "service", label: "Service" },
              { key: "category", label: "Category" },
              { key: "distance", label: "Distance" }
            ]}
          />
        </div>

        <div className="map-panel">
          <div className="panel-heading">
            <div>
              <h2>Nearby Services</h2>
              <p>Click a service marker to inspect referral details.</p>
            </div>
            <label className="inline-range">
              Radius
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={radius}
                onChange={(event) => setRadius(Number(event.target.value))}
              />
              <span>{radius.toFixed(1)} km</span>
            </label>
          </div>
          {servicesToShow.length > 0 ? (
            <Suspense fallback={<div className="map-loading">Loading map</div>}>
              <InteractiveMap
                variant="services"
                points={servicesToShow}
              selectedId={selectedServiceId}
              area={selectedGap}
              radiusKm={radius}
              onSelect={setSelectedServiceId}
            />
            </Suspense>
          ) : (
            <EmptyState message="No services match the selected filters." />
          )}
          {selectedService ? (
            <div className="service-detail">
              <strong>{selectedService.service_name}</strong>
              <span>{selectedService.service_category}</span>
              <p>
                {selectedService.address} | {selectedService.phone} | {(selectedService.distance_km ?? 0).toFixed(1)} km
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="analysis-panel">
        <div className="panel-heading compact">
          <div>
            <h2>PDF Handout</h2>
            <p>Referral-ready handout generated from the selected area, vulnerability type, and radius.</p>
          </div>
          <button className="action-button" onClick={generatePdfHandout}>
            <FileText size={17} />
            Generate PDF
          </button>
        </div>
        <pre className="flyer-output">{flyerText}</pre>
      </section>

      <section className="print-handout" aria-label="PDF handout preview">
        <header>
          <p>Community Needs Radar</p>
          <h1>{flyerTitle}</h1>
          <span>Generated {generatedDate}</span>
        </header>
        <div className="handout-summary">
          <div>
            <strong>{selectedGap.area_name}</strong>
            <span>{selectedGap.borough_name}</span>
          </div>
          <div>
            <strong>{vulnerability.fullLabel}</strong>
            <span>
              {selectedScore.toFixed(0)}/100 | {vulnerabilityLevel(selectedScore)}
            </span>
          </div>
          <div>
            <strong>{selectedGap.gap_score.toFixed(1)}</strong>
            <span>Gap score | Rank {selectedGap.gap_rank}</span>
          </div>
        </div>
        <h2>Analysis Focus</h2>
        <p>{vulnerability.analysisFocus}</p>
        <h2>Referral Services</h2>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Category</th>
              <th>Contact</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            {servicesToShow.slice(0, 5).map((service) => (
              <tr key={service.service_id}>
                <td>
                  <strong>{service.service_name}</strong>
                  <br />
                  {service.address}
                </td>
                <td>{service.service_category}</td>
                <td>
                  {service.phone}
                  <br />
                  {service.language}
                </td>
                <td>{(service.distance_km ?? 0).toFixed(1)} km</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>{flyerDisclaimer}</footer>
      </section>
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("planner");
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState("");

  useEffect(() => {
    loadAppData()
      .then((loaded) => {
        setData(loaded);
        setSelectedAreaId(loaded.gap[0]?.area_id ?? "");
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const selectedArea = data?.gap.find((area) => area.area_id === selectedAreaId) ?? data?.gap[0];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Community Needs Radar</p>
          <h1>{mode === "planner" ? "Planner Analysis Workspace" : "Frontline Community Workspace"}</h1>
        </div>
        <nav className="mode-switch" aria-label="Mode switcher">
          <button className={mode === "planner" ? "active" : ""} onClick={() => setMode("planner")}>
            <MapPinned size={18} />
            Planner
          </button>
          <button className={mode === "frontline" ? "active" : ""} onClick={() => setMode("frontline")}>
            <ShieldAlert size={18} />
            Frontline
          </button>
        </nav>
      </header>

      {error ? <EmptyState message={error} /> : null}
      {!data && !error ? (
        <div className="loading-state">
          <Loader2 size={20} />
          Loading dashboard data
        </div>
      ) : null}
      {data && selectedArea ? (
        mode === "planner" ? (
          <PlannerView data={data} selectedAreaId={selectedAreaId} setSelectedAreaId={setSelectedAreaId} />
        ) : (
          <FrontlineView data={data} selectedAreaId={selectedAreaId} setSelectedAreaId={setSelectedAreaId} />
        )
      ) : null}
    </div>
  );
}
