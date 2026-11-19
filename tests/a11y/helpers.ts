import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;
export const THEMES = ["light", "dark"] as const;

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Enter Judge Demo Mode once and wait for the shell. */
export async function enterDemo(page: Page, path = "/") {
  const url = new URL(path, "http://x");
  url.searchParams.set("demo", "1");
  await page.goto(url.pathname + url.search);
  const pill = page.getByTestId("judge-demo-pill");
  try {
    await expect(pill).toBeVisible({ timeout: 30_000 });
  } catch {
    // A cold `next dev` compile or a busy local Convex can stall the first
    // Demo provision; one reload is enough to recover.
    await page.reload();
    await expect(pill).toBeVisible({ timeout: 30_000 });
  }
}

/**
 * Axe with WCAG 2.0/2.1/2.2 A+AA tags. Passes with zero serious or critical
 * violations inside the given scopes. Legacy screen bodies are excluded until
 * Phase 1A migrates them (docs/accessibility/migration.md).
 */
export async function expectNoSeriousAxe(page: Page, opts: { include?: string[]; exclude?: string[]; label: string }) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of opts.include ?? []) builder = builder.include(selector);
  for (const selector of opts.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")}: ${n.failureSummary}`).join(" | ")}`);
  expect(summary, `axe serious/critical violations · ${opts.label}`).toEqual([]);
}

/** Every visible interactive element in scope is at least 44×44 CSS px. */
export async function expectTargetSizes(page: Page, scope: string, label: string) {
  const small = await page.locator(scope).evaluateAll((roots) => {
    const selector = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link]";
    const out: string[] = [];
    for (const root of roots) {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        if (el.closest("[data-testid=campus-map-canvas]")) continue; // map pins are exempt
        if (el.closest("[data-target-exempt]")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (el.closest(".sr-only") && !el.matches(":focus")) continue;
        // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
        if (el.tagName === "A" && style.display === "inline") continue;
        if (rect.width < 43.5 || rect.height < 43.5) {
          out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
    }
    return out;
  });
  expect(small, `targets under 44 px · ${label}`).toEqual([]);
}

/** No rendered text below 13 px in scope. */
export async function expectMinTextSize(page: Page, scope: string, label: string) {
  const tiny = await page.locator(scope).evaluateAll((roots) => {
    const out: string[] = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        const parent = node.parentElement;
        if (!text || !parent) continue;
        if (parent.closest(".sr-only,[aria-hidden=true],[data-testid=campus-map-canvas]")) continue;
        const rect = parent.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size < 12.95) out.push(`"${text.slice(0, 30)}" ${size}px`);
      }
    }
    return out;
  });
  expect(tiny, `text under 13 px · ${label}`).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const details = overflow > 1 ? await page.locator("body *").evaluateAll((nodes) => nodes.flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= document.documentElement.clientWidth + 1) return [];
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowX)) return [];
      parent = parent.parentElement;
    }
    return [`${el.tagName.toLowerCase()}.${el.className} right=${Math.round(r.right)}: ${(el.textContent ?? "").slice(0, 60)}`];
  }).slice(0, 15)) : [];
  expect(overflow, `horizontal overflow · ${label}\n${details.join("\n")}`).toBeLessThanOrEqual(1);
}

/** The scope for shared shell chrome (everything but a legacy screen body). */
export const SHELL_CHROME = ["header", "nav[aria-label=Main]", "nav[aria-label=Destinations]", "aside[data-testid=desktop-campus-pulse-rail]"];
