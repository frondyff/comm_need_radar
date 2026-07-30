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
    { category: null, label: { en: "You are here", fr: "Vous êtes ici" }, kind: "location" },
    { category: "Shelter", label: { en: "Shelter", fr: "Hébergement" }, kind: "service" },
    { category: "Food", label: { en: "Food", fr: "Alimentation" }, kind: "service" },
    { category: "Medical", label: { en: "Medical", fr: "Médical" }, kind: "service" },
  ];

  assert.deepEqual(
    getVisibleFlyerLegendItems({ destinations: [{ category: "Shelter" }, { category: "Medical" }], legendItems }),
    [legendItems[0], legendItems[1], legendItems[3]],
  );
});

test("getFlyerServiceLabelPlacement flips a long label left when the right side is constrained", () => {
  assert.deepEqual(
    getFlyerServiceLabelPlacement({ point: { x: 400, y: 30 }, mapSize: { x: 420, y: 245 }, labelWidth: 180 }),
    { left: 202, top: 18 },
  );
});

test("getFlyerServiceLabelPlacement keeps a label right of the marker when space permits", () => {
  assert.deepEqual(
    getFlyerServiceLabelPlacement({ point: { x: 100, y: 30 }, mapSize: { x: 420, y: 245 }, labelWidth: 180 }),
    { left: 118, top: 18 },
  );
});

test("isFlyerMapPointVisible hides a label when its selected marker is panned off the map", () => {
  const mapSize = { x: 420, y: 245 };

  assert.equal(isFlyerMapPointVisible({ point: { x: 210, y: 122 }, mapSize }), true);
  assert.equal(isFlyerMapPointVisible({ point: { x: 10, y: 122 }, mapSize }), false);
  assert.equal(isFlyerMapPointVisible({ point: { x: 210, y: 246 }, mapSize }), false);
});
