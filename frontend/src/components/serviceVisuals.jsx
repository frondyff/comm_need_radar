import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { Circle, CircleUserRound, Globe, Home, Layers, MapPin, Scale, Stethoscope, UtensilsCrossed } from "lucide-react";

export const CATEGORY_COLORS = Object.freeze({
  Shelter: "#DC2626",
  Food: "#D97706",
  Medical: "#2563EB",
  Legal: "#059669",
  Translation: "#9333EA",
  Other: "#64748B",
});

export const USER_LOCATION_COLOR = "#0F172A";

// This is the sole visual contract for category colors on every Leaflet map,
// map legend, marker, and flyer service-centre detail.
export const MAP_LEGEND_ITEMS = Object.freeze([
  Object.freeze({ label: "You are here", color: USER_LOCATION_COLOR, kind: "location" }),
  ...Object.entries(CATEGORY_COLORS).map(([label, color]) => Object.freeze({ label, color, kind: "service" })),
]);

const CATEGORY_ICONS = Object.freeze({
  Shelter: Home,
  Food: UtensilsCrossed,
  Medical: Stethoscope,
  Legal: Scale,
  Translation: Globe,
  Other: Layers,
});

export function createServiceMarker(category, isSelected) {
  const color = CATEGORY_COLORS[category] || "#888";
  const size = isSelected ? 36 : 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="${isSelected ? 2.5 : 2}"/><circle cx="12" cy="12" r="${isSelected ? 5 : 3.5}" fill="white"/></svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function createUserLocationMarker() {
  // Deliberately a pin shape (not a plain circle like the category dots) so
  // it reads as "this is a different kind of thing" at a glance, in a color
  // ("#0F172A", near-black) that no category uses — the old green circle
  // was the exact same color as the Legal category dot.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="${USER_LOCATION_COLOR}" stroke="white" stroke-width="2"/>
      <circle cx="15" cy="15" r="9.5" fill="white"/>
      <circle cx="15" cy="11.5" r="3.6" fill="${USER_LOCATION_COLOR}"/>
      <path d="M8.2 21c0-3.9 3.1-6.2 6.8-6.2s6.8 2.3 6.8 6.2" fill="none" stroke="${USER_LOCATION_COLOR}" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });
}

function createFlyerPinMarker({ color, InnerIcon, size = 36 }) {
  const iconMarkup = renderToStaticMarkup(
    <span style={{ display: "inline-flex", height: size, position: "relative", width: size }}>
      <MapPin size={size} color={color} fill={color} strokeWidth={1.5} />
      <InnerIcon
        size={size * 0.48}
        color="#fff"
        fill={InnerIcon === Circle ? "#fff" : "none"}
        strokeWidth={InnerIcon === Circle ? 1 : 2.7}
        style={{ left: size * 0.26, position: "absolute", top: size * 0.17 }}
      />
    </span>,
  );

  return L.divIcon({
    html: iconMarkup,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

export function createFlyerStartMarker() {
  return createFlyerPinMarker({ color: "#111111", InnerIcon: CircleUserRound, size: 38 });
}

export function createFlyerPrimaryMarker() {
  return createFlyerPinMarker({ color: "#E50914", InnerIcon: Circle, size: 40 });
}

export function createFlyerShelterMarker(color) {
  return createFlyerPinMarker({ color, InnerIcon: Home, size: 36 });
}

export function CategoryIcon({ category, size = 14, color, style }) {
  const Icon = CATEGORY_ICONS[category] || Home;

  return <Icon size={size} color={color} strokeWidth={2.25} style={{ flexShrink: 0, verticalAlign: "middle", ...style }} />;
}
