export const FLYER_MAP_ZOOM = Object.freeze({ min: 10, max: 17, step: 1 });

export function nextFlyerMapZoom(currentZoom, direction) {
  const requestedZoom = Number(currentZoom) + Number(direction) * FLYER_MAP_ZOOM.step;
  return Math.min(FLYER_MAP_ZOOM.max, Math.max(FLYER_MAP_ZOOM.min, requestedZoom));
}

export function getVisibleFlyerLegendItems({ destinations = [], legendItems = [] }) {
  const visibleCategories = new Set(destinations.map((destination) => destination.category).filter(Boolean));
  return legendItems.filter((item) => item.kind === "location" || visibleCategories.has(item.label));
}

export function getFlyerServiceLabelPlacement({ point, mapSize, labelWidth }) {
  const margin = 8;
  const preferredLeft = point.x + 18;
  const preferredTop = point.y - 12;
  return {
    left: Math.min(Math.max(preferredLeft, margin), mapSize.x - labelWidth - margin),
    top: Math.max(preferredTop, margin),
  };
}

export function isFlyerMapPointVisible({ point, mapSize }) {
  const markerSafeInset = 14;
  return point.x >= markerSafeInset
    && point.x <= mapSize.x - markerSafeInset
    && point.y >= markerSafeInset
    && point.y <= mapSize.y - markerSafeInset;
}
