import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { enterDemo } from "../a11y/helpers";
test.use({ actionTimeout: 15_000 });

async function start(page: Page) {
  await page.getByTestId("report-incident-btn").click();
  await page.getByTestId("report-emergency-panel").getByTestId("emergency-continue").click();
  await expect(page.getByTestId("incident-form")).toContainText("Step 1 of 6");
}
async function fill(page: Page, text: string) {
  const form = page.getByTestId("incident-form");
  await form.getByRole("button", { name: /Hazard An obstacle/ }).click();
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Campus", { exact: true }).selectOption("Marietta");
  await form.getByLabel("Search buildings or areas").fill("Atrium");
  await form.getByLabel("Building or area", { exact: true }).selectOption({ label: "Atrium Building" });
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Claimed observed time").selectOption("15");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Description").fill(text);
  await form.getByRole("button", { name: "Next", exact: true }).click();
}

test("Incident panel, divert, validation, publish, map/list, update, identifies-me quarantine and offline refusal", async ({ page, context }) => {
  test.setTimeout(180_000);
  await enterDemo(page);
  const auth = await page.evaluate(() => ({ demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!, demoPersonaHandle: sessionStorage.getItem("ksux_demo_persona")! }));
  await page.goto("/safety");
  await start(page);
  await page.getByRole("button", { name: "Medical emergency", exact: true }).click();
  await expect(page.getByRole("heading", { name: "KSUX doesn’t post these publicly" })).toBeVisible();
  await expect(page.locator('a[href^="tel:"],a[href^="sms:"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Choose something else" }).click();
  await fill(page, "all clear");
  await expect(page.getByTestId("incident-form").getByRole("alert")).toContainText("Don’t claim");
  const form = page.getByTestId("incident-form");
  await form.getByLabel("Description").fill("water leaking beside the entrance");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByRole("button", { name: "Student · name hidden", exact: true }).click();
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await expect(form).toContainText("Community report · not verified");
  await context.setOffline(true);
  await expect(form.getByRole("button", { name: "Post to the community", exact: true })).toBeDisabled();
  await context.setOffline(false);
  // Reconnect never submits: an explicit click is still required.
  await expect(page.getByTestId("incident-posted")).toHaveCount(0);
  await form.getByRole("button", { name: "Post to the community", exact: true }).click();
  await expect(page.getByTestId("incident-posted")).toContainText("This did not contact police or KSU");
  await page.getByRole("link", { name: "See it on Incidents" }).click();
  await expect(page).toHaveURL(/\/safety\/[a-z0-9]+(?:\?|$)/);
  const incidentUrl = page.url();
  const incidentId = new URL(incidentUrl).pathname.split("/").pop()!;
  await expect(page.getByTestId("incident-card")).toContainText("water leaking beside the entrance");
  await page.getByRole("button", { name: "Add an update (0/5)", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Text", { exact: true }).fill("water still visible by the entrance");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("incident-card")).toContainText("water still visible");
  await page.goto("/safety");
  await page.getByTestId("campus-switch-marietta").click();
  await expect(page.getByTestId("campus-map-list")).toContainText("water leaking beside the entrance");
  await expect(page.getByTestId("campus-map-list-item").filter({ hasText: "water leaking beside the entrance" })).toContainText("◆");
  const other = await context.newPage();
  await other.goto(`/safety/${incidentId}?demo=${auth.demoShortCode}&persona=alex_owl`);
  await expect(other.getByTestId("incident-card")).toBeVisible();
  await other.getByRole("button", { name: "This post identifies me", exact: true }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Send to KSUX moderators", exact: true }).click();
  await expect(other.getByTestId("incident-tombstone")).toHaveText("Under review");
  await page.goto(incidentUrl);
  await expect(page.getByTestId("incident-tombstone")).toHaveText("Under review");
  await context.setOffline(true);
  await expect(page.getByTestId("offline-incidents")).toBeVisible();
  await expect(page.getByTestId("incident-card")).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/safety");
  await start(page);
  await context.setOffline(true);
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const discard = page.getByRole("alertdialog");
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Discard report", exact: true }).click();
  await page.getByTestId("report-incident-btn").click();
  await page.getByTestId("report-emergency-panel").getByTestId("emergency-continue").click();
  await expect(page.getByTestId("report-offline")).toContainText("Nothing has been sent or saved");
  await context.setOffline(false);
});

test("offline detail reconnect replaces deleted content and never persists Incident data", async ({ page, context }) => {
  await enterDemo(page);
  const auth = await page.evaluate(() => ({ demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!, demoPersonaHandle: sessionStorage.getItem("ksux_demo_persona")! }));
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
  const { incidentId } = await client.mutation(api.incidents.create, { ...auth, category: "hazard", campus: "Marietta", buildingId: "bldg-osm-225446898",
    observedAt: Date.now(), text: "temporary entrance obstruction", nameLevel: "hidden" });
  await page.goto(`/safety/${incidentId}`);
  await expect(page.getByTestId("incident-card")).toContainText("temporary entrance obstruction");
  await context.setOffline(true);
  await expect(page.getByTestId("incident-card")).toHaveCount(0);
  await client.mutation(api.incidents.deleteOwn, { ...auth, incidentId });
  await page.evaluate(() => {
    (window as unknown as { incidentFlashes: string[] }).incidentFlashes = [];
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="incident-card"]')) (window as unknown as { incidentFlashes: string[] }).incidentFlashes.push(document.body.innerText);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await context.setOffline(false);
  await expect(page.getByTestId("incident-tombstone")).toHaveText("Deleted by author");
  expect(await page.evaluate(() => (window as unknown as { incidentFlashes: string[] }).incidentFlashes)).toEqual([]);
  const stored = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage),
    cached: (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((r) => r.url)))).flat(),
  }));
  expect(JSON.stringify(stored)).not.toContain(incidentId);
  expect(JSON.stringify(stored)).not.toContain("temporary entrance obstruction");
});

for (const state of ["removed", "redacted"] as const) {
  test(`reconnect paints only the fresh ${state} response and handles a failed refresh`, async ({ page, context }) => {
    await enterDemo(page);
    const auth = await page.evaluate(() => ({ demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!, demoPersonaHandle: "maya_cs" }));
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
    const { incidentId } = await client.mutation(api.incidents.create, { ...auth, category: "hazard", campus: "Marietta", buildingId: "bldg-osm-225446898",
      observedAt: Date.now(), text: "temporary entrance obstruction", nameLevel: "hidden" });
    const original = await client.query(api.incidents.incidentDetail, { ...auth, incidentId });
    expect(original.state).toBe("visible");
    if (original.state !== "visible") throw new Error("Missing test Incident");
    await page.goto(`/safety/${incidentId}`);
    await expect(page.getByTestId("incident-card")).toContainText("temporary entrance obstruction");
    await context.setOffline(true);
    await expect(page.getByTestId("incident-card")).toHaveCount(0);
    // #87 owns Moderator actions. Here the HTTP boundary supplies the exact
    // post-moderation response so the reconnect renderer is tested separately.
    let fail = true;
    await page.route("**/api/query", async (route) => {
      if (route.request().postDataJSON()?.path !== "incidents:incidentDetail") return route.continue();
      if (fail) return route.abort("failed");
      const value = state === "removed" ? { state: "removed" } : { ...original, incident: { ...original.incident,
        text: "[removed by moderators]", updates: [{ _id: "note", kind: "moderator_note", createdAt: Date.now(), text: "Identifying details removed" }] } };
      await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ status: "success", value, logLines: [] }) });
    });
    await page.evaluate(() => {
      (window as unknown as { staleFlash: boolean }).staleFlash = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="incident-card"]')?.textContent?.includes("temporary entrance obstruction"))
          (window as unknown as { staleFlash: boolean }).staleFlash = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "Can’t load current Incidents" })).toBeVisible();
    await expect(page.getByTestId("incident-card")).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Retry connection / Refresh Incident", exact: true }).click();
    if (state === "removed") await expect(page.getByTestId("incident-tombstone")).toHaveText("Removed by KSUX moderators");
    else await expect(page.getByTestId("incident-card")).toContainText("Identifying details removed");
    expect(await page.evaluate(() => (window as unknown as { staleFlash: boolean }).staleFlash)).toBe(false);
  });
}
