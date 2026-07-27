import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAreaRowsToAreas,
  mapServiceRowsToDashboardServices,
  serviceMatchesSearch,
} from "./dashboardAdapter.js";
import { validateRealAreaIndicators } from "./supabaseData.js";

test("service rows parse names, categories, ages, groups, and tags", () => {
  const [service] = mapServiceRowsToDashboardServices([{
    service_id: "S1",
    name: "(CENTRE D'AIDE)",
    primary_category: "Community",
    service_categories: "Food; Newcomer",
    services: "* Meals. * Settlement support.",
    age_groups: "25-44; 45-64",
    serves_immigrant: true,
    gender_focus: "all",
    latitude: 45.5,
    longitude: -73.6,
  }]);

  assert.equal(service.name, "Centre D'Aide");
  assert.equal(service.category, "Food");
  assert.deepEqual(service.ageGroups, ["25–44", "45–64"]);
  assert.deepEqual(service.group, ["Immigrant"]);
  assert.deepEqual(service.tags, ["Meals", "Settlement support"]);
});

test("search resolves case, accents, service type, address, and tags", () => {
  const service = {
    name: "CLSC de Côte-des-Neiges",
    type: "Medical clinic",
    address: "Chemin de la Côte-des-Neiges",
    tags: ["Settlement support"],
    categoryTags: ["Health"],
  };

  assert.equal(serviceMatchesSearch(service, "cote des neiges"), true);
  assert.equal(serviceMatchesSearch(service, "MEDICAL"), true);
  assert.equal(serviceMatchesSearch(service, "settlement"), true);
  assert.equal(serviceMatchesSearch(service, "unrelated"), false);
});

test("area scoring retains real indicator labels and priority metadata", () => {
  const [area] = mapAreaRowsToAreas(
    [{
      area_id: "A003",
      area_name: "Cote-des-Neiges",
      borough_name: "Cote-des-Neiges-Notre-Dame-de-Grace",
      gap_score: 56.99,
      vulnerability_score: 64.39,
      gap_rank: 1,
      priority_flag: "High priority",
      gap_drivers: "Low income; access score 11.49",
    }],
    [{ area_id: "A003", latitude: 45.5, longitude: -73.63 }],
    [],
    [{
      area_id: "A003",
      low_income_pct: 20.89,
      low_income_pct_scaled: 97.01,
      shelter_cost_burden_pct: 27.62,
      shelter_cost_burden_pct_scaled: 75.7,
      recent_immigrant_pct: 9.33,
      recent_immigrant_pct_scaled: 100,
    }]
  );

  assert.equal(area.gapScore, 0.57);
  assert.equal(area.priorityFlag, "High priority");
  assert.deepEqual(area.drivers, ["Low income"]);
  assert.equal(area.incomePct, 20.89);
  assert.equal(area.housingPct, 27.62);
  assert.equal(area.immigrationPct, 9.33);
});

test("real indicator contract rejects duplicate and non-numeric rows", () => {
  const validRow = index => ({
    area_id: `A${String(index + 1).padStart(3, "0")}`,
    low_income_pct: 10,
    low_income_pct_scaled: 20,
    shelter_cost_burden_pct: 30,
    shelter_cost_burden_pct_scaled: 40,
    recent_immigrant_pct: 5,
    recent_immigrant_pct_scaled: 60,
  });
  const valid = { areas: Array.from({ length: 12 }, (_, index) => validRow(index)) };
  assert.equal(validateRealAreaIndicators(valid).length, 12);

  const duplicate = structuredClone(valid);
  duplicate.areas[11].area_id = "A001";
  assert.throws(
    () => validateRealAreaIndicators(duplicate),
    /violated the frontend data contract/
  );

  const nonNumeric = structuredClone(valid);
  nonNumeric.areas[0].low_income_pct = "not-a-number";
  assert.throws(
    () => validateRealAreaIndicators(nonNumeric),
    /violated the frontend data contract/
  );
});
