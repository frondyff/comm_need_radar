import { test as base, expect } from "@playwright/test";

const analyticsWriteLog = new WeakMap();
const analyticsRoute = /\/rest\/v1\/(page_events|flyer_downloads)(?:\?|$)/;

export const test = base.extend({
  productionSafety: [
    async ({ page }, use) => {
      const writes = [];
      analyticsWriteLog.set(page, writes);

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
  await expect(page.getByTestId("data-source-status")).toHaveText("Supabase", {
    timeout: 30_000,
  });
}

export async function choosePlannerView(page) {
  await page.goto("/");
  await expect(page.getByTestId("role-screen")).toBeVisible();
  await page.getByTestId("choose-planner-role").click();
  await expect(page.getByTestId("planner-view")).toBeVisible();
  await expect(page.getByTestId("data-source-status")).toHaveText("Supabase", {
    timeout: 30_000,
  });
}

export { expect };
