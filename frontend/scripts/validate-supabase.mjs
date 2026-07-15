import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";


const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env."
  );
  process.exit(1);
}

const expectedCounts = {
  area_profile: Number(env.SUPABASE_EXPECTED_AREA_PROFILE_ROWS ?? 12),
  gap_score: Number(env.SUPABASE_EXPECTED_GAP_SCORE_ROWS ?? 12),
  accessibility: Number(env.SUPABASE_EXPECTED_ACCESSIBILITY_ROWS ?? 108),
  service_table: Number(env.SUPABASE_EXPECTED_SERVICE_TABLE_ROWS ?? 4255),
  observed_need_index: Number(env.SUPABASE_EXPECTED_OBSERVED_NEED_INDEX_ROWS ?? 12),
  vulnerability_index_v2: Number(
    env.SUPABASE_EXPECTED_VULNERABILITY_INDEX_V2_ROWS ?? 12
  )
};

const requiredColumns = {
  area_profile: [
    "area_id",
    "area_name",
    "borough_name",
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
    "top_vulnerability_drivers"
  ],
  gap_score: [
    "area_id",
    "area_name",
    "borough_name",
    "latitude",
    "longitude",
    "vulnerability_score",
    "overall_accessibility_score",
    "gap_score",
    "gap_rank",
    "priority_flag",
    "gap_drivers",
    "summary_en",
    "summary_fr"
  ],
  accessibility: [
    "area_id",
    "service_category",
    "nearest_service_distance_km",
    "service_count_within_threshold",
    "accessibility_score",
    "accessibility_method"
  ],
  service_table: [
    "service_id",
    "service_name",
    "service_category",
    "address",
    "latitude",
    "longitude",
    "phone",
    "website",
    "language",
    "source_name",
    "source_url",
    "last_checked_date"
  ],
  observed_need_index: [
    "area_id",
    "v1_demand_score",
    "v2_observed_score",
    "observed_data_basis",
    "insufficient_visit_data"
  ],
  vulnerability_index_v2: [
    "area_id",
    "vulnerability_index_v2",
    "v2_data_basis",
    "insufficient_visit_data",
    "vulnerability_rank_v2"
  ]
};

const keyColumns = {
  area_profile: ["area_id"],
  gap_score: ["area_id"],
  accessibility: ["area_id", "service_category"],
  service_table: ["service_id"],
  observed_need_index: ["area_id"],
  vulnerability_index_v2: ["area_id"]
};

const privateObjects = [
  "census_tract",
  "ct_centroid",
  "database_center",
  "database_visitor_tag",
  "cisv_reference",
  "stm_stop",
  "area_vulnerability_index_real",
  "monitoring_summary",
  "role_activity_log",
  "flyer_examples",
  "services_master",
  "center_area_lookup",
  "observed_need_category_summary",
  "v_visit_needs_by_center",
  "v_ct_vulnerability"
];

const client = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

async function loadAll(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns.join(","))
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const tableRows = {};
for (const [table, count] of Object.entries(expectedCounts)) {
  const { count: actualCount, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    fail(`${table} read failed: ${error.message}`);
    continue;
  }
  if (actualCount !== count) {
    fail(`${table} expected ${count} rows but returned ${actualCount}`);
    continue;
  }
  pass(`${table} returned ${actualCount} rows`);

  try {
    tableRows[table] = await loadAll(table, requiredColumns[table]);
    pass(`${table} required columns are readable`);
  } catch (validationError) {
    fail(validationError.message);
  }
}

for (const [table, columns] of Object.entries(keyColumns)) {
  const rows = tableRows[table];
  if (!rows) continue;
  const keys = rows.map((row) => columns.map((column) => row[column]).join("\u001f"));
  if (
    rows.some((row) =>
      columns.some((column) => row[column] === null || row[column] === undefined)
    )
  ) {
    fail(`${table} has a null key`);
  } else if (new Set(keys).size !== keys.length) {
    fail(`${table} has duplicate keys`);
  } else {
    pass(`${table} keys are non-null and unique`);
  }
}

const areaIds = new Set((tableRows.area_profile ?? []).map((row) => row.area_id));
for (const table of [
  "gap_score",
  "accessibility",
  "observed_need_index",
  "vulnerability_index_v2"
]) {
  const orphanIds = [
    ...new Set(
      (tableRows[table] ?? [])
        .map((row) => row.area_id)
        .filter((areaId) => !areaIds.has(areaId))
    )
  ];
  if (orphanIds.length > 0) {
    fail(`${table} has orphan area IDs: ${orphanIds.join(", ")}`);
  } else {
    pass(`${table} area IDs join to area_profile`);
  }
}

for (const [table, columns] of Object.entries(keyColumns)) {
  const firstRow = tableRows[table]?.[0];
  if (!firstRow) continue;
  const updateValue = Object.fromEntries(columns.map((column) => [column, firstRow[column]]));
  let query = client.from(table).update(updateValue);
  for (const column of columns) query = query.eq(column, firstRow[column]);
  const { data, error } = await query.select(columns.join(","));
  if (!error && data && data.length > 0) {
    fail(`${table} allowed an anonymous update`);
  } else {
    pass(`${table} denied an anonymous update`);
  }
}

for (const objectName of privateObjects) {
  const { error } = await client.from(objectName).select("*").limit(1);
  if (!error) {
    fail(`${objectName} accepted an anonymous read query`);
  } else {
    pass(`${objectName} is not readable by the anonymous browser role`);
  }
}

if (failures.length > 0) {
  console.error(`\nSupabase validation failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nSupabase public contract validation passed.");
