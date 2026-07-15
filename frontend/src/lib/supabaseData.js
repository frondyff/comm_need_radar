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
  "overall_accessibility_score",
  "gap_score",
  "gap_rank",
  "nearest_service_distance_km",
  "service_count_within_threshold",
  "accessibility_score",
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

export async function loadAppData() {
  const supabaseConfig = config();
  if (!supabaseConfig) throw new Error("Supabase environment variables are not configured");

  const client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const [areas, gap, accessibility, services] = await Promise.all([
    loadTable(client, "area_profile", "area_id"),
    loadTable(client, "gap_score", "gap_rank"),
    loadTable(client, "accessibility", "area_id"),
    loadTable(client, "service_table", "service_id"),
  ]);
  const missing = [
    areas.length === 0 ? "area_profile" : "",
    gap.length === 0 ? "gap_score" : "",
    accessibility.length === 0 ? "accessibility" : "",
    services.length === 0 ? "service_table" : "",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Supabase returned no rows for ${missing.join(", ")}`);
  }
  return { areas, gap, accessibility, services, source: "supabase" };
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
