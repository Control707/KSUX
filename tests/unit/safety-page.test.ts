// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import SafetyPage from "../../src/app/safety/page";
import SafetyLayout from "../../src/app/safety/layout";
import type { ActiveAuthState } from "../../src/lib/viewerClient";

const viewer = vi.hoisted(() => ({
  auth: { status: "booting" } as ActiveAuthState,
  gate: undefined as { postingEnabled: boolean } | undefined,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/safety" }));
vi.mock("@/lib/viewerClient", () => ({
  useViewerClient: () => ({ auth: viewer.auth }),
  useViewerQuery: () => viewer.gate,
}));
const render = () => renderToStaticMarkup(createElement(SafetyLayout, null, createElement(SafetyPage)));
beforeEach(() => { viewer.auth = { status: "booting" }; viewer.gate = undefined; });

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
  expect(html).toContain("KSUX can’t confirm the call or a police response.");
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
  const order = ["Official Alerts", "What KSUX Safety is and isn’t", "Is anyone in danger right now?", "Report something you saw", "Community Incidents"]
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
  expect(html).toContain("In-app · KSUX volunteers");
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
