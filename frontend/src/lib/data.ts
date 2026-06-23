import Papa from "papaparse";

export type AreaProfile = {
  area_id: string;
  area_name: string;
  borough_name: string;
  latitude: number;
  longitude: number;
  population: number;
  income_indicator: number;
  age_indicator: number;
  language_indicator: number;
  immigration_indicator: number;
  housing_indicator: number;
  vulnerability_score: number;
  vulnerability_rank: number;
  top_vulnerability_drivers: string;
};

export type GapRow = {
  area_id: string;
  area_name: string;
  borough_name: string;
  latitude: number;
  longitude: number;
  vulnerability_score: number;
  overall_accessibility_score: number;
  gap_score: number;
  gap_rank: number;
  priority_flag: string;
  gap_drivers: string;
  summary_en: string;
  summary_fr: string;
};

export type AccessibilityRow = {
  area_id: string;
  service_category: string;
  nearest_service_distance_km: number;
  service_count_within_threshold: number;
  accessibility_score: number;
  accessibility_method: string;
};

export type ServiceRow = {
  service_id: string;
  service_name: string;
  service_category: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  website: string;
  language: string;
  source_name: string;
  source_url: string;
  last_checked_date: string;
  distance_km?: number;
};

export type AppData = {
  areas: AreaProfile[];
  gap: GapRow[];
  accessibility: AccessibilityRow[];
  services: ServiceRow[];
  areaPolygons: AreaFeatureCollection | null;
};

export type AreaMetricKey = "gap_score" | "vulnerability_score" | "overall_accessibility_score";

export type AreaPolygonProperties = {
  area_id: string;
  area_name: string;
  boundary_type: string;
  gap_score?: number;
  vulnerability_score?: number;
  overall_accessibility_score?: number;
  style_score?: number;
  priority_flag?: string;
};

export type AreaPolygonFeature = {
  type: "Feature";
  properties: AreaPolygonProperties;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

export type AreaFeatureCollection = {
  type: "FeatureCollection";
  name?: string;
  features: AreaPolygonFeature[];
};

export type VulnerabilityKey =
  | "income_indicator"
  | "age_indicator"
  | "language_indicator"
  | "immigration_indicator"
  | "housing_indicator";

export type VulnerabilityType = {
  key: VulnerabilityKey;
  shortLabel: string;
  fullLabel: string;
  description: string;
  analysisFocus: string;
  serviceCategories: string[];
  questions: string;
};

export const postalAreaLookup: Record<string, string> = {
  H1E: "Riviere-des-Prairies",
  H1H: "Montreal-Nord",
  H1W: "Hochelaga",
  H2J: "Plateau Mont-Royal",
  H2M: "Ahuntsic",
  H3K: "Pointe-Saint-Charles",
  H3N: "Parc Extension",
  H3S: "Cote-des-Neiges",
  H3Y: "Westmount",
  H4G: "Verdun",
  H8S: "Lachine"
};

export const vulnerabilityTypes: VulnerabilityType[] = [
  {
    key: "income_indicator",
    shortLabel: "Income",
    fullLabel: "Income pressure",
    description: "Signals pressure from lower-income conditions and cost sensitivity.",
    analysisFocus: "Look for food, employment, legal, and benefits-navigation supports near the client area.",
    serviceCategories: ["Food Support", "Employment", "Legal Aid", "General Support"],
    questions: "Ask about immediate food needs, job search barriers, income benefits, and documentation support."
  },
  {
    key: "age_indicator",
    shortLabel: "Age",
    fullLabel: "Age-related support",
    description: "Signals higher need for age-related services and daily-living supports.",
    analysisFocus: "Check whether senior, health, transportation, and general support services are close enough.",
    serviceCategories: ["Senior Support", "General Support", "Mental Health"],
    questions: "Ask about mobility, caregiver support, isolation, appointment access, and home-safety needs."
  },
  {
    key: "language_indicator",
    shortLabel: "Language",
    fullLabel: "Language access",
    description: "Signals potential language-access barriers when finding or using services.",
    analysisFocus: "Prioritize multilingual services, intake support, interpretation, and plain-language referrals.",
    serviceCategories: ["Newcomer Support", "Legal Aid", "General Support", "Family Services"],
    questions: "Ask preferred language, comfort with forms, interpretation needs, and digital access barriers."
  },
  {
    key: "immigration_indicator",
    shortLabel: "Newcomer",
    fullLabel: "Newcomer support",
    description: "Signals newcomer-support needs and settlement navigation pressure.",
    analysisFocus: "Prioritize settlement, employment, legal, family, and multilingual navigation services.",
    serviceCategories: ["Newcomer Support", "Employment", "Legal Aid", "Family Services"],
    questions: "Ask about settlement status, documents, school or childcare needs, work access, and social support."
  },
  {
    key: "housing_indicator",
    shortLabel: "Housing",
    fullLabel: "Housing pressure",
    description: "Signals housing pressure, affordability stress, or instability risk.",
    analysisFocus: "Check nearby housing clinics, legal aid, food support, and emergency stabilization resources.",
    serviceCategories: ["Housing", "Legal Aid", "Food Support", "General Support"],
    questions: "Ask about rent arrears, eviction notices, repair issues, crowding, and urgent safety concerns."
  }
];

const numericFields = new Set([
  "latitude",
  "longitude",
  "population",
  "income_indicator",
  "age_indicator",
  "language_indicator",
  "immigration_indicator",
  "housing_indicator",
  "vulnerability_score",
  "vulnerability_rank",
  "overall_accessibility_score",
  "gap_score",
  "gap_rank",
  "nearest_service_distance_km",
  "service_count_within_threshold",
  "accessibility_score"
]);

async function loadCsv<T>(path: string): Promise<T[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status}`);
  }
  const csvText = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(`Unable to parse ${path}: ${parsed.errors[0].message}`);
  }

  return parsed.data.map((row) => {
    const normalized: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = numericFields.has(key) ? Number(value) : value;
    }
    return normalized as T;
  });
}

async function loadAreaPolygons(path: string): Promise<AreaFeatureCollection | null> {
  const response = await fetch(path);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AreaFeatureCollection;
}

export async function loadAppData(): Promise<AppData> {
  const [areas, gap, accessibility, services, areaPolygons] = await Promise.all([
    loadCsv<AreaProfile>("/data/area_profile.csv"),
    loadCsv<GapRow>("/data/gap_score_table.csv"),
    loadCsv<AccessibilityRow>("/data/accessibility_table.csv"),
    loadCsv<ServiceRow>("/data/service_table.csv"),
    loadAreaPolygons("/geo/areas.geojson")
  ]);

  return {
    areas,
    gap: gap.sort((a, b) => a.gap_rank - b.gap_rank),
    accessibility,
    services,
    areaPolygons
  };
}

export function normalizeLookup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveAreaSearch(searchText: string, areas: GapRow[]): { areaName: string; label: string } | null {
  const query = searchText.trim();
  if (!query) {
    return null;
  }

  const postal = query.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (postal.length >= 3 && postalAreaLookup[postal.slice(0, 3)]) {
    const areaName = postalAreaLookup[postal.slice(0, 3)];
    return { areaName, label: `${postal.slice(0, 3)} matched to ${areaName}` };
  }

  const normalizedQuery = normalizeLookup(query);
  const sortedAreas = [...areas].sort((a, b) => a.area_name.localeCompare(b.area_name));
  for (const area of sortedAreas) {
    if (normalizeLookup(area.area_name).includes(normalizedQuery)) {
      return { areaName: area.area_name, label: area.area_name };
    }
    if (normalizeLookup(area.borough_name).includes(normalizedQuery)) {
      return { areaName: area.area_name, label: area.borough_name };
    }
  }

  return null;
}

export function vulnerabilityLevel(score: number): string {
  if (score >= 75) return "Very high";
  if (score >= 60) return "High";
  if (score >= 45) return "Moderate";
  return "Lower";
}

export function topVulnerability(area: AreaProfile): VulnerabilityType {
  return vulnerabilityTypes.reduce((current, next) => (area[next.key] > area[current.key] ? next : current));
}

export function vulnerabilityRank(areas: AreaProfile[], key: VulnerabilityKey, areaId: string): number {
  const ranked = [...areas].sort((a, b) => b[key] - a[key]);
  return ranked.findIndex((area) => area.area_id === areaId) + 1;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function accessibilityScore(nearestDistanceKm: number, serviceCount: number): number {
  const thresholdKm = 2.5;
  const distanceComponent = Math.max(0, 100 - (nearestDistanceKm / thresholdKm) * 70);
  const countComponent = Math.min(serviceCount, 5) * 6;
  return Number(Math.min(100, distanceComponent + countComponent).toFixed(2));
}

export function estimatedWalkMinutes(distanceKm: number): number {
  return Math.round((distanceKm / 4.5) * 60);
}

export function travelBurden(distanceKm: number): string {
  if (distanceKm <= 1) return "Low";
  if (distanceKm <= 2.5) return "Moderate";
  if (distanceKm <= 5) return "High";
  return "Severe";
}

export function addServiceDistances(area: GapRow, services: ServiceRow[]): ServiceRow[] {
  return services
    .map((service) => ({
      ...service,
      distance_km: Number(haversineKm(area.latitude, area.longitude, service.latitude, service.longitude).toFixed(2))
    }))
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
}

export function servicesForVulnerability(services: ServiceRow[], vulnerability: VulnerabilityType): ServiceRow[] {
  return services
    .filter((service) => vulnerability.serviceCategories.includes(service.service_category))
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
}

export function categoryAccessRows(data: AppData, areaId: string): AccessibilityRow[] {
  return data.accessibility
    .filter((row) => row.area_id === areaId)
    .sort((a, b) => a.accessibility_score - b.accessibility_score);
}

export function catchmentSummary(services: ServiceRow[], radiusKm: number) {
  const withinRadius = services.filter((service) => (service.distance_km ?? 0) <= radiusKm);
  const nearest = services[0];
  const categories = new Set(withinRadius.map((service) => service.service_category));
  return {
    serviceCount: withinRadius.length,
    categoryCount: categories.size,
    nearestDistanceKm: nearest?.distance_km ?? null,
    nearestWalkMinutes: nearest?.distance_km ? estimatedWalkMinutes(nearest.distance_km) : null,
    nearestTravelBurden: nearest?.distance_km ? travelBurden(nearest.distance_km) : "n/a"
  };
}

export function scenarioImpact(accessRows: AccessibilityRow[]) {
  const weakest = accessRows[0];
  if (!weakest) {
    return null;
  }
  const currentScore = weakest.accessibility_score;
  const proposedScore = accessibilityScore(0.2, weakest.service_count_within_threshold + 1);
  return {
    serviceCategory: weakest.service_category,
    currentScore,
    proposedScore,
    scoreLift: Number((proposedScore - currentScore).toFixed(1)),
    currentNearestKm: weakest.nearest_service_distance_km,
    proposedNearestKm: 0.2
  };
}

export function areaMetricLabel(metric: AreaMetricKey): string {
  if (metric === "gap_score") return "Gap score";
  if (metric === "vulnerability_score") return "Vulnerability";
  return "Access deficit";
}

export function mapStyleScore(area: Pick<GapRow, AreaMetricKey>, metric: AreaMetricKey): number {
  const value = Number(area[metric]);
  return metric === "overall_accessibility_score" ? 100 - value : value;
}

export function enrichAreaPolygons(
  polygons: AreaFeatureCollection | null,
  rows: GapRow[],
  metric: AreaMetricKey
): AreaFeatureCollection | null {
  if (!polygons) {
    return null;
  }
  const byId = new Map(rows.map((row) => [row.area_id, row]));
  return {
    ...polygons,
    features: polygons.features
      .filter((feature) => byId.has(feature.properties.area_id))
      .map((feature) => {
        const row = byId.get(feature.properties.area_id);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            gap_score: row?.gap_score,
            vulnerability_score: row?.vulnerability_score,
            overall_accessibility_score: row?.overall_accessibility_score,
            style_score: row ? mapStyleScore(row, metric) : 0,
            priority_flag: row?.priority_flag
          }
        };
      })
  };
}

export function policyAssistantResponse(
  prompt: string,
  data: AppData,
  selectedAreaName: string,
  serviceCategory: string
): string {
  const query = prompt.toLowerCase();
  const selectedProfile = data.gap.find((area) => area.area_name === selectedAreaName) ?? data.gap[0];

  if (["top", "priority", "prioritize", "highest", "rank"].some((term) => query.includes(term))) {
    const rows = data.gap
      .slice(0, 5)
      .map(
        (row) =>
          `${row.area_name}: gap ${row.gap_score.toFixed(1)}, vulnerability ${row.vulnerability_score.toFixed(1)}, access ${row.overall_accessibility_score.toFixed(1)}`
      );
    return `Top policy priority areas: ${rows.join("; ")}. Review the weakest service categories in the top three areas before assigning funding.`;
  }

  if (["borough", "district", "compare"].some((term) => query.includes(term))) {
    const grouped = new Map<string, { gap: number; vulnerability: number; count: number; highPriority: number }>();
    for (const row of data.gap) {
      const current = grouped.get(row.borough_name) ?? { gap: 0, vulnerability: 0, count: 0, highPriority: 0 };
      current.gap += row.gap_score;
      current.vulnerability += row.vulnerability_score;
      current.count += 1;
      current.highPriority += row.priority_flag === "High priority" ? 1 : 0;
      grouped.set(row.borough_name, current);
    }
    const rows = [...grouped.entries()]
      .map(([name, values]) => ({
        name,
        avgGap: values.gap / values.count,
        avgVulnerability: values.vulnerability / values.count,
        highPriority: values.highPriority
      }))
      .sort((a, b) => b.highPriority - a.highPriority || b.avgGap - a.avgGap)
      .slice(0, 4)
      .map((row) => `${row.name}: avg gap ${row.avgGap.toFixed(1)}, high-priority areas ${row.highPriority}`);
    return `Borough comparison: ${rows.join("; ")}.`;
  }

  const areaAccess = data.accessibility
    .filter((row) => row.area_id === selectedProfile.area_id)
    .filter((row) => serviceCategory === "All" || row.service_category === serviceCategory)
    .sort((a, b) => a.accessibility_score - b.accessibility_score);

  if (["service", "access", "gap", "category", "nearby"].some((term) => query.includes(term))) {
    const weakest = areaAccess
      .slice(0, 3)
      .map(
        (row) =>
          `${row.service_category}: access ${row.accessibility_score.toFixed(1)}, nearest ${row.nearest_service_distance_km.toFixed(1)} km`
      );
    return `Weakest service-access categories for ${selectedAreaName}: ${weakest.join("; ")}.`;
  }

  if (["why", "driver", "explain", "summary"].some((term) => query.includes(term))) {
    return `${selectedAreaName} ranks #${selectedProfile.gap_rank} with a gap score of ${selectedProfile.gap_score.toFixed(
      1
    )}. Main score drivers: ${selectedProfile.gap_drivers}.`;
  }

  if (["fund", "budget", "intervention", "recommend", "action"].some((term) => query.includes(term))) {
    const weakest = areaAccess[0];
    const nearbyCount = addServiceDistances(selectedProfile, data.services).filter((service) => (service.distance_km ?? 0) <= 2.5).length;
    return `Recommended action for ${selectedAreaName}: target access improvement in ${
      weakest?.service_category ?? "the weakest service category"
    }. There are ${nearbyCount} synthetic services within 2.5 km across all categories. Consider added capacity, mobile outreach, transport support, and referral coordination.`;
  }

  return "Ask about top priority areas, weakest service categories, borough comparisons, ranking drivers, or recommended funding actions.";
}
