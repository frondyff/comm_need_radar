import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";


const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
const expectedObservedCategoryRows =
  env.SUPABASE_EXPECTED_OBSERVED_NEED_CATEGORY_SUMMARY_ROWS
    ? Number(env.SUPABASE_EXPECTED_OBSERVED_NEED_CATEGORY_SUMMARY_ROWS)
    : null;

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
  services_master: Number(env.SUPABASE_EXPECTED_SERVICES_MASTER_ROWS ?? 3664),
  observed_need_index: Number(env.SUPABASE_EXPECTED_OBSERVED_NEED_INDEX_ROWS ?? 12),
  observed_need_category_summary: expectedObservedCategoryRows,
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
    "structural_vulnerability_score",
    "vulnerability_score",
    "structural_vulnerability_rank",
    "vulnerability_rank",
    "top_vulnerability_drivers",
    "structural_formula_id",
    "score_basis",
    "score_version",
    "source_year",
    "source_geography_level",
    "source_geography_name",
    "population_basis"
  ],
  gap_score: [
    "area_id",
    "area_name",
    "borough_name",
    "latitude",
    "longitude",
    "structural_vulnerability_score",
    "vulnerability_score",
    "service_accessibility_score",
    "overall_accessibility_score",
    "gap_score",
    "gap_rank",
    "priority_band",
    "priority_flag",
    "classification_formula_id",
    "classification_status",
    "priority_cutoff_rank",
    "comparison_set_size",
    "gap_drivers",
    "summary_en",
    "summary_fr",
    "structural_formula_id",
    "accessibility_formula_id",
    "gap_formula_id",
    "formula_set_version",
    "gap_basis",
    "gap_version",
    "taxonomy_version",
    "service_snapshot_id"
  ],
  accessibility: [
    "area_id",
    "service_category",
    "nearest_service_distance_km",
    "service_count_within_threshold",
    "distance_component",
    "availability_component",
    "accessibility_score",
    "accessibility_method",
    "accessibility_basis",
    "accessibility_version",
    "accessibility_formula_id",
    "formula_set_version",
    "taxonomy_version",
    "service_snapshot_id",
    "service_snapshot_date",
    "service_snapshot_total_rows",
    "service_snapshot_mappable_rows"
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
  services_master: [
    "service_id",
    "name",
    "primary_category",
    "service_categories",
    "address",
    "latitude",
    "longitude",
    "mappable",
    "area_id",
    "borough_name",
    "phone",
    "website",
    "hours",
    "services",
    "sources"
  ],
  observed_need_index: [
    "area_id",
    "v1_demand_score",
    "v2_observed_score",
    "observed_data_basis",
    "insufficient_visit_data"
  ],
  observed_need_category_summary: [
    "area_id",
    "key_need",
    "encounter_count",
    "encounter_share_pct",
    "category_rank",
    "weighted_demand_total",
    "weighted_demand_share_pct",
    "source_type"
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
  services_master: ["service_id"],
  observed_need_index: ["area_id"],
  observed_need_category_summary: ["area_id", "key_need"],
  vulnerability_index_v2: ["area_id"]
};

const privateObjects = [
  "flyer_downloads",
  "page_events",
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
  "center_area_lookup",
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
  if (count !== null && actualCount !== count) {
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
  "observed_need_category_summary",
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

const profileById = new Map(
  (tableRows.area_profile ?? []).map((row) => [row.area_id, row])
);
const scoringErrors = [];
for (const row of tableRows.gap_score ?? []) {
  const profile = profileById.get(row.area_id);
  const expectedGap =
    Number(row.structural_vulnerability_score)
    * (100 - Number(row.service_accessibility_score))
    / 100;
  if (!profile) continue;
  if (
    Math.abs(
      Number(profile.structural_vulnerability_score)
      - Number(profile.vulnerability_score)
    ) > 0.01
    || Number(profile.structural_vulnerability_rank)
      !== Number(profile.vulnerability_rank)
    || Math.abs(
      Number(row.structural_vulnerability_score)
      - Number(row.vulnerability_score)
    ) > 0.01
    || Math.abs(
      Number(row.structural_vulnerability_score)
      - Number(profile.structural_vulnerability_score)
    ) > 0.01
  ) {
    scoringErrors.push(`${row.area_id} structural aliases disagree`);
  }
  if (Math.abs(Number(row.gap_score) - expectedGap) > 0.011) {
    scoringErrors.push(`${row.area_id} gap formula does not reconcile`);
  }
  if (
    row.structural_formula_id !== "STRUCT-01"
    || row.accessibility_formula_id !== "ACCESS-REAL-02"
    || row.gap_formula_id !== "GAP-CANON-02"
    || row.formula_set_version !== "scoring-contract-03"
    || row.classification_formula_id !== "CLASS-TOP5-02"
    || row.classification_status !== "poc_relative_candidate"
    || Number(row.priority_cutoff_rank) !== 5
    || Number(row.comparison_set_size) !== 12
    || (
      Number(row.gap_rank) <= 5
      && (
        row.priority_band !== "high_candidate"
        || row.priority_flag !== "High-priority candidate (POC)"
      )
    )
    || (
      Number(row.gap_rank) > 5
      && (
        String(row.priority_band ?? "").trim() !== ""
        || String(row.priority_flag ?? "").trim() !== ""
      )
    )
  ) {
    scoringErrors.push(`${row.area_id} formula metadata is not scoring-contract-03`);
  }
}
if (scoringErrors.length > 0) {
  scoringErrors.forEach(fail);
} else {
  pass("candidate scoring aliases, formula IDs, classification, and gap arithmetic reconcile");
}

const accessibilityCategoriesByArea = new Map();
for (const row of tableRows.accessibility ?? []) {
  const categories = accessibilityCategoriesByArea.get(row.area_id) ?? new Set();
  categories.add(row.service_category);
  accessibilityCategoriesByArea.set(row.area_id, categories);
  if (
    row.accessibility_formula_id !== "ACCESS-REAL-02"
    || row.formula_set_version !== "scoring-contract-03"
    || row.taxonomy_version !== "planning-needs-9-v1"
    || Number(row.distance_component) < 0
    || Number(row.distance_component) > 100
    || Number(row.availability_component) < 0
    || Number(row.availability_component) > 100
    || Math.abs(
      Number(row.accessibility_score)
      - (
        0.5 * Number(row.distance_component)
        + 0.5 * Number(row.availability_component)
      )
    ) > 0.011
    || Number(row.service_snapshot_total_rows) !== 3664
    || Number(row.service_snapshot_mappable_rows) !== 3200
  ) {
    fail(`${row.area_id}/${row.service_category} accessibility metadata is invalid`);
  }
}
if (
  accessibilityCategoriesByArea.size === 12
  && [...accessibilityCategoriesByArea.values()].every(categories => categories.size === 9)
) {
  pass("accessibility contains nine candidate planning categories for all 12 areas");
} else {
  fail("accessibility is not a complete 12 area x 9 category matrix");
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

for (const functionName of [
  "publish_scoring_contract_02",
  "publish_scoring_contract_03",
]) {
  const { error: scoringPublishError } = await client.rpc(
    functionName,
    {
      p_area_profiles: [],
      p_accessibility: [],
      p_gap_scores: [],
    }
  );
  if (!scoringPublishError) {
    fail(`anonymous browser role can execute ${functionName}`);
  } else {
    pass(`anonymous browser role cannot execute ${functionName}`);
  }
}

if (failures.length > 0) {
  console.error(`\nSupabase validation failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nSupabase public contract validation passed.");
