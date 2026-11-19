import { expect, test } from "@playwright/test";
import { THEMES, enterDemo, expectMinTextSize, expectNoSeriousAxe, expectTargetSizes } from "./helpers";

/** The shared "Report to KSUX moderators" dialog, opened from a Feed post in Demo. */

/** Let the dialog fade-in finish so axe doesn't measure contrast mid-animation. */
async function settleAnimations(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

async function openFeedReport(page: import("@playwright/test").Page) {
  await enterDemo(page, "/feed");
  const trigger = page.getByRole("button", { name: "Report to KSUX moderators" }).first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Report to KSUX moderators" });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

for (const theme of THEMES) {
  test(`report dialog · ${theme} · axe, targets and text`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const { dialog } = await openFeedReport(page);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await settleAnimations(page);
    await expectNoSeriousAxe(page, { include: ["[role=dialog]"], label: `report dialog ${theme}` });
    await expectTargetSizes(page, "[role=dialog]", `report dialog ${theme}`);
    await expectMinTextSize(page, "[role=dialog]", `report dialog ${theme}`);
  });
}

test("report dialog groups reasons, labels notes, closes on Escape and restores focus", async ({ page }) => {
  const { trigger, dialog } = await openFeedReport(page);
  const group = dialog.getByRole("group", { name: "Why are you reporting this?" });
  await expect(group.getByRole("radio")).toHaveCount(5);
  await expect(dialog.getByLabel("Notes for moderators (optional)")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("sending a report toasts “Sent to KSUX moderators” in Demo", async ({ page }) => {
  const { dialog } = await openFeedReport(page);
  await dialog.getByRole("radio", { name: /Harassment/ }).check();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByTestId("toast-status-region")).toContainText("Sent to KSUX moderators");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a Campus Safety report shows emergency contacts and keeps them in the confirmation", async ({ page }) => {
  const { dialog } = await openFeedReport(page);
  await dialog.getByRole("radio", { name: /Campus Safety/ }).check();
  await expect(dialog.getByTestId("ksu-police-callout")).toBeVisible();
  await dialog.getByRole("button", { name: "Send report" }).click();
  // The Feed hides a reported post at once, so the toast carries the emergency reminder.
  const toast = page.getByTestId("toast-status-region");
  await expect(toast).toContainText("Sent to KSUX moderators");
  await expect(toast).toContainText("Call 911");
});
