import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { enterDemo, expectMinTextSize, expectNoSeriousAxe, expectTargetSizes, THEMES, VIEWPORTS } from "./helpers";
test.use({ actionTimeout: 15_000 });

for (const theme of THEMES) for (const [size, viewport] of Object.entries(VIEWPORTS)) {
  test(`Incident list, detail and seven steps · ${theme} · ${size}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await enterDemo(page);
    await page.goto("/safety");
    await page.getByTestId("campus-switch-marietta").click();
    await expect(page.getByTestId("incident-card").first()).toBeVisible();
    await expectNoSeriousAxe(page, { label: `Incident list ${theme} ${size}` });
    await expectTargetSizes(page, "main", "Incident list");
    await expectMinTextSize(page, "main", "Incident list");
    const skip = page.getByRole("link", { name: /^Skip map, go to the list/ });
    await skip.focus(); await page.keyboard.press("Enter");
    await expect(page.getByTestId("campus-map-list")).toBeFocused();
    await page.getByTestId("incident-card").first().getByRole("link", { name: "Details", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Community Incident", exact: true })).toBeVisible();
    await expect(page.getByTestId("incident-card")).toBeVisible();
    await expectNoSeriousAxe(page, { label: `Incident detail ${theme} ${size}` });
    await page.getByRole("button", { name: "Report to KSUX moderators", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Reason", { exact: true }).selectOption("campus_safety");
    await expect(page.getByRole("dialog", { name: "Campus Safety Moderation Report", exact: true })).toBeVisible();
    await page.getByRole("dialog").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)); });
    await expectNoSeriousAxe(page, { label: "Campus Safety Emergency Panel" });
    await page.getByRole("dialog", { name: "Campus Safety Moderation Report", exact: true }).getByTestId("emergency-continue").click();
    await page.keyboard.press("Escape");
    await page.goto("/safety");
    await page.getByTestId("report-incident-btn").focus(); await page.keyboard.press("Enter");
    await page.getByTestId("report-emergency-panel").getByTestId("emergency-continue").click();
    const form = page.getByTestId("incident-form");
    for (let step = 0; step < 7; step++) {
      await expect(form).toContainText(`Step ${step + 1} of 7`);
      await expect(form.locator("h1")).toBeFocused();
      await page.getByTestId("report-incident-dialog").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)); });
      await expectNoSeriousAxe(page, { label: `Incident step ${step + 1} ${theme} ${size}` });
      await expectTargetSizes(page, '[data-testid="report-incident-dialog"]', "Incident form");
      await expectMinTextSize(page, '[data-testid="report-incident-dialog"]', "Incident form");
      if (step === 0) await form.getByRole("button", { name: /Hazard An obstacle/ }).click();
      if (step === 1) {
        await form.getByLabel("Campus", { exact: true }).selectOption("Marietta");
        await form.getByLabel("Search buildings or areas").fill("Atrium");
        await form.getByLabel("Building or area", { exact: true }).selectOption({ label: "Atrium Building" });
      }
      if (step === 2) await form.getByLabel("Claimed observed time").selectOption("0");
      if (step === 3) await form.getByLabel("Description").fill("temporary entrance obstruction");
      if (step === 4) {
        await form.getByRole("button", { name: "Use Demo fixture photo", exact: true }).click();
        await form.getByLabel("Blur the whole photo", { exact: true }).check();
        await expectNoSeriousAxe(page, { label: "Photo selected with whole-photo blur" });
        await expectTargetSizes(page, '[data-testid="report-incident-dialog"]', "Photo options");
      }
      if (step === 5) await form.getByRole("button", { name: "Student · name hidden", exact: true }).click();
      if (step < 6) await form.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; } * { letter-spacing: .12em !important; word-spacing: .16em !important; }" });
    await expect.poll(() => page.getByTestId("report-incident-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/incidents-${theme}-${size}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("report-incident-btn")).toBeFocused();
    const auth = await page.evaluate(() => ({ demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!, demoPersonaHandle: "maya_cs" }));
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
    const { incidentId } = await client.mutation(api.incidents.create, { ...auth, category: "hazard", campus: "Marietta", buildingId: "bldg-osm-225446898",
      observedAt: Date.now(), text: "temporary entrance obstruction", nameLevel: "hidden" });
    await page.goto(`/safety/${incidentId}`);
    await expect(page.getByTestId("incident-card")).toBeVisible();
    await page.getByRole("button", { name: "Add an update (0/5)", exact: true }).click();
    await page.getByRole("dialog").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)); });
    await expectNoSeriousAxe(page, { label: "Author Update dialog" });
    await expectTargetSizes(page, '[role="dialog"]', "Author Update dialog");
  });
}
