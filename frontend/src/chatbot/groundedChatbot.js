// Grounded, no-LLM chatbot query layer for the frontend. Mirrors the Python
// scripts/chatbot_queries.py: every function runs a real Supabase query and
// returns { answer, source } where `source` names the table the answer came
// from. No model, no API key: the browser queries Supabase directly with the
// anon key the app already uses.

import { getSupabaseClient } from "../lib/supabaseData.js";

// One of the five app categories -> (visit/demand need label, services category).
export const CATEGORIES = {
  shelter: { need: "Housing & Shelter", service: "Shelter", label: "shelter" },
  food: { need: "Food Support", service: "Food", label: "food" },
  medical: { need: "Mental Health", service: "Medical", label: "medical" },
  legal: { need: "Legal Aid", service: "Legal", label: "legal" },
  translation: { need: "Language Access", service: "Translation", label: "translation" },
};

const SOURCE = {
  services: "services_master (real 211 + open-data services)",
  demandCat: "observed_need_category_summary (source-labelled aggregate)",
  demandArea: "observed_need_index (source-labelled aggregate)",
  profile: "area_profile (STRUCT-01, Statistics Canada 2021)",
  gap: "gap_score (GAP-CANON-02 candidate POC)",
  areaFull: "area_profile + gap_score (candidate scoring contract 02)",
};

const client = () => getSupabaseClient();
const num = v => Number(v || 0).toLocaleString();

// The 12 analysis areas, so the chatbot can offer them as menu choices instead
// of depending on a map click. Returns [{ areaId, areaLabel }] ordered by name.
export async function listAreas() {
  const c = client();
  if (!c) return [];
  const { data, error } = await c
    .from("area_profile")
    .select("area_id, area_name")
    .order("area_name");
  if (error || !data) return [];
  return data.map(r => ({ areaId: r.area_id, areaLabel: r.area_name }));
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const phone = p => (p ? `  (${String(p).split(/\s+/).join(" ")})` : "");
const notConfigured = () => ({ answer: "The live data source is not configured.", source: "n/a" });
const failed = e => ({ answer: `Could not load data: ${e.message}`, source: "n/a" });
const isWebObserved = basis => String(basis || "").startsWith("real_web_behavior");

export async function listServices({ category, areaId, areaLabel, audience = {} }) {
  const c = client();
  if (!c) return notConfigured();
  const service = category ? CATEGORIES[category]?.service : null;
  let q = c.from("services_master").select("name, phone", { count: "exact" });
  if (service) q = q.eq("primary_category", service);
  if (areaId) q = q.eq("area_id", areaId);
  if (audience.indigenous) q = q.eq("serves_indigenous", true);
  if (audience.immigrant) q = q.eq("serves_immigrant", true);
  if (audience.gender) q = q.eq("gender_focus", audience.gender);
  // Age-specific orgs only: the ILIKE alone also matches the "serves all ages"
  // default (which contains every band), so e.g. "Seniors (65+)" would return
  // every all-ages org. Exclude that default to match the Python chatbot.
  if (audience.age) {
    q = q.ilike("age_groups", `%${audience.age}%`).neq("age_groups", "Under 25; 25-44; 45-64; 65+");
  }
  const { data, count, error } = await q.order("name").limit(20);
  if (error) return failed(error);
  const label = (service ? service.toLowerCase() + " " : "") + "organizations";
  const where = areaLabel ? ` in ${areaLabel}` : "";
  if (!data || data.length === 0) return { answer: `No ${label}${where}.`, source: SOURCE.services };
  const lines = data.map(r => `• ${r.name}${phone(r.phone)}`).join("\n");
  const more = count > 20 ? `\n…and ${count - 20} more` : "";
  return { answer: `${cap(label)}${where} (${count} total):\n${lines}${more}`, source: SOURCE.services };
}

export async function demandInArea({ category, areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const { need, label } = CATEGORIES[category];
  const { data, error } = await c
    .from("observed_need_category_summary")
    .select("encounter_count, source_type")
    .eq("area_id", areaId)
    .eq("key_need", need)
    .maybeSingle();
  if (error) return failed(error);
  const n = data?.encounter_count ?? 0;
  const unit = data?.source_type === "web_behavior"
    ? "anonymous sessions showed interest"
    : "recorded visits were";
  return {
    answer: `In ${areaLabel}, about ${num(n)} ${unit} for ${label} services.`,
    source: SOURCE.demandCat,
  };
}

export async function demandByArea({ category }) {
  const c = client();
  if (!c) return notConfigured();
  const { need, label } = CATEGORIES[category];
  const { data, error } = await c
    .from("observed_need_category_summary")
    .select("encounter_count, source_type, area_profile(area_name)")
    .eq("key_need", need)
    .order("encounter_count", { ascending: false })
    .limit(5);
  if (error) return failed(error);
  if (!data || data.length === 0) return { answer: `No demand recorded for ${label}.`, source: SOURCE.demandCat };
  const lines = data
    .map((r, i) => {
      const unit = r.source_type === "web_behavior" ? "sessions" : "visits";
      return `${i + 1}. ${r.area_profile?.area_name ?? r.area_id} (${num(r.encounter_count)} ${unit})`;
    })
    .join("\n");
  return { answer: `Areas with the highest demand for ${label} services:\n${lines}`, source: SOURCE.demandCat };
}

export async function areaDemand({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c
    .from("observed_need_index")
    .select("rolling_visit_count, top_key_needs, observed_data_basis")
    .eq("area_id", areaId)
    .maybeSingle();
  if (error) return failed(error);
  if (!data) return { answer: `No demand data for ${areaLabel}.`, source: SOURCE.demandArea };
  const unit = isWebObserved(data.observed_data_basis)
    ? "anonymous website sessions"
    : "recorded visits";
  return {
    answer: `In ${areaLabel}, about ${num(data.rolling_visit_count)} ${unit} contributed to the observed-demand aggregate. Most reported needs: ${data.top_key_needs}.`,
    source: SOURCE.demandArea,
  };
}

export async function explainArea({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const [{ data: a }, { data: g }] = await Promise.all([
    c.from("area_profile")
      .select("structural_vulnerability_score, structural_vulnerability_rank, top_vulnerability_drivers, structural_formula_id, source_year, source_geography_level, source_geography_name")
      .eq("area_id", areaId).maybeSingle(),
    c.from("gap_score")
      .select("gap_score, gap_rank, service_accessibility_score, gap_formula_id, classification_status")
      .eq("area_id", areaId).maybeSingle(),
  ]);
  const parts = [`${areaLabel}:`];
  if (a) {
    parts.push(
      `• Structural vulnerability ${Number(a.structural_vulnerability_score).toFixed(2)}/100 `
      + `(rank ${a.structural_vulnerability_rank} of 12; ${a.structural_formula_id}).`
    );
    parts.push(
      `• Source: Statistics Canada ${a.source_year}, ${a.source_geography_level}-level `
      + `${a.source_geography_name}. Drivers: ${a.top_vulnerability_drivers}.`
    );
  }
  if (g) {
    parts.push(
      `• Relative service accessibility ${Number(g.service_accessibility_score).toFixed(2)}/100.`
    );
    parts.push(
      `• POC service-gap index ${Number(g.gap_score).toFixed(2)} `
      + `(rank ${g.gap_rank} of 12; ${g.gap_formula_id}). `
      + "No validated High/Watch/Lower classification is assigned."
    );
  }
  return { answer: parts.join("\n"), source: SOURCE.areaFull };
}

export async function areaStats({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile")
    .select("income_indicator, immigration_indicator, language_indicator, housing_indicator, structural_vulnerability_score, structural_formula_id, source_year, source_geography_level, source_geography_name")
    .eq("area_id", areaId).maybeSingle();
  if (error) return failed(error);
  if (!data) return { answer: `No profile for ${areaLabel}.`, source: SOURCE.profile };
  return {
    answer: `${areaLabel} (Statistics Canada ${data.source_year}, ${data.source_geography_level} level — ${data.source_geography_name}):\n`
      + `• Structural vulnerability ${Number(data.structural_vulnerability_score).toFixed(2)}/100 (${data.structural_formula_id})\n`
      + `• Pressure (0-100): income ${data.income_indicator}, immigrant ${data.immigration_indicator}, `
      + `language ${data.language_indicator}, housing ${data.housing_indicator}`,
    source: SOURCE.profile,
  };
}

export async function mostVulnerable() {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile")
    .select("area_name, structural_vulnerability_score")
    .order("structural_vulnerability_rank")
    .limit(5);
  if (error) return failed(error);
  const lines = data
    .map((r, i) => `${i + 1}. ${r.area_name} (${Number(r.structural_vulnerability_score).toFixed(2)}/100)`)
    .join("\n");
  return { answer: `Highest structural vulnerability (STRUCT-01):\n${lines}`, source: SOURCE.profile };
}

export async function highestGap() {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("gap_score")
    .select("area_name, gap_score, gap_rank, gap_formula_id")
    .order("gap_rank")
    .limit(5);
  if (error) return failed(error);
  const lines = data
    .map((r, i) => `${i + 1}. ${r.area_name} (POC gap ${Number(r.gap_score).toFixed(2)}, rank ${r.gap_rank})`)
    .join("\n");
  return {
    answer: `Highest relative service-gap ranks (${data[0]?.gap_formula_id ?? "candidate"}; no validated priority bands):\n${lines}`,
    source: SOURCE.gap,
  };
}

export async function rankBy({ column, label, ascending = false }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile").select(`area_name, ${column}`).order(column, { ascending }).limit(5);
  if (error) return failed(error);
  const lines = data.map((r, i) => `${i + 1}. ${r.area_name} (${r[column]})`).join("\n");
  return { answer: `Areas with the ${ascending ? "lowest" : "highest"} ${label}:\n${lines}`, source: SOURCE.profile };
}
