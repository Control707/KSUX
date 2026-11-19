import { expect, test } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

const ready = async (page: import("@playwright/test").Page) => {
  await expect(page.getByTestId("feed-post-card").first()).toBeVisible({ timeout: 20_000 });
};

test.describe("feed", () => {
  screenMatrix("feed", ["/feed"], { ready });

  test("the stream is named All KSU and every Post has a Campus badge", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/feed");
    await ready(page);
    await expect(page.getByTestId("feed-stream-campus")).toHaveText(/All KSU/);
    await expect(page.getByTestId("feed-stream-campus")).toHaveAttribute("aria-pressed", "true");
    for (const card of await page.getByTestId("feed-post-card").all()) {
      await expect(card.getByText(/^(Kennesaw|Marietta)$/).first()).toBeVisible();
    }
  });

  test("the composer is a dialog: Escape restores focus and publishing is announced", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/feed");
    await ready(page);
    const trigger = page.getByTestId("open-post-composer-btn");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New Post" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("post-composer-textarea")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    const body = `Library 2nd floor is quiet today ${Date.now()}`;
    await page.getByTestId("post-composer-textarea").fill(body);
    await page.getByTestId("publish-post-btn").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("toast-status-region")).toContainText("Post published");
    await expect(page.getByTestId("feed-post-card").first()).toContainText(body);
    await expect(trigger).toBeFocused();
  });

  test("replies open in a dialog that restores focus to the Replies button", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/feed");
    await ready(page);
    const opener = page.getByTestId("open-thread-btn").first();
    await expect(opener).toHaveAccessibleName(/^Replies, \d+$/);
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Post thread" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Your reply")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the Quick Sheet Post tile opens the composer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterDemo(page);
    await page.getByTestId("center-quick-sheet-btn").click();
    await page.getByTestId("quick-create-post").click();
    await expect(page.getByRole("dialog", { name: "New Post" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("post-composer-textarea")).toBeFocused();
  });
});
