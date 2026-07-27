import { getSupabaseClient } from "./supabaseData.js";

export const FLYER_DOWNLOADS_TABLE = "flyer_downloads";
export const PAGE_EVENTS_TABLE = "page_events";
export const ANALYTICS_EVENT_VERSION = 2;

const SESSION_STORAGE_KEY = "comm-need-radar:analytics-session:v2";
const impressionKeys = new Set();
let cachedSessionId = null;

function randomSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function getAnalyticsSessionId(storage = globalThis.sessionStorage) {
  if (cachedSessionId) return cachedSessionId;
  try {
    cachedSessionId = storage?.getItem(SESSION_STORAGE_KEY) || randomSessionId();
    storage?.setItem(SESSION_STORAGE_KEY, cachedSessionId);
  } catch {
    cachedSessionId = randomSessionId();
  }
  return cachedSessionId;
}

export function resetAnalyticsSessionForTests() {
  cachedSessionId = null;
  impressionKeys.clear();
}

function limitedText(value, maxLength = 120) {
  if (value == null || value === "") return null;
  return String(value).slice(0, maxLength);
}

function contextFields({
  sessionId,
  selectedAreaId,
  service,
  category,
  sourceView,
  isTest = false,
} = {}) {
  return {
    event_version: ANALYTICS_EVENT_VERSION,
    anonymous_session_id: limitedText(sessionId || getAnalyticsSessionId(), 128),
    selected_area_id: limitedText(selectedAreaId, 32),
    service_id: limitedText(service?.id, 128),
    service_area_id: limitedText(service?.areaId, 32),
    category: limitedText(category || service?.category, 120),
    source_view: limitedText(sourceView, 64),
    is_test: Boolean(isTest),
  };
}

export function buildPageEventPayload({
  eventType,
  detail,
  location,
  ...context
}) {
  return {
    event_type: limitedText(eventType, 64),
    detail: limitedText(detail),
    location: limitedText(location),
    ...contextFields(context),
  };
}

export function buildFlyerDownloadPayload({
  service,
  filters = {},
  location,
  language,
  ...context
}) {
  return {
    group_filter: filters.group || [],
    gender_filter: limitedText(filters.gender, 64),
    age_filter: filters.age || [],
    category_filter: filters.category || [],
    service_id: limitedText(service?.id, 128),
    service_name: limitedText(service?.name, 240),
    service_category: limitedText(service?.category, 120),
    distribution_location: limitedText(location?.name, 240),
    flyer_language: limitedText(language, 16),
    ...contextFields({
      ...context,
      service,
      category: context.category || service?.category,
    }),
  };
}

function isMissingAnalyticsColumn(error) {
  return error?.code === "PGRST204"
    || /column.+schema cache|could not find.+column/i.test(error?.message || "");
}

async function insertWithLegacyFallback(client, table, payload, legacyPayload) {
  const { error } = await client.from(table).insert(payload);
  if (!error) return null;
  if (!isMissingAnalyticsColumn(error)) return error;
  const { error: legacyError } = await client.from(table).insert(legacyPayload);
  return legacyError;
}

// Passive analytics — one row per interaction (page view, filter clicked,
// map opened, etc.), captures browse-only users who never click "Generate
// flyer". No personal or identifying data is recorded.
export async function logPageEvent(options) {
  const client = getSupabaseClient();
  if (!client) return; // Supabase not configured — fail silently

  const payload = buildPageEventPayload(options);
  const legacyPayload = {
    event_type: payload.event_type,
    detail: payload.detail,
    location: payload.location,
  };
  try {
    const error = await insertWithLegacyFallback(
      client,
      PAGE_EVENTS_TABLE,
      payload,
      legacyPayload
    );
    if (error) console.warn("Failed to log page event to Supabase:", error.message);
  } catch (error) {
    console.warn("Failed to log page event to Supabase:", error);
  }
}

// Logs one row per flyer download — which filters a social worker had
// active (group/gender/age/category) and which service they picked. No
// personal or identifying data about the social worker or the client is
// recorded, only the interaction itself.
export async function logFlyerDownload(options) {
  const client = getSupabaseClient();
  if (!client) return; // Supabase not configured — fail silently, don't block the download

  const payload = buildFlyerDownloadPayload(options);
  const legacyPayload = {
    group_filter: payload.group_filter,
    gender_filter: payload.gender_filter,
    age_filter: payload.age_filter,
    category_filter: payload.category_filter,
    service_id: payload.service_id,
    service_name: payload.service_name,
    service_category: payload.service_category,
    distribution_location: payload.distribution_location,
    flyer_language: payload.flyer_language,
  };
  try {
    const error = await insertWithLegacyFallback(
      client,
      FLYER_DOWNLOADS_TABLE,
      payload,
      legacyPayload
    );
    if (error) console.warn("Failed to log flyer download to Supabase:", error.message);
  } catch (error) {
    console.warn("Failed to log flyer download to Supabase:", error);
  }
}

// Record which services were actually visible so click/download rates can be
// normalized for exposure. Each service is emitted at most once per browser
// session and source view; the processing pipeline applies a second server-side
// deduplication guard.
export function buildServiceImpressionPayloads({
  services = [],
  sourceView = "community_list",
  sessionId = getAnalyticsSessionId(),
}) {
  const rows = [];
  for (const service of services.slice(0, 50)) {
    const key = `${sessionId}:${sourceView}:${service?.id ?? ""}`;
    if (!service?.id || impressionKeys.has(key)) continue;
    impressionKeys.add(key);
    rows.push(buildPageEventPayload({
      eventType: "service_impression",
      detail: "service_visible",
      sessionId,
      service,
      category: service.category,
      selectedAreaId: service.areaId,
      sourceView,
    }));
  }
  return rows;
}

export async function logServiceImpressions(options) {
  const client = getSupabaseClient();
  if (!client) return;
  const rows = buildServiceImpressionPayloads(options);
  if (rows.length === 0) return;
  try {
    const { error } = await client.from(PAGE_EVENTS_TABLE).insert(rows);
    // Impressions have no useful legacy representation because the old schema
    // lacks area/session context, so omit them until the migration is applied.
    if (error && !isMissingAnalyticsColumn(error)) {
      console.warn("Failed to log service impressions to Supabase:", error.message);
    }
  } catch (error) {
    console.warn("Failed to log service impressions to Supabase:", error);
  }
}
