import { expect, test, type Page } from "@playwright/test";
import { enterDemo } from "./helpers";
import { screenMatrix } from "./screens";

/** Opens the first seeded Demo Deal Chat from the inbox (chat ids differ per Demo session). */
async function openFirstDealChat(page: Page) {
  await page.getByTestId("chats-filter-deal").click();
  await page.getByTestId("inbox-row-deal").first().getByRole("link").click();
  await expect(page.getByTestId("deal-handoff-card")).toBeVisible({ timeout: 20_000 });
}

test.describe("chats", () => {
  // "/chats#deal-thread" loads the inbox, then `ready` opens a Deal Chat thread.
  screenMatrix("chats", ["/chats", "/chats#deal-thread"], {
    ready: async (page, route) => {
      await expect(page.locator("[data-testid^=inbox-row-]").first()).toBeVisible({ timeout: 20_000 });
      if (route.endsWith("#deal-thread")) await openFirstDealChat(page);
    },
  });

  test("the thread has a labelled, pinned composer and named icon buttons", async ({ page }) => {
    await enterDemo(page);
    await page.goto("/chats");
    await openFirstDealChat(page);
    const input = page.getByTestId("chat-message-input");
    await expect(input).toHaveAccessibleName(/^Message /);
    await expect(page.getByTestId("chat-composer")).toHaveCSS("position", "sticky");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByTestId("shell-back-btn")).toBeVisible();

    await input.fill("Is it still available?");
    await page.getByTestId("chat-send-btn").click();
    const mine = page.getByTestId("chat-message-bubble").filter({ hasText: "Is it still available?" }).last();
    await expect(mine).toBeVisible();
    await expect(mine.getByTestId("chat-delete-message-btn")).toHaveAccessibleName("Delete your message");
  });

  test("a message from the other person is announced politely while the thread is open", async ({ page, context }) => {
    await enterDemo(page);
    // Co-Test Link opens the same Demo session as the seller persona in a second tab.
    await page.getByTestId("judge-demo-pill").click();
    await page.getByTestId("copy-cotest-link-btn").click();
    const coTestUrl = await page.getByTestId("cotest-link-preview").getAttribute("data-cotest-url");
    expect(coTestUrl).toContain("persona=alex_owl");
    await page.getByTestId("judge-demo-pill").click();

    await page.goto("/chats");
    await openFirstDealChat(page);
    const dealPath = new URL(page.url()).pathname;

    const seller = await context.newPage();
    await seller.goto(coTestUrl!);
    await expect(seller.getByTestId("judge-demo-pill")).toContainText("Alex", { timeout: 20_000 });
    await seller.goto(dealPath);
    await expect(seller.getByTestId("deal-handoff-card")).toBeVisible({ timeout: 20_000 });

    const text = `Still here, meet at 3? ${Date.now()}`;
    await seller.getByTestId("chat-message-input").fill(text);
    await seller.getByTestId("chat-send-btn").click();

    await expect(page.getByTestId("chat-message-bubble").filter({ hasText: text })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("live-status")).toContainText(`New message from @alex_owl: ${text}`);
    // The sender's own tab does not announce their own message.
    await expect(seller.getByTestId("live-status")).not.toContainText(text);
  });
});
