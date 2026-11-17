import { describe, expect, it } from "vitest";
import { parseLocalistEventsPayload } from "../../convex/sync/eventsSync";
import { runPassioShuttleIngestCycle } from "../../convex/sync/transitDiningSync";

const nowMs = Date.parse("2026-11-17T15:00:00Z");

describe("Campus feed completeness and data provenance", () => {
  it("rejects a malformed successful Passio response instead of replacing a good snapshot", async () => {
    const result = await runPassioShuttleIngestCycle({
      syncState: { consecutiveFailures: 2, activeRecordCount: 11 },
      nowMs,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ message: "Temporarily unavailable" }),
      }),
    });

    expect(result).toMatchObject({ status: "failed" });
  });

  it("avoids publishing a live Shuttle ETA without an arrival time", async () => {
    const result = await runPassioShuttleIngestCycle({
      syncState: { consecutiveFailures: 0, activeRecordCount: 11 },
      nowMs,
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          entity: url.includes("tripUpdates")
            ? [{
                id: "trip-1",
                trip_update: {
                  trip: { route_id: "74760" },
                  stop_time_update: [{ stop_id: "library" }],
                },
              }]
            : url.includes("vehiclePositions")
              ? [{
                  id: "vehicle-1",
                  vehicle: {
                    trip: { route_id: "74760" },
                    position: { latitude: 34, longitude: -84 },
                  },
                }]
              : [],
        }),
      }),
    });

    expect(result).toMatchObject({ status: "ready_to_upsert", stopEtas: [] });
  });

  it("retains each dated instance of a recurring Localist Event with a distinct key", () => {
    const times = ["2026-11-17T18:00:00Z", "2026-11-24T18:00:00Z"];
    const events = parseLocalistEventsPayload({
      events: [{
        event: {
          id: 1,
          title: "Weekly Robotics Workshop",
          event_instances: times.map((start, index) => ({
            event_instance: { id: index + 10, start },
          })),
        },
      }],
    });

    expect(events.map((event) => event.startTime)).toEqual(times.map(Date.parse));
    expect(new Set(events.map((event) => event.externalKey)).size).toBe(2);
  });
});
