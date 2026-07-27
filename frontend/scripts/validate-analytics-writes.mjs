import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const fileEnv = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const supabaseUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  fileEnv.VITE_SUPABASE_URL ??
  fileEnv.SUPABASE_URL;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ??
  fileEnv.VITE_SUPABASE_ANON_KEY ??
  fileEnv.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !publishableKey || !secretKey) {
  console.error(
    "Set the Supabase URL and publishable key, plus the server-only SUPABASE_SECRET_KEY."
  );
  process.exit(1);
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const publicClient = createClient(supabaseUrl, publishableKey, clientOptions);
const adminClient = createClient(supabaseUrl, secretKey, clientOptions);
const marker = `production-grill:${process.env.GITHUB_RUN_ID ?? "local"}:${randomUUID()}`;

let failure;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSubset(actual, expected, label) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[key];
    const matches = Array.isArray(expectedValue)
      ? JSON.stringify(actualValue) === JSON.stringify(expectedValue)
      : actualValue === expectedValue;
    assert(
      matches,
      `${label}.${key} expected ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`
    );
  }
}

async function insertPublicRow(table, payload) {
  const { error } = await publicClient.from(table).insert(payload);
  if (error) throw new Error(`${table} public insert failed: ${error.message}`);
  console.log(`PASS ${table} accepted a public frontend-equivalent insert`);
}

async function loadProbeRow(table, markerColumn, columns) {
  const { data, error } = await adminClient
    .from(table)
    .select(columns.join(","))
    .eq(markerColumn, marker);
  if (error) throw new Error(`${table} privileged verification failed: ${error.message}`);
  assert(data?.length === 1, `${table} expected one committed probe row, received ${data?.length ?? 0}`);
  return data[0];
}

async function preflightTable(table, columns) {
  const { error } = await adminClient
    .from(table)
    .select(columns.join(","))
    .limit(0);
  if (error) {
    throw new Error(`${table} privileged schema preflight failed: ${error.message}`);
  }
  console.log(`PASS ${table} exists with the expected analytics columns`);
}

async function cleanupProbe(table, markerColumn) {
  const { error: deleteError } = await adminClient
    .from(table)
    .delete()
    .eq(markerColumn, marker);
  if (deleteError) throw new Error(`${table} probe cleanup failed: ${deleteError.message}`);

  const { data, error: verifyError } = await adminClient
    .from(table)
    .select(markerColumn)
    .eq(markerColumn, marker);
  if (verifyError) {
    throw new Error(`${table} cleanup verification failed: ${verifyError.message}`);
  }
  assert(data?.length === 0, `${table} cleanup left ${data?.length ?? 0} probe row(s)`);
  console.log(`PASS ${table} has no retained synthetic rows`);
}

const pageEvent = {
  event_type: "production_grill_write_probe",
  detail: marker,
  location: "automated-test",
};

const { data: service, error: serviceError } = await publicClient
  .from("services_master")
  .select("service_id,name,primary_category")
  .not("service_id", "is", null)
  .limit(1)
  .single();

if (serviceError || !service) {
  console.error(
    `Unable to load a valid service for the flyer probe: ${serviceError?.message ?? "no row returned"}`
  );
  process.exit(1);
}

const flyerDownload = {
  group_filter: ["production-grill"],
  gender_filter: "All",
  age_filter: ["25–44"],
  category_filter: [service.primary_category || "Other"],
  service_id: String(service.service_id),
  service_name: service.name,
  service_category: service.primary_category || "Other",
  distribution_location: marker,
  flyer_language: "en",
};

try {
  await preflightTable("page_events", Object.keys(pageEvent));
  await preflightTable("flyer_downloads", Object.keys(flyerDownload));

  await insertPublicRow("page_events", pageEvent);
  const storedPageEvent = await loadProbeRow(
    "page_events",
    "detail",
    Object.keys(pageEvent)
  );
  assertSubset(storedPageEvent, pageEvent, "page_events");
  console.log("PASS page_events committed the expected values");

  await insertPublicRow("flyer_downloads", flyerDownload);
  const storedFlyerDownload = await loadProbeRow(
    "flyer_downloads",
    "distribution_location",
    Object.keys(flyerDownload)
  );
  assertSubset(storedFlyerDownload, flyerDownload, "flyer_downloads");
  console.log("PASS flyer_downloads committed the expected values");
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const [table, markerColumn] of [
    ["page_events", "detail"],
    ["flyer_downloads", "distribution_location"],
  ]) {
    try {
      await cleanupProbe(table, markerColumn);
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (cleanupErrors.length > 0) {
    failure = new Error(
      [failure instanceof Error ? failure.message : failure, ...cleanupErrors]
        .filter(Boolean)
        .join("; ")
    );
  }
}

if (failure) {
  console.error(failure instanceof Error ? failure.message : String(failure));
  process.exit(1);
}

console.log("Supabase analytics write contract passed with zero probe rows retained.");
