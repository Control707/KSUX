import { expect, test } from "@playwright/test";

test("falls back to synced transit when the direct feed stops updating", async ({ page }) => {
  await page.clock.install();
  let servePosition = true;
  await page.route("https://passio3.com/**/vehiclePositions.json", async (route) => {
    if (!servePosition) {
      await route.abort();
      return;
    }
    await route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: {
        entity: [{
          vehicle: {
            vehicle: { id: "test-bus", label: "Test bus" },
            position: { latitude: 34.038, longitude: -84.582 },
          },
        }],
      },
    });
  });

  await page.goto("/transit?demo=1");
  const transit = page.getByTestId("transit-view");
  await expect(transit.getByText("Direct Passio GPS")).toBeVisible({ timeout: 25_000 });

  servePosition = false;
  await page.clock.runFor(24_001);

  await expect(transit.getByText("Direct Passio GPS")).toHaveCount(0);
  await expect(transit.getByTestId("passio-live-tracker-link")).toHaveAttribute(
    "href", "https://kennesawstate.passiogo.com"
  );
  await expect(transit.getByText(/KM Kennesaw \/ Marietta/).first()).toBeVisible();
});

test("reloads a saved schedule and static campus map offline", async ({ page, context }) => {
  await page.goto("/?demo=1");
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("CS 3305");
  await expect.poll(() => page.evaluate(() => {
    const shortCode = sessionStorage.getItem("ksux_demo_short_code");
    const persona = sessionStorage.getItem("ksux_demo_persona");
    return Boolean(sessionStorage.getItem(`ksux_commuter_cache:demo:${shortCode}:${persona}`));
  })).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("offline-commuter-banner")).toBeVisible();
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("CS 3305");
  await expect(page.getByTestId("campus-geo-map")).toHaveAttribute("data-loaded-buildings", /^[1-9]\d*$/);
});
