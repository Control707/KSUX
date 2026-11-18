import { expect, test } from "@playwright/test";
import {
  THEMES,
  VIEWPORTS,
  enterDemo,
  expectMinTextSize,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

const MAP = "[data-testid=campus-geo-map]";
const MAP_SCREENS = ["/parking", "/transit"];

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`shared map frame · ${theme} · ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await enterDemo(page);
      for (const route of MAP_SCREENS) {
        await page.goto(route);
        const map = page.locator(MAP);
        await expect(map).toBeVisible();
        await expect(map.getByTestId("campus-map-list-item").first()).toBeVisible({ timeout: 15_000 });
        await expectNoSeriousAxe(page, { include: [MAP], label: `${route} map ${theme} ${viewportName}` });
        await expectTargetSizes(page, MAP, `${route} map`);
        await expectMinTextSize(page, MAP, `${route} map`);
      }
    });
  }
}

test.describe("map controls and list parity", () => {
  test.use({ viewport: VIEWPORTS.desktop });

  for (const route of MAP_SCREENS) {
    test(`${route}: zoom, Recenter, attribution, Skip map and a synced list`, async ({ page }) => {
      await enterDemo(page, route);
      const map = page.locator(MAP);
      await expect(map.getByTestId("campus-map-list-item").first()).toBeVisible({ timeout: 15_000 });

      await expect(map.getByRole("button", { name: "Zoom in" })).toBeVisible();
      await expect(map.getByRole("button", { name: "Zoom out" })).toBeVisible();
      await expect(map.getByRole("button", { name: "Recenter map" })).toBeVisible();
      await expect(map.getByTestId("map-attribution")).toContainText("OpenStreetMap");
      if (route === "/transit") await expect(map.getByTestId("map-attribution")).toContainText("Passio GO / Big Owl Bus");

      const featureCount = Number(await map.getAttribute("data-map-feature-count"));
      expect(featureCount).toBeGreaterThan(0);
      await expect(map.getByTestId("campus-map-list-item")).toHaveCount(featureCount);

      // Skip map moves focus past the canvas to the list.
      const skip = map.getByTestId("skip-map-link");
      await skip.focus();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(map.getByTestId("campus-map-list")).toBeFocused();

      // List selection is pressed and announced.
      const first = map.getByTestId("campus-map-list-item").first().getByRole("button");
      await first.click();
      await expect(first).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("live-status")).toContainText("shown on the map");

      // Status is never colour alone: every lot row has a glyph and word.
      if (route === "/parking") {
        const chips = map.locator("[data-testid=campus-map-list] [data-status]");
        await expect(chips.first()).toContainText(/Open|Filling|Nearly Full|Full|No recent reports/);
      }
    });
  }

  test("zoom and Recenter work from the keyboard and jump under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterDemo(page, "/parking");
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const fallback = page.getByTestId("campus-map-svg-fallback");
    await expect(zoomIn.or(fallback).first()).toBeVisible();
    await expect.poll(async () => (await fallback.count()) > 0 || (await zoomIn.isEnabled()), { timeout: 20_000 }).toBe(true);
    test.skip((await fallback.count()) > 0, "WebGL unavailable in this browser; the list carries every task");
    await zoomIn.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("live-status")).toContainText("Zoom level");
    await page.getByRole("button", { name: "Recenter map" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("live-status")).toHaveText("Map recentered");
  });
});
