import { readFile } from "node:fs/promises";

const path = new URL("../public/geo/areas.geojson", import.meta.url);
const payload = await readFile(path);
const collection = JSON.parse(payload.toString("utf8"));
const failures = [];

if (collection.type !== "FeatureCollection") {
  failures.push("root type must be FeatureCollection");
}

if (!Array.isArray(collection.features) || collection.features.length !== 12) {
  failures.push(`expected 12 features, found ${collection.features?.length ?? 0}`);
}

const ids = new Set();
const expectedIds = new Set(
  Array.from({ length: 12 }, (_, index) => `A${String(index + 1).padStart(3, "0")}`)
);
let derivedCount = 0;

for (const feature of collection.features ?? []) {
  const properties = feature.properties ?? {};

  if (!properties.area_id) failures.push("feature is missing area_id");
  if (!properties.borough_name) failures.push(`${properties.area_id} is missing borough_name`);
  if (!properties.boundary_source) failures.push(`${properties.area_id} is missing attribution`);
  if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
    failures.push(`${properties.area_id} has unsupported geometry ${feature.geometry?.type}`);
  }
  if (ids.has(properties.area_id)) failures.push(`duplicate area_id ${properties.area_id}`);

  ids.add(properties.area_id);

  if (properties.boundary_type === "centroid_partition_within_official_boundary") {
    derivedCount += 1;
  }
  if (properties.boundary_type === "synthetic_envelope") {
    failures.push(`${properties.area_id} still uses a synthetic envelope`);
  }
}

if (derivedCount !== 2) failures.push(`expected 2 derived partitions, found ${derivedCount}`);
for (const expectedId of expectedIds) {
  if (!ids.has(expectedId)) failures.push(`missing stable area_id ${expectedId}`);
}
for (const areaId of ids) {
  if (!expectedIds.has(areaId)) failures.push(`unexpected area_id ${areaId}`);
}
if (payload.byteLength > 600_000) {
  failures.push(`payload exceeds 600000 bytes: ${payload.byteLength}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(`PASS 12 stable real-boundary features (${payload.byteLength} bytes)`);
