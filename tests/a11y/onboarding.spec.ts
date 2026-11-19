import { expect, test, type Page } from "@playwright/test";
import {
  THEMES,
  VIEWPORTS,
  expectMinTextSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAxe,
  expectTargetSizes,
} from "./helpers";

/**
 * The signed-out Welcome gate and the KSU .edu sign-in dialog. These screens
 * are only shown outside Judge Demo Mode, so they don't use screenMatrix
 * (which enters Demo first). Onboarding needs a real verified .edu Student and
 * is covered by tests/unit/onboarding-markup.test.ts instead.
 */

/** Let the dialog fade-in finish so axe doesn't measure contrast mid-animation. */
async function settleAnimations(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

async function openWelcome(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("dual-path-welcome")).toBeVisible({ timeout: 30_000 });
}

async function openSignIn(page: Page) {
  await openWelcome(page);
  const trigger = page.getByTestId("welcome-edu-signin-btn");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Sign in with your KSU .edu email" });
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

/** Stub the sign-in API so tests never send email or hit OTP rate limits. */
async function stubAuthApi(page: Page, verify: { status: number; body: unknown }) {
  await page.route("**/api/auth/session", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON() as { operation?: string };
    if (body.operation === "request") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, expiresAt: Date.now() + 600_000 }) });
    }
    return route.fulfill({ status: verify.status, contentType: "application/json", body: JSON.stringify(verify.body) });
  });
}

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`welcome gate · ${theme} · ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await openWelcome(page);
      const label = `/ welcome ${theme} ${viewportName}`;
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "KSUX" })).toBeVisible();
      await expectNoSeriousAxe(page, { label });
      await expectTargetSizes(page, "body", label);
      await expectMinTextSize(page, "body", label);

      await page.getByTestId("welcome-edu-signin-btn").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settleAnimations(page);
      await expectNoSeriousAxe(page, { include: ["[role=dialog]"], label: `${label} sign-in dialog` });
      await expectTargetSizes(page, "[role=dialog]", `${label} sign-in dialog`);
      await expectMinTextSize(page, "[role=dialog]", `${label} sign-in dialog`);
    });
  }
}

test("welcome gate reflows at 320 px and 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openWelcome(page);
  await expectNoHorizontalOverflow(page, "welcome 320px");
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  await expectNoHorizontalOverflow(page, "welcome 200% text");
  await page.getByTestId("welcome-edu-signin-btn").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoHorizontalOverflow(page, "sign-in dialog 200% text");
});

test("sign-in is a modal dialog with focus in, a named Close, Escape and focus restore", async ({ page }) => {
  const { trigger, dialog } = await openSignIn(page);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const email = dialog.getByLabel("KSU email address");
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("type", "email");
  await expect(email).toHaveAttribute("autocomplete", "email");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Close sign-in" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("the code field is a labelled one-time-code input that accepts a pasted code and announces status and errors", async ({ page }) => {
  await stubAuthApi(page, { status: 401, body: { ok: false, message: "That code didn’t match. Check the email and try again." } });
  const { dialog } = await openSignIn(page);
  await dialog.getByLabel("KSU email address").fill("owl@students.kennesaw.edu");
  await dialog.getByRole("button", { name: "Send 6-digit code" }).click();

  await expect(dialog.getByRole("status")).toContainText("Code sent to owl@students.kennesaw.edu");
  const code = dialog.getByLabel("6-digit code");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");

  await code.focus();
  await code.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "Your code: 123 456");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(code).toHaveValue("123456");

  const verify = dialog.getByRole("button", { name: "Verify and sign in" });
  await expect(verify).toBeEnabled();
  await verify.click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText("That code didn’t match");
  await expect(code).toHaveAttribute("aria-invalid", "true");
});

test("a failed code request is announced as an alert", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Use your KSU .edu email address." }) })
      : route.fallback()
  );
  const { dialog } = await openSignIn(page);
  await dialog.getByLabel("KSU email address").fill("owl@example.com");
  await dialog.getByRole("button", { name: "Send 6-digit code" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Use your KSU \.edu email address\./);
});

test("Verify KSU .edu email from the Demo menu opens the same sign-in dialog", async ({ page }) => {
  await page.goto("/?demo=1");
  const pill = page.getByTestId("judge-demo-pill");
  await expect(pill).toBeVisible({ timeout: 30_000 });
  await pill.click();
  await page.getByTestId("verify-edu-from-demo-btn").click();
  await expect(page.getByTestId("dual-path-welcome")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Sign in with your KSU .edu email" })).toBeVisible();
});
