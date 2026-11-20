// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SafetyPage from "../../src/app/safety/page";
import SafetyLayout from "../../src/app/safety/layout";
import type { ActiveAuthState } from "../../src/lib/viewerClient";

const viewer = vi.hoisted(() => ({
  auth: { status: "booting" } as ActiveAuthState,
  gate: undefined as { postingEnabled: boolean } | undefined,
  alerts: undefined as unknown,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/safety" }));
vi.mock("@/lib/viewerClient", () => ({
  useViewerClient: () => ({ auth: viewer.auth }),
  useViewerQuery: () => viewer.gate,
  usePublicViewerQuery: () => viewer.alerts,
  useViewerMutation: () => async () => ({}),
}));
const render = () => renderToStaticMarkup(createElement(SafetyLayout, null, createElement(SafetyPage)));
beforeEach(() => { viewer.auth = { status: "booting" }; viewer.gate = undefined; viewer.alerts = undefined; });

it("never exposes real phone handoffs in an offline Judge Demo session", () => {
  viewer.auth = { status: "offline", scope: { mode: "demo", shortCode: "demo", persona: "maya_cs" } };
  const html = render();
  expect(html).toContain("Demo · not real");
  expect(html).not.toMatch(/href="(?:tel|sms):/);
});

it("does not announce a disabled launch before its status has loaded", () => {
  expect(render()).not.toContain("Community Incident posting is unavailable.");
  viewer.gate = { postingEnabled: false };
  expect(render()).toContain("Community Incident posting is unavailable.");
});

it("keeps emergency resources public without requiring a sign-in or gate result", () => {
  viewer.auth = { status: "unauthenticated" };
  const html = render();
  expect(html).toContain('href="tel:911"');
  expect(html).toContain('href="tel:4705786666"');
  expect(html).toContain('href="mailto:police@kennesaw.edu"');
  expect(html).toContain('href="sms:7703563866"');
  expect(html).toContain("OwlSide can’t confirm the call or a police response.");
  expect(html).toContain('href="/"');
  expect(html).toContain("Is anyone in danger right now?");
  expect(html).toContain('href="https://campus.kennesaw.edu/offices-services/livesafe/"');
});

it("shows the Emergency Panel while the session is still booting", () => {
  const html = render();
  expect(html).toContain('href="tel:911"');
  expect(html).toContain('id="main-content"');
  expect(html).toContain("Skip to main content");
});

it("orders Official Alerts first, then the intro, the panel, reporting and Incidents", () => {
  const html = render();
  const order = ["Official Alerts", "What OwlSide Safety is and isn’t", "Is anyone in danger right now?", "Report something you saw", "Community Incidents"]
    .map((text) => html.indexOf(text));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

it("names the source of every official link and keeps the three kinds of help distinct", () => {
  const html = render();
  expect(html).toContain("KSU Police · Timely Warnings");
  expect(html).toContain("KSU Campus Security &amp; Advisories · Emergency Advisory page");
  expect(html).toContain("KSU Office of Emergency Management · KSU Alert (Rave) emergency notifications");
  expect(html).toContain("Not seeing an Alert doesn’t mean campus is safe.");
  expect(html).toContain("Official · KSU Police");
  expect(html).toContain("In-app · OwlSide volunteers");
  expect(html).toContain("Kennesaw Campus");
  expect(html).toContain("Marietta Campus");
  expect(html).toContain('href="/safety/about"');
  expect(html).not.toMatch(/all clear|campus is safe now|verified by/i);
});

it("labels Demo fixtures and shows contact numbers without dialling in Demo", () => {
  viewer.auth = { status: "offline", scope: { mode: "demo", shortCode: "demo", persona: "maya_cs" } };
  const html = render();
  expect(html).toContain("Sample Timely Warning");
  expect(html).toContain("470-578-6206");
  expect(html).not.toContain('href="tel:4705786206"');
  expect(html).toContain("police@kennesaw.edu");
  expect(html).not.toContain('href="mailto:');
});

describe("Official Alert copy (#80)", () => {
  const now = Date.now();
  const source = (overrides: Record<string, unknown>) => ({
    sourceKey: "ksu_timely_warnings", sourceName: "KSU Police", pageTitle: "Timely Warnings page",
    href: "https://campus.kennesaw.edu/offices-services/public-safety-police/notifications/index.php",
    display: "quiet", quietText: "No Timely Warnings at This Time.", lastSuccessAt: now - 60_000, lastAttemptAt: now - 60_000,
    demo: false, items: [], ...overrides,
  });
  const item = {
    _id: "a1", sourceKey: "ksu_timely_warnings", sourceName: "KSU Police", category: "timely_warning",
    headline: "Timely Warning: Robbery", excerpt: "KSU Police are investigating.", campus: null,
    officialIssuedAt: null, officialIssuedText: null, firstObservedAt: now - 120_000, lastSeenAt: now - 60_000,
    state: "issued", stateChangedAt: now - 120_000, noLongerListedAt: null, lifecycle: "current",
    officialUrl: "https://example.test", demoLabel: null, lastSuccessAt: now - 60_000, lastAttemptAt: now - 60_000,
  };
  const withSources = (...sources: unknown[]) => { viewer.auth = { status: "unauthenticated" }; viewer.alerts = { serverNow: now, mode: "display", sources }; };

  it("quotes a quiet source with its check time and never calls it safe", () => {
    withSources(source({}));
    const html = render();
    expect(html).toContain("KSU Police page: “No Timely Warnings at This Time.” Checked");
    expect(html).toContain("Not seeing an Alert doesn’t mean campus is safe.");
    expect(html).not.toMatch(/all safe|all clear/i);
  });

  it("shows an issued Alert with its source, an unknown official time and Campus not specified", () => {
    withSources(source({ display: "ok", items: [item] }));
    const html = render();
    expect(html).toContain("Official · KSU Police · Timely Warning · Issued");
    expect(html).toContain("Unknown: the source doesn’t state a time");
    expect(html).toContain("Campus not specified");
    expect(html).toContain('href="/safety/alerts/a1"');
    expect(html).toContain("Read the full notice on KSU’s page");
  });

  it("labels a copy older than 20 minutes as out of date", () => {
    withSources(source({ display: "ok", items: [item], lastSuccessAt: now - 25 * 60_000 }));
    expect(render()).toContain("OwlSide’s copy is out of date");
  });

  it("falls back to links when OwlSide has switched the copy off", () => {
    withSources(source({ display: "links_only", reason: "kill_switched", items: [] }));
    const html = render();
    expect(html).toContain("OwlSide has switched off its copy of this page for now.");
    expect(html).toContain("official-link-timelyWarnings");
  });

  it("keeps links-only wording while the copy is still in its shadow poll", () => {
    withSources(source({ display: "links_only", reason: "not_enabled" }));
    expect(render()).toContain("OwlSide doesn’t copy official notices yet.");
  });
});
