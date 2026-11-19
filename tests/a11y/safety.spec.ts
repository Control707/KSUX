import { expect, test } from "@playwright/test";
import {
  THEMES,
  VIEWPORTS,
  expectMinTextSize,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

const SAFETY_ROUTES = ["/safety", "/safety/about", "/safety/demo-incident", "/safety/alerts/demo-alert", "/emergency"];

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
  await expect(page.locator('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]')).toHaveCount(0);
  await page.getByTestId("emergency-emergency").click();
  await expect(page.getByTestId("emergency-panel").getByRole("status")).toHaveText(/Demo Mode: nothing dialled/);
});

test("Report an incident opens the Emergency Panel first and is keyboard reachable", async ({ page }) => {
  await page.goto("/safety");
  const trigger = page.getByTestId("report-incident-btn");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("report-emergency-panel")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Is anyone in danger right now?" })).toBeVisible();
  await dialog.getByTestId("emergency-continue").click();
  await expect(dialog.getByRole("status").filter({ hasText: "Nothing has been sent or saved" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the Quick Sheet report link lands on the Emergency Panel", async ({ page }) => {
  await page.goto("/safety?report=1");
  await expect(page.getByRole("dialog").getByTestId("report-emergency-panel")).toBeVisible();
});

test("offline, Safety keeps the panel and says it can't check sources or post", async ({ page, context }) => {
  await page.goto("/safety");
  await expect(page.getByTestId("emergency-panel")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId("offline-official")).toHaveText("Offline: can’t check official sources.");
  await expect(page.getByTestId("offline-incidents")).toContainText("Offline: can’t load community Incidents.");
  await expect(page.getByTestId("emergency-emergency")).toHaveAttribute("href", "tel:911");
  await page.getByTestId("report-incident-btn").click();
  await page.getByRole("dialog").getByTestId("emergency-continue").click();
  await expect(page.getByTestId("report-offline")).toContainText("Nothing has been sent or saved.");
  await context.setOffline(false);
});

test("Demo labels Alert fixtures and dials nothing anywhere on Safety", async ({ page }) => {
  await page.goto("/safety?demo=1");
  await expect(page.getByTestId("demo-alert-fixture")).toContainText("Demo · not real");
  await expect(page.locator('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]')).toHaveCount(0);
});

test("the intro card dismisses and stays dismissed", async ({ page }) => {
  await page.goto("/safety");
  await page.getByTestId("safety-intro-dismiss").click();
  await expect(page.getByTestId("safety-intro")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("emergency-panel")).toBeVisible();
  await expect(page.getByTestId("safety-intro")).toHaveCount(0);
});

test("Demo shows every Official Alert state with its source and check time, and no push", async ({ page }) => {
  await page.goto("/safety?demo=1");
  const copy = page.getByTestId("official-alert-copy");
  await expect(copy).toContainText("KSUX makes no real fetch and sends no push in Demo");
  await expect(copy.locator('[data-display="ok"]').first()).toBeVisible();
  await expect(copy.getByTestId("alert-stale")).toContainText("KSUX’s copy is out of date");
  await expect(copy.getByTestId("alert-quiet").first()).toContainText("Checked");
  await expect(copy.getByTestId("alert-unavailable")).toBeVisible();
  for (const state of ["Issued", "Updated", "All clear (quoted from the source)", "No longer listed"]) {
    await expect(copy.getByTestId("official-alert-item").filter({ hasText: state }).first()).toBeVisible();
  }
  await expect(page.getByTestId("no-alert-isnt-safe")).toBeVisible();
  await expectNoSeriousAxe(page, { label: "/safety demo alert copy" });

  await copy.getByRole("link", { name: "Alert details" }).first().click();
  await expect(page).toHaveURL(/\/safety\/alerts\//);
  await expect(page.getByTestId("official-alert-item")).toContainText("Demo · not real");
  await expectNoSeriousAxe(page, { label: "/safety/alerts demo" });
});

test("Notifications says Demo Mode sends no push and keeps the Alert switch disabled", async ({ page }) => {
  await page.goto("/profile/notifications?demo=1#alerts");
  await expect(page.getByTestId("push-phone-state")).toHaveAttribute("data-state", "demo");
  const toggle = page.getByTestId("alert-push-switch");
  await expect(toggle).toHaveAttribute("role", "switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("alert-push-reason")).toHaveText("Demo Mode: no push.");
  await expect(page.getByTestId("alert-push-callout")).toContainText("call 911");
  await toggle.click({ force: true });
  await expect(page.getByTestId("alert-push-confirm")).toHaveCount(0);
  await expectNoSeriousAxe(page, { label: "/profile/notifications demo" });
});
