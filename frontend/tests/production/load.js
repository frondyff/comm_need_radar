import http from "k6/http";
import { check, sleep } from "k6";

const baseURL = (__ENV.BASE_URL || "https://comm-need-radar.vercel.app").replace(/\/$/, "");
const profile = __ENV.LOAD_PROFILE || "smoke";
const bypassSecret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers = bypassSecret
  ? { "x-vercel-protection-bypass": bypassSecret }
  : {};

const smokeScenarios = {
  browse: {
    executor: "constant-vus",
    exec: "browse",
    vus: 2,
    duration: "1m",
  },
  chat: {
    executor: "constant-arrival-rate",
    exec: "chat",
    rate: 6,
    timeUnit: "1m",
    duration: "1m",
    preAllocatedVUs: 1,
    maxVUs: 2,
  },
};

const nightlyScenarios = {
  browse: {
    executor: "ramping-vus",
    exec: "browse",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 10 },
      { duration: "5m", target: 10 },
      { duration: "1m", target: 0 },
    ],
  },
  chat: {
    executor: "constant-arrival-rate",
    exec: "chat",
    rate: 24,
    timeUnit: "1m",
    duration: "8m",
    preAllocatedVUs: 2,
    maxVUs: 2,
  },
};

export const options = {
  scenarios: profile === "nightly" ? nightlyScenarios : smokeScenarios,
  thresholds: {
    checks: [{ threshold: "rate>0.99", abortOnFail: true, delayAbortEval: "20s" }],
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "20s" }],
    "http_req_duration{endpoint:root}": ["p(95)<2000"],
    "http_req_duration{endpoint:geojson}": ["p(95)<2000"],
    "http_req_duration{endpoint:chat}": [
      { threshold: "p(95)<8000", abortOnFail: true, delayAbortEval: "30s" },
    ],
  },
};

export function browse() {
  const root = http.get(`${baseURL}/`, {
    headers,
    tags: { endpoint: "root" },
  });
  check(root, {
    "root returns HTML": response =>
      response.status === 200 && response.body.includes('id="root"'),
  });

  const boundaries = http.get(`${baseURL}/geo/areas.geojson`, {
    headers,
    tags: { endpoint: "geojson" },
  });
  check(boundaries, {
    "GeoJSON returns 12 features": response => {
      if (response.status !== 200) return false;
      try {
        return JSON.parse(response.body).features?.length === 12;
      } catch {
        return false;
      }
    },
  });
  sleep(2);
}

export function chat() {
  const response = http.post(
    `${baseURL}/api/chat`,
    JSON.stringify({
      message: "What verified services are nearby?",
      selectedAreaId: "A001",
      serviceCategory: "All",
      radiusKm: 5,
      language: "en",
    }),
    {
      headers: { ...headers, "content-type": "application/json" },
      tags: { endpoint: "chat" },
    }
  );
  check(response, {
    "chat returns grounded contract": result => {
      if (result.status !== 200) return false;
      try {
        const body = result.json();
        return (
          typeof body.answer === "string" &&
          Array.isArray(body.service_ids) &&
          body.service_ids.length <= 3 &&
          typeof body.fallback_used === "boolean"
        );
      } catch {
        return false;
      }
    },
  });
}
