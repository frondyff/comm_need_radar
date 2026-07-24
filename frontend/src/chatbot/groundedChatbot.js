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
  demandCat: "observed_need_category_summary (synthetic visit data)",
  demandArea: "observed_need_index (synthetic visit data)",
  profile: "area_profile (real, census-based)",
  gap: "gap_score (real)",
  areaFull: "area_profile + gap_score (real)",
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
    .select("encounter_count")
    .eq("area_id", areaId)
    .eq("key_need", need)
    .maybeSingle();
  if (error) return failed(error);
  const n = data?.encounter_count ?? 0;
  return {
    answer: `In ${areaLabel}, about ${num(n)} recorded visits were for ${label} services.`,
    source: SOURCE.demandCat,
  };
}

export async function demandByArea({ category }) {
  const c = client();
  if (!c) return notConfigured();
  const { need, label } = CATEGORIES[category];
  const { data, error } = await c
    .from("observed_need_category_summary")
    .select("encounter_count, area_profile(area_name)")
    .eq("key_need", need)
    .order("encounter_count", { ascending: false })
    .limit(5);
  if (error) return failed(error);
  if (!data || data.length === 0) return { answer: `No demand recorded for ${label}.`, source: SOURCE.demandCat };
  const lines = data
    .map((r, i) => `${i + 1}. ${r.area_profile?.area_name ?? r.area_id} (${num(r.encounter_count)} visits)`)
    .join("\n");
  return { answer: `Areas with the highest demand for ${label} services:\n${lines}`, source: SOURCE.demandCat };
}

export async function areaDemand({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c
    .from("observed_need_index")
    .select("rolling_visit_count, top_key_needs")
    .eq("area_id", areaId)
    .maybeSingle();
  if (error) return failed(error);
  if (!data) return { answer: `No demand data for ${areaLabel}.`, source: SOURCE.demandArea };
  return {
    answer: `In ${areaLabel}, about ${num(data.rolling_visit_count)} recorded visits in total. Most reported needs: ${data.top_key_needs}.`,
    source: SOURCE.demandArea,
  };
}

export async function explainArea({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const [{ data: a }, { data: g }] = await Promise.all([
    c.from("area_profile")
      .select("vulnerability_score, vulnerability_rank, top_vulnerability_drivers, population")
      .eq("area_id", areaId).maybeSingle(),
    c.from("gap_score").select("gap_score, gap_rank, priority_flag").eq("area_id", areaId).maybeSingle(),
  ]);
  const parts = [`${areaLabel}:`];
  if (a) parts.push(`• Vulnerability ${Math.round(a.vulnerability_score)}/100 (rank ${a.vulnerability_rank} of 12). Drivers: ${a.top_vulnerability_drivers}.`);
  if (g) parts.push(`• Service gap ${Math.round(g.gap_score)} (rank ${g.gap_rank})${g.priority_flag ? ", " + g.priority_flag : ""}.`);
  if (a) parts.push(`• Population about ${num(a.population)}.`);
  return { answer: parts.join("\n"), source: SOURCE.areaFull };
}

export async function areaStats({ areaId, areaLabel }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile")
    .select("population, income_indicator, immigration_indicator, language_indicator, housing_indicator, vulnerability_score")
    .eq("area_id", areaId).maybeSingle();
  if (error) return failed(error);
  if (!data) return { answer: `No profile for ${areaLabel}.`, source: SOURCE.profile };
  return {
    answer: `${areaLabel} (census-based):\n• Population about ${num(data.population)}\n`
      + `• Vulnerability ${Math.round(data.vulnerability_score)}/100\n`
      + `• Pressure (0-100): income ${data.income_indicator}, immigrant ${data.immigration_indicator}, `
      + `language ${data.language_indicator}, housing ${data.housing_indicator}`,
    source: SOURCE.profile,
  };
}

export async function mostVulnerable() {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile")
    .select("area_name, vulnerability_score").order("vulnerability_rank").limit(5);
  if (error) return failed(error);
  const lines = data.map((r, i) => `${i + 1}. ${r.area_name} (${Math.round(r.vulnerability_score)}/100)`).join("\n");
  return { answer: `Most vulnerable areas:\n${lines}`, source: SOURCE.profile };
}

export async function highestGap() {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("gap_score")
    .select("area_name, gap_score, priority_flag").order("gap_rank").limit(5);
  if (error) return failed(error);
  const lines = data
    .map((r, i) => `${i + 1}. ${r.area_name} (gap ${Math.round(r.gap_score)})${r.priority_flag ? " - " + r.priority_flag : ""}`)
    .join("\n");
  return { answer: `Areas with the largest service gap:\n${lines}`, source: SOURCE.gap };
}

export async function rankBy({ column, label, ascending = false }) {
  const c = client();
  if (!c) return notConfigured();
  const { data, error } = await c.from("area_profile").select(`area_name, ${column}`).order(column, { ascending }).limit(5);
  if (error) return failed(error);
  const lines = data.map((r, i) => `${i + 1}. ${r.area_name} (${r[column]})`).join("\n");
  return { answer: `Areas with the ${ascending ? "lowest" : "highest"} ${label}:\n${lines}`, source: SOURCE.profile };
}
