import { loadAppData, haversineKm } from "./supabaseData.js";

export const DASHBOARD_CATEGORIES = [
  { label: "Shelter", color: "#4F46E5", bg: "#EEF2FF" },
  { label: "Food", color: "#D97706", bg: "#FFFBEB" },
  { label: "Medical", color: "#0891B2", bg: "#ECFEFF" },
  { label: "Legal", color: "#059669", bg: "#ECFDF5" },
  { label: "Translation", color: "#7C3AED", bg: "#F5F3FF" },
];

const DEFAULT_REFERENCE_POINT = { lat: 45.5088, lng: -73.5878 };

function normalizeText(value) {
  return String(value || "").trim();
}

function splitList(value) {
  return normalizeText(value)
    .split(/[;,/]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function dashboardCategory(serviceCategory) {
  const category = normalizeText(serviceCategory).toLowerCase();
  if (/(shelter|housing|home|emergency)/.test(category)) return "Shelter";
  if (/(food|meal|nutrition)/.test(category)) return "Food";
  if (/(medical|health|mental|clinic|senior)/.test(category)) return "Medical";
  if (/(legal|rights|aid)/.test(category)) return "Legal";
  return "Translation";
}

function dashboardGroups(service) {
  const text = [
    service.service_name,
    service.service_category,
    service.language,
    service.source_name,
    service.indigenous_led_or_specific,
  ].join(" ").toLowerCase();
  const groups = [];
  if (/indigenous|inuktitut|first nation|first nations|native/.test(text)) {
    groups.push("Indigenous");
  }
  if (/immigrant|newcomer|settlement|language|translation|arabic|spanish|mandarin|haitian|creole/.test(text)) {
    groups.push("Immigrant");
  }
  return groups;
}

function dashboardTags(service, languages, groups, hours) {
  const tags = [];
  if (languages.length > 2) tags.push("Multilingual");
  if (groups.includes("Indigenous")) tags.push("Indigenous services");
  if (normalizeText(service.source_name) || normalizeText(service.last_checked_date)) {
    tags.push("Source verified");
  }
  if (hours === "Hours not listed") tags.push("Hours not listed");
  return tags.length > 0 ? tags : ["Info available"];
}

export function mapServiceRowsToDashboardServices(
  serviceRows,
  referencePoint = DEFAULT_REFERENCE_POINT
) {
  return serviceRows
    .filter(service => Number.isFinite(Number(service.latitude))
      && Number.isFinite(Number(service.longitude)))
    .map(service => {
      const lat = Number(service.latitude);
      const lng = Number(service.longitude);
      const distance = haversineKm(referencePoint.lat, referencePoint.lng, lat, lng);
      const category = dashboardCategory(service.service_category);
      const languages = splitList(service.language);
      const groups = dashboardGroups(service);
      const hours = normalizeText(service.hours) || "Hours not listed";
      return {
        id: String(service.service_id),
        name: normalizeText(service.service_name) || "Unnamed service",
        type: normalizeText(service.service_category) || category,
        dist: `${distance.toFixed(1)} km`,
        distanceKm: Number(distance.toFixed(2)),
        hours,
        address: normalizeText(service.address) || "Address not listed",
        phone: normalizeText(service.phone) || "Phone not listed",
        website: normalizeText(service.website),
        tags: dashboardTags(service, languages, groups, hours),
        langs: languages.length > 0 ? languages : ["Language not listed"],
        group: groups,
        category,
        gender: "All",
        lat,
        lng,
        sourceId: String(service.service_id),
        sourceTable: "service_table",
      };
    })
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

function normalizeMetric(value, maxValue) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isFinite(maxValue) || maxValue <= 0) return 0;
  if (number <= 1 && maxValue <= 1) return Number(number.toFixed(2));
  return Number(Math.min(1, number / maxValue).toFixed(2));
}

export function mapAreaRowsToBoroughScores(gapRows, areaRows) {
  const areaById = new Map(areaRows.map(area => [area.area_id, area]));
  const grouped = new Map();
  for (const row of gapRows) {
    const name = normalizeText(row.borough_name) || normalizeText(row.area_name);
    if (!name) continue;
    const profile = areaById.get(row.area_id);
    const current = grouped.get(name) || {
      sourceAreaIds: [],
      score: 0,
      income: 0,
      housing: 0,
      immigration: 0,
      count: 0,
    };
    current.sourceAreaIds.push(row.area_id);
    current.score += Number(row.gap_score) || 0;
    current.income += Number(profile?.income_indicator) || 0;
    current.housing += Number(profile?.housing_indicator) || 0;
    current.immigration += Number(profile?.immigration_indicator) || 0;
    current.count += 1;
    grouped.set(name, current);
  }

  const averages = [...grouped.entries()].map(([name, values]) => ({
    name,
    score: values.score / values.count,
    income: values.income / values.count,
    housing: values.housing / values.count,
    immigration: values.immigration / values.count,
    sourceAreaIds: values.sourceAreaIds,
  }));
  const maxScore = Math.max(...averages.map(row => row.score), 0);
  const maxIncome = Math.max(...averages.map(row => row.income), 0);
  const maxHousing = Math.max(...averages.map(row => row.housing), 0);
  const maxImmigration = Math.max(...averages.map(row => row.immigration), 0);

  return Object.fromEntries(averages.map(row => [
    row.name,
    {
      score: normalizeMetric(row.score, maxScore),
      income: normalizeMetric(row.income, maxIncome),
      housing: normalizeMetric(row.housing, maxHousing),
      immigration: normalizeMetric(row.immigration, maxImmigration),
      sourceAreaIds: row.sourceAreaIds,
    },
  ]));
}

export async function loadDashboardData({ demoServices, demoBoroughScores, referencePoint } = {}) {
  try {
    const appData = await loadAppData();
    const services = mapServiceRowsToDashboardServices(appData.services, referencePoint);
    const boroughScores = mapAreaRowsToBoroughScores(appData.gap, appData.areas);
    if (services.length === 0 || Object.keys(boroughScores).length === 0) {
      throw new Error("Dashboard adapter produced empty services or borough scores");
    }
    return {
      services,
      boroughScores,
      categories: DASHBOARD_CATEGORIES,
      sourceStatus: appData.source,
      warnings: [],
    };
  } catch (error) {
    console.warn("Dashboard data load failed; using demo dashboard constants.", error);
    return {
      services: demoServices,
      boroughScores: demoBoroughScores,
      categories: DASHBOARD_CATEGORIES,
      sourceStatus: "demo",
      warnings: [error instanceof Error ? error.message : "Unknown dashboard data load error"],
    };
  }
}
