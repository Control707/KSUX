import { expect, test } from "@playwright/test";

type NavigationSample = { route: string; title: string; y: number; scroll: number; width: number };
declare global {
  interface Window {
    navigationSamples: NavigationSample[];
    headingFocusScrolls: { route: string; before: number; after: number }[];
  }
}

for (const [device, viewport] of Object.entries({ phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } })) {
  test.describe(`navigation stability · ${device}`, () => {
    test.use({ viewport, serviceWorkers: "block" });

    test("primary navigation keeps heading focus from introducing a second scroll", async ({ page }) => {
      await page.addInitScript(() => {
        window.navigationSamples = [];
        window.headingFocusScrolls = [];
        const originalFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function (options) {
          const before = window.scrollY;
          originalFocus.call(this, options);
          if (this.tagName === "H1") window.headingFocusScrolls.push({ route: location.pathname, before, after: window.scrollY });
        };
        const sample = () => {
          const heading = document.querySelector("#main-content h1");
          const next = { route: location.pathname, title: heading?.textContent ?? "", y: heading?.getBoundingClientRect().top ?? -1, scroll: window.scrollY, width: document.body?.clientWidth ?? 0 };
          if (JSON.stringify(next) !== JSON.stringify(window.navigationSamples.at(-1))) window.navigationSamples.push(next);
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.goto("/feed?demo=1");
      await expect(page.getByTestId("feed-post-card").first()).toBeVisible({ timeout: 30_000 });
      const nav = page.getByRole("navigation", { name: device === "phone" ? "Main" : "Destinations", exact: true });
      for (const [label, pathname, title] of [["Now", "/", /Now on/], ["Feed", "/feed", /^Feed$/], ["Market", "/marketplace", /^Marketplace$/], ["Chats", "/chats", /^Chats$/]] as const) {
        await page.evaluate(() => window.scrollTo(0, 600));
        await nav.getByRole("link", { name: new RegExp(label) }).click();
        await page.waitForURL((url) => url.pathname === pathname);
        await expect(page.locator("#main-content h1")).toHaveText(title);
        await expect(page.locator("#main-content h1")).toBeFocused();
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      // History navigation must also leave focus accessible without an extra
      // browser scroll caused by focusing the heading.
      await page.goBack();
      await expect(page.locator("#main-content h1")).toHaveText("Marketplace");
      await expect(page.locator("#main-content h1")).toBeFocused();
      await page.goForward();
      await expect(page.locator("#main-content h1")).toHaveText("Chats");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

      const { focusScrolls, samples } = await page.evaluate(() => ({ focusScrolls: window.headingFocusScrolls, samples: window.navigationSamples }));
      expect(focusScrolls.filter(({ before, after }) => before !== after)).toEqual([]);
      const nowPositions = samples.filter(({ route, title, scroll }) => route === "/" && title.startsWith("Now") && scroll === 0).map(({ y }) => y);
      expect(nowPositions.length).toBeGreaterThan(0);
      expect(Math.max(...nowPositions) - Math.min(...nowPositions)).toBeLessThanOrEqual(1);
      const contentWidths = samples.filter(({ title }) => title).map(({ width }) => width);
      expect(new Set(contentWidths).size).toBe(1);
    });

    test("hash navigation keeps the requested reminder section in view", async ({ page }) => {
      await page.goto("/agenda?demo=1");
      await expect(page.getByTestId("judge-demo-pill")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("link", { name: "Reminder settings", exact: true }).click();
      await expect(page).toHaveURL(/\/profile\/notifications#agenda$/);
      const heading = page.getByRole("heading", { name: "Agenda reminders", exact: true });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });
  });
}
