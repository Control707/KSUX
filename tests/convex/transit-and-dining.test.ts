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
