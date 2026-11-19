import { expect, test, type Page } from "@playwright/test";
import {
  THEMES,
  VIEWPORTS,
  enterDemo,
  expectMinTextSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

/**
 * Phase 1A route × theme × viewport matrix (SPEC-v2 §13, #54). Each migrated
 * screen registers its routes here from its own spec file. A route passes with
 * zero serious/critical axe violations, 44 px targets and ≥13 px text on the
 * whole page, one h1, and no sideways scroll at 320 px or 200% text.
 */
export function screenMatrix(
  name: string,
  routes: readonly string[],
  opts: { ready?: (page: Page, route: string) => Promise<void> } = {},
) {
  const ready = opts.ready ?? (async (page: Page) => {
    await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 20_000 });
  });

  for (const theme of THEMES) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`${name} · ${theme} · ${viewportName}`, async ({ page }) => {
        test.setTimeout(60_000 + routes.length * 45_000);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        await enterDemo(page);
        for (const route of routes) {
          await page.goto(route);
          await ready(page, route);
          await expect(page.locator("h1"), `${route} has one h1`).toHaveCount(1);
          const label = `${route} ${theme} ${viewportName}`;
          await expectNoSeriousAxe(page, { label });
          await expectTargetSizes(page, "body", label);
          await expectMinTextSize(page, "body", label);
        }
      });
    }
  }

  test(`${name} · reflows at 320 px and 200% text`, async ({ page }) => {
    test.setTimeout(60_000 + routes.length * 30_000);
    await page.setViewportSize({ width: 320, height: 700 });
    await enterDemo(page);
    for (const route of routes) {
      await page.goto(route);
      await ready(page, route);
      await expectNoHorizontalOverflow(page, `${route} 320px`);
      await page.addStyleTag({ content: "html{font-size:200% !important}" });
      await expectNoHorizontalOverflow(page, `${route} 200% text`);
      // Wide glyphs stand in for platform font differences (CI runs on Linux).
      await page.addStyleTag({ content: "*{font-family:Verdana,'DejaVu Sans',sans-serif !important;letter-spacing:.02em}" });
      await expectNoHorizontalOverflow(page, `${route} 200% text, wide font`);
    }
  });
}
