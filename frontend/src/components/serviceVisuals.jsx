import L from "leaflet";
import { Globe, Home, Scale, Stethoscope, UtensilsCrossed } from "lucide-react";

export const CATEGORY_COLORS = Object.freeze({
  Shelter: "#DC2626",
  Food: "#D97706",
  Medical: "#2563EB",
  Legal: "#059669",
  Translation: "#9333EA",
});

const CATEGORY_ICONS = Object.freeze({
  Shelter: Home,
  Food: UtensilsCrossed,
  Medical: Stethoscope,
  Legal: Scale,
  Translation: Globe,
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
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#059669" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export function CategoryIcon({ category, size = 14, color, style }) {
  const Icon = CATEGORY_ICONS[category] || Home;

  return <Icon size={size} color={color} strokeWidth={2.25} style={{ flexShrink: 0, verticalAlign: "middle", ...style }} />;
}
