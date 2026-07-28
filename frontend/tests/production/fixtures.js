import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const analyticsWriteLog = new WeakMap();
const analyticsRoute = /\/rest\/v1\/(page_events|flyer_downloads)(?:\?|$)/;
const useLocalIndicatorFixture = process.env.AREA_VULNERABILITY_FIXTURE === "true";
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
