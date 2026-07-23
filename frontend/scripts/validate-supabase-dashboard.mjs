import { readFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { mapAreaRowsToBoroughScores } from "../src/lib/dashboardAdapter.js";
import { loadAppData } from "../src/lib/supabaseData.js";

Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""));

const expectedCounts = {
  areas: 12,
  gap: 12,
  accessibility: 108,
  services: Number(process.env.SUPABASE_EXPECTED_SERVICES_MASTER_ROWS ?? 3664),
};
const data = await loadAppData();
const failures = [];

for (const [key, expected] of Object.entries(expectedCounts)) {
  const actual = data[key].length;
  if (actual !== expected) failures.push(`${key} expected ${expected} rows but returned ${actual}`);
}

const geojsonPath = new URL("../public/geo/areas.geojson", import.meta.url);
const collection = JSON.parse(await readFile(geojsonPath, "utf8"));
const scores = mapAreaRowsToBoroughScores(data.gap, data.areas);
for (const feature of collection.features) {
  const { area_id: areaId, borough_name: boroughName } = feature.properties;
  const score = scores[boroughName];
  if (!score) failures.push(`${areaId} has no live Supabase score for ${boroughName}`);
  if (score && !score.sourceAreaIds.includes(areaId)) {
    failures.push(`${areaId} is missing from live Supabase score key ${boroughName}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(
  `PASS live Supabase: ${data.areas.length} areas, ${data.gap.length} scores, `
  + `${data.accessibility.length} accessibility rows, ${data.services.length} services, `
  + `${collection.features.length} covered boundaries`
);
