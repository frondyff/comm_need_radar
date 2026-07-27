import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_EVENT_VERSION,
  buildFlyerDownloadPayload,
  buildPageEventPayload,
  buildServiceImpressionPayloads,
  getAnalyticsSessionId,
  resetAnalyticsSessionForTests,
} from "./analytics.js";


test("analytics session is anonymous, stable, and scoped to session storage", () => {
  resetAnalyticsSessionForTests();
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const first = getAnalyticsSessionId(storage);
  const second = getAnalyticsSessionId(storage);

  assert.ok(first);
  assert.equal(first, second);
  assert.equal(values.size, 1);
});

test("page event payload carries versioned scoring context and bounded text", () => {
  resetAnalyticsSessionForTests();
  const payload = buildPageEventPayload({
    eventType: "service_card_opened",
    detail: "x".repeat(200),
    sessionId: "anonymous-session",
    selectedAreaId: "A001",
    service: { id: "svc-1", areaId: "A001", category: "Food" },
    sourceView: "community_list",
  });

  assert.equal(payload.event_version, ANALYTICS_EVENT_VERSION);
  assert.equal(payload.anonymous_session_id, "anonymous-session");
  assert.equal(payload.selected_area_id, "A001");
  assert.equal(payload.service_id, "svc-1");
  assert.equal(payload.service_area_id, "A001");
  assert.equal(payload.category, "Food");
  assert.equal(payload.detail.length, 120);
  assert.equal(payload.is_test, false);
});

test("flyer payload attributes demand to the selected service area", () => {
  resetAnalyticsSessionForTests();
  const payload = buildFlyerDownloadPayload({
    sessionId: "anonymous-session",
    service: {
      id: "svc-2",
      name: "Community Food Centre",
      areaId: "A002",
      category: "Food",
    },
    filters: { category: ["Food"], group: [], age: [] },
    location: { name: "Distribution point" },
    language: "EN",
    sourceView: "flyer_download",
  });

  assert.equal(payload.service_id, "svc-2");
  assert.equal(payload.selected_area_id, null);
  assert.equal(payload.service_area_id, "A002");
  assert.equal(payload.category, "Food");
  assert.equal(payload.source_view, "flyer_download");
});

test("service impressions are emitted once per session, service, and view", () => {
  resetAnalyticsSessionForTests();
  const service = { id: "svc-3", areaId: "A003", category: "Legal" };

  const first = buildServiceImpressionPayloads({
    services: [service, service],
    sourceView: "community_list",
    sessionId: "anonymous-session",
  });
  const duplicate = buildServiceImpressionPayloads({
    services: [service],
    sourceView: "community_list",
    sessionId: "anonymous-session",
  });
  const otherView = buildServiceImpressionPayloads({
    services: [service],
    sourceView: "community_map",
    sessionId: "anonymous-session",
  });

  assert.equal(first.length, 1);
  assert.equal(first[0].event_type, "service_impression");
  assert.equal(first[0].selected_area_id, "A003");
  assert.equal(duplicate.length, 0);
  assert.equal(otherView.length, 1);
});
