import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  analyticsWritesFor,
  chooseCommunityView,
  choosePlannerView,
  expect,
  test,
} from "./fixtures.js";

test("landing page supports language and role selection without horizontal overflow", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Community Radar/i);
  await expect(page.getByRole("heading", { name: "Community Radar" })).toBeVisible();
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(page.getByText("Qui êtes-vous?")).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("community workflow exercises filters, pagination, map, and safe analytics", async ({ page }) => {
  await chooseCommunityView(page);

  const cards = page.getByTestId("service-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);

  await page.getByTestId("service-search").fill("CLSC");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  await page.getByTestId("service-search").clear();

  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(cards.first()).toBeVisible();
  await page.getByRole("button", { name: "Food", exact: true }).click();

  const slider = page.getByTestId("distance-filter");
  await slider.evaluate(element => {
    element.value = "2";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(cards.first()).toBeVisible();

  const nextPage = page.getByTestId("next-page");
  if (await nextPage.isEnabled()) {
    await nextPage.click();
    await expect(page.getByText(/Page 2\//)).toBeVisible();
  }

  await page.getByTestId("view-services-map").click();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  await expect
    .poll(() => analyticsWritesFor(page).filter(write => write.table === "page_events").length)
    .toBeGreaterThan(0);
  const eventWrite = analyticsWritesFor(page).find(write => write.table === "page_events");
  const eventPayload = Array.isArray(eventWrite.body) ? eventWrite.body[0] : eventWrite.body;
  expect(eventPayload).toEqual(
    expect.objectContaining({
      event_type: expect.any(String),
      detail: expect.anything(),
    })
  );
});

test("community workflow downloads a valid single-page A4 flyer PDF", async ({ page }) => {
  test.setTimeout(120_000);
  await chooseCommunityView(page);

  await page.getByTestId("service-card").first().click();
  await page.getByTestId("preview-flyer").click();
  await expect(page.getByTestId("flyer-preview-shell")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-flyer").click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  expect(download.suggestedFilename()).toMatch(/^flyer-.+\.pdf$/);

  const bytes = await readFile(filePath);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.byteLength).toBeGreaterThan(20_000);

  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(1);
  const { width, height } = document.getPage(0).getSize();
  expect(width).toBeGreaterThan(590);
  expect(width).toBeLessThan(600);
  expect(height).toBeGreaterThan(840);
  expect(height).toBeLessThan(845);

  await expect
    .poll(() => analyticsWritesFor(page).filter(write => write.table === "flyer_downloads").length)
    .toBe(1);
  const flyerWrite = analyticsWritesFor(page).find(
    write => write.table === "flyer_downloads"
  );
  const flyerPayload = Array.isArray(flyerWrite.body)
    ? flyerWrite.body[0]
    : flyerWrite.body;
  expect(flyerPayload).toEqual(
    expect.objectContaining({
      group_filter: expect.any(Array),
      age_filter: expect.any(Array),
      category_filter: expect.any(Array),
      service_id: expect.any(String),
      service_name: expect.any(String),
      service_category: expect.any(String),
      distribution_location: expect.any(String),
      flyer_language: "EN",
    })
  );
});

test("planner workflow loads live areas, switches language, and completes a chatbot session", async ({ page }) => {
  await choosePlannerView(page);

  await expect(page.getByText("Tracts analyzed")).toBeVisible();
  await expect(page.getByTestId("priority-area")).toHaveCount(5);
  const initialProfile = await page.getByTestId("area-profile").textContent();
  await page.getByTestId("priority-area").nth(1).click();
  await expect
    .poll(() => page.getByTestId("area-profile").textContent())
    .not.toBe(initialProfile);

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(page.getByText("Vue Planificateur (V2)")).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("chatbot")).toBeVisible();
  await page.getByRole("button", { name: "City-wide rankings" }).click();
  await page.getByRole("button", { name: "Highest service gap" }).click();
  await expect(page.getByTestId("chat-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Source \(table\):/)).toBeVisible();

  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByTestId("chat-session-summary")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("chatbot")).toBeHidden();
});
