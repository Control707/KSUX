import { expect, test } from "@playwright/test";
import {
  SHELL_CHROME,
  THEMES,
  VIEWPORTS,
  enterDemo,
  expectMinTextSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

// Routes added by Phase 0 render fully in Direction C and are checked whole.
// /leaderboard is checked whole by tests/a11y/leaderboard.spec.ts (#90).
const PHASE0_SHELL_ROUTES = ["/profile/notifications"];
// Every other screen migrated in Phase 1A (#74) and is checked whole by its own
// screenMatrix spec (tests/a11y/<area>.spec.ts). Only the shell chrome is checked
// here for screens that are still mid-migration; the list may only shrink.
const LEGACY_ROUTES: string[] = [];

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(`shell · ${theme} · ${viewportName}`, () => {
      test.use({ viewport, colorScheme: theme });

      test("Phase 0 routes and shell chrome have no serious axe violations, 44 px targets and ≥13 px text", async ({ page }) => {
        await enterDemo(page);
        for (const route of PHASE0_SHELL_ROUTES) {
          await page.goto(route);
          await expect(page.locator("#main-content h1")).toBeVisible();
          await expectNoSeriousAxe(page, { label: `${route} ${theme} ${viewportName}` });
          await expectTargetSizes(page, "body", route);
          await expectMinTextSize(page, "body", route);
        }
        for (const route of LEGACY_ROUTES) {
          await page.goto(route);
          await expect(page.locator("header")).toBeVisible();
          await expectNoSeriousAxe(page, { include: SHELL_CHROME, label: `${route} chrome ${theme} ${viewportName}` });
          await expectTargetSizes(page, SHELL_CHROME.join(","), `${route} chrome`);
          await expectMinTextSize(page, SHELL_CHROME.join(","), `${route} chrome`);
        }
      });

      test("Quick Sheet is an accessible dialog with focus in, trap, Escape and restore", async ({ page }) => {
        await enterDemo(page);
        const trigger =
          viewportName === "phone"
            ? page.getByTestId("center-quick-sheet-btn")
            : page.getByTestId("desktop-left-rail").getByRole("button", { name: /Quick Sheet/ });
        await trigger.focus();
        await page.keyboard.press("Enter");

        const dialog = page.getByRole("dialog", { name: "Ask Scrappy or jump anywhere" });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute("aria-modal", "true");
        await expect(page.getByLabel("Ask Scrappy about Kennesaw or Marietta")).toBeFocused();
        // The shell behind the dialog is inert; live regions are not.
        expect(await page.locator("header").evaluate((el) => !!el.closest("[inert]"))).toBe(true);
        expect(await page.getByTestId("live-status").evaluate((el) => !!el.closest("[inert]"))).toBe(false);

        await expectNoSeriousAxe(page, { include: ["[role=dialog]"], label: `Quick Sheet ${theme} ${viewportName}` });
        await expectTargetSizes(page, "[role=dialog]", "Quick Sheet");
        await expectMinTextSize(page, "[role=dialog]", "Quick Sheet");
        for (const name of ["Safety", "Report an incident", "Leaderboard", "Parking", "Transit"]) {
          await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
        }

        // Tab never leaves the dialog.
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });

      test("Campus switcher appears only on location screens", async ({ page }) => {
        await enterDemo(page, "/parking");
        await expect(page.getByTestId("campus-switcher")).toBeVisible();
        await expect(page.getByRole("button", { name: "Marietta", exact: false }).first()).toHaveAttribute("aria-pressed", /true|false/);
        for (const route of ["/feed", "/marketplace", "/chats", "/profile", "/leaderboard"]) {
          await page.goto(route);
          await expect(page.locator("header")).toBeVisible();
          await expect(page.getByTestId("campus-switcher")).toHaveCount(0);
        }
      });
    });
  }
}

test.describe("shell keyboard and announcements", () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test("skip link is first, focus moves to the route heading, and live regions exist", async ({ page }) => {
    await enterDemo(page);
    await page.keyboard.press("Tab");
    const skip = page.getByTestId("skip-to-content");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await expect(page.getByTestId("live-status")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("live-alert")).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("toast-status-region")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("toast-alert-region")).toHaveAttribute("role", "alert");

    await page.getByTestId("desktop-left-rail").getByRole("link", { name: "Leaderboard" }).click();
    await expect(page.locator("#main-content h1")).toBeFocused();
    await expect(page.locator("#main-content h1")).toHaveText("Leaderboard");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Destinations" })).toBeVisible();
  });

  test("Campus changes are announced", async ({ page }) => {
    await enterDemo(page, "/parking");
    await page.getByTestId("campus-switch-marietta").click();
    await expect(page.getByTestId("live-status")).toHaveText("Showing Marietta");
    await expect(page.getByTestId("campus-switch-marietta")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("campus-switch-kennesaw").click();
    await expect(page.getByTestId("live-status")).toHaveText("Showing Kennesaw");
  });

  test("chat-like screens hide the bar and show Back", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await enterDemo(page, "/scrappy");
    await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
    await expect(page.getByTestId("shell-back-btn")).toBeVisible();
  });

  test("reduced motion keeps the sheet to a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(VIEWPORTS.phone);
    await enterDemo(page);
    await page.getByTestId("center-quick-sheet-btn").click();
    const animation = await page.getByRole("dialog").evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("ksux-fade-in");
  });

  test("no horizontal overflow at 320 px or 200% text on Phase 0 routes", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await enterDemo(page, "/leaderboard");
    for (const route of ["/profile/notifications", "/safety", "/emergency"]) {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoHorizontalOverflow(page, `${route} 320px`);
      await page.addStyleTag({ content: "html{font-size:200% !important}" });
      await expectNoHorizontalOverflow(page, `${route} 200% text`);
      // Wide glyphs stand in for platform font differences (CI runs on Linux).
      await page.addStyleTag({ content: "*{font-family:Verdana,'DejaVu Sans',sans-serif !important;letter-spacing:.02em}" });
      await expectNoHorizontalOverflow(page, `${route} 200% text, wide font`);
    }
  });
});
