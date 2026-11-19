import { expect, test } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

test.describe("marketplace", () => {
  screenMatrix("marketplace", ["/marketplace"], {
    ready: async (page) => {
      await expect(page.getByTestId("marketplace-listing-card").first()).toBeVisible({ timeout: 20_000 });
    },
  });

  test("the local Campus filter lists the home Campus first and badges each Listing", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/marketplace");
    const group = page.getByRole("group", { name: "Listing Campus" });
    await expect(group.getByRole("button")).toHaveText([/All KSU$/, /^Kennesaw \(home\)$/, /^Marietta$/]);
    await group.getByRole("button", { name: "Marietta" }).click();
    await expect(group.getByRole("button", { name: "Marietta" })).toHaveAttribute("aria-pressed", "true");
    await group.getByRole("button", { name: "All KSU" }).click();
    const card = page.getByTestId("marketplace-listing-card").first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/^(Kennesaw|Marietta)$/)).toBeVisible();
  });

  test("the sell form is a labelled dialog: Escape closes it and focus returns", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/marketplace");
    const trigger = page.getByTestId("open-create-listing-btn");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Sell something" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByLabel("Title")).toBeFocused();
    for (const name of ["Category", "Campus", "Pricing", "Price in dollars", "Description"]) {
      await expect(dialog.getByLabel(name, { exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("publishing a Listing from the dialog announces success", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/marketplace");
    await page.getByTestId("open-create-listing-btn").click();
    const dialog = page.getByRole("dialog", { name: "Sell something" });
    const title = `A11y desk lamp ${Date.now()}`;
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("Works well. Meet at the Student Center.");
    await dialog.getByTestId("publish-listing-btn").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("toast-status-region")).toContainText("Listing published");
    await expect(page.getByTestId("marketplace-listing-card").filter({ hasText: title })).toBeVisible();
  });
});
