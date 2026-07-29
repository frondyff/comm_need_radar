import { readFile } from "node:fs/promises";
import {
  mapAreaRowsToAreas,
  mapAreaRowsToBoroughScores,
  mapServiceRowsToDashboardServices,
} from "../src/lib/dashboardAdapter.js";

const geojsonPath = new URL("../public/geo/areas.geojson", import.meta.url);
const collection = JSON.parse(await readFile(geojsonPath, "utf8"));
const areaRows = collection.features.map((feature, index) => ({
  area_id: feature.properties.area_id,
  structural_vulnerability_score: 70 - index,
  vulnerability_score: 70 - index,
  structural_vulnerability_rank: index + 1,
  vulnerability_rank: index + 1,
  structural_formula_id: "STRUCT-01",
  score_basis: "statcan-2021-equal5-borough",
  source_year: 2021,
  source_geography_level: "borough",
  source_geography_name: feature.properties.borough_name,
}));
const vulnerabilityRows = collection.features.map((feature, index) => ({
  area_id: feature.properties.area_id,
  low_income_pct: 10 + index,
  low_income_pct_scaled: 20 + index,
  shelter_cost_burden_pct: 30 + index,
  shelter_cost_burden_pct_scaled: 40 + index,
  recent_immigrant_pct: 5 + index,
  recent_immigrant_pct_scaled: 60 + index,
}));
const gapRows = collection.features.map((feature, index) => ({
  area_id: feature.properties.area_id,
  area_name: feature.properties.area_name,
  borough_name: feature.properties.borough_name,
  gap_score: 40 + index,
  structural_vulnerability_score: 70 - index,
  vulnerability_score: 70 - index,
  service_accessibility_score: 50 - index,
  overall_accessibility_score: 50 - index,
  gap_rank: index + 1,
  priority_band: index < 5 ? "high_candidate" : "",
  priority_flag: index < 5 ? "High-priority candidate (POC)" : "",
  classification_formula_id: "CLASS-TOP5-02",
  classification_status: "poc_relative_candidate",
  priority_cutoff_rank: 5,
  comparison_set_size: 12,
  structural_formula_id: "STRUCT-01",
  accessibility_formula_id: "ACCESS-REAL-02",
  gap_formula_id: "GAP-CANON-02",
  formula_set_version: "scoring-contract-03",
}));
const scores = mapAreaRowsToBoroughScores(gapRows, areaRows, vulnerabilityRows);
const failures = [];

for (const feature of collection.features) {
  const { area_id: areaId, borough_name: boroughName } = feature.properties;
  const score = scores[boroughName];
  if (!score) failures.push(`${areaId} does not resolve to Supabase score key ${boroughName}`);
  if (score && !score.sourceAreaIds.includes(areaId)) {
    failures.push(`${boroughName} does not retain source area_id ${areaId}`);
  }
}

const sharedBorough = scores["Villeray-Saint-Michel-Parc-Extension"];
if (sharedBorough?.sourceAreaIds.join(",") !== "A001,A002") {
  failures.push("A001/A002 did not aggregate under their shared Supabase borough key");
}
if (sharedBorough?.income !== 0.205 || sharedBorough?.incomePct !== 10.5) {
  failures.push("Borough income did not use the real scaled/raw census fields");
}

const mappedAreas = mapAreaRowsToAreas(gapRows, areaRows, [], vulnerabilityRows);
const firstArea = mappedAreas.find(area => area.id === collection.features[0].properties.area_id);
if (firstArea?.income !== 0.2 || firstArea?.incomePct !== 10) {
  failures.push("Area income did not use low_income_pct_scaled and low_income_pct");
}
if (firstArea?.housing !== 0.4 || firstArea?.housingPct !== 30) {
  failures.push("Area housing did not use shelter_cost_burden_pct_scaled and its raw percentage");
}
if (firstArea?.immigration !== 0.6 || firstArea?.immigrationPct !== 5) {
  failures.push("Area immigration did not use recent_immigrant_pct_scaled and its raw percentage");
}
if (firstArea?.vulnerability !== 0.7 || firstArea?.accessibility !== 0.5) {
  failures.push("Area did not use the canonical structural and area-average accessibility fields");
}
if (
  firstArea?.structuralFormulaId !== "STRUCT-01"
  || firstArea?.accessibilityFormulaId !== "ACCESS-REAL-02"
  || firstArea?.gapFormulaId !== "GAP-CANON-02"
) {
  failures.push("Area did not retain candidate scoring formula lineage");
}
if (
  firstArea?.priorityBand !== "high_candidate"
  || firstArea?.priorityFlag !== "High-priority candidate (POC)"
  || firstArea?.classificationFormulaId !== "CLASS-TOP5-02"
  || firstArea?.classificationStatus !== "poc_relative_candidate"
) {
  failures.push("Area lost its CLASS-TOP5-02 POC candidate classification");
}

const services = mapServiceRowsToDashboardServices([{
  service_id: "S001",
  name: "Test food service",
  primary_category: "Food",
  service_categories: "Food; Material Aid",
  latitude: 45.51,
  longitude: -73.59,
}]);
if (services.length !== 1 || services[0].category !== "Food") {
  failures.push("Supabase service row did not map into the dashboard contract");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(
  `PASS ${collection.features.length} boundaries resolve to ${Object.keys(scores).length} Supabase score keys`
);
