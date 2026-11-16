import { describe, expect, it } from "vitest";
import {
  deduplicateUpstreamEvents,
  runEventsIngestCycle,
} from "../../convex/sync/eventsSync";
import { computeCircuitBackoffMs } from "../../convex/lib/syncGuard";

describe("Seam 2 — Localist + Engage Events Deduplication, Sanity Drop Abort & 3-Strike Circuit Breaker (#19)", () => {
  it("deduplicates Localist and Engage events on (normalized title + start ±15m) with Localist winning ties", () => {
    const startMs = Date.parse("2026-11-19T18:00:00Z");
    const deduped = deduplicateUpstreamEvents(
      [
        {
          externalKey: "localist:901",
          source: "localist",
          campus: "Kennesaw",
          campusScope: "Kennesaw",
          isVirtual: false,
          title: "Scrappy Hour: Hot Cocoa & Trivia!",
          description: "Rich Localist listing",
          locationName: "Carmichael Atrium",
          startTime: startMs,
          endTime: startMs + 7200_000,
        },
      ],
      [
        {
          externalKey: "engage:551",
          source: "engage",
          campus: "Kennesaw",
          campusScope: "Kennesaw",
          isVirtual: false,
          title: "scrappy hour - hot cocoa & trivia",
          description: "Duplicate Engage RSS item 10 minutes off",
          locationName: "Student Center",
          startTime: startMs + 10 * 60_000, // within ±15m!
          endTime: startMs + 7200_000,
        },
        {
          externalKey: "engage:552",
          source: "engage",
          campus: "Marietta",
          campusScope: "Marietta",
          isVirtual: true,
          title: "Virtual OwlHacks Info Session",
          description: "Distinct Engage event",
          locationName: "Online",
          startTime: startMs + 3600_000,
          endTime: startMs + 7200_000,
        },
      ]
    );

    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.externalKey).toBe("localist:901");
    expect(deduped[1]?.externalKey).toBe("engage:552");
    expect(deduped[1]?.campusScope).toBe("Both");
  });

  it("aborts upserts on >80% sudden record drops and trips 15m -> 30m -> 60m exponential backoff on 3rd strike", async () => {
    expect(computeCircuitBackoffMs(1)).toBeUndefined();
    expect(computeCircuitBackoffMs(2)).toBeUndefined();
    expect(computeCircuitBackoffMs(3)).toBe(15 * 60_000);
    expect(computeCircuitBackoffMs(4)).toBe(30 * 60_000);
    expect(computeCircuitBackoffMs(5)).toBe(60 * 60_000);
    expect(computeCircuitBackoffMs(9)).toBe(60 * 60_000);

    const nowMs = Date.now();
    // Simulate upstream returning only 2 events when previous active count was 30 (>80% drop!)
    const outcome = await runEventsIngestCycle({
      syncState: {
        consecutiveFailures: 2, // this failure will be strike #3!
        activeRecordCount: 30,
      },
      nowMs,
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: url.includes("localist") || url.includes("calendar.kennesaw.edu")
            ? [
                {
                  event: {
                    id: 1,
                    title: "Lone Maintenance Notice",
                    event_instances: [
                      { event_instance: { start: "2026-11-20T15:00:00Z" } },
                    ],
                  },
                },
              ]
            : [],
        }),
        text: async () => "<rss><channel></channel></rss>",
      }),
    });

    expect(outcome.status).toBe("failed_or_aborted");
    if (outcome.status === "failed_or_aborted") {
      expect(outcome.reason).toMatch(/>80% drop/);
      expect(outcome.failurePatch.consecutiveFailures).toBe(3);
      expect(outcome.failurePatch.backoffUntil).toBe(nowMs + 15 * 60_000);
    }

    // Subsequent call while backoffUntil > nowMs immediately short-circuits as circuit_open
    const gated = await runEventsIngestCycle({
      syncState: {
        consecutiveFailures: 3,
        backoffUntil: nowMs + 15 * 60_000,
        activeRecordCount: 30,
      },
      nowMs: nowMs + 60_000,
    });
    expect(gated.status).toBe("circuit_open");
  });
});
