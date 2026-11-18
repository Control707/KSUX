// Throwaway UX/a11y baseline audit (#45). Not product code; never merged.
// Usage: node audit/run-audit.mjs  (expects next dev on :3000 + local Convex on :3210)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.resolve("audit");
const AXE = fs.readFileSync(process.env.AXE_PATH ?? "/tmp/ksux-axe/node_modules/axe-core/axe.min.js", "utf8");
for (const d of ["screenshots/mobile", "screenshots/desktop", "screenshots/zoom200", "axe"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const STATIC = ["/", "/feed", "/marketplace", "/chats", "/scrappy", "/parking", "/study", "/transit", "/dining", "/profile", "/moderation", "/clubs", "/events"];
const DYNAMIC = [
  { from: "/chats", re: /^\/chats\/[^/?#]+$/, name: "chats-[chatId]" },
  { from: "/clubs", re: /^\/clubs\/[^/?#]+$/, name: "clubs-[slug]" },
  { from: "/events", re: /^\/events\/[^/?#]+$/, name: "events-[eventId]" },
  { from: "/feed", re: /^\/courses\/[^/?#]+$/, name: "courses-[subjectCourse]" },
];

const slug = (r) => (r === "/" ? "now" : r.slice(1).replace(/\//g, "-"));
const results = [];

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // wait for client "Loading ..." placeholders to resolve (Convex queries), max 30s
  await page.waitForFunction(() => !/\bLoading\b[^\n]{0,40}(\.\.\.|…)/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 30000 }).catch(() => console.log("  (still loading after 30s: " + page.url() + ")"));
  await page.waitForTimeout(1500);
  // hide Next.js dev-tools badge so it does not pollute screenshots/scans (dev-only artifact)
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
}

async function axe(page, name) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return {
      violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags, count: v.nodes.length, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, summary: n.failureSummary })) })),
      incomplete: res.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })),
    };
  });
  fs.writeFileSync(path.join(OUT, "axe", `${name}.json`), JSON.stringify(r, null, 2));
  return r;
}

// Manual-style probes run in-page: small targets, unlabeled controls, focus visibility, tab order sample, overflow at zoom.
async function probes(page) {
  return page.evaluate(() => {
    const interactive = [...document.querySelectorAll("a[href],button,input,select,textarea,[role=button],[tabindex]:not([tabindex='-1'])")].filter((el) => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    });
    const small = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; });
    const under44 = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44; });
    const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("alt") || "").trim().slice(0, 40);
    return {
      interactiveCount: interactive.length,
      targetsUnder24: small.length,
      targetsUnder44: under44.length,
      smallExamples: small.slice(0, 6).map((el) => `${el.tagName.toLowerCase()}[${label(el)}] ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
      hasMain: !!document.querySelector("main,[role=main]"),
      h1Count: document.querySelectorAll("h1").length,
      lang: document.documentElement.lang,
      title: document.title,
      canvasCount: document.querySelectorAll("canvas").length,
      liveRegions: document.querySelectorAll("[aria-live],[role=status],[role=alert]").length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      animatedEls: [...document.querySelectorAll("*")].filter((el) => { const s = getComputedStyle(el); return s.animationName !== "none" && s.animationDuration !== "0s"; }).length,
    };
  });
}

async function focusWalk(page, steps = 25) {
  await page.evaluate(() => document.activeElement?.blur());
  const seq = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    seq.push(await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return { tag: "body" };
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      const visibleRing = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      return { tag: el.tagName.toLowerCase(), name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), visibleRing, inView: r.bottom > 0 && r.top < innerHeight, testid: el.getAttribute("data-testid") };
    }));
  }
  const ids = seq.map((s) => `${s.tag}:${s.testid ?? s.name}`);
  const unique = new Set(ids).size;
  return { steps: seq.length, unique, noVisibleRing: seq.filter((s) => s.tag !== "body" && !s.visibleRing).length, offscreen: seq.filter((s) => s.tag !== "body" && !s.inView).length, possibleTrap: unique <= 3, first: ids.slice(0, 8) };
}

async function auditRoute(ctxs, route, name) {
  const entry = { route, name };
  // mobile
  {
    const page = ctxs.mobile.page; await page.goto(BASE + route); await settle(page);
    await page.screenshot({ path: path.join(OUT, "screenshots/mobile", `${name}.png`), fullPage: true });
    entry.mobileAxe = await axe(page, `${name}.mobile`);
    entry.mobileProbes = await probes(page);
    entry.focus = await focusWalk(page);
  }
  // desktop
  {
    const page = ctxs.desktop.page; await page.goto(BASE + route); await settle(page);
    await page.screenshot({ path: path.join(OUT, "screenshots/desktop", `${name}.png`), fullPage: false });
    entry.desktopAxe = await axe(page, `${name}.desktop`);
  }
  // 200% text zoom approximation: double root font-size at 390px (WCAG 1.4.4 resize text)
  {
    const page = ctxs.mobile.page;
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "screenshots/zoom200", `${name}.png`), fullPage: false });
    entry.zoom200 = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      clippedText: [...document.querySelectorAll("p,span,h1,h2,h3,button,a,label")].filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible").length,
    }));
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  results.push(entry);
  console.log(`✓ ${name}: mobile ${entry.mobileAxe.violations.length} rules, desktop ${entry.desktopAxe.violations.length} rules`);
}

const browser = await chromium.launch();
const mk = async (opts) => { const context = await browser.newContext(opts); const page = await context.newPage(); return { context, page }; };

// --- Welcome gate (signed out) ---
{
  const anon = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = anon.page;
  await p.goto(BASE + "/"); await settle(p);
  await p.screenshot({ path: path.join(OUT, "screenshots/mobile", "welcome.png"), fullPage: true });
  const w = { route: "/ (signed out)", name: "welcome", mobileAxe: await axe(p, "welcome.mobile"), mobileProbes: await probes(p), focus: await focusWalk(p) };
  // OTP modal
  await p.goto(BASE + "/"); await settle(p);
  await p.getByTestId("welcome-edu-signin-btn").click(); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, "screenshots/mobile", "otp-modal.png"), fullPage: false });
  const o = { route: "/ (OTP modal)", name: "otp-modal", mobileAxe: await axe(p, "otp-modal.mobile"), mobileProbes: await probes(p), focus: await focusWalk(p, 15) };
  // Escape closes?
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  o.escapeCloses = (await p.getByTestId("edu-otp-modal").count()) === 0;
  o.dialogRole = await p.evaluate(() => !!document.querySelector("[role=dialog],dialog"));
  results.push(w, o);
  await anon.context.close();
}

// --- Demo contexts ---
const ctxs = {
  mobile: await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  desktop: await mk({ viewport: { width: 1440, height: 900 } }),
};
for (const c of Object.values(ctxs)) { await c.page.goto(BASE + "/?demo=1"); await c.page.getByTestId("judge-demo-pill").waitFor({ timeout: 30000 }); await settle(c.page); }

for (const r of STATIC) await auditRoute(ctxs, r, slug(r));
for (const d of DYNAMIC) {
  const p = ctxs.mobile.page; await p.goto(BASE + d.from); await settle(p);
  const href = await p.evaluate((src) => { const re = new RegExp(src); return [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => re.test(h)); }, d.re.source);
  let target = href;
  if (!target && d.name === "chats-[chatId]") { await p.locator("[data-testid^=inbox-row]").first().click().catch(() => {}); await p.waitForTimeout(2000); const u = new URL(p.url()); if (d.re.test(u.pathname)) target = u.pathname; }
  if (!target && d.name === "clubs-[slug]") { await p.goto(BASE + "/feed"); await settle(p); target = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /^\/clubs\/[^/?#]+$/.test(h))); }
  if (target) await auditRoute(ctxs, target, d.name); else { console.log(`✗ ${d.name}: no link found on ${d.from}`); results.push({ route: d.name, name: d.name, missing: `no link found on ${d.from}` }); }
}

// Quick Sheet
{
  const p = ctxs.mobile.page; await p.goto(BASE + "/"); await settle(p);
  await p.getByTestId("center-quick-sheet-btn").click(); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, "screenshots/mobile", "quick-sheet.png"), fullPage: false });
  const q = { route: "Quick Sheet", name: "quick-sheet", mobileAxe: await axe(p, "quick-sheet.mobile"), mobileProbes: await probes(p), focus: await focusWalk(p, 20) };
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  q.escapeCloses = (await p.getByTestId("quick-sheet-overlay").count()) === 0 || !(await p.getByTestId("quick-sheet-overlay").isVisible());
  results.push(q);
}

// Reduced motion check on Now
{
  const rm = await mk({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await rm.page.goto(BASE + "/?demo=1"); await rm.page.getByTestId("judge-demo-pill").waitFor({ timeout: 30000 }); await settle(rm.page);
  const animated = await rm.page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => { const s = getComputedStyle(el); return s.animationName !== "none" && s.animationDuration !== "0s" && s.animationIterationCount === "infinite"; }).map((el) => el.className.toString().slice(0, 60)));
  results.push({ route: "/ (prefers-reduced-motion)", name: "reduced-motion", infiniteAnimationsUnderReduce: animated.length, examples: animated.slice(0, 8) });
  await rm.context.close();
}

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
console.log("done");
