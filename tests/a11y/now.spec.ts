import { expect, test } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

test.describe("now", () => {
  screenMatrix("now", ["/"], {
    ready: async (page) => {
      await expect(page.getByTestId("bento-parking-tile")).toBeVisible({ timeout: 20_000 });
    },
  });

  test("the pinned-lot card never shows a tier or % without reports", async ({ page }) => {
    await enterDemo(page);
    const cards = page.getByTestId("now-parking-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    for (const card of await cards.all()) {
      const status = await card.getAttribute("data-status");
      const text = (await card.textContent()) ?? "";
      expect(text).not.toMatch(/\d+\s*%/);
      if (status === "none") {
        await expect(card).toContainText("No recent reports");
        await expect(card.locator("[data-status=none]")).toHaveClass(/border-dashed/);
      } else {
        expect(text).toMatch(/unconfirmed|Student-verified/);
      }
    }
  });

  test("the Scrappy brief is logistics-only", async ({ page }) => {
    await enterDemo(page);
    const brief = page.getByTestId("now-scrappy-brief");
    await expect(brief).toBeVisible({ timeout: 20_000 });
    await expect(brief).not.toContainText(/incident|alert|clout|safe/i);
    await expect(page.getByTestId("now-bento-hud")).not.toContainText(/Clout|Incident|Official Alert/);
  });
});
