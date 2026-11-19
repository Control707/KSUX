import { expect, test, type Page } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

async function ready(page: Page) {
  await expect(page.locator("#main-content h1")).toHaveText("Leaderboard", { timeout: 20_000 });
  await expect(page.getByTestId("leaderboard-list")).toBeVisible({ timeout: 20_000 });
}

test.describe("leaderboard", () =>
  screenMatrix("leaderboard", ["/leaderboard", "/leaderboard?campus=marietta"], { ready }));

test("Demo board: own Campus control in ?campus=, Top 25, exact rank and footer", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/leaderboard");
  await ready(page);
  // Maya earned only on Kennesaw this week, so the board defaults there and records it in the URL.
  await expect(page).toHaveURL(/[?&]campus=kennesaw/);
  await expect(page.getByTestId("leaderboard-demo-label")).toHaveText("Demo · not real");
  await expect(page.getByTestId("leaderboard-me")).toContainText(/#\d+ of \d+ this week/);
  await expect(page.getByTestId("leaderboard-list").getByRole("listitem").first()).toContainText("@alex_owl");
  await expect(page.getByTestId("leaderboard-footer")).toContainText("Clout counts helpful logistics reports, not reliability");
  await expect(page.getByRole("group", { name: "Leaderboard Campus" })).toBeVisible();
  await expect(page.getByText("All KSU")).toHaveCount(0);

  await page.getByTestId("leaderboard-campus-marietta").click();
  await expect(page).toHaveURL(/[?&]campus=marietta/);
  await expect(page.getByTestId("leaderboard-list").getByRole("listitem").first()).toContainText("@sam_cpe");
  await expect(page.getByTestId("leaderboard-me")).toContainText("No Clout yet this week");

  await page.getByTestId("leaderboard-refresh").click();
  await expect(page.getByTestId("live-status")).toHaveText("Marietta Leaderboard refreshed");
});
