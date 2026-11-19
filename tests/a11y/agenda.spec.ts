import { expect, test } from "@playwright/test";
import { screenMatrix } from "./screens";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { enterDemo, THEMES, VIEWPORTS, expectNoSeriousAxe, expectTargetSizes, expectMinTextSize, expectNoHorizontalOverflow } from "./helpers";

test.describe("private agenda and reminder preferences", () => screenMatrix("agenda", ["/agenda", "/profile/notifications"], {
  ready: async (page, route) => {
    if (route === "/agenda") await expect(page.getByTestId("agenda-items")).toBeVisible({ timeout: 40_000 });
    else await expect(page.getByRole("switch", { name: "Class reminders", exact: true })).toBeVisible({ timeout: 40_000 });
  },
}));

test("agenda is KSU-wide and reminder settings work from the keyboard", async ({ page }) => {
  await enterDemo(page, "/agenda");
  await expect(page.getByTestId("agenda-items")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("button", { name: "Kennesaw", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Owl Express · official records" })).toHaveAttribute("href", "https://owlexpress.kennesaw.edu/");
  await page.getByRole("link", { name: "Reminder settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agenda reminders", exact: true })).toBeFocused();
  const toggle = page.getByRole("switch", { name: "Event reminders", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("toast-status-region")).toContainText("Event reminders on");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

for (const theme of THEMES) for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  test(`joined Study Session detail · ${theme} · ${viewportName}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: theme });
    await enterDemo(page, "/agenda");
    const auth = await page.evaluate(() => ({
      demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!,
      demoPersonaHandle: sessionStorage.getItem("ksux_demo_persona")!,
    }));
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
    const rooms = await convex.query(api.study.listStudyRoomsAndSessions, { ...auth, campusOverride: "All KSU" });
    const hosted = await convex.mutation(api.study.createStudySession, { ...auth, studyRoomId: rooms.rooms[0]!._id,
      title: "Accessible practice session", visibility: "campus_open", startTime: Date.now() + 10 * 60_000,
      endTime: Date.now() + 70 * 60_000, maxSeats: 6 });
    await page.goto("/study/" + hosted.sessionId);
    await expect(page.getByRole("heading", { name: "Accessible practice session", exact: true })).toBeVisible();
    await expect(page.getByTestId("campus-switcher")).toHaveCount(0);
    const label = `Study Session ${theme} ${viewportName}`;
    await expectNoSeriousAxe(page, { label });
    await expectTargetSizes(page, "body", label);
    await expectMinTextSize(page, "body", label);
    await page.setViewportSize({ width: 320, height: 700 });
    await expectNoHorizontalOverflow(page, label);
    await page.addStyleTag({ content: "html{font-size:200% !important}" });
    await expectNoHorizontalOverflow(page, label + " 200%");
  });
}
