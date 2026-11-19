// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

// Onboarding needs a real verified .edu Student, so it can't be reached in
// Judge Demo Mode or the a11y browser suite. Check its markup statically.
vi.mock("@/lib/viewerClient", () => ({
  useViewerClient: () => ({ uploadImage: async () => ({}) }),
  useViewerMutation: () => async () => {},
}));

const { OnboardingFlow } = await import("../../src/components/auth/OnboardingFlow");
const { normaliseOtpInput } = await import("../../src/components/auth/EduOtpModal");

const html = renderToStaticMarkup(createElement(OnboardingFlow));

it("renders exactly one h1 marked as the route heading", () => {
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toMatch(/<h1[^>]*data-route-heading=""[^>]*tabindex="-1"/);
});

it("associates every text input with a label", () => {
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !/type="radio"/.test(tag));
  expect(inputs.length).toBeGreaterThan(0);
  for (const tag of inputs) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    expect(id, tag).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  }
});

it("groups Home Campus radios in a fieldset with a legend", () => {
  expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Home Campus \(required\)<\/legend>/);
  expect(html.match(/type="radio"/g)).toHaveLength(2);
});

it("uses no px text or hex colours", () => {
  expect(html).not.toMatch(/text-\[[0-9.]+px\]|font-size:\s*[0-9.]+px/);
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});

it("normalises a pasted one-time code to six digits", () => {
  expect(normaliseOtpInput("Your code: 123 456")).toBe("123456");
  expect(normaliseOtpInput("12-34-5678")).toBe("123456");
  expect(normaliseOtpInput("abc")).toBe("");
});
