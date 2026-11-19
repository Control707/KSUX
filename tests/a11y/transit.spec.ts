import { expect, test, type Page } from "@playwright/test";
import { THEMES, VIEWPORTS, enterDemo } from "./helpers";
import { screenMatrix } from "./screens";
import { arrivalFor } from "../../src/components/transit/transitModel";

const ready = async (page: Page) => {
  await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("transit-route-row").first()).toBeAttached({ timeout: 20_000 });
};

test.describe("transit", () => screenMatrix("transit", ["/transit"], { ready }));

function ratio(a: number[], b: number[]) {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

async function openHalf(page: Page) {
  const half = page.getByTestId("transit-sheet-snap-half");
  if (await half.isVisible()) await half.click();
}

test.describe("transit behaviours", () => {
  for (const theme of THEMES) {
    test(`every route badge reaches 4.5:1 · ${theme}`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.emulateMedia({ colorScheme: theme });
      await enterDemo(page, "/transit");
      await ready(page);
      const badges = page.getByTestId("transit-view").getByTestId("route-badge");
      expect(await badges.count()).toBeGreaterThan(0);
      const colours = await badges.evaluateAll((els) =>
        els.map((el) => {
          const cs = getComputedStyle(el);
          const nums = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          return { code: el.getAttribute("data-route-code"), fg: nums(cs.color), bg: nums(cs.backgroundColor) };
        })
      );
      for (const c of colours) {
        expect(ratio(c.fg, c.bg), `${c.code} badge contrast`).toBeGreaterThanOrEqual(4.5);
      }
      // Route identity: no two routes on this Campus share colour and pattern.
      const identities = await page
        .getByTestId("transit-route-row")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const badge = row.querySelector<HTMLElement>("[data-testid=route-badge]")!;
            return `${getComputedStyle(badge).backgroundColor}|${badge.dataset.pattern}`;
          })
        );
      expect(new Set(identities).size).toBe(identities.length);
    });
  }

  test("Shuttle Notices carry the source line and appear only with their routes", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await enterDemo(page, "/transit");
    await ready(page);
    const notices = page.getByTestId("shuttle-notice");
    // Shuttle Notices come from the live Passio sync (or the Demo fixture). When
    // there are none right now, the screen must show no notice at all.
    if ((await notices.count()) === 0) {
      await expect(page.getByTestId("peek-notice-link")).toHaveCount(0);
      test.skip(true, "No Shuttle Notices in the current Passio snapshot");
    }
    await expect(notices.first()).toBeVisible();
    await expect(page.getByTestId("shuttle-notice-source").first()).toHaveText(
      /^Shuttle Notice · from Big Owl Bus via Passio GO · posted .+ · not a KSU safety Alert$/
    );
    // Only inside the affected route row (KM in the Demo fixtures), never a page-top banner.
    const outsideRows = await notices.evaluateAll(
      (els) => els.filter((el) => !el.closest("[data-testid=transit-route-row],[data-testid=stop-card]")).length
    );
    expect(outsideRows).toBe(0);
    // Each notice sits in a route row for a route it affects.
    const rowsWithNotices = await page.locator("[data-testid=transit-route-row]:has([data-testid=shuttle-notice])").count();
    expect(rowsWithNotices).toBeGreaterThan(0);
    expect(rowsWithNotices).toBeLessThan(await page.getByTestId("transit-route-row").count() + 1);
    // Never red: the notice uses the neutral surface, not the bad/alert colours.
    const bg = await notices.first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const bad = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--bad-bg)";
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    expect(bg).not.toBe(bad);
    await expect(page.getByTestId("peek-notice-link")).toHaveText(/\d+ Shuttle Notices? on Kennesaw routes/);
  });

  test("a stop opened from the route list focuses its stop card, and Show on map selects it", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await enterDemo(page, "/transit");
    await ready(page);
    await openHalf(page);
    const km = page.locator("[data-testid=transit-route-row][data-route-code=KM]");
    const toggle = km.locator("button[aria-expanded]");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The full ordered stop line (no cap).
    await expect(km.getByTestId("route-stop-button")).toHaveCount(3);
    await km.getByTestId("route-stop-button").first().click();
    const cardHeading = page.getByTestId("stop-card").getByRole("heading", { level: 2 });
    await expect(cardHeading).toHaveText("Rec Center");
    await expect(cardHeading).toBeFocused();
    await expect(page.getByTestId("stop-card").getByTestId("stop-arrivals").getByTestId("arrival").first()).toBeVisible();
    await page.getByTestId("stop-show-on-map").click();
    await expect(page.getByTestId("live-status")).toContainText("Rec Center shown on the map");
    await expect(page.locator("[data-item-id='stop:361'] button")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("make-your-stop").click();
    await expect(page.getByTestId("make-your-stop")).toHaveText(/This is your stop/);
    await page.getByRole("button", { name: "Close stop" }).click();
    await page.getByTestId("transit-sheet-snap-peek").click();
    await expect(page.getByTestId("your-stop-card")).toContainText("Your stop · Rec Center");
    await expect(page.getByTestId("your-stop-card").getByTestId("arrival")).toHaveCount(3);
  });

  test("a stop report publishes in one tap and Undo removes it", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await enterDemo(page, "/transit");
    await ready(page);
    const kl = page.locator("[data-testid=transit-route-row][data-route-code=KL]");
    await kl.locator("button[aria-expanded]").click();
    await kl.getByTestId("route-stop-button").nth(2).click();
    const card = page.getByTestId("stop-card");
    await expect(card).toContainText("anonymous to Students · not sent to Big Owl Bus or KSU");
    await expect(card.getByText(/Clout/)).toHaveCount(0);
    await card.getByTestId("stop-report-long_line").click();
    await expect(page.getByTestId("stop-report-toast")).toContainText("Stop report sent: Long line");
    await expect(card.getByTestId("stop-report-long_line")).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByTestId("stop-reports")).toContainText("Long line");
    await card.getByTestId("stop-report-undo").click();
    await expect(page.getByTestId("live-status")).toContainText("was removed");
    await expect(card.getByTestId("stop-report-undo")).toHaveCount(0);
    await expect(card.getByTestId("stop-reports-empty")).toBeVisible();
  });

  test("the sheet snaps to peek, half and full from buttons", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await enterDemo(page, "/transit");
    await ready(page);
    const sheet = page.getByTestId("transit-sheet");
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    await expect(page.getByTestId("your-stop-card")).toBeVisible();
    await expect(page.getByTestId("transit-route-list")).toBeHidden();
    const peekHeight = (await sheet.boundingBox())!.height;

    await page.getByTestId("transit-sheet-snap-half").focus();
    await page.keyboard.press("Enter");
    await expect(sheet).toHaveAttribute("data-snap", "half");
    await expect(page.getByTestId("transit-sheet-snap-half")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("transit-route-list")).toBeVisible();
    await expect(page.getByTestId("live-status")).toContainText("Panel at half");

    await page.getByTestId("transit-sheet-snap-full").click();
    await expect(sheet).toHaveAttribute("data-snap", "full");
    const fullHeight = (await sheet.boundingBox())!.height;
    expect(fullHeight).toBeGreaterThan(peekHeight);
  });

  test("stale GPS turns every arrival into a schedule estimate", () => {
    const base = { code: "KM", routeName: "Kennesaw / Marietta", runsToday: true, runDaysLabel: "Mon–Sat" };
    expect(arrivalFor({ ...base, liveMinutes: 4, stale: false })).toMatchObject({ kind: "live", text: "4 min · live" });
    expect(arrivalFor({ ...base, liveMinutes: 4, stale: true })).toMatchObject({ kind: "schedule", text: "~4 min · schedule" });
    expect(arrivalFor({ ...base, liveMinutes: null, stale: false })).toMatchObject({ kind: "schedule", text: "~20 min · schedule" });
    expect(arrivalFor({ ...base, liveMinutes: 3, stale: false, runsToday: false, runDaysLabel: "Fri–Sun" }))
      .toMatchObject({ kind: "not-today", text: "Not today · runs Fri–Sun" });
  });

  test("when the direct Passio feed stops, the pill stops claiming direct GPS", async ({ page }) => {
    await page.clock.install();
    let serve = true;
    await page.route("https://passio3.com/**/vehiclePositions.json", async (route) => {
      if (!serve) return route.abort();
      await route.fulfill({
        headers: { "access-control-allow-origin": "*" },
        json: { entity: [{ vehicle: { vehicle: { id: "t1", label: "Test bus" }, trip: { route_id: "74760" },
          position: { latitude: 34.038, longitude: -84.582, bearing: 90 } } }] },
      });
    });
    await page.setViewportSize(VIEWPORTS.desktop);
    await enterDemo(page, "/transit");
    await ready(page);
    const pill = page.getByTestId("transit-feed-pill");
    await expect(pill).toContainText("Direct Passio GPS", { timeout: 25_000 });
    serve = false;
    await page.clock.runFor(37_000);
    await expect(pill).not.toContainText("Direct Passio GPS");
    await expect(page.getByTestId("passio-live-tracker-link")).toBeVisible();
    // Stale means schedule estimates everywhere; live means live minutes.
    const feed = await pill.getAttribute("data-feed");
    if (feed === "stale") {
      await expect(pill).toContainText(/Bus GPS not updating · last \d+ min ago/);
      const kinds = await page.getByTestId("arrival").evaluateAll((els) => els.map((e) => e.getAttribute("data-arrival-kind")));
      expect(kinds.filter((k) => k === "live")).toEqual([]);
    }
  });

  test("a route that doesn't run today says so", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await enterDemo(page, "/transit");
    await ready(page);
    const ks = page.locator("[data-testid=transit-route-row][data-route-code=KS]");
    const day = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short" });
    if (["Fri", "Sat", "Sun"].includes(day)) await expect(ks).not.toContainText("Not today");
    else await expect(ks).toContainText("Not today · runs Fri–Sun");
  });
});
