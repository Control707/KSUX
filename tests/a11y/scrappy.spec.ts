import { expect, test } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

test.describe("scrappy", () => {
  screenMatrix("scrappy", ["/scrappy"]);

  test("a streamed answer is announced once, when it completes", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/scrappy");
    const status = page.getByTestId("scrappy-answer-status");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toBeEmpty();
    const input = page.getByTestId("ask-scrappy-input");
    await expect(input).toHaveAccessibleName("Ask Scrappy a question");
    await expect(page.getByTestId("scrappy-composer")).toHaveCSS("position", "sticky");

    await input.fill("Draft a Listing to sell my CS 3305 textbook for $40");
    await page.getByTestId("ask-scrappy-send-btn").click();
    await expect(page.getByTestId("scrappy-draft-card").last()).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText(/^Scrappy answered: /);
    await expect(status).toContainText("Draft ready to review");

    // Draft card actions and citation pills are 44 px targets.
    for (const el of [page.getByTestId("review-draft-card-btn").last(), page.getByTestId("scrappy-citation-pill").first()]) {
      const box = await el.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});
