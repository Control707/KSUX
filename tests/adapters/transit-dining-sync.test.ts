import { describe, expect, it } from "vitest";
import {
  runNutrisliceDiningIngestCycle,
  runPassioShuttleIngestCycle,
} from "../../convex/sync/transitDiningSync";
import { evaluateDiningOpenStatus } from "../../convex/lib/parkingMath";
import { parseOfficialDiningHours } from "../../convex/lib/diningFeeds";

describe("Seam 2 — Passio GO & Nutrislice Payload-Hash Gating, >80% Drop Abort & Read-Time Hours (#21)", () => {
  it("uses the published weekday hours and checks full campus closure ranges first", () => {
    const html = [
      "<h2>Fall 2026 Hours of Operation</h2>",
      "<h3>Important Dates</h3><p>Saturday, November 21-Saturday, November 28 | All locations CLOSED</p>",
      "<h2>Kennesaw Campus</h2><h3>The Commons Dining Hall</h3>",
      "<p>Monday – Thursday | 7:00 AM – 9:00 PM</p><p>Friday | 7:00 AM – 7:00 PM</p>",
      "<p>Saturday | 10:30 AM – 7:00 PM</p><p>Sunday | 10:30 AM – 9:00 PM</p>",
    ].join("");
    const [commons] = parseOfficialDiningHours(html, [{ slug: "the-commons", name: "The Commons", campus: "Kennesaw" }]);
    expect(commons).toBeDefined();
    const schedule = commons!.hoursScheduleJson;
    expect(evaluateDiningOpenStatus(schedule, Date.UTC(2026, 10, 16, 13)).state).toBe("open");
    expect(evaluateDiningOpenStatus(schedule, Date.UTC(2026, 10, 20, 1)).state).toBe("open");
    expect(evaluateDiningOpenStatus(schedule, Date.UTC(2026, 10, 21, 1)).state).toBe("closed");
    expect(evaluateDiningOpenStatus(schedule, Date.UTC(2026, 10, 23, 17)).label).toBe("Closed Today");
  });
  it("short-circuits Passio GO snapshot writes as noop_unchanged when payload hash matches", async () => {
    const nowMs = Date.now();
    const mockFetch = async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => "{}",
      json: async () => ({
        entity: url.includes("vehiclePositions") ? [
          {
            id: "v1",
            vehicle: {
              vehicle: { id: "401", label: "BOB #401" },
              trip: { route_id: "74760" },
              position: { latitude: 34.038, longitude: -84.582, bearing: 90 },
            },
          },
        ] : [],
      }),
    });

    const first = await runPassioShuttleIngestCycle({
      syncState: { consecutiveFailures: 0, activeRecordCount: 11 },
      nowMs,
      fetchImpl: mockFetch,
    });
    expect(first.status).toBe("ready_to_upsert");
    if (first.status !== "ready_to_upsert") throw new Error("Expected upsert");

    const second = await runPassioShuttleIngestCycle({
      syncState: {
        consecutiveFailures: 0,
        activeRecordCount: 11,
        lastPayloadHash: first.payloadHash,
      },
      nowMs: nowMs + 120_000,
      fetchImpl: mockFetch,
    });
    expect(second.status).toBe("noop_unchanged");
  });

  it("aborts Nutrislice upserts on empty/>80%-drop payloads and computes Open Now / Closing in Xm / Closed at read time", async () => {
    const dropOutcome = await runNutrisliceDiningIngestCycle({
      syncState: { consecutiveFailures: 2, activeRecordCount: 17 },
      nowMs: Date.now(),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "[]",
        json: async () => [],
      }),
    });
    expect(dropOutcome.status).toBe("failed_or_aborted");
    if (dropOutcome.status === "failed_or_aborted") {
      expect(dropOutcome.failurePatch.consecutiveFailures).toBe(3);
      expect(dropOutcome.failurePatch.backoffUntil).toBeDefined();
    }

    const scheduleJson = JSON.stringify({
      weekdayOpenMin: 420, // 7:00 AM ET
      weekdayCloseMin: 1200, // 8:00 PM ET
      weekendOpenMin: null,
      weekendCloseMin: null,
    });
    // Monday Nov 16, 2026 at 12:00 PM EST (17:00 UTC) -> Open Now
    const noonMon = Date.parse("2026-11-16T17:00:00Z");
    expect(evaluateDiningOpenStatus(scheduleJson, noonMon)).toEqual({
      state: "open",
      label: "Open Now",
    });

    // Monday Nov 16, 2026 at 7:30 PM EST (00:30 UTC Nov 17) -> Closing in 30m
    const closingSoonMon = Date.parse("2026-11-17T00:30:00Z");
    expect(evaluateDiningOpenStatus(scheduleJson, closingSoonMon)).toEqual({
      state: "closing_soon",
      label: "Closing in 30m",
    });
  });
});
