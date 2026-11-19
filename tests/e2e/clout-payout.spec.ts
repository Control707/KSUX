import { expect, test } from "@playwright/test";

// SPEC-v2 Testing Decisions, Layer 3: judge Parking Report → demo
// corroboration (@jordan_me, 4 s later, through the normal path) → payout
// toast → Profile "Your Clout" card. Runs in an isolated Judge Demo workspace.
test("a judge's Parking Report is corroborated by the demo persona and paid on Profile", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/parking?demo=1`);
  await expect(page.getByTestId("judge-demo-pill")).toContainText("Maya", { timeout: 20_000 });
  await expect(page.getByTestId("arrival-strip")).toBeVisible({ timeout: 20_000 });

  // Report a lot with no seeded demo reports so only @jordan_me can corroborate it.
  await page.getByTestId("arrival-lot-btn").click();
  const picker = page.getByTestId("arrival-lot-dialog");
  await picker.getByRole("button", { name: /North Parking Deck/ }).click();
  await page.getByTestId("arrival-tier-2").click();
  await expect(page.getByTestId("arrival-strip-reported")).toBeVisible();
  await expect(page.getByTestId("parking-clout")).toContainText("pending corroboration");

  const toast = page.getByTestId("clout-payout-toast");
  await expect(toast).toContainText(/\+5 Clout · your Lot \S+ report was confirmed/, { timeout: 15_000 });
  await expect(toast).toContainText("Demo · not real");
  await expect(toast.getByRole("link", { name: "See leaderboard" })).toHaveAttribute("href", "/leaderboard");

  await page.goto(`${baseURL}/profile`);
  const card = page.getByTestId("clout-card");
  await expect(card).toContainText("Demo · not real");
  await expect(page.getByTestId("clout-week-kennesaw")).toContainText("10");
  await expect(page.getByTestId("clout-payout-log")).toContainText("Parking Report confirmed");
});
