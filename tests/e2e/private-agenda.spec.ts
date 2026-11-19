import fs from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { expect, test } from "@playwright/test";
import { api } from "../../convex/_generated/api";
import { easternDate } from "../../convex/lib/easternDate";
import { enterDemo } from "../a11y/helpers";

test("private agenda imports classes, exports only Events, follows RSVP/attendance and reminds in-app once", async ({ page, context }) => {
  test.setTimeout(180_000);
  await enterDemo(page, "/agenda");
  const auth = await page.evaluate(() => ({
    demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!,
    demoPersonaHandle: sessionStorage.getItem("ksux_demo_persona")!,
  }));
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
  const now = Date.now();
  const date = easternDate(now).replace(/-/g, "");
  const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(easternDate(now) + "T12:00:00Z").getUTCDay()];
  const editor = page.getByRole("region", { name: "Private schedule" });
  await editor.getByLabel("Import .ics Schedule").setInputFiles({
    name: "agenda.ics", mimeType: "text/calendar", buffer: Buffer.from([
      "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:agenda-private", "SUMMARY:Private agenda seminar",
      `DTSTART;TZID=America/New_York:${date}T230000`, `RRULE:FREQ=WEEKLY;BYDAY=${weekday}`, "LOCATION:Private studio", "END:VEVENT",
      "BEGIN:VEVENT", "UID:agenda-deadline", "SUMMARY:Private agenda worksheet",
      "DTEND:" + new Date(now + 3600_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n")),
  });
  await expect(editor.getByRole("heading", { name: "Review schedule import" })).toBeVisible();
  await editor.getByRole("button", { name: "Save schedule" }).click();
  const items = page.getByTestId("agenda-items");
  await expect(items.getByRole("link", { name: "Private agenda seminar", exact: true }).first()).toBeVisible();
  await expect(items.getByRole("link", { name: "Private agenda worksheet", exact: true })).toBeVisible();
  const { eventId } = await convex.mutation(api.communities.createNativeEvent, { ...auth, title: "Agenda browser gathering",
    description: "Meet classmates", campus: "Marietta", isVirtual: false, locationName: "Student Center",
    startTime: now + 10 * 60_000, endTime: now + 70 * 60_000 });
  const rooms = await convex.query(api.study.listStudyRoomsAndSessions, { ...auth, campusOverride: "All KSU" });
  const hosted = await convex.mutation(api.study.createStudySession, { ...auth, studyRoomId: rooms.rooms[0]!._id,
    title: "Agenda browser practice", visibility: "campus_open", startTime: now + 12 * 60_000,
    endTime: now + 72 * 60_000, maxSeats: 6 });
  await expect(items.getByRole("link", { name: "Agenda browser gathering", exact: true })).toBeVisible();
  const studyLink = items.getByRole("link", { name: "Agenda browser practice", exact: true });
  await expect(studyLink).toBeVisible();
  await page.screenshot({ path: "test-results/private-agenda.png", fullPage: true });
  await studyLink.click();
  await expect(page.getByRole("heading", { name: "Agenda browser practice", exact: true })).toBeVisible();
  await expect(page.getByTestId("campus-switcher")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to private agenda" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Events (.ics)" }).click();
  const download = await downloadPromise;
  const text = await fs.readFile((await download.path())!, "utf8");
  expect(text).toContain("SUMMARY:Agenda browser gathering");
  expect(text).not.toMatch(/Private agenda seminar|Private agenda worksheet|Agenda browser practice|VALARM/);
  await page.getByRole("link", { name: "Reminder settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Event reminders", exact: true });
  await toggle.click();
  await expect(page.getByTestId("agenda-reminder-toast")).toContainText("Agenda browser gathering");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("agenda-reminder-toast")).toHaveCount(0);
  await convex.mutation(api.communities.setEventRsvp, { ...auth, eventId, rsvpStatus: "none" });
  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-items")).toBeVisible();
  await expect(items.getByRole("link", { name: "Agenda browser gathering", exact: true })).toHaveCount(0);
  const other = await context.newPage();
  await other.goto(`/agenda?demo=${auth.demoShortCode}&persona=alex_owl`);
  await expect(other.getByTestId("agenda-items")).toBeAttached();
  await expect(other.getByTestId("agenda-items")).not.toContainText("Private agenda seminar");
  await expect(other.getByTestId("agenda-items")).not.toContainText("Agenda browser practice");
  await convex.mutation(api.study.endStudySession, { ...auth, sessionId: hosted.sessionId });
});
