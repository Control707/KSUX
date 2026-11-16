import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Big Owl Bus Shuttle Routes, 15m Stop Pulses & 17 Dining Venues with 30m Line Checks (#21)", () => {
  it("preserves KM Intercampus Shuttle across Campus switches, decays stop pulses at 15m, filters Dining dietary tags, and enforces 15m Line Check cooldown + 30m decay", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

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

    // Submit 15m rider stop pulse on stop-23
    await t.mutation(api.transitDining.submitShuttleStopPulse, {
      sessionToken: student.sessionToken,
      stopId: "stop-23",
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
