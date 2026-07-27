import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const profile = process.argv[2] ?? "critical";
const baseURL = new URL(process.env.BASE_URL || "https://comm-need-radar.vercel.app");
const legacyBaseURL = process.env.LEGACY_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const timeoutMs = Number(process.env.PROD_GRILL_REQUEST_TIMEOUT_MS ?? 15_000);
const reportPath = resolve(
  process.env.PROD_GRILL_REPORT || `test-results/production-${profile}.json`
);

if (!["critical", "security"].includes(profile)) {
  console.error(`Unknown production smoke profile: ${profile}`);
  process.exit(2);
}

const results = [];

function record(name, passed, detail, durationMs = null) {
  const result = { name, passed, detail, durationMs };
  results.push(result);
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(pathOrURL, options = {}) {
  const target = new URL(pathOrURL, baseURL);
  const headers = new Headers(options.headers);
  if (bypassSecret) {
    headers.set("x-vercel-protection-bypass", bypassSecret);
    headers.set("x-vercel-set-bypass-cookie", "true");
  }
  const startedAt = performance.now();
  const response = await fetch(target, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    ...options,
    headers,
  });
  return { response, durationMs: Math.round(performance.now() - startedAt) };
}

async function check(name, operation) {
  try {
    const detail = await operation();
    record(name, true, detail?.message ?? detail ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonResponse(path, options, expectedStatus) {
  const { response, durationMs } = await request(path, options);
  assert(
    response.status === expectedStatus,
    `expected HTTP ${expectedStatus}, received ${response.status}`
  );
  assert(
    response.headers.get("content-type")?.includes("application/json"),
    `expected JSON content-type, received ${response.headers.get("content-type")}`
  );
  return { body: await response.json(), response, durationMs };
}

async function criticalChecks() {
  await check("production root", async () => {
    const { response, durationMs } = await request("/");
    const body = await response.text();
    assert(response.status === 200, `expected HTTP 200, received ${response.status}`);
    assert(body.includes('id="root"'), "root mount element is missing");
    assert(durationMs <= 5_000, `response took ${durationMs}ms`);
    return `${response.url} in ${durationMs}ms`;
  });

  if (legacyBaseURL) {
    await check("legacy alias resolves to canonical production", async () => {
      const { response } = await request(legacyBaseURL);
      assert(response.status === 200, `expected HTTP 200, received ${response.status}`);
      assert(
        new URL(response.url).hostname === baseURL.hostname,
        `resolved to ${new URL(response.url).hostname}, expected ${baseURL.hostname}`
      );
      return response.url;
    });
  }

  await check("boundary GeoJSON contract", async () => {
    const { response, durationMs } = await request("/geo/areas.geojson");
    assert(response.status === 200, `expected HTTP 200, received ${response.status}`);
    const raw = await response.text();
    const collection = JSON.parse(raw);
    assert(collection.type === "FeatureCollection", `unexpected type ${collection.type}`);
    assert(collection.features?.length === 12, `expected 12 features, received ${collection.features?.length}`);
    assert(raw.length < 400_000, `payload is unexpectedly large: ${raw.length} bytes`);
    return `12 features, ${raw.length} bytes, ${durationMs}ms`;
  });

  await check("real census area indicator contract", async () => {
    const { body, durationMs } = await jsonResponse(
      "/api/area-vulnerability",
      { method: "GET" },
      200
    );
    assert(body.source === "statistics_canada_2021_census", `unexpected source ${body.source}`);
    assert(Array.isArray(body.areas) && body.areas.length === 12, "expected 12 area rows");
    const first = body.areas[0];
    for (const field of [
      "area_id",
      "low_income_pct",
      "low_income_pct_scaled",
      "shelter_cost_burden_pct",
      "shelter_cost_burden_pct_scaled",
      "recent_immigrant_pct",
      "recent_immigrant_pct_scaled",
    ]) {
      assert(first[field] !== null && first[field] !== undefined, `missing ${field}`);
    }
    assert(!("income_indicator" in first), "legacy synthetic income field leaked into response");
    return `12 census-derived areas in ${durationMs}ms`;
  });

  await check("chat rejects unsupported method", async () => {
    const { body, durationMs } = await jsonResponse("/api/chat", { method: "GET" }, 405);
    assert(body.error === "method_not_allowed", `unexpected error ${body.error}`);
    return `HTTP 405 in ${durationMs}ms`;
  });

  await check("events endpoint method and acceptance contract", async () => {
    const getResult = await jsonResponse("/api/events", { method: "GET" }, 405);
    assert(getResult.body.error === "method_not_allowed", "GET error contract changed");
    const postResult = await jsonResponse(
      "/api/events",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "production_grill" }),
      },
      202
    );
    assert(postResult.body.accepted === true, "POST acceptance contract changed");
    return "GET 405; POST 202";
  });

  await check("grounded chat production contract", async () => {
    const { body, durationMs } = await jsonResponse(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "What verified services are nearby?",
          selectedAreaId: "A001",
          serviceCategory: "All",
          radiusKm: 5,
          language: "en",
        }),
      },
      200
    );
    assert(typeof body.answer === "string" && body.answer.length > 20, "answer is missing");
    assert(Array.isArray(body.service_ids), "service_ids must be an array");
    assert(body.service_ids.length <= 3, `received ${body.service_ids.length} service IDs`);
    assert(body.service_ids.every(id => typeof id === "string"), "service IDs must be strings");
    assert(Array.isArray(body.limitations), "limitations must be an array");
    assert(typeof body.fallback_used === "boolean", "fallback_used must be boolean");
    assert(["deterministic", "llm"].includes(body.source), `unexpected source ${body.source}`);
    assert(durationMs <= 8_000, `response took ${durationMs}ms`);
    return `${body.source}, ${body.service_ids.length} services, ${durationMs}ms`;
  });
}

async function securityChecks() {
  await check("production security headers", async () => {
    const { response } = await request("/");
    const required = {
      "strict-transport-security": value => value?.includes("max-age="),
      "content-security-policy": value => value?.includes("frame-ancestors"),
      "x-content-type-options": value => value?.toLowerCase() === "nosniff",
      "referrer-policy": value => Boolean(value),
      "permissions-policy": value => Boolean(value),
    };
    const missing = Object.entries(required)
      .filter(([header, valid]) => !valid(response.headers.get(header)))
      .map(([header]) => header);
    assert(missing.length === 0, `missing or weak headers: ${missing.join(", ")}`);
    return "HSTS, CSP, nosniff, referrer and permissions policies present";
  });

  const invalidCases = [
    {
      name: "malformed JSON",
      body: "{",
      status: 400,
      error: "invalid_json",
    },
    {
      name: "missing required fields",
      body: JSON.stringify({}),
      status: 400,
      error: "invalid_request",
    },
    {
      name: "oversized prompt",
      body: JSON.stringify({ message: "x".repeat(901), selectedAreaId: "A001" }),
      status: 400,
      error: "invalid_request",
    },
    {
      name: "negative radius",
      body: JSON.stringify({ message: "test", selectedAreaId: "A001", radiusKm: -1 }),
      status: 400,
      error: "invalid_request",
    },
    {
      name: "radius above limit",
      body: JSON.stringify({ message: "test", selectedAreaId: "A001", radiusKm: 25.1 }),
      status: 400,
      error: "invalid_request",
    },
    {
      name: "unknown area",
      body: JSON.stringify({ message: "test", selectedAreaId: "A999", radiusKm: 5 }),
      status: 404,
      error: "area_not_found",
    },
  ];

  for (const invalidCase of invalidCases) {
    await check(`chat validation: ${invalidCase.name}`, async () => {
      const { body } = await jsonResponse(
        "/api/chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: invalidCase.body,
        },
        invalidCase.status
      );
      assert(body.error === invalidCase.error, `unexpected error ${body.error}`);
      const serialized = JSON.stringify(body);
      assert(!/stack|SUPABASE_|LLM_API_KEY/i.test(serialized), "response leaked internal details");
      return `HTTP ${invalidCase.status}`;
    });
  }

  await check("chat treats injection-like text as data", async () => {
    const marker = "<script>alert('production-grill')</script>";
    const { body } = await jsonResponse(
      "/api/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: marker,
          selectedAreaId: "A001",
          serviceCategory: "All",
          radiusKm: 1,
          language: "en",
        }),
      },
      200
    );
    assert(!body.answer.includes("<script>"), "answer reflected executable markup");
    return "markup was not reflected";
  });

  await check("production JavaScript source maps are not public", async () => {
    const { response } = await request("/");
    const html = await response.text();
    const asset = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    assert(asset, "unable to find production JavaScript asset");
    const mapResponse = await request(`${asset}.map`);
    assert(mapResponse.response.status === 404, `source map returned HTTP ${mapResponse.response.status}`);
    return "HTTP 404";
  });
}

await criticalChecks();
if (profile === "security") await securityChecks();

const report = {
  profile,
  baseURL: baseURL.toString(),
  generatedAt: new Date().toISOString(),
  passed: results.every(result => result.passed),
  totals: {
    checks: results.length,
    passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length,
  },
  results,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${reportPath}`);

if (!report.passed) process.exit(1);
