import {
  chooseCommunityView,
  choosePlannerView,
  expect,
  test,
} from "./fixtures.js";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("chromium"), "Chromium owns visual baselines");
});

test("@visual landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("role-screen")).toBeVisible();
  await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
});

test("@visual community view", async ({ page }) => {
  await chooseCommunityView(page);
  await expect(page).toHaveScreenshot("community.png", {
    fullPage: true,
    mask: [page.locator(".leaflet-container")],
  });
});

test("@visual planner view", async ({ page }) => {
  await choosePlannerView(page);
  await expect(page).toHaveScreenshot("planner.png", {
    fullPage: true,
    mask: [page.locator(".leaflet-container")],
  });
});

test("@visual flyer preview", async ({ page }) => {
  await chooseCommunityView(page);
  await page.getByTestId("service-card").first().click();
  await page.getByTestId("preview-flyer").click();
  const flyer = page.getByTestId("flyer-preview-shell");
  await expect(flyer).toBeVisible();
  await expect
    .poll(() => flyer.evaluate(element => element.getBoundingClientRect().height))
    .toBeGreaterThan(500);
  await expect(flyer).toHaveScreenshot("flyer.png", {
    mask: [page.locator(".leaflet-container")],
  });
});
