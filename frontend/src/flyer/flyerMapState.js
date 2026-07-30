export const FLYER_MAP_ZOOM = Object.freeze({ min: 10, max: 17, step: 1 });

export function nextFlyerMapZoom(currentZoom, direction) {
  const requestedZoom = Number(currentZoom) + Number(direction) * FLYER_MAP_ZOOM.step;
  return Math.min(FLYER_MAP_ZOOM.max, Math.max(FLYER_MAP_ZOOM.min, requestedZoom));
}

export function getVisibleFlyerLegendItems({ destinations = [], legendItems = [] }) {
  const visibleCategories = new Set(destinations.map((destination) => destination.category).filter(Boolean));
  return legendItems.filter((item) => item.kind === "location" || visibleCategories.has(item.category));
}

export function getFlyerServiceLabelPlacement({ point, mapSize, labelWidth }) {
  const margin = 8;
  const gap = 18;
  const top = Math.max(point.y - 12, margin);

  // Prefer placing the label to the right of the marker. If there isn't
  // enough room before the map edge, flip it to the left instead — simply
  // clamping the "right" position back toward the edge would slide the
  // label box backward over the marker/cluster it's meant to describe.
  const spaceRight = mapSize.x - margin - (point.x + gap);
  const fitsRight = spaceRight >= labelWidth;
  const preferredLeft = fitsRight ? point.x + gap : point.x - gap - labelWidth;

  return {
    left: Math.min(Math.max(preferredLeft, margin), mapSize.x - labelWidth - margin),
    top,
  };
}

export function isFlyerMapPointVisible({ point, mapSize }) {
  const markerSafeInset = 14;
  return point.x >= markerSafeInset
    && point.x <= mapSize.x - markerSafeInset
    && point.y >= markerSafeInset
    && point.y <= mapSize.y - markerSafeInset;
}
