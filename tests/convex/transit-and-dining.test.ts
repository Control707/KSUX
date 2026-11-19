import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Big Owl Bus Shuttle Routes, 15m Stop Pulses & 17 Dining Venues with 30m Line Checks (#21)", () => {
  it("preserves KM Intercampus Shuttle across Campus switches, decays stop pulses at 15m, filters Dining dietary tags, and enforces 15m Line Check cooldown + 30m decay", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });

    const student = await createVerifiedTestStudent(t, {
      handle: "commuter_owl",
      displayName: "Commuter Owl",
      homeCampus: "Marietta",
    });

    const baseNow = Date.now();
    const mariettaShuttles = await t.query(
      api.transitDining.listShuttleOverview,
      {
        sessionToken: student.sessionToken,
        campusOverride: "Marietta",
        nowOverride: baseNow,
      }
    );
    // KM Kennesaw / Marietta (74760) is ALWAYS preserved under Marietta filter!
    expect(
      mariettaShuttles.routes.some((r) => r.passioRouteId === "74760")
    ).toBe(true);

    // Submit 15m rider stop pulse on Shore Center (Passio stop 223238, first Marietta Loop stop)
    await t.mutation(api.transitDining.submitShuttleStopPulse, {
      sessionToken: student.sessionToken,
      stopId: "223238",
      pulseKind: "long_line",
      nowOverride: baseNow,
    });

    const activePulseCheck = await t.query(
      api.transitDining.listShuttleOverview,
      {
        sessionToken: student.sessionToken,
        campusOverride: "Marietta",
        nowOverride: baseNow + 5 * 60_000,
      }
    );
    const mlRoute = activePulseCheck.routes.find(
      (r) => r.passioRouteId === "74764"
    )!;
    expect(mlRoute.stops[0]?.activePulse?.label).toBe("Long line");

    // Decays cleanly after 15 minutes
    const expiredPulseCheck = await t.query(
      api.transitDining.listShuttleOverview,
      {
        sessionToken: student.sessionToken,
        campusOverride: "Marietta",
        nowOverride: baseNow + 16 * 60_000,
      }
    );
    expect(
      expiredPulseCheck.routes.find((r) => r.passioRouteId === "74764")
        ?.stops[0]?.activePulse
    ).toBeNull();

    // All 17 Dining Venues seeded; dietary filter ("vegan") returns matching venues & stations
    const allDining = await t.query(api.transitDining.listDiningVenues, {
      sessionToken: student.sessionToken,
      campusOverride: "All KSU",
      nowOverride: baseNow,
    });
    expect(allDining.venues).toHaveLength(17);

    const veganDining = await t.query(api.transitDining.listDiningVenues, {
      sessionToken: student.sessionToken,
      campusOverride: "Kennesaw",
      dietaryFilter: "vegan",
      nowOverride: baseNow,
    });
    expect(
      veganDining.venues.some((v) => v.slug === "the-commons")
    ).toBe(true);

    // Submit 30m Line Check + station chip on Stingers; immediate repeat within 15m is rate-limited
    await t.mutation(api.transitDining.submitDiningLineCheck, {
      sessionToken: student.sessionToken,
      venueSlug: "stingers",
      lineTier: "packed",
      stationChips: ["Fresh batch out"],
      nowOverride: baseNow,
    });

    await expect(
      t.mutation(api.transitDining.submitDiningLineCheck, {
        sessionToken: student.sessionToken,
        venueSlug: "stingers",
        lineTier: "no_wait",
        nowOverride: baseNow + 5 * 60_000,
      })
    ).rejects.toThrowError(/1 per 15 minutes/);

    const stingersLive = await t.query(api.transitDining.listDiningVenues, {
      sessionToken: student.sessionToken,
      campusOverride: "Marietta",
      nowOverride: baseNow + 10 * 60_000,
    });
    const stingers = stingersLive.venues.find((v) => v.slug === "stingers")!;
    expect(stingers.lineStatus.label).toBe("Packed 15m+ (Live)");
    expect(stingers.lineStatus.stationChips).toEqual(["Fresh batch out"]);

    // After 31 minutes, falls back cleanly to "Estimated · Typical meal-hour rush"
    const stingersAfter31m = await t.query(api.transitDining.listDiningVenues, {
      sessionToken: student.sessionToken,
      campusOverride: "Marietta",
      nowOverride: baseNow + 31 * 60_000,
    });
    expect(
      stingersAfter31m.venues.find((v) => v.slug === "stingers")?.lineStatus
        .label
    ).toBe("Estimated · Typical meal-hour rush");
  });
});

describe("Transit v2 stop reports, run days and Shuttle Notices (#74)", () => {
  it("relabels stop reports, keeps them anonymous, lets the author Undo, and replaces their earlier report", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const maya = await createVerifiedTestStudent(t, { handle: "stop_reporter", displayName: "Stop Reporter" });
    const other = await createVerifiedTestStudent(t, { handle: "stop_reader", displayName: "Stop Reader" });
    const now = Date.UTC(2026, 10, 17, 19, 0); // Tue 2 PM Eastern

    const first = await t.mutation(api.transitDining.submitShuttleStopPulse, {
      sessionToken: maya.sessionToken, stopId: "361", pulseKind: "stop_clear", nowOverride: now,
    });
    const second = await t.mutation(api.transitDining.submitShuttleStopPulse, {
      sessionToken: maya.sessionToken, stopId: "361", pulseKind: "bus_passed_full", nowOverride: now + 60_000,
    });
    expect(second.pulseId).not.toEqual(first.pulseId);
    expect(second.expiresAt).toBe(now + 60_000 + 15 * 60_000);

    const mine = await t.query(api.transitDining.listShuttleOverview, {
      sessionToken: maya.sessionToken, campusOverride: "Kennesaw", nowOverride: now + 2 * 60_000,
    });
    const rec = mine.routes.find((r) => r.passioRouteId === "74760")!.stops.find((s) => s.stopId === "361")!;
    expect(rec.reports).toEqual([{ kind: "bus_passed_full", label: "Passed full", count: 1, minutesAgo: 1 }]);
    expect(rec.myReport).toMatchObject({ kind: "bus_passed_full", label: "Passed full", pulseId: String(second.pulseId) });

    const theirs = await t.query(api.transitDining.listShuttleOverview, {
      sessionToken: other.sessionToken, campusOverride: "Kennesaw", nowOverride: now + 2 * 60_000,
    });
    const seen = theirs.routes.find((r) => r.passioRouteId === "74760")!.stops.find((s) => s.stopId === "361")!;
    expect(seen.myReport).toBeNull();
    expect(JSON.stringify(seen)).not.toContain(String(maya.studentId));
    await expect(t.mutation(api.transitDining.undoShuttleStopPulse, {
      sessionToken: other.sessionToken, pulseId: second.pulseId,
    })).rejects.toThrow(/not found/i);

    await t.mutation(api.transitDining.undoShuttleStopPulse, { sessionToken: maya.sessionToken, pulseId: second.pulseId });
    const after = await t.query(api.transitDining.listShuttleOverview, {
      sessionToken: maya.sessionToken, campusOverride: "Kennesaw", nowOverride: now + 3 * 60_000,
    });
    const cleared = after.routes.find((r) => r.passioRouteId === "74760")!.stops.find((s) => s.stopId === "361")!;
    expect(cleared.reports).toEqual([]);
    expect(cleared.activePulse).toBeNull();
  });

  it("orders stops, reports run days, and exposes the notice retrieval time", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const student = await createVerifiedTestStudent(t, { handle: "run_days", displayName: "Run Days" });
    const tuesday = Date.UTC(2026, 10, 17, 19, 0);
    const saturday = Date.UTC(2026, 10, 21, 17, 0);
    const tue = await t.query(api.transitDining.listShuttleOverview, {
      sessionToken: student.sessionToken, campusOverride: "Kennesaw", nowOverride: tuesday,
    });
    const ks = tue.routes.find((r) => r.shortName === "KS")!;
    expect(ks.runsToday).toBe(false);
    expect(ks.runDaysLabel).toBe("Fri–Sun");
    expect(tue.routes.find((r) => r.shortName === "KL")!.runsToday).toBe(true);
    for (const r of tue.routes) {
      const seq = r.stops.map((s) => s.sequence);
      expect(seq).toEqual([...seq].sort((a, b) => a - b));
    }
    expect(typeof tue.noticesRetrievedAt).toBe("number");
    const sat = await t.query(api.transitDining.listShuttleOverview, {
      sessionToken: student.sessionToken, campusOverride: "Kennesaw", nowOverride: saturday,
    });
    expect(sat.routes.find((r) => r.shortName === "KS")!.runsToday).toBe(true);
    expect(sat.routes.find((r) => r.shortName === "KL")!.runsToday).toBe(false);
  });
});

describe("Shuttle catalog refresh on re-seed (#31)", () => {
  it("replaces stale stops on an already-seeded route without duplicating it", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: false });
    await t.run(async (ctx) => {
      const km = await ctx.db
        .query("shuttleRoutes")
        .withIndex("by_passio_id", (q) => q.eq("passioRouteId", "74760"))
        .unique();
      await ctx.db.patch(km!._id, {
        stops: [
          { stopId: "stop-01", name: "Old Fake Stop", campus: "Kennesaw", latitude: 34.031, longitude: -84.587, sequence: 1 },
        ],
      });
    });
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: false });
    const rows = await t.run((ctx) =>
      ctx.db.query("shuttleRoutes").withIndex("by_passio_id", (q) => q.eq("passioRouteId", "74760")).collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stops.map((s) => s.stopId)).toEqual(["361", "362", "3884"]);
    expect(rows[0]!.stops.some((s) => s.name === "Old Fake Stop")).toBe(false);
  });
});

describe("Geo catalog refresh on re-seed (#32)", () => {
  it("repoints already-seeded study rooms and meetup spots at the real building data", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: false });
    await t.run(async (ctx) => {
      const room = (await ctx.db.query("studyRooms").collect()).find((r) => r.slug.startsWith("sturgis"))!;
      await ctx.db.patch(room._id, { geoFeatureId: "bldg-k-1" });
      const spot = (await ctx.db.query("meetupSpots").collect())[0]!;
      await ctx.db.patch(spot._id, { latitude: 1, longitude: 1 });
    });
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: false });
    const { rooms, spots } = await t.run(async (ctx) => ({
      rooms: await ctx.db.query("studyRooms").collect(),
      spots: await ctx.db.query("meetupSpots").collect(),
    }));
    expect(rooms.every((r) => !r.geoFeatureId || r.geoFeatureId.startsWith("bldg-osm-"))).toBe(true);
    expect(spots.every((s) => s.latitude > 33 && s.longitude < -84)).toBe(true);
    expect(rooms).toHaveLength(57);
    expect(spots).toHaveLength(14);
  });
});
