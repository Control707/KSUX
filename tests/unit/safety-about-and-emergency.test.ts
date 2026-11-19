// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import AboutKsuxSafetyPage from "../../src/app/safety/about/page";
import EmergencyPage from "../../src/app/emergency/page";
import { KSU_SOURCES } from "../../src/components/safety/safetyContent";

vi.mock("next/navigation", () => ({ usePathname: () => "/emergency" }));

it("About KSUX Safety lists the never-claims and the independence statement", () => {
  const html = renderToStaticMarkup(createElement(AboutKsuxSafetyPage));
  expect(html).toContain("KSUX is an independent student project, not operated or endorsed by Kennesaw State University.");
  for (const phrase of ["isn’t 911", "isn’t monitored 24/7", "isn’t official KSU", "aren’t verified", "doesn’t contact police"]) {
    expect(html).toContain(phrase);
  }
});

it("the precached /emergency page carries static contacts and both offline lines, never a status", () => {
  const html = renderToStaticMarkup(createElement(EmergencyPage));
  expect(html).toContain('href="tel:911"');
  expect(html).toContain("Offline: can’t check official sources.");
  expect(html).toContain("Offline: can’t load community Incidents.");
  expect(html).toContain("470-578-6206");
  expect(html).toContain(KSU_SOURCES.liveSafe.href);
  expect(html).not.toMatch(/No Timely Warnings|Checked \d/);
});

it("only links to official KSU https pages", () => {
  for (const s of Object.values(KSU_SOURCES)) {
    expect(new URL(s.href).protocol).toBe("https:");
    expect(new URL(s.href).hostname).toMatch(/(^|\.)kennesaw\.edu$/);
  }
});
