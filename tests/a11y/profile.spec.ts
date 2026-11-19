import { expect, test, type Page } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

async function ready(page: Page, route: string) {
  await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 20_000 });
  if (route === "/profile") {
    await expect(page.getByTestId("clout-hide-toggle")).toBeVisible({ timeout: 20_000 });
  }
  if (route === "/moderation") {
    await expect(page.getByTestId("moderation-queue-view")).toContainText(/items not shown|waiting|No pending items/, { timeout: 20_000 });
  }
}

test.describe("profile, moderation and about", () =>
  screenMatrix("profile", ["/profile", "/moderation", "/profile/about"], { ready }));

test("Your Clout card renders privately with a labelled hide-me switch", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/profile");
  const card = page.getByTestId("clout-card");
  await expect(card.getByRole("heading", { name: "Your Clout", level: 2 })).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Clout counts helpful logistics reports, not reliability");
  await expect(card).toContainText("Lifetime");
  await expect(card).not.toContainText(/trust(ed|worthy)?\b/i);

  const toggle = card.getByRole("switch", { name: "Hide me from leaderboards" });
  await expect(toggle).toHaveAttribute("aria-checked", /^(true|false)$/);
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  const after = before === "true" ? "false" : "true";
  await expect(toggle).toHaveAttribute("aria-checked", after);
  await expect(page.getByRole("status").filter({ hasText: /leaderboards/ }).first()).toBeAttached();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", before!);
});

test("other Students' profiles never show Clout", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/profile?handle=alex_owl");
  await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("clout-card")).toHaveCount(0);
});

test("Edit profile dialog: role, name, labelled fields, Escape and focus restore", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/profile");
  const trigger = page.getByRole("button", { name: "Edit profile" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Edit profile" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Display name")).toBeFocused();
  await expect(dialog.getByLabel("Major")).toBeVisible();
  await expect(dialog.getByLabel("Class year")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Profile links to the About page with the accessibility statement", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/profile");
  await page.getByTestId("profile-about-link").click();
  await expect(page).toHaveURL(/\/profile\/about$/);
  const statement = page.getByTestId("accessibility-statement");
  await expect(statement).toContainText("built to WCAG 2.2 AA");
  await expect(statement).toContainText("Known issues");
  await expect(page.getByTestId("accessibility-feedback-link")).toHaveAttribute("href", /^https:/);
  await expect(page.locator("#main-content")).not.toContainText(/compliant|certified|accessible to everyone/i);
  await expect(page.locator("#main-content")).not.toContainText("independent student project");
});

test("Moderation restore announces its result", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/moderation");
  await page.getByTestId("judge-demo-pill").click();
  await page.getByTestId("persona-switch-alex_owl").click();
  await page.getByTestId("moderation-row").filter({ hasText: "Post report" }).click();
  const restore = page.getByTestId("moderation-restore-btn").first();
  await expect(restore).toBeVisible({ timeout: 20_000 });
  await restore.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/Restore complete. Logged./).first()).toBeAttached();
  await page.getByTestId("judge-demo-pill").click();
  await page.getByTestId("reset-demo-state-btn").click();
  await expect(page.getByTestId("moderation-row").filter({ hasText: "Post report" })).toBeVisible({ timeout: 10_000 });
});
