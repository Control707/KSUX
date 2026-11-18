import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { runPassioShuttleIngestCycle } from "../../convex/lib/passio";
import type { UpstreamFetchFn } from "../../convex/lib/syncGuard";
import { createTestConvex } from "../helpers/convexTestEnv";

const header = { gtfs_realtime_version: "2.0", incrementality: 0, timestamp: 1794941657 };
const now = header.timestamp * 1000;
const syncState = { consecutiveFailures: 0, activeRecordCount: 0 };
const liveVehicle = { id: "bus-1", vehicle: {
  position: { latitude: 34, longitude: -84 }, trip: { route_id: "r1" },
} };
const liveAlert = { id: "a1", alert: { header_text: { translation: [{ text: "Detour" }] } } };

function passioFeed(streams: Record<string, unknown> = {}): UpstreamFetchFn {
  return async (url) => {
    const endpoint = url.split("/").at(-1)!.replace(".json", "");
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => streams[endpoint] ?? { header },
    };
  };
}

describe("Passio Shuttle Route snapshots", () => {
  it("normalizes header-only full snapshots and ignores header timestamps when hash gating", async () => {
    const initial = await runPassioShuttleIngestCycle({ syncState, nowMs: now, fetchImpl: passioFeed() });
    expect(initial).toMatchObject({ status: "ready_to_upsert", vehicles: [], stopEtas: [], shuttleNotices: [] });
    if (initial.status !== "ready_to_upsert") throw new Error("Expected an empty full snapshot");

    const next = await runPassioShuttleIngestCycle({
      syncState: { ...syncState, lastPayloadHash: initial.payloadHash }, nowMs: now + 60_000,
      fetchImpl: passioFeed({ serviceAlerts: { header: { ...header, timestamp: header.timestamp + 60 }, entity: [] } }),
    });
    expect(next).toMatchObject({ status: "noop_unchanged", payloadHash: initial.payloadHash });
  });

  it.each([
    { header: { ...header, incrementality: 1 } },
    { header: { ...header, gtfs_realtime_version: "" } },
    { header: { ...header, timestamp: "invalid" } },
    { header, entity: null },
  ])("does not treat a malformed or differential envelope as an empty snapshot (%j)", async (payload) => {
    const fetchImpl = passioFeed({ vehiclePositions: payload, tripUpdates: payload, serviceAlerts: payload });
    const result = await runPassioShuttleIngestCycle({
      syncState: { consecutiveFailures: 2, activeRecordCount: 10 }, nowMs: now, fetchImpl,
    });
    expect(result).toMatchObject({ status: "failed", failurePatch: { consecutiveFailures: 3, backoffUntil: now + 900_000 } });
  });

  it.each([
    ["empty", { header }],
    ["90% smaller", { header, entity: [liveVehicle] }],
  ])("keeps the prior vehicle snapshot on a guarded %s update, but clears withdrawn alerts", async (_label, positions) => {
    const t = createTestConvex();
    const mutation = internal.sync.transitDiningSync.applyShuttleSyncInternal;
    const prev = await runPassioShuttleIngestCycle({
      syncState, nowMs: now - 60_000,
      fetchImpl: passioFeed({
        vehiclePositions: { header, entity: Array.from({ length: 10 }, (_, i) => ({ ...liveVehicle, id: `bus-${i}` })) },
        serviceAlerts: { header, entity: [liveAlert] },
      }),
    });
    if (prev.status !== "ready_to_upsert") throw new Error("Expected the live snapshot");
    await t.mutation(mutation, {
      now: now - 60_000, status: prev.status, payloadHash: prev.payloadHash,
      vehicles: prev.vehicles, stopEtas: prev.stopEtas, shuttleNotices: prev.shuttleNotices,
    });

    const current = await runPassioShuttleIngestCycle({
      syncState: { ...syncState, lastPayloadHash: prev.payloadHash, activeRecordCount: 10 },
      nowMs: now, previousVehicleCount: 10, fetchImpl: passioFeed({ vehiclePositions: positions }),
    });
    if (current.status !== "ready_to_upsert") throw new Error("Expected an independent alert update");
    expect(current.vehicles).toBeUndefined();
    expect(current.shuttleNotices).toEqual([]);
    await t.mutation(mutation, {
      now, status: current.status, payloadHash: current.payloadHash,
      vehicles: current.vehicles, stopEtas: current.stopEtas, shuttleNotices: current.shuttleNotices,
    });

    const snapshot = await t.run(({ db }) => db.query("shuttleSnapshots").unique());
    expect(snapshot?.vehicles).toHaveLength(10);
    expect(snapshot?.vehiclesFetchedAt).toBe(now - 60_000);
    expect(snapshot?.noticesFetchedAt).toBe(now);
    expect(snapshot?.shuttleNotices).toEqual([]);
  });
});
