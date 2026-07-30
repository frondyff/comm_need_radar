import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const analyticsWriteLog = new WeakMap();
const analyticsRoute = /\/rest\/v1\/(page_events|flyer_downloads)(?:\?|$)/;
const useLocalIndicatorFixture = process.env.AREA_VULNERABILITY_FIXTURE === "true";
const useLocalScoringFixture = process.env.SCORING_CONTRACT_FIXTURE === "true";
const expectedDataSource = process.env.ALLOW_DEMO_DATA === "true"
  ? /^(Supabase|Demo data)$/
  : "Supabase";

async function realIndicatorFixture() {
  const csv = await readFile(
    new URL("../../../data/processed/area_vulnerability_index_real.csv", import.meta.url),
    "utf8"
  );
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  const fieldIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const numericFields = [
    "low_income_pct",
    "low_income_pct_scaled",
    "shelter_cost_burden_pct",
    "shelter_cost_burden_pct_scaled",
    "recent_immigrant_pct",
    "recent_immigrant_pct_scaled",
    "vulnerability_index",
  ];
  return {
    source: "statistics_canada_2021_census_test_fixture",
    areas: lines.map(line => {
      const values = line.split(",");
      return {
        area_id: values[fieldIndex.area_id],
        ...Object.fromEntries(
          numericFields.map(field => [field, Number(values[fieldIndex[field]])])
        ),
      };
    }),
  };
}

async function csvRows(relativePath) {
  const csv = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map(line =>
    Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index] ?? ""]))
  );
}

async function scoringContractFixture() {
  const [area_profile, gap_score, accessibility] = await Promise.all([
    csvRows("../../../data/processed/area_profile.csv"),
    csvRows("../../../data/processed/gap_score_table.csv"),
    csvRows("../../../data/processed/accessibility_table.csv"),
  ]);
  const services_master = area_profile.map((area, index) => ({
    service_id: `FIXTURE-${String(index + 1).padStart(3, "0")}`,
    name: `${area.area_name} fixture service`,
    primary_category: "Food",
    service_categories: "Food",
    latitude: area.latitude,
    longitude: area.longitude,
    mappable: true,
    area_id: area.area_id,
    borough_name: area.borough_name,
    age_groups: "Under 25; 25-44; 45-64; 65+",
    gender_focus: "all",
    serves_immigrant: false,
    serves_indigenous: false,
  }));
  return { area_profile, gap_score, accessibility, services_master };
}

export const test = base.extend({
  productionSafety: [
    async ({ page }, use) => {
      const writes = [];
      analyticsWriteLog.set(page, writes);

      if (useLocalIndicatorFixture) {
        const payload = await realIndicatorFixture();
        await page.route("**/api/area-vulnerability", route =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(payload),
          })
        );
      }

      if (useLocalScoringFixture) {
        const tables = await scoringContractFixture();
        await page.route(
          /\/rest\/v1\/(area_profile|gap_score|accessibility|services_master)(?:\?|$)/,
          route => {
            const request = route.request();
            if (request.method() !== "GET") {
              route.continue();
              return;
            }
            const url = new URL(request.url());
            const table = url.pathname.split("/").at(-1);
            let rows = tables[table] ?? [];
            const areaFilter = url.searchParams.get("area_id");
            if (areaFilter?.startsWith("eq.")) {
              rows = rows.filter(row => row.area_id === areaFilter.slice(3));
            }
            const limit = Number(url.searchParams.get("limit"));
            if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
            const wantsObject = request.headers().accept?.includes(
              "application/vnd.pgrst.object+json"
            );
            route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: {
                "access-control-allow-origin": "*",
                "access-control-expose-headers": "content-range",
                "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
              },
              body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
            });
          }
        );
      }

      await page.route(analyticsRoute, async route => {
        const request = route.request();
        if (request.method() !== "POST") {
          await route.continue();
          return;
        }

        const table = new URL(request.url()).pathname.split("/").at(-1);
        writes.push({
          table,
          body: request.postDataJSON?.() ?? request.postData(),
        });
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "content-range",
          },
          body: "[]",
        });
      });

      await page.route("http://localhost:8000/**", route =>
        route.fulfill({ status: 202, contentType: "application/json", body: "{}" })
      );

      await use();
    },
    { auto: true },
  ],
});

export function analyticsWritesFor(page) {
  return analyticsWriteLog.get(page) ?? [];
}

export async function chooseCommunityView(page) {
  await page.goto("/");
  await expect(page.getByTestId("role-screen")).toBeVisible();
  await page.getByTestId("choose-community-role").click();
  await expect(page.getByTestId("location-screen")).toBeVisible();
  await page.getByTestId("distribution-location").first().click();
  await expect(page.getByTestId("community-view")).toBeVisible();
  await expect(page.getByTestId("data-source-status")).toHaveText(expectedDataSource, {
    timeout: 30_000,
  });
}

export async function choosePlannerView(page) {
  await page.goto("/");
  await expect(page.getByTestId("role-screen")).toBeVisible();
  await page.getByTestId("choose-planner-role").click();
  await expect(page.getByTestId("planner-view")).toBeVisible();
  await expect(page.getByTestId("data-source-status")).toHaveText(expectedDataSource, {
    timeout: 30_000,
  });
}

export { expect };
