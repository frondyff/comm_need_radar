import { loadAppData, haversineKm } from "./supabaseData.js";

export const DASHBOARD_CATEGORIES = [
  { label: "Shelter", color: "#DC2626", bg: "#FEF2F2" },
  { label: "Food", color: "#D97706", bg: "#FFFBEB" },
  { label: "Medical", color: "#2563EB", bg: "#EFF6FF" },
  { label: "Legal", color: "#047857", bg: "#ECFDF5" },
  { label: "Translation", color: "#9333EA", bg: "#F5F3FF" },
  { label: "Other", color: "#475569", bg: "#F8FAFC" },
];

const DEFAULT_REFERENCE_POINT = { lat: 45.5088, lng: -73.5878 };

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function serviceMatchesSearch(service, searchTerm) {
  const query = normalizeSearchText(searchTerm);
  if (!query) return true;
  return [
    service?.name,
    service?.type,
    service?.address,
    ...(service?.tags ?? []),
    ...(service?.categoryTags ?? []),
  ].some(value => normalizeSearchText(value).includes(query));
}

// Some source rows come in ALL CAPS ("(VILLE-MARIE EST), ÎLE ...") or
// wrapped in stray parentheses ("(PRAIDA)"). Names that are already
// mixed-case are left completely untouched.
function cleanServiceName(raw) {
  const name = normalizeText(raw);
  if (!name) return name;
  let cleaned = /^\(.*\)$/.test(name) ? name.slice(1, -1).trim() : name;
  const hasLower = /[a-zà-ÿ]/.test(cleaned);
  const hasUpper = /[A-ZÀ-Ÿ]/.test(cleaned);
  if (hasUpper && !hasLower) {
    cleaned = cleaned.toLowerCase().replace(/(^|[\s\-'’"(])([a-zà-ÿ])/g, (m, pre, ch) => pre + ch.toUpperCase());
  }
  return cleaned;
}

function splitList(value) {
  return normalizeText(value)
    .split(/[;,/]/)
    .map(item => item.trim())
    .filter(Boolean);
}

// The DB stores ranges like "25-44" with a plain hyphen, but the UI's
// AGE_RANGES chips use an en-dash ("25–44") — normalize so they match.
function normalizeAgeGroup(raw) {
  return raw.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}

function dashboardCategory(primaryCategory, serviceCategories) {
  const category = `${normalizeText(primaryCategory)} ${normalizeText(serviceCategories)}`.toLowerCase();
  if (/(shelter|housing|home|emergency)/.test(category)) return "Shelter";
  if (/(food|meal|nutrition)/.test(category)) return "Food";
  if (/(medical|health|mental|clinic)/.test(category)) return "Medical";
  if (/(legal|legal aid|rights)/.test(category)) return "Legal";
  if (/(translat|language|interpret|newcomer|immigra)/.test(category)) return "Translation";
  return "Other";
}

// services_master stores these as real booleans, but by the time a row
// comes back through normalizeRow() everything not in NUMERIC_FIELDS is a
// string — so accept "true"/"TRUE"/"t"/"1" as well as an actual boolean.
function isTrue(value) {
  if (value === true) return true;
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" || v === "t" || v === "1" || v === "yes";
}

function dashboardGroups(service) {
  const groups = [];
  if (isTrue(service.serves_indigenous)) groups.push("Indigenous");
  if (isTrue(service.serves_immigrant)) groups.push("Immigrant");
  return groups;
}

function normalizeGender(raw) {
  const g = normalizeText(raw).toLowerCase();
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  if (!g || g === "all" || g === "any") return "All";
  return normalizeText(raw); // unrecognized value — pass through as-is
}

// "services" is messy free text — either "* item.* item.* item." bullet
// style, or a plain comma/semicolon separated list.
function parseBulletList(raw, maxItems = 6, maxLen = 60) {
  const text = normalizeText(raw);
  if (!text) return [];
  const parts = text.includes("*")
    ? text.split("*").map(t => t.trim().replace(/\.$/, "").trim())
    : text.split(/[,;]/).map(t => t.trim());
  return parts
    .filter(Boolean)
    .slice(0, maxItems)
    .map(t => (t.length > maxLen ? t.slice(0, maxLen - 1) + "…" : t));
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
      const category = dashboardCategory(service.primary_category, service.service_categories);
      const groups = dashboardGroups(service);
      const ageGroups = splitList(service.age_groups).map(normalizeAgeGroup);
      const hours = normalizeText(service.hours) || "Hours not listed";
      return {
        id: String(service.service_id),
        name: cleanServiceName(service.name) || "Unnamed service",
        type: normalizeText(service.primary_category) || category,
        dist: `${distance.toFixed(1)} km`,
        distanceKm: Number(distance.toFixed(2)),
        hours,
        address: normalizeText(service.address) || "Address not listed",
        phone: normalizeText(service.phone) || "Phone not listed",
        website: normalizeText(service.website),
        email: normalizeText(service.email),
        tags: parseBulletList(service.services, 8, 400),
        categoryTags: splitList(service.service_categories),
        langs: [], // not available in services_master yet
        group: groups,
        ageGroups,
        category,
        gender: normalizeGender(service.gender_focus),
        borough: normalizeText(service.borough_name),
        areaId: normalizeText(service.area_id),
        lat,
        lng,
        sourceId: String(service.service_id),
        sourceTable: "services_master",
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

export function mapAreaRowsToBoroughScores(gapRows, _areaRows, vulnerabilityRows = []) {
  const vulnerabilityById = new Map(vulnerabilityRows.map(area => [area.area_id, area]));
  const grouped = new Map();
  for (const row of gapRows) {
    const name = normalizeText(row.borough_name) || normalizeText(row.area_name);
    if (!name) continue;
    const vulnerability = vulnerabilityById.get(row.area_id);
    const current = grouped.get(name) || {
      sourceAreaIds: [],
      score: 0,
      income: 0,
      housing: 0,
      immigration: 0,
      incomePct: 0,
      housingPct: 0,
      immigrationPct: 0,
      count: 0,
    };
    current.sourceAreaIds.push(row.area_id);
    current.score += Number(row.gap_score) || 0;
    current.income += Number(vulnerability?.low_income_pct_scaled) || 0;
    current.housing += Number(vulnerability?.shelter_cost_burden_pct_scaled) || 0;
    current.immigration += Number(vulnerability?.recent_immigrant_pct_scaled) || 0;
    current.incomePct += Number(vulnerability?.low_income_pct) || 0;
    current.housingPct += Number(vulnerability?.shelter_cost_burden_pct) || 0;
    current.immigrationPct += Number(vulnerability?.recent_immigrant_pct) || 0;
    current.count += 1;
    grouped.set(name, current);
  }

  const averages = [...grouped.entries()].map(([name, values]) => ({
    name,
    score: values.score / values.count,
    income: values.income / values.count,
    housing: values.housing / values.count,
    immigration: values.immigration / values.count,
    incomePct: values.incomePct / values.count,
    housingPct: values.housingPct / values.count,
    immigrationPct: values.immigrationPct / values.count,
    sourceAreaIds: values.sourceAreaIds,
  }));

  // Bar widths use the census indicators' 0-100 min-max scaled fields. Raw
  // census percentages are retained separately for the visible labels.
  return Object.fromEntries(averages.map(row => [
    row.name,
    {
      score: normalizeMetric(row.score, 100),
      income: normalizeMetric(row.income, 100),
      housing: normalizeMetric(row.housing, 100),
      immigration: normalizeMetric(row.immigration, 100),
      incomePct: Number(row.incomePct.toFixed(2)),
      housingPct: Number(row.housingPct.toFixed(2)),
      immigrationPct: Number(row.immigrationPct.toFixed(2)),
      sourceAreaIds: row.sourceAreaIds,
    },
  ]));
}

// gap_drivers is messy free text ("* item.* item." bullets, or a plain
// comma/semicolon list) with occasional stray numeric fragments like
// "access score 10.59" mixed in — those get filtered out.
function parseDrivers(raw, maxItems = 6, maxLen = 50) {
  return parseBulletList(raw, 20, maxLen)
    .filter(t => !/\bscore\b.*\d/i.test(t))
    .slice(0, maxItems);
}

// One row per AREA (not aggregated to borough) — carries the auditable
// gap_score fields (rank, formula IDs, bilingual narrative summary, key
// drivers) plus the area_profile indicators. Used for the Area Profile
// drill-down and an area-level relative-gap ranking, since
// text fields like summary/drivers can't be meaningfully averaged the way
// mapAreaRowsToBoroughScores averages the numeric score for the choropleth.
export function mapAreaRowsToAreas(
  gapRows,
  areaRows,
  _accessibilityRows = [],
  vulnerabilityRows = []
) {
  const profileById = new Map(areaRows.map(area => [area.area_id, area]));
  const vulnerabilityById = new Map(vulnerabilityRows.map(row => [row.area_id, row]));
  return gapRows
    .map(row => {
      const profile = profileById.get(row.area_id);
      const vulnerability = vulnerabilityById.get(row.area_id);
      const lat = row.latitude != null ? Number(row.latitude) : (profile?.latitude != null ? Number(profile.latitude) : null);
      const lng = row.longitude != null ? Number(row.longitude) : (profile?.longitude != null ? Number(profile.longitude) : null);
      return {
        id: row.area_id,
        name: normalizeText(row.area_name) || row.area_id,
        borough: normalizeText(row.borough_name) || normalizeText(row.area_name),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        gapScore: normalizeMetric(row.gap_score, 100),
        vulnerability: normalizeMetric(
          row.structural_vulnerability_score ?? row.vulnerability_score,
          100
        ),
        // The accessibility table has nine category rows per area. The gap
        // row carries their authoritative equal-weight area average.
        accessibility: normalizeMetric(
          row.service_accessibility_score ?? row.overall_accessibility_score,
          100
        ),
        rank: row.gap_rank != null ? Number(row.gap_rank) : null,
        priorityFlag: normalizeText(row.priority_flag),
        classificationStatus: normalizeText(row.classification_status),
        structuralFormulaId: normalizeText(row.structural_formula_id),
        accessibilityFormulaId: normalizeText(row.accessibility_formula_id),
        gapFormulaId: normalizeText(row.gap_formula_id),
        formulaSetVersion: normalizeText(row.formula_set_version),
        scoreBasis: normalizeText(profile?.score_basis),
        sourceYear: profile?.source_year != null ? Number(profile.source_year) : null,
        sourceGeographyLevel: normalizeText(profile?.source_geography_level),
        sourceGeographyName: normalizeText(profile?.source_geography_name),
        drivers: parseDrivers(row.gap_drivers),
        summaryEn: normalizeText(row.summary_en),
        summaryFr: normalizeText(row.summary_fr),
        income: vulnerability?.low_income_pct_scaled != null
          ? normalizeMetric(vulnerability.low_income_pct_scaled, 100) : null,
        housing: vulnerability?.shelter_cost_burden_pct_scaled != null
          ? normalizeMetric(vulnerability.shelter_cost_burden_pct_scaled, 100) : null,
        immigration: vulnerability?.recent_immigrant_pct_scaled != null
          ? normalizeMetric(vulnerability.recent_immigrant_pct_scaled, 100) : null,
        incomePct: vulnerability?.low_income_pct != null ? Number(vulnerability.low_income_pct) : null,
        housingPct: vulnerability?.shelter_cost_burden_pct != null
          ? Number(vulnerability.shelter_cost_burden_pct) : null,
        immigrationPct: vulnerability?.recent_immigrant_pct != null
          ? Number(vulnerability.recent_immigrant_pct) : null,
      };
    })
    .sort((a, b) => (b.gapScore || 0) - (a.gapScore || 0));
}

export async function loadDashboardData({ demoServices, demoBoroughScores, demoAreas = [], referencePoint } = {}) {
  try {
    const appData = await loadAppData();
    const services = mapServiceRowsToDashboardServices(appData.services, referencePoint);
    const boroughScores = mapAreaRowsToBoroughScores(
      appData.gap,
      appData.areas,
      appData.vulnerability
    );
    const areas = mapAreaRowsToAreas(
      appData.gap,
      appData.areas,
      appData.accessibility,
      appData.vulnerability
    );
    if (services.length === 0 || Object.keys(boroughScores).length === 0) {
      throw new Error("Dashboard adapter produced empty services or borough scores");
    }
    return {
      services,
      boroughScores,
      areas,
      categories: DASHBOARD_CATEGORIES,
      sourceStatus: appData.source,
      warnings: [],
    };
  } catch (error) {
    console.warn("Dashboard data load failed; using demo dashboard constants.", error);
    return {
      services: demoServices,
      boroughScores: demoBoroughScores,
      areas: demoAreas,
      categories: DASHBOARD_CATEGORIES,
      sourceStatus: "demo",
      warnings: [error instanceof Error ? error.message : "Unknown dashboard data load error"],
    };
  }
}
