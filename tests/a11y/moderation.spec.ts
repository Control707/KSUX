import { expect, test } from "@playwright/test";
import { enterDemo, THEMES, VIEWPORTS, expectMinTextSize, expectNoHorizontalOverflow, expectNoSeriousAxe, expectTargetSizes } from "./helpers";
import { screenMatrix } from "./screens";

screenMatrix("moderation sections", ["/moderation", "/moderation?section=appeals", "/moderation?section=log", "/profile/moderation"]);

for (const theme of THEMES) for (const [size, viewport] of Object.entries(VIEWPORTS)) test(`Held photo review and confirms · ${theme} · ${size}`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(viewport); await page.emulateMedia({ colorScheme: theme });
  await enterDemo(page, "/moderation");
  await page.getByTestId("judge-demo-pill").click(); await page.getByTestId("persona-switch-alex_owl").click();
  await page.getByTestId("moderation-row").filter({ hasText: "▧ Held photo" }).click();
  const show = page.getByRole("button", { name: "Show photo", exact: true });
  await expect(show).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("img", { name: "Held Incident photo for Moderator review" })).toHaveCount(0);
  await show.click(); await expect(page.getByRole("button", { name: "Hide photo", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Held Incident photo for Moderator review" })).toBeVisible();
  await expectNoSeriousAxe(page, { label: `Held photo ${theme} ${size}` });
  await expectTargetSizes(page, "body", "Held photo review"); await expectMinTextSize(page, "body", "Held photo review");
  for (const action of ["Approve", "Approve with blur", "Reject"]) {
    const trigger = page.getByRole("button", { name: action, exact: true }); await trigger.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await dialog.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)); });
    await expectNoSeriousAxe(page, { label: `Photo ${action} confirm` });
    await expectTargetSizes(page, '[role="alertdialog"]', "Photo confirm");
    await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: "html{font-size:200% !important} *{font-family:Verdana,'DejaVu Sans',sans-serif !important;letter-spacing:.02em}" });
  await expectNoHorizontalOverflow(page, "Held photo 320px / 200%");
  await page.getByRole("button", { name: "Approve with blur", exact: true }).click();
  await expectNoHorizontalOverflow(page, "Photo blur confirm 320px / 200%");
});

for (const theme of THEMES) for (const [size, viewport] of Object.entries(VIEWPORTS)) test(`Moderator review and confirms · ${theme} · ${size}`, async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(viewport); await page.emulateMedia({ colorScheme: theme });
  await enterDemo(page, "/moderation");
  await page.getByTestId("judge-demo-pill").click(); await page.getByTestId("persona-switch-alex_owl").click();
  const row = page.getByTestId("moderation-row").filter({ hasText: "◆ Identifies me" });
  await row.click();
  await expect(page.getByRole("heading", { name: /^Review ◆/ })).toBeFocused();
  await expect(page.getByTestId("moderation-queue-view")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByTestId("mobile-bottom-nav")).toHaveCount(0);
  await expect(page).toHaveTitle(/KSUX/);
  await expectNoSeriousAxe(page, { label: `review ${theme} ${size}` });
  await expectTargetSizes(page, "body", "review"); await expectMinTextSize(page, "body", "review");
  const trigger = page.getByRole("button", { name: "Redact", exact: true }); await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("Exact words").fill("identifying detail");
  await dialog.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)); });
  await expectNoSeriousAxe(page, { label: "redaction confirm" }); await expectTargetSizes(page, '[role="alertdialog"]', "confirm");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).focus();
  await page.keyboard.press("Tab"); await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 700 });
  const textStyle = await page.addStyleTag({ content: "html{font-size:200% !important} *{font-family:Verdana,'DejaVu Sans',sans-serif !important;letter-spacing:.02em}" });
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "");
  await expectNoHorizontalOverflow(page, "redaction confirm at 320px / 200%");
  await textStyle.evaluate((el) => el.parentNode?.removeChild(el)); await page.setViewportSize(viewport);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Cancelled. Nothing changed." }).first()).toBeAttached();
  await page.keyboard.press("Escape"); await expect(row).toBeFocused();
  await row.click(); await page.getByRole("button", { name: "Back to queue", exact: true }).click(); await expect(row).toBeFocused();
  await page.getByRole("link", { name: "Action log", exact: true }).click();
  await expect(page.getByRole("table")).toHaveAccessibleName("Moderator actions · latest 200 entries");
  await expect(page.getByRole("region", { name: "Moderator action log, scroll horizontally" })).toHaveAttribute("tabindex", "0");
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: "html{font-size:200% !important} *{font-family:Verdana,'DejaVu Sans',sans-serif !important;letter-spacing:.02em}" });
  await expect(page.locator("html")).toHaveAttribute("data-large-text", "");
  await expectNoHorizontalOverflow(page, "log 320px / 200%");
});
