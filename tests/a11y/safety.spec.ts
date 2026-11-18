import { expect, test } from "@playwright/test";
import {
  THEMES,
  VIEWPORTS,
  expectMinTextSize,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

const SAFETY_ROUTES = ["/safety", "/safety/demo-incident", "/safety/alerts/demo-alert", "/emergency"];

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`Safety and Emergency Panel · ${theme} · ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      for (const route of SAFETY_ROUTES) {
        await page.goto(route);
        await expect(page.locator("h1")).toHaveCount(1);
        await expectNoSeriousAxe(page, { label: `${route} ${theme} ${viewportName}` });
        await expectTargetSizes(page, "body", route);
        await expectMinTextSize(page, "body", route);
      }
    });
  }
}

test("the Emergency Panel works signed out and never dials in Demo", async ({ page }) => {
  await page.goto("/safety");
  const panel = page.getByTestId("emergency-panel");
  await expect(panel.getByRole("heading", { name: "Is anyone in danger right now?" })).toBeVisible();
  await expect(panel.getByTestId("emergency-emergency")).toHaveAttribute("href", "tel:911");
  await expect(panel.getByTestId("emergency-police")).toHaveAttribute("href", "tel:4705786666");
  await expect(panel.getByTestId("emergency-policeText")).toHaveAttribute("href", "sms:7703563866");

  await page.goto("/safety?demo=1");
  await expect(page.getByTestId("emergency-panel")).toHaveAttribute("data-mode", "demo");
  await expect(page.locator('a[href^="tel:"],a[href^="sms:"]')).toHaveCount(0);
  await page.getByTestId("emergency-emergency").click();
  await expect(page.getByTestId("emergency-panel").getByRole("status")).toHaveText(/Demo Mode: nothing dialled/);
});
