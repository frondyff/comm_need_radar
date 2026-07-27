import { getSupabaseClient } from "./supabaseData.js";

// TODO: confirm this matches the table name your teammate creates in Supabase
export const FLYER_DOWNLOADS_TABLE = "flyer_downloads";
export const PAGE_EVENTS_TABLE = "page_events";

// Passive analytics — one row per interaction (page view, filter clicked,
// map opened, etc.), captures browse-only users who never click "Generate
// flyer". No personal or identifying data is recorded.
export async function logPageEvent({ eventType, detail, location }) {
  const client = getSupabaseClient();
  if (!client) return; // Supabase not configured — fail silently

  try {
    const { error } = await client.from(PAGE_EVENTS_TABLE).insert({
      event_type: eventType,
      detail: detail != null ? String(detail) : null,
      location: location || null,
    });
    if (error) console.warn("Failed to log page event to Supabase:", error.message);
  } catch (error) {
    console.warn("Failed to log page event to Supabase:", error);
  }
}

// Logs one row per flyer download — which filters a social worker had
// active (group/gender/age/category) and which service they picked. No
// personal or identifying data about the social worker or the client is
// recorded, only the interaction itself.
export async function logFlyerDownload({ service, filters = {}, location, language }) {
  const client = getSupabaseClient();
  if (!client) return; // Supabase not configured — fail silently, don't block the download

  try {
    const { error } = await client.from(FLYER_DOWNLOADS_TABLE).insert({
      group_filter: filters.group || [],
      gender_filter: filters.gender || null,
      age_filter: filters.age || [],
      category_filter: filters.category || [],
      service_id: service?.id != null ? String(service.id) : null,
      service_name: service?.name || null,
      service_category: service?.category || null,
      distribution_location: location?.name || null,
      flyer_language: language || null,
    });
    if (error) console.warn("Failed to log flyer download to Supabase:", error.message);
  } catch (error) {
    console.warn("Failed to log flyer download to Supabase:", error);
  }
}
