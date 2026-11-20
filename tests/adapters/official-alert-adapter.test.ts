// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADVISORY_QUIET_TEXT, fetchSource, officialAlertPushPayload, parseEmergencyAdvisoryPage, parseTimelyWarningsPage,
  MIN_SHADOW_MS, retryAfterMs, shadowGatePassed, shadowWindowMs, SHADOW_MS, type PageFetch,
} from "../../convex/lib/officialAlerts";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/official-alerts", name), "utf8");

describe("KSU Police Timely Warnings page", () => {
  it("quotes the quiet state in the source's own words", () => {
    expect(parseTimelyWarningsPage(fixture("timely-warnings-quiet.html")))
      .toEqual({ kind: "quiet", quietText: "No Timely Warnings at This Time." });
  });

  it("parses an issued warning with its stated time, named Campus and a bounded excerpt", () => {
    const result = parseTimelyWarningsPage(fixture("timely-warnings-issued.html"));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item).toMatchObject({
      category: "timely_warning", headline: "Timely Warning: Robbery near Chastain Pointe",
      officialIssuedText: "November 18, 2026 at 9:40 p.m.", campus: "Kennesaw", allClear: false,
    });
    expect(new Date(item!.officialIssuedAt!).toISOString()).toBe("2026-11-19T02:40:00.000Z");
    expect(item!.excerpt.length).toBeLessThanOrEqual(280);
  });

  it("keeps the item key across an update and changes only its content hash", () => {
    const issued = parseTimelyWarningsPage(fixture("timely-warnings-issued.html"));
    const updated = parseTimelyWarningsPage(fixture("timely-warnings-updated.html"));
    if (issued.kind !== "ok" || updated.kind !== "ok") throw new Error("expected ok");
    expect(updated.items[0]!.itemKey).toBe(issued.items[0]!.itemKey);
    expect(updated.items[0]!.contentHash).not.toBe(issued.items[0]!.contentHash);
  });

  it("recognises a quoted all clear", () => {
    const result = parseTimelyWarningsPage(fixture("timely-warnings-all-clear.html"));
    expect(result.kind === "ok" && result.items[0]!.allClear).toBe(true);
  });

  it("treats a changed layout as unrecognized, never as quiet", () => {
    expect(parseTimelyWarningsPage(fixture("timely-warnings-changed-layout.html")).kind).toBe("unrecognized");
  });

  it("treats a truncated page as unavailable, not as a state change", () => {
    expect(parseTimelyWarningsPage(fixture("timely-warnings-partial.html")).kind).toBe("unavailable");
  });

  it("never states an issued time the source didn't give", () => {
    const html = fixture("timely-warnings-quiet.html").replace(
      /<p style="text-align: left;">[\s\S]*?<\/p>/,
      "<h2>Timely Warning: Theft from vehicle</h2><p>KSU Police are investigating a theft. Campus not stated.</p>");
    const result = parseTimelyWarningsPage(html);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.items[0]!.officialIssuedAt).toBeUndefined();
      expect(result.items[0]!.campus).toBeUndefined();
    }
  });
});

describe("KSU Emergency Advisory page", () => {
  it("is quiet when only the fixed contact block is present", () => {
    expect(parseEmergencyAdvisoryPage(fixture("emergency-advisory-quiet.html")))
      .toEqual({ kind: "quiet", quietText: ADVISORY_QUIET_TEXT });
  });

  it("parses a posted notice and the Campus it names", () => {
    const result = parseEmergencyAdvisoryPage(fixture("emergency-advisory-issued.html"));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.items[0]).toMatchObject({ category: "emergency_advisory", campus: "Marietta" });
      expect(result.items[0]!.officialIssuedAt).toBeUndefined();
    }
  });

  it("is unrecognized when the fixed contact block changes", () => {
    expect(parseEmergencyAdvisoryPage(fixture("emergency-advisory-changed-layout.html")).kind).toBe("unrecognized");
  });
});

describe("fetching", () => {
  const respond = (status: number, body: string, headers: Record<string, string> = {}): PageFetch => async () => ({
    status, ok: status >= 200 && status < 300, headers: { get: (n) => headers[n.toLowerCase()] ?? null }, text: async () => body,
  });

  it("honours Retry-After on an error and reports unavailable", async () => {
    const now = Date.UTC(2026, 10, 19);
    await expect(fetchSource("ksu_timely_warnings", now, respond(503, "", { "retry-after": "120" })))
      .resolves.toEqual({ kind: "unavailable", reason: "HTTP 503", retryAfterMs: 120_000 });
    expect(retryAfterMs(new Date(now + 30_000).toUTCString(), now)).toBe(30_000);
    expect(retryAfterMs("999999", now)).toBe(60 * 60_000);
  });

  it("maps a network error to unavailable", async () => {
    const failing: PageFetch = async () => { throw new Error("ECONNRESET"); };
    await expect(fetchSource("ksu_emergency_advisories", 0, failing)).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("parses a fetched page", async () => {
    await expect(fetchSource("ksu_timely_warnings", 0, respond(200, fixture("timely-warnings-quiet.html"))))
      .resolves.toMatchObject({ kind: "quiet" });
  });
});

it("names the source, never the content, in the push payload", () => {
  const payload = officialAlertPushPayload("ksu_timely_warnings", "abc", false)!;
  expect(payload).toEqual({
    title: "OwlSide · Official Alert", body: "KSU Police posted a new Timely Warning",
    href: "/safety/alerts/abc", tag: "owlside-official-alert-abc",
  });
  expect(JSON.stringify(payload)).not.toMatch(/urgent|robbery/i);
});

it("passes the shadow gate only after 14 signed-off days with zero unrecognized results", () => {
  expect(shadowGatePassed({})).toBe(false);
  expect(shadowGatePassed({ shadowStartedAt: 0, shadowSignedOffAt: SHADOW_MS - 1 })).toBe(false);
  expect(shadowGatePassed({ shadowStartedAt: 0, shadowSignedOffAt: SHADOW_MS, shadowUnrecognizedCount: 1 })).toBe(false);
  expect(shadowGatePassed({ shadowStartedAt: 0, shadowSignedOffAt: SHADOW_MS })).toBe(true);
});

it("lets a maintainer shorten the shadow window to no less than an hour, and records it per source", () => {
  expect(shadowWindowMs(undefined)).toBe(SHADOW_MS);
  expect(shadowWindowMs("nonsense")).toBe(SHADOW_MS);
  expect(shadowWindowMs("2")).toBe(2 * 60 * 60_000);
  expect(shadowWindowMs("0.1")).toBe(MIN_SHADOW_MS);
  expect(shadowWindowMs("1000")).toBe(SHADOW_MS);
  const hour = { shadowStartedAt: 0, shadowSignedOffAt: MIN_SHADOW_MS, shadowWindowMs: MIN_SHADOW_MS };
  expect(shadowGatePassed(hour)).toBe(true);
  // A stored window below the floor is still held to an hour.
  expect(shadowGatePassed({ ...hour, shadowWindowMs: 1, shadowSignedOffAt: 30 * 60_000 })).toBe(false);
  expect(shadowGatePassed({ ...hour, shadowSignedOffAt: MIN_SHADOW_MS - 1 })).toBe(false);
  expect(shadowGatePassed({ ...hour, shadowUnrecognizedCount: 1 })).toBe(false);
});
