import { readFile } from "node:fs/promises";
import {
  mapAreaRowsToBoroughScores,
  mapServiceRowsToDashboardServices,
} from "../src/lib/dashboardAdapter.js";

const geojsonPath = new URL("../public/geo/areas.geojson", import.meta.url);
const collection = JSON.parse(await readFile(geojsonPath, "utf8"));
const areaRows = collection.features.map((feature, index) => ({
  area_id: feature.properties.area_id,
  income_indicator: 10 + index,
  housing_indicator: 20 + index,
  immigration_indicator: 30 + index,
}));
const gapRows = collection.features.map((feature, index) => ({
  area_id: feature.properties.area_id,
  area_name: feature.properties.area_name,
  borough_name: feature.properties.borough_name,
  gap_score: 40 + index,
}));
const scores = mapAreaRowsToBoroughScores(gapRows, areaRows);
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

const services = mapServiceRowsToDashboardServices([{
  service_id: "S001",
  service_name: "Test food service",
  service_category: "Food Support",
  latitude: 45.51,
  longitude: -73.59,
  language: "English;French",
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
