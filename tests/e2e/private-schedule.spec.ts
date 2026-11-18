import { expect, test } from "@playwright/test";

test("previews a mixed calendar, saves a private class, and shows it in Now", async ({ page, context }) => {
  await page.goto("/courses/CS%203305?demo=1");
  await page.waitForURL(/[?&]persona=maya_cs/);
  const editor = page.getByRole("region", { name: "Private schedule" });
  await editor.getByLabel("Import .ics Schedule").setInputFiles({
    name: "mixed.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from([
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:browser-cs", "SUMMARY:CS 3305 CRN 83190",
      "DTSTART;TZID=America/New_York:20260901T111000", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH", "END:VEVENT",
      "BEGIN:VEVENT", "UID:browser-biol", "SUMMARY:BIOL 9900 Field Lab",
      "DTSTART:20260902T140000Z", "DTEND:20260902T153000Z", "RRULE:FREQ=WEEKLY;BYDAY=WE",
      "LOCATION:Lab 201", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")),
  });
  await expect(editor.getByRole("heading", { name: "Review schedule import" })).toBeVisible({ timeout: 15_000 });
  await expect(editor.getByText(/Exact match/)).toBeVisible();
  await expect(editor.getByText(/Unmatched · No published section/)).toBeVisible();
  await expect(editor.getByRole("button", { name: "Edit BIOL 9900 Field Lab" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved 2 new private classes");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByTestId("desktop-left-rail").getByRole("link", { name: "Now", exact: true }).click();
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("BIOL 9900 Field Lab");
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("Lab 201");
  // Visit the online home document once with the service worker controlling it.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("BIOL 9900 Field Lab");
  await expect.poll(() => page.evaluate(() => {
    const key = "ksux_commuter_cache:demo:" + sessionStorage.getItem("ksux_demo_short_code")
      + ":" + sessionStorage.getItem("ksux_demo_persona");
    return sessionStorage.getItem(key)?.includes("BIOL 9900 Field Lab") ?? false;
  })).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("offline-commuter-banner")).toBeVisible();
  await expect(page.getByTestId("bento-schedule-tile")).toContainText("BIOL 9900 Field Lab");
});
