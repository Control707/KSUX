import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { easternDate } from "../../convex/lib/easternDate";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Campus commuter data provenance", () => {
  it("preserves a Dining Venue with a matching Tomorrow menu under a dietary filter", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "filtered_menu",
      displayName: "Dining Student",
    });
    const now = Date.now();
    const grainBowl = { name: "Grain bowl", calories: 420, dietaryTags: ["vegan"] };
    await t.run((ctx) => ctx.db.insert("diningVenues", {
      nutrisliceSlug: "workshop-cafe",
      nutrisliceId: 1,
      campus: "Kennesaw",
      venueKind: "retail",
      name: "Workshop Café",
      buildingName: "Library",
      hoursScheduleJson: "{}",
      todayMenuJson: JSON.stringify({ stations: [] }),
      tomorrowMenuJson: JSON.stringify({ stations: [{ name: "Lunch", items: [grainBowl] }] }),
      todayMenuDateET: easternDate(now),
      tomorrowMenuDateET: easternDate(now, 1),
      lastHoursSyncAt: now,
      lastMenuSyncAt: now,
    }));

    const unfiltered = await t.query(api.transitDining.listDiningVenues, { sessionToken });
    expect(unfiltered.venues[0]?.tomorrowStations[0]?.items).toEqual([grainBowl]);
    const filtered = await t.query(api.transitDining.listDiningVenues, {
      sessionToken,
      dietaryFilter: "vegan",
    });
    expect(filtered.venues[0]?.tomorrowStations[0]?.items).toEqual([grainBowl]);
  });

  it("keeps a single Student's latest Parking Report at single-report confidence", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "repeat_parking",
      displayName: "Parking Student",
    });
    const parkingLotId = await t.run((ctx) => ctx.db.insert("parkingLots", {
      slug: "library-parking",
      campus: "Kennesaw",
      name: "Library Parking",
      lotCode: "LIB",
      isDeck: false,
      levels: [],
      permitTiers: [],
      servedByShuttleRouteIds: [],
      overflowTargetLotSlugs: [],
      hourlyBaselinePrior: Array(168).fill(1),
      latitude: 34,
      longitude: -84,
      geoFeatureId: "lot-library",
    }));
    const now = Date.now();
    const report = (fullnessTier: 0 | 3, nowOverride: number) =>
      t.mutation(api.parking.submitParkingReport, {
        sessionToken,
        parkingLotId,
        reportKind: "fullness",
        fullnessTier,
        nowOverride,
      });

    await report(3, now);
    await report(0, now + 11 * 60_000);
    const parking = await t.query(api.parking.listParkingLots, {
      sessionToken,
      nowOverride: now + 12 * 60_000,
    });
    expect(parking.lots[0]).toMatchObject({
      _id: parkingLotId,
      provenanceKind: "single_report",
      effectiveTier: 0,
    });
  });
});
