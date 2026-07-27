import assert from "node:assert/strict";
import test from "node:test";

import { parseModelJson, validateModelAnswer } from "./chatContract.js";

const allowed = new Set(["S1", "S2"]);

test("parses plain and fenced model JSON", () => {
  assert.deepEqual(parseModelJson('{"answer":"ok"}'), { answer: "ok" });
  assert.deepEqual(
    parseModelJson('```json\n{"answer":"ok"}\n```'),
    { answer: "ok" }
  );
  assert.throws(() => parseModelJson("{"), SyntaxError);
});

test("accepts only evidenced verified service fields", () => {
  const result = validateModelAnswer({
    answer: "S1 is nearby.",
    service_ids: ["S1"],
    evidence: [{
      service_id: "S1",
      fields_used: ["service_name", "distance_km"],
    }],
    verification_questions: ["Confirm hours."],
    limitations: ["Availability may change."],
  }, allowed);

  assert.deepEqual(result.serviceIds, ["S1"]);
  assert.equal(result.evidence.length, 1);
});

test("rejects unknown services and unsupported facts", () => {
  assert.throws(
    () => validateModelAnswer({
      answer: "Unknown service.",
      service_ids: ["S999"],
      evidence: [{
        service_id: "S999",
        fields_used: ["service_name"],
      }],
    }, allowed),
    /unknown service/
  );

  assert.throws(
    () => validateModelAnswer({
      answer: "S1 has guaranteed eligibility.",
      service_ids: ["S1"],
      evidence: [{
        service_id: "S1",
        fields_used: ["guaranteed_eligibility"],
      }],
    }, allowed),
    /unsupported field/
  );
});

test("rejects service claims without matching evidence", () => {
  assert.throws(
    () => validateModelAnswer({
      answer: "S1 is nearby.",
      service_ids: ["S1"],
      evidence: [],
    }, allowed),
    /no evidence/
  );
});
