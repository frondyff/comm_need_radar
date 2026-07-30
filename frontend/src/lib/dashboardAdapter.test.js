import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAreaRowsToAreas,
  mapServiceRowsToDashboardServices,
  serviceMatchesSearch,
} from "./dashboardAdapter.js";
import {
  validateCandidateScoringContract,
  validateRealAreaIndicators,
} from "./supabaseData.js";

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

test("area scoring retains real indicators and candidate formula lineage", () => {
  const [area] = mapAreaRowsToAreas(
    [{
      area_id: "A003",
      area_name: "Cote-des-Neiges",
      borough_name: "Cote-des-Neiges-Notre-Dame-de-Grace",
      gap_score: 26.29,
      structural_vulnerability_score: 62.87,
      vulnerability_score: 62.87,
      service_accessibility_score: 58.18,
      gap_rank: 1,
      priority_band: "high_candidate",
      priority_flag: "High-priority candidate (POC)",
      classification_formula_id: "CLASS-TOP5-02",
      classification_status: "poc_relative_candidate",
      priority_cutoff_rank: 5,
      comparison_set_size: 12,
      structural_formula_id: "STRUCT-01",
      accessibility_formula_id: "ACCESS-REAL-02",
      gap_formula_id: "GAP-CANON-02",
      formula_set_version: "scoring-contract-03",
      gap_drivers: "Low income; comparatively weaker access: Legal Aid",
    }],
    [{
      area_id: "A003",
      latitude: 45.5,
      longitude: -73.63,
      score_basis: "statcan-2021-equal5-borough",
      source_year: 2021,
      source_geography_level: "borough",
      source_geography_name: "Cote-des-Neiges-Notre-Dame-de-Grace",
    }],
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

  assert.equal(area.gapScore, 0.2629);
  assert.equal(area.vulnerability, 0.6287);
  assert.equal(area.accessibility, 0.5818);
  assert.equal(area.priorityBand, "high_candidate");
  assert.equal(area.priorityFlag, "High-priority candidate (POC)");
  assert.equal(area.classificationFormulaId, "CLASS-TOP5-02");
  assert.equal(area.classificationStatus, "poc_relative_candidate");
  assert.equal(area.priorityCutoffRank, 5);
  assert.equal(area.comparisonSetSize, 12);
  assert.equal(area.structuralFormulaId, "STRUCT-01");
  assert.equal(area.accessibilityFormulaId, "ACCESS-REAL-02");
  assert.equal(area.gapFormulaId, "GAP-CANON-02");
  assert.deepEqual(area.drivers, [
    "Low income",
    "comparatively weaker access: Legal Aid",
  ]);
  assert.equal(area.incomePct, 20.89);
  assert.equal(area.housingPct, 27.62);
  assert.equal(area.immigrationPct, 9.33);
  assert.equal(area.sourceYear, 2021);
  assert.equal(area.sourceGeographyLevel, "borough");
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
    vulnerability_index: 50,
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

test("candidate scoring contract accepts a complete reconciled snapshot", () => {
  const areas = Array.from({ length: 12 }, (_, index) => ({
    area_id: `A${String(index + 1).padStart(3, "0")}`,
    structural_vulnerability_score: 60,
    vulnerability_score: 60,
    structural_vulnerability_rank: index + 1,
    vulnerability_rank: index + 1,
    structural_formula_id: "STRUCT-01",
  }));
  const gap = areas.map((area, index) => ({
    area_id: area.area_id,
    structural_vulnerability_score: 60,
    vulnerability_score: 60,
    service_accessibility_score: 50,
    overall_accessibility_score: 50,
    gap_score: 30,
    gap_rank: index + 1,
    priority_band: index < 5 ? "high_candidate" : "",
    priority_flag: index < 5 ? "High-priority candidate (POC)" : "",
    classification_formula_id: "CLASS-TOP5-02",
    classification_status: "poc_relative_candidate",
    priority_cutoff_rank: 5,
    comparison_set_size: 12,
    structural_formula_id: "STRUCT-01",
    accessibility_formula_id: "ACCESS-REAL-02",
    gap_formula_id: "GAP-CANON-02",
    formula_set_version: "scoring-contract-03",
  }));
  const accessibility = areas.flatMap(area =>
    Array.from({ length: 9 }, (_, categoryIndex) => ({
      area_id: area.area_id,
      service_category: `Category ${categoryIndex + 1}`,
      distance_component: 40,
      availability_component: 60,
      accessibility_score: 50,
      accessibility_formula_id: "ACCESS-REAL-02",
      formula_set_version: "scoring-contract-03",
      taxonomy_version: "planning-needs-9-v1",
      service_snapshot_total_rows: 3664,
      service_snapshot_mappable_rows: 3200,
    }))
  );

  assert.doesNotThrow(() =>
    validateCandidateScoringContract({ areas, gap, accessibility })
  );
});

test("candidate scoring contract rejects a mixed legacy snapshot", () => {
  assert.throws(
    () => validateCandidateScoringContract({
      areas: Array(12).fill({
        structural_formula_id: "",
        vulnerability_score: 74.6,
      }),
      gap: Array(12).fill({
        gap_formula_id: "GAP-PROD-01",
      }),
      accessibility: Array(108).fill({
        accessibility_formula_id: "ACCESS-LEGACY-01",
      }),
    }),
    /scoring-contract-03|complete candidate matrix/
  );
});
