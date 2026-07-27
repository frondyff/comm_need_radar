import AxeBuilder from "@axe-core/playwright";
import {
  chooseCommunityView,
  choosePlannerView,
  expect,
  test,
} from "./fixtures.js";

async function expectNoSeriousViolations(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations.filter(violation =>
    ["critical", "serious"].includes(violation.impact)
  );
  const summary = violations
    .map(violation => {
      const examples = violation.nodes
        .slice(0, 3)
        .map(node => [
          node.target.join(" "),
          node.html,
          node.failureSummary,
        ].filter(Boolean).join("\n"))
        .join("\n\n");
      return `${violation.id} (${violation.impact}): ${violation.nodes.length} node(s); ${examples}`;
    })
    .join("\n");
  expect(violations.length, `${label} WCAG findings:\n${summary}`).toBe(0);
}

test("landing page has no serious WCAG violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("role-screen")).toBeVisible();
  await expectNoSeriousViolations(page, "landing");
});

test("community view has no serious WCAG violations", async ({ page }) => {
  await chooseCommunityView(page);
  await expectNoSeriousViolations(page, "community");
});

test("planner and chatbot have no serious WCAG violations", async ({ page }) => {
  await choosePlannerView(page);
  await expectNoSeriousViolations(page, "planner");
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("chatbot")).toBeVisible();
  await expectNoSeriousViolations(page, "chatbot");
});
