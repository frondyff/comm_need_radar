import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const NUMERIC_FIELDS = new Set([
  "latitude",
  "longitude",
  "population",
  "income_indicator",
  "age_indicator",
  "language_indicator",
  "immigration_indicator",
  "housing_indicator",
  "vulnerability_score",
  "vulnerability_rank",
  "structural_vulnerability_score",
  "structural_vulnerability_rank",
  "service_accessibility_score",
  "overall_accessibility_score",
  "gap_score",
  "gap_rank",
  "priority_cutoff_rank",
  "comparison_set_size",
  "nearest_service_distance_km",
  "service_count_within_threshold",
  "accessibility_score",
  "distance_component",
  "availability_component",
  "source_year",
  "service_snapshot_total_rows",
  "service_snapshot_mappable_rows",
  "vulnerability_index",
  "low_income_pct",
  "low_income_pct_scaled",
  "shelter_cost_burden_pct",
  "shelter_cost_burden_pct_scaled",
  "recent_immigrant_pct",
  "recent_immigrant_pct_scaled",
]);

function config() {
  const environment = import.meta.env
    ?? (typeof process !== "undefined" ? process.env : {});
  const url = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY
    || environment.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

let cachedClient = null;
// Reuse one Supabase client across the whole app (data loading + analytics
// writes) instead of creating a new one per call — avoids the "Multiple
// GoTrueClient instances" warning and is the recommended pattern.
export function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const supabaseConfig = config();
  if (!supabaseConfig) return null;
  cachedClient = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      NUMERIC_FIELDS.has(key) ? Number(value) : String(value ?? ""),
    ])
  );
}

async function loadTable(client, table, orderColumn) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client.from(table).select("*");
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to load Supabase table ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map(normalizeRow);
}

export function validateRealAreaIndicators(payload) {
  if (!Array.isArray(payload?.areas) || payload.areas.length !== 12) {
    throw new Error("Real area indicator response did not contain 12 areas");
  }
  const rows = payload.areas.map(normalizeRow);
  const requiredNumericFields = [
    "low_income_pct",
    "low_income_pct_scaled",
    "shelter_cost_burden_pct",
    "shelter_cost_burden_pct_scaled",
    "recent_immigrant_pct",
    "recent_immigrant_pct_scaled",
    "vulnerability_index",
  ];
  if (
    new Set(rows.map(row => row.area_id)).size !== rows.length
    || rows.some(row =>
      !row.area_id
      || requiredNumericFields.some(field => !Number.isFinite(row[field]))
    )
  ) {
    throw new Error("Real area indicator response violated the frontend data contract");
  }
  return rows;
}

function closeEnough(left, right, tolerance = 0.011) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= tolerance;
}

export function validateCandidateScoringContract({
  areas,
  gap,
  accessibility,
}) {
  if (
    !Array.isArray(areas)
    || !Array.isArray(gap)
    || !Array.isArray(accessibility)
    || areas.length !== 12
    || gap.length !== 12
    || accessibility.length !== 108
  ) {
    throw new Error("Supabase scoring snapshot is not a complete candidate matrix");
  }

  const profiles = new Map(areas.map(row => [row.area_id, row]));
  const categorySets = new Map();
  const invalidProfile = areas.some(row =>
    !row.area_id
    || row.structural_formula_id !== "STRUCT-01"
    || !closeEnough(
      row.structural_vulnerability_score,
      row.vulnerability_score,
      0.01
    )
    || Number(row.structural_vulnerability_rank) !== Number(row.vulnerability_rank)
  );
  const ranks = new Set(gap.map(row => Number(row.gap_rank)));
  const invalidGap = gap.some(row => {
    const profile = profiles.get(row.area_id);
    const expectedGap = Number(row.structural_vulnerability_score)
      * (100 - Number(row.service_accessibility_score))
      / 100;
    const rank = Number(row.gap_rank);
    const isCandidate = rank <= 5;
    return (
      !profile
      || row.structural_formula_id !== "STRUCT-01"
      || row.accessibility_formula_id !== "ACCESS-REAL-02"
      || row.gap_formula_id !== "GAP-CANON-02"
      || row.formula_set_version !== "scoring-contract-03"
      || row.classification_formula_id !== "CLASS-TOP5-02"
      || row.classification_status !== "poc_relative_candidate"
      || Number(row.priority_cutoff_rank) !== 5
      || Number(row.comparison_set_size) !== 12
      || (isCandidate && row.priority_band !== "high_candidate")
      || (
        isCandidate
        && String(row.priority_flag ?? "").trim()
          !== "High-priority candidate (POC)"
      )
      || (!isCandidate && String(row.priority_band ?? "").trim() !== "")
      || (!isCandidate && String(row.priority_flag ?? "").trim() !== "")
      || !closeEnough(
        row.structural_vulnerability_score,
        row.vulnerability_score,
        0.01
      )
      || !closeEnough(
        row.structural_vulnerability_score,
        profile.structural_vulnerability_score,
        0.01
      )
      || !closeEnough(
        row.service_accessibility_score,
        row.overall_accessibility_score,
        0.01
      )
      || !closeEnough(row.gap_score, expectedGap)
    );
  });
  const invalidAccessibility = accessibility.some(row => {
    const categories = categorySets.get(row.area_id) ?? new Set();
    categories.add(row.service_category);
    categorySets.set(row.area_id, categories);
    const expectedScore = (
      0.5 * Number(row.distance_component)
      + 0.5 * Number(row.availability_component)
    );
    return (
      !profiles.has(row.area_id)
      || row.accessibility_formula_id !== "ACCESS-REAL-02"
      || row.formula_set_version !== "scoring-contract-03"
      || row.taxonomy_version !== "planning-needs-9-v1"
      || Number(row.service_snapshot_total_rows) !== 3664
      || Number(row.service_snapshot_mappable_rows) !== 3200
      || !closeEnough(row.accessibility_score, expectedScore, 0.011)
    );
  });
  const incompleteCategories = (
    categorySets.size !== 12
    || [...categorySets.values()].some(categories => categories.size !== 9)
  );
  if (
    invalidProfile
    || invalidGap
    || invalidAccessibility
    || incompleteCategories
    || ranks.size !== 12
    || [...Array(12)].some((_, index) => !ranks.has(index + 1))
  ) {
    throw new Error(
      "Supabase scoring snapshot does not satisfy scoring-contract-03"
    );
  }
  return { areas, gap, accessibility };
}

async function loadRealAreaIndicators() {
  const response = await fetch("/api/area-vulnerability", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Unable to load real area indicators: HTTP ${response.status}`);
  }
  return validateRealAreaIndicators(await response.json());
}

export async function loadAppData() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase environment variables are not configured");

  const [areas, gap, accessibility, services, vulnerability] = await Promise.all([
    loadTable(client, "area_profile", "area_id"),
    loadTable(client, "gap_score", "gap_rank"),
    loadTable(client, "accessibility", "area_id"),
    loadTable(client, "services_master", "service_id"),
    loadRealAreaIndicators(),
  ]);
  const missing = [
    areas.length === 0 ? "area_profile" : "",
    gap.length === 0 ? "gap_score" : "",
    accessibility.length === 0 ? "accessibility" : "",
    services.length === 0 ? "services_master" : "",
    vulnerability.length === 0 ? "area_vulnerability_index_real" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Supabase returned no rows for ${missing.join(", ")}`);
  }
  validateCandidateScoringContract({ areas, gap, accessibility });
  return { areas, gap, accessibility, services, vulnerability, source: "supabase" };
}

export function haversineKm(latitude1, longitude1, latitude2, longitude2) {
  const toRadians = value => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitude1))
    * Math.cos(toRadians(latitude2))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}
