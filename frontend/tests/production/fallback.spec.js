import { expect, test } from "./fixtures.js";

const dashboardRead =
  /\/(?:rest\/v1\/(?:area_profile|gap_score|accessibility|services_master)|api\/area-vulnerability)(?:\?|$)/;

test("dashboard falls back to demo data instead of rendering a blank screen", async ({ page }) => {
  await page.route(dashboardRead, route =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "synthetic production test outage" }),
    })
  );

  await page.goto("/");
  await page.getByTestId("choose-planner-role").click();
  await expect(page.getByTestId("planner-view")).toBeVisible();
  await expect(page.getByTestId("data-source-status")).toHaveText("Demo data");
  await expect(page.getByTestId("data-source-notice")).toBeVisible();
  await expect(page.getByTestId("retry-live-data")).toBeVisible();
  await expect(page.getByText("Highest relative service-gap ranks")).toBeVisible();
  await expect(page.getByTestId("area-profile")).toBeVisible();
});
