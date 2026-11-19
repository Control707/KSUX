import { expect, test, type Page } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

/** KSU-wide search and the private Saved view (#77). */
async function ready(page: Page, route: string) {
  await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 20_000 });
  if (route.startsWith("/search?q=")) {
    await expect(page.getByTestId("search-status")).toHaveText(/result|No results/, { timeout: 20_000 });
  }
  if (route === "/saved") {
    await expect(page.getByTestId("saved-list").or(page.getByTestId("saved-empty"))).toBeVisible({ timeout: 20_000 });
  }
}

test.describe("search and saved", () =>
  screenMatrix("search", ["/search", "/search?q=calculator", "/search?q=zzqxnomatch", "/saved"], { ready }));

test("keyboard users reach Search from the header and open a grouped result", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/");
  const link = page.getByTestId("header-search-link");
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search/);
  const input = page.getByRole("searchbox", { name: /Buildings, Events/ });
  await expect(page.locator("#main-content h1")).toBeFocused();
  // The search field is the first focusable control after the route heading.
  await expect.poll(async () => {
    await page.locator("#main-content h1").focus();
    await page.keyboard.press("Tab");
    return input.evaluate((el) => el === document.activeElement);
  }, { timeout: 10_000 }).toBe(true);
  await input.fill("calculator");
  const listings = page.getByRole("region", { name: /Marketplace Listings/ });
  await expect(listings.getByRole("link").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("search-status")).toHaveText(/result/);

  await page.getByRole("button", { name: "Marietta" }).click();
  await expect(page.getByTestId("search-status")).toHaveText(/result|No results/);

  await page.getByRole("searchbox").fill("zzqxnomatch");
  await expect(page.getByTestId("search-status")).toHaveText(/No results/);
});

test("Saved lists the Demo persona's bookmarks, filters and removes one", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/saved");
  // The Demo fixtures bookmark the TI-84 Listing for maya_cs.
  await page.getByRole("button", { name: "Listings" }).click();
  await expect(page.getByTestId("saved-list")).toContainText("TI-84", { timeout: 20_000 });
  const items = page.getByTestId("saved-item");
  const before = await items.count();
  await items.first().getByRole("button", { name: /Remove/ }).click();
  await expect(items).toHaveCount(before - 1);
});
