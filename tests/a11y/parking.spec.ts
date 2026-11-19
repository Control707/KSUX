import { expect, test, type Page } from "@playwright/test";
import { VIEWPORTS, enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

async function parkingReady(page: Page) {
  await expect(page.locator("#main-content h1")).toHaveText("Parking", { timeout: 20_000 });
  await expect(page.locator("[data-testid^=parking-lot-card-]").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("parking-best-bet")).toBeVisible();
}

test.describe("parking", () => screenMatrix("parking", ["/parking"], { ready: parkingReady }));

test.describe("parking sheet and reporting", () => {
  test.use({ viewport: VIEWPORTS.phone });

  test("the permit select is labelled, and the sheet snaps to peek, half and full with buttons and announces it", async ({ page }) => {
    await enterDemo(page, "/parking");
    await parkingReady(page);
    await expect(page.getByRole("combobox", { name: "Your permit" })).toHaveAttribute("data-testid", "permit-tier-select");
    const sheet = page.getByTestId("parking-sheet");
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    // The shared map's synced list renders inside the sheet, not beside it (renderPanel).
    await expect(sheet.getByTestId("campus-map-list")).toHaveCount(1);
    const group = page.getByRole("group", { name: "Parking sheet size" });
    for (const [label, snap, words] of [
      ["Half", "half", "opened to half height"],
      ["Full", "full", "opened to full height"],
      ["Peek", "peek", "collapsed to peek"],
    ] as const) {
      const button = group.getByRole("button", { name: label });
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(sheet).toHaveAttribute("data-snap", snap);
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("live-status")).toHaveText(`Parking sheet ${words}`);
    }
  });

  test("arrival strip publishes in one tap, collapses with Undo, and Undo clears it", async ({ page }) => {
    await enterDemo(page, "/parking");
    await parkingReady(page);
    await page.getByTestId("permit-tier-select").selectOption("All");
    const strip = page.getByTestId("arrival-strip");

    // Change the lot through the dialog (role, name, Escape, focus restore).
    const lotButton = strip.getByTestId("arrival-lot-btn");
    await lotButton.click();
    const picker = page.getByRole("dialog", { name: "Where did you park?" });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(lotButton).toBeFocused();

    await lotButton.click();
    await picker.getByRole("button", { name: /North Parking Deck/ }).click();
    await expect(page.getByTestId("live-status")).toHaveText("Arrival strip set to North Parking Deck");
    await expect(lotButton).toContainText("ND");

    await strip.getByTestId("arrival-tier-1").click();
    await expect(strip.getByTestId("arrival-strip-reported")).toContainText("Reported Filling at ND");
    await expect(page.getByTestId("parking-status-banner")).toContainText("North Parking Deck is Filling");
    await expect(page.getByTestId("parking-status-banner")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("parking-lot-status-north-parking-deck")).toContainText("Filling");
    await expect(page.getByTestId("parking-lot-provenance-north-parking-deck")).toContainText("unconfirmed");

    await strip.getByTestId("arrival-undo-btn").click();
    await expect(page.getByTestId("parking-status-banner")).toContainText("undone");
    await expect(strip.getByTestId("arrival-tier-0")).toBeVisible();
    await expect(page.getByTestId("parking-lot-status-north-parking-deck")).toContainText("No recent reports");
  });

  test("zero-report lots are neutral: dashed, no tier and no percentage", async ({ page }) => {
    await enterDemo(page, "/parking");
    await parkingReady(page);
    await page.getByTestId("permit-tier-select").selectOption("All");
    const card = page.locator("[data-testid^=parking-lot-card-][data-status=none]").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("No recent reports");
    await expect(card.locator("[data-status=none]").first()).toHaveClass(/border-dashed/);
    expect(await page.getByTestId("parking-sheet").innerText()).not.toMatch(/\d+\s*%/);
  });

  test("Parking Report dialog opens from the button, traps Escape and restores focus", async ({ page }) => {
    await enterDemo(page, "/parking");
    await parkingReady(page);
    const trigger = page.getByTestId("parking-report-btn");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Parking Report" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Parking Lot")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
