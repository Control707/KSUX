// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  DEMO_CALL_INTERCEPT_SCRIPT,
  DEMO_HANDOFF_COPY,
  EmergencyPanel,
} from "../../src/components/safety/EmergencyPanel";

const render = (mode: "live" | "demo", onContinue?: () => void) =>
  renderToStaticMarkup(createElement(EmergencyPanel, { mode, onContinue }));

describe("Emergency Panel", () => {
  it("offers 911, KSU Police by phone and by text, with honest copy and no auto-dial", () => {
    const html = render("live");
    expect(html).toContain("Is anyone in danger right now?");
    expect(html).toContain("OwlSide can’t send help and doesn’t contact police.");
    const order = ["tel:911", "tel:4705786666", "sms:7703563866"].map((href) => html.indexOf(`href="${href}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("answered 24/7");
    expect(html).toContain("deaf, hard of hearing");
    expect(html).toContain("outside OwlSide");
    expect(html).not.toMatch(/<audio|autoplay|window\.location/i);
    expect(html).not.toMatch(/Sent to police|Help is on the way|monitoring/i);
  });

  it("puts the community path last", () => {
    const html = render("live", () => {});
    expect(html.indexOf("Not an emergency · post to the community")).toBeGreaterThan(html.indexOf("sms:7703563866"));
  });

  it("dials and texts nothing in Judge Demo Mode", () => {
    const html = render("demo");
    expect(html).toContain("Demo · not real");
    expect(html).not.toMatch(/href="(?:tel|sms):/);
  });

  it("intercepts tel:, sms: and mailto: taps in a Demo tab before hydration", () => {
    const listeners: ((event: any) => void)[] = [];
    const status = { textContent: "" };
    const panel = { querySelector: () => status };
    const link = { closest: (selector: string) => (selector.startsWith("[data-emergency-panel]") ? panel : link) };
    const dispatchEvent = vi.fn();
    const run = (demo: boolean) => {
      listeners.length = 0;
      runInNewContext(DEMO_CALL_INTERCEPT_SCRIPT, {
        document: { addEventListener: (_: string, fn: (event: any) => void) => listeners.push(fn), dispatchEvent },
        sessionStorage: { getItem: () => (demo ? "abc123" : null) },
        location: { search: "" },
        URLSearchParams,
        CustomEvent: class { constructor(public type: string) {} },
      });
      const event = { target: link, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      listeners[0]!(event);
      return event;
    };

    expect(run(false).preventDefault).not.toHaveBeenCalled();
    const demoTap = run(true);
    expect(demoTap.preventDefault).toHaveBeenCalled();
    expect(status.textContent).toBe(DEMO_HANDOFF_COPY);
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(DEMO_CALL_INTERCEPT_SCRIPT).toContain('a[href^="mailto:"]');
  });
});
