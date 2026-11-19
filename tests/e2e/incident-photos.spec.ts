import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { enterDemo } from "../a11y/helpers";
test.use({ actionTimeout: 15_000 });

async function postPhoto(page: Page, blur = false) {
  await enterDemo(page); await page.goto("/safety");
  await page.getByTestId("report-incident-btn").click();
  await page.getByTestId("report-emergency-panel").getByTestId("emergency-continue").click();
  const form = page.getByTestId("incident-form");
  await form.getByRole("button", { name: /Hazard An obstacle/ }).click();
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Campus", { exact: true }).selectOption("Marietta");
  await form.getByLabel("Search buildings or areas").fill("Atrium");
  await form.getByLabel("Building or area", { exact: true }).selectOption({ label: "Atrium Building" });
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Claimed observed time").selectOption("0");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByLabel("Description").fill("temporary entrance obstruction beside a cone");
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await expect(form).toContainText("Step 5 of 7");
  await expect(form.getByRole("heading", { name: "Add a photo?" })).toBeFocused();
  await expect(form.locator('input[type="file"]')).toHaveCount(0);
  await form.getByRole("button", { name: "Use Demo fixture photo", exact: true }).click();
  if (blur) await form.getByLabel("Blur the whole photo", { exact: true }).check();
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await form.getByRole("button", { name: "Student · name hidden", exact: true }).click();
  await form.getByRole("button", { name: "Next", exact: true }).click();
  await expect(form).toContainText("Photo held for review");
  await form.getByRole("button", { name: "Post to the community", exact: true }).click();
  await expect(page.getByTestId("incident-posted")).toContainText("Your photo is held for review");
  const href = await page.getByRole("link", { name: "See it on Incidents" }).getAttribute("href");
  const incidentId = href!.split("/").pop()!;
  const auth = await page.evaluate(() => ({ demoShortCode: sessionStorage.getItem("ksux_demo_short_code")!, demoPersonaHandle: sessionStorage.getItem("ksux_demo_persona")! }));
  return { incidentId, auth };
}

for (const approve of ["Approve", "Approve with blur"] as const) test(`Incident photo hold → ${approve}`, async ({ page, context }) => {
  let uploads = 0; page.on("request", (r) => { if (r.url().includes("/api/uploadthing")) uploads++; });
  const { incidentId, auth } = await postPhoto(page, approve === "Approve");
  await page.getByRole("link", { name: "See it on Incidents" }).click();
  await expect(page.getByTestId("incident-card").getByRole("img")).toHaveCount(0);
  const reviewer = await context.newPage();
  await reviewer.goto(`/moderation?demo=${auth.demoShortCode}&persona=alex_owl&section=queue&item=${encodeURIComponent("incident:" + incidentId)}`);
  await expect(reviewer.getByRole("button", { name: "Show photo", exact: true })).toBeVisible();
  const photo = reviewer.getByRole("img", { name: "Held Incident photo for Moderator review", exact: true });
  await expect(photo).toHaveCount(0);
  await reviewer.getByRole("button", { name: "Show photo", exact: true }).click();
  await expect(photo).toBeVisible(); await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await reviewer.getByRole("button", { name: approve, exact: true }).click();
  const confirm = reviewer.getByRole("alertdialog");
  await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(confirm).toContainText("in-app notice only");
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await page.getByRole("button", { name: "Retry connection / Refresh Incident", exact: true }).click();
  const approved = page.getByRole("img", { name: "Moderator-approved Incident photo", exact: true });
  await expect(approved).toBeVisible(); await expect.poll(() => approved.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId("incident-card")).toContainText("Whole-photo blur applied");
  await context.setOffline(true); await expect(approved).toHaveCount(0); await context.setOffline(false);
  await page.goto("/profile/moderation"); await expect(page.getByText("Your Incident photo was approved with whole-photo blur.", { exact: true })).toBeVisible();
  expect(uploads).toBe(0);
});

test("Incident photo hold → 48-hour discard leaves text visible and sends a private notice", async ({ page }) => {
  const { incidentId, auth } = await postPhoto(page);
  await page.getByRole("button", { name: "Demo: simulate 48-hour discard", exact: true }).click();
  await expect(page.getByTestId("incident-posted")).toContainText("Photo discarded. Your Incident text is unchanged.");
  await page.getByRole("link", { name: "Read private photo notice", exact: true }).click();
  await expect(page.getByText(/Your Incident photo was discarded because nobody reviewed it within 48 hours/)).toBeVisible();
  await page.goto(`/safety/${incidentId}`);
  await expect(page.getByTestId("incident-card")).toContainText("temporary entrance obstruction beside a cone");
  await expect(page.getByTestId("incident-card").getByRole("img")).toHaveCount(0);
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210");
  expect((await client.query(api.moderatorConsole.queue, { ...auth, demoPersonaHandle: "alex_owl" })).items.some((i) => i.targetId === incidentId)).toBe(false);
});

test("Incident photo hold → Reject adds the fixed public note and a private author notice", async ({ page, context }) => {
  const { incidentId, auth } = await postPhoto(page);
  const reviewer = await context.newPage();
  await reviewer.goto(`/moderation?demo=${auth.demoShortCode}&persona=alex_owl&item=${encodeURIComponent("incident:" + incidentId)}`);
  await reviewer.getByRole("button", { name: "Reject", exact: true }).click();
  const confirm = reviewer.getByRole("alertdialog"); await expect(confirm).toContainText("The photo is deleted");
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click(); await expect(confirm).toHaveCount(0);
  await page.getByRole("link", { name: "See it on Incidents" }).click();
  await expect(page.getByTestId("incident-card")).toContainText("Photo not approved");
  await expect(page.getByTestId("incident-card").getByRole("img")).toHaveCount(0);
});
