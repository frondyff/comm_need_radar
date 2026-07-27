import test from "node:test";
import assert from "node:assert/strict";
import { FLYER_MAP_ZOOM, getFlyerServiceLabelPlacement, getVisibleFlyerLegendItems, isFlyerMapPointVisible, nextFlyerMapZoom } from "./flyerMapState.js";

test("nextFlyerMapZoom moves one level and never exceeds its bounds", () => {
  assert.equal(nextFlyerMapZoom(12, 1), 13);
  assert.equal(nextFlyerMapZoom(FLYER_MAP_ZOOM.max, 1), FLYER_MAP_ZOOM.max);
  assert.equal(nextFlyerMapZoom(FLYER_MAP_ZOOM.min, -1), FLYER_MAP_ZOOM.min);
});

test("getVisibleFlyerLegendItems retains only location and shown service categories", () => {
  const legendItems = [
    { label: "You are here", kind: "location" },
    { label: "Shelter", kind: "service" },
    { label: "Food", kind: "service" },
    { label: "Medical", kind: "service" },
  ];

  assert.deepEqual(
    getVisibleFlyerLegendItems({ destinations: [{ category: "Shelter" }, { category: "Medical" }], legendItems }),
    [legendItems[0], legendItems[1], legendItems[3]],
  );
});

test("getFlyerServiceLabelPlacement keeps a long selected-service label inside the map", () => {
  assert.deepEqual(
    getFlyerServiceLabelPlacement({ point: { x: 400, y: 30 }, mapSize: { x: 420, y: 245 }, labelWidth: 180 }),
    { left: 232, top: 18 },
  );
});

test("isFlyerMapPointVisible hides a label when its selected marker is panned off the map", () => {
  const mapSize = { x: 420, y: 245 };

  assert.equal(isFlyerMapPointVisible({ point: { x: 210, y: 122 }, mapSize }), true);
  assert.equal(isFlyerMapPointVisible({ point: { x: 10, y: 122 }, mapSize }), false);
  assert.equal(isFlyerMapPointVisible({ point: { x: 210, y: 246 }, mapSize }), false);
});
