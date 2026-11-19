import { expect, test } from "@playwright/test";
import { enterDemo, expectNoSeriousAxe, expectNoHorizontalOverflow, expectTargetSizes } from "../a11y/helpers";

test("next class connects both Campuses to Your stop, the shared map and offline wayfinding", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.clock.install({ time: new Date("2026-11-19T13:00:00Z") });
  await enterDemo(page, "/courses/CS%203305");
  const editor = page.getByRole("region", { name: "Private schedule" });
  await editor.getByLabel("Import .ics Schedule").setInputFiles({
    name: "travel.ics", mimeType: "text/calendar",
    buffer: Buffer.from([
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:travel-k", "SUMMARY:Kennesaw seminar", "DTSTART;TZID=America/New_York:20261119T090000",
      "DTEND;TZID=America/New_York:20261119T095000", "RRULE:FREQ=WEEKLY;BYDAY=TH", "LOCATION:Burruss Building Room 101", "END:VEVENT",
      "BEGIN:VEVENT", "UID:travel-m", "SUMMARY:Marietta workshop", "DTSTART;TZID=America/New_York:20261119T100000",
      "DTEND;TZID=America/New_York:20261119T105000", "RRULE:FREQ=WEEKLY;BYDAY=TH", "LOCATION:Engineering Technology Center Room 201", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")),
  });
  await expect(editor.getByRole("heading", { name: "Review schedule import" })).toBeVisible();
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved 2 new private classes");
  await page.goto("/transit");
  const km = page.locator('[data-testid="transit-route-row"][data-route-code="KM"]');
  await expect(km).toBeVisible();
  await km.locator("button[aria-expanded]").first().click();
  await km.getByTestId("route-stop-button").first().click();
  await page.getByTestId("make-your-stop").click();
  await expect(page.getByTestId("your-stop-toast")).toContainText("is your stop");
  await page.goto("/");
  const card = page.getByTestId("next-class-card");
  await expect(card).toContainText("Kennesaw seminar");
  await expect(card).toContainText("Kennesaw · Burruss Building Room 101");
  await expect(card.getByRole("combobox", { name: "Start from" })).toHaveValue("stop:361");
  await card.getByRole("button", { name: "Show Burruss Building on campus map" }).focus();
  await page.keyboard.press("Enter");
  await expect(card.getByTestId("campus-map-list")).toBeVisible();
  await expect(card.getByTestId("campus-place-search")).toHaveValue("Burruss Building");
  await card.screenshot({ path: "test-results/class-wayfinding-online.png" });
  await expectNoSeriousAxe(page, { include: ['[data-testid="next-class-card"]'], label: "next class and shared map" });
  await expectTargetSizes(page, '[data-testid="next-class-card"]', "next class controls");
  await page.setViewportSize({ width: 320, height: 700 });
  await expectNoHorizontalOverflow(page, "next-class map at 320px");
  await page.clock.fastForward(61 * 60_000);
  await expect(card).toContainText("Marietta workshop");
  await expect(card).toContainText("Intercampus trip · KM");
  await expect(card).toContainText("Destination stop: Joe Mack Wilson Student Center");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(card).toContainText("Marietta workshop");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const key = "ksux_commuter_cache:demo:" + sessionStorage.getItem("ksux_demo_short_code") + ":" + sessionStorage.getItem("ksux_demo_persona");
    return JSON.parse(sessionStorage.getItem(key) ?? "null")?.snapshot?.wayfinding?.yourStopId;
  })).toBe("361");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("offline-commuter-banner")).toBeVisible();
  await expect(card).toContainText("Marietta workshop");
  await expect(card).toContainText("Intercampus trip · KM");
  await expect(card).toContainText("Offline · live estimates unavailable");
  await card.getByRole("button", { name: /Show Engineering Technology Center/ }).click();
  await expect(card.getByTestId("campus-map-list")).toBeVisible();
  await expect(card.getByTestId("campus-place-search")).toHaveValue("Engineering Technology Center");
});
