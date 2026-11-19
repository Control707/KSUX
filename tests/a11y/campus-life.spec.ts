import { expect, test, type Page } from "@playwright/test";
import { screenMatrix } from "./screens";
import { enterDemo } from "./helpers";

/**
 * Study, Dining, Events, Clubs and Course Hubs (issue #74). Event ids are
 * generated per deployment, so look one up from the seeded Convex backend.
 */
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";

async function convexCall(kind: "query" | "mutation", path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = (await res.json()) as { status: string; value: unknown; errorMessage?: string };
  if (body.status !== "success") throw new Error(`${path}: ${body.errorMessage}`);
  return body.value;
}

async function firstEventId(): Promise<string> {
  try {
    const session = (await convexCall("mutation", "demo/session:provisionOrAttachDemoSession", {})) as { shortCode: string };
    const auth = { demoShortCode: session.shortCode, demoPersonaHandle: "maya_cs" };
    const listed = (await convexCall("query", "communities:listEvents", { ...auth, campusOverride: "All KSU" })) as {
      events: { _id: string }[];
    };
    return listed.events[0]?._id ?? "missing-event";
  } catch {
    return "missing-event";
  }
}

const eventId = await firstEventId();

const ROUTES = [
  "/study",
  "/dining",
  "/events",
  "/clubs",
  `/events/${eventId}`,
  "/clubs/acm-ksu",
  "/courses/CS%203305",
] as const;

async function ready(page: Page, route: string) {
  await expect(page.locator("#main-content h1")).toBeVisible({ timeout: 40_000 });
  const lists: Record<string, string> = {
    "/dining": "dining-venue-list",
    "/events": "events-list",
    "/clubs": "clubs-list",
  };
  const listId = lists[route];
  if (listId) await expect(page.getByTestId(listId).locator("li").first()).toBeVisible({ timeout: 40_000 });
  if (route === "/study") await expect(page.getByRole("heading", { name: /Walk-in study spaces/ })).toBeVisible();
  if (route.startsWith("/courses/")) await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible({ timeout: 40_000 });
  if (route.startsWith("/clubs/")) await expect(page.getByTestId("club-profile-view")).toBeVisible({ timeout: 40_000 });
  if (route.startsWith("/events/") && eventId !== "missing-event") {
    await expect(page.getByTestId("event-detail-view")).toBeVisible({ timeout: 40_000 });
  }
}

test.describe("campus-life", () => screenMatrix("campus-life", ROUTES, { ready }));

/** Shared dialog contract: role, accessible name, Escape closes, focus returns to the trigger. */
async function expectDialogContract(page: Page, trigger: ReturnType<Page["getByRole"]>, name: string) {
  await trigger.click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

test.describe("campus-life dialogs", () => {
  test.beforeEach(async ({ page }) => {
    await enterDemo(page);
  });

  test("Study Session host dialog", async ({ page }) => {
    await page.goto("/study");
    await expectDialogContract(page, page.getByRole("button", { name: "Host Study Session" }), "Host a Study Session");
    await page.getByRole("button", { name: "Host Study Session" }).click();
    const dialog = page.getByRole("dialog", { name: "Host a Study Session" });
    await expect(dialog.getByLabel("Session title")).toBeFocused();
    await expect(dialog.getByLabel("Study Room")).toBeVisible();
    await expect(dialog.getByLabel("Who can join")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("Study ?host=1 opens the host dialog", async ({ page }) => {
    await page.goto("/study?host=1");
    await expect(page.getByRole("dialog", { name: "Host a Study Session" })).toBeVisible({ timeout: 40_000 });
  });

  test("Campus Hangout dialog", async ({ page }) => {
    await page.goto("/events");
    await expectDialogContract(page, page.getByRole("button", { name: "Host a Campus Hangout" }), "Host a Campus Hangout");
  });

  test("Community Club dialog and visible Campus filter", async ({ page }) => {
    await page.goto("/clubs");
    await expect(page.getByLabel("Filter Clubs by Campus")).toBeVisible();
    await expectDialogContract(page, page.getByRole("button", { name: "Start a Community Club" }), "Start a Community Club");
  });

  test("private class editor dialog", async ({ page }) => {
    await page.goto("/courses/CS%203305");
    const editor = page.getByRole("region", { name: "Private schedule" });
    await expect(editor.getByRole("button", { name: "Add private class" })).toBeVisible({ timeout: 40_000 });
    await expectDialogContract(page, editor.getByRole("button", { name: "Add private class" }), "New private class");
  });

  test("dining line check is announced and status is not colour alone", async ({ page }) => {
    await page.goto("/dining");
    const list = page.getByTestId("dining-venue-list");
    await expect(list.locator("li").first()).toBeVisible({ timeout: 40_000 });
    const status = page.getByTestId("dining-open-status").first();
    await expect(status.locator("[aria-hidden=true]")).toHaveText(/\S/);
    await expect(status).toHaveText(/[A-Za-z]/);
    await list.getByRole("button", { name: /No wait/ }).first().click();
    await expect(page.getByTestId("toast-status-region")).toContainText("Line check sent: No wait");
  });
});
