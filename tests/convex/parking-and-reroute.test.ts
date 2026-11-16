import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Parking Lots, 45m Recency Decay, Outlier Trimming, Spot Opening & Rerouting (#20)", () => {
  it("enforces 10m per-lot report cooldowns, 45m decay into 168-hr priors, >=3-report outlier trimming, 2-vote Gone clearing, and overflow Shuttle rerouting", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

    const s1 = await createVerifiedTestStudent(t, {
      handle: "park_one",
      displayName: "Driver One",
      homeCampus: "Kennesaw",
    });
    const s2 = await createVerifiedTestStudent(t, {
      handle: "park_two",
      displayName: "Driver Two",
      homeCampus: "Kennesaw",
    });
    const s3 = await createVerifiedTestStudent(t, {
      handle: "park_three",
      displayName: "Driver Three",
      homeCampus: "Kennesaw",
    });

    const baseNow = Date.now();

    // 0 active reports -> provenance is "Estimated · Typical ... class load"
    const initial = await t.query(api.parking.listParkingLots, {
      sessionToken: s1.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow,
    });
    expect(initial.lots).toHaveLength(44);
    const central = initial.lots.find(
      (l) => l.slug === "central-parking-deck"
    )!;
    expect(central.provenanceKind).toBe("baseline_prior");
    expect(central.provenanceLabel).toMatch(/Estimated · Typical/);

    // Pin up to 2 favorite lots; 3rd pin rejected
    const eastDeck = initial.lots.find((l) => l.slug === "east-parking-deck")!;
    const northDeck = initial.lots.find(
      (l) => l.slug === "north-parking-deck"
    )!;
    await t.mutation(api.parking.saveParkingPreferences, {
      sessionToken: s1.sessionToken,
      togglePinLotId: central._id,
    });
    await t.mutation(api.parking.saveParkingPreferences, {
      sessionToken: s1.sessionToken,
      togglePinLotId: eastDeck._id,
    });
    await expect(
      t.mutation(api.parking.saveParkingPreferences, {
        sessionToken: s1.sessionToken,
        togglePinLotId: northDeck._id,
      })
    ).rejects.toThrowError(/up to 2 favorite Parking Lots/);

    // s1 submits Full (3) on Central Deck; immediate 2nd report within 10m is rate-limited
    await t.mutation(api.parking.submitParkingReport, {
      sessionToken: s1.sessionToken,
      parkingLotId: central._id,
      reportKind: "fullness",
      fullnessTier: 3,
      deckLevel: "P4",
      nowOverride: baseNow,
    });
    await expect(
      t.mutation(api.parking.submitParkingReport, {
        sessionToken: s1.sessionToken,
        parkingLotId: central._id,
        reportKind: "fullness",
        fullnessTier: 2,
        nowOverride: baseNow + 2 * 60_000,
      })
    ).rejects.toThrowError(/1 per 10 minutes/);

    // 1 report blends 70/30 with prior ("Live · 1 Student report")
    const afterOne = await t.query(api.parking.listParkingLots, {
      sessionToken: s1.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow + 60_000,
    });
    const centralAfterOne = afterOne.lots.find(
      (l) => l.slug === "central-parking-deck"
    )!;
    expect(centralAfterOne.provenanceKind).toBe("blended_single");

    // s2 also reports Full (3), while s3 submits a lone troll Open (0) within 20m -> outlier trimmed, stays Full (3) + triggers Overflow Shuttle Reroute!
    await t.mutation(api.parking.submitParkingReport, {
      sessionToken: s2.sessionToken,
      parkingLotId: central._id,
      reportKind: "fullness",
      fullnessTier: 3,
      nowOverride: baseNow + 2 * 60_000,
    });
    await t.mutation(api.parking.submitParkingReport, {
      sessionToken: s3.sessionToken,
      parkingLotId: central._id,
      reportKind: "fullness",
      fullnessTier: 0, // lone outlier >= 2 tiers from median 3!
      nowOverride: baseNow + 3 * 60_000,
    });

    const afterThree = await t.query(api.parking.listParkingLots, {
      sessionToken: s1.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow + 4 * 60_000,
    });
    const centralVerified = afterThree.lots.find(
      (l) => l.slug === "central-parking-deck"
    )!;
    expect(centralVerified.provenanceKind).toBe("verified_multi");
    expect(centralVerified.effectiveTier).toBe(3);
    expect(centralVerified.overflowReroute?.slug).toBe(
      "town-point-economy-lot"
    );
    expect(centralVerified.overflowReroute?.shuttleRouteName).toBe(
      "Economy Route"
    );

    // After 46 minutes, reports decay back to baseline_prior with zero status-flip crons!
    const after46m = await t.query(api.parking.listParkingLots, {
      sessionToken: s1.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow + 49 * 60_000,
    });
    expect(
      after46m.lots.find((l) => l.slug === "central-parking-deck")
        ?.provenanceKind
    ).toBe("baseline_prior");

    // 10-minute Spot Opening pulse: clears after 2 distinct Gone votes
    const opening = await t.mutation(api.parking.submitParkingReport, {
      sessionToken: s1.sessionToken,
      parkingLotId: central._id,
      reportKind: "spot_opening",
      deckLevel: "P2",
      nowOverride: baseNow,
    });

    const vote1 = await t.mutation(api.parking.resolveSpotOpening, {
      sessionToken: s2.sessionToken,
      reportId: opening.reportId,
    });
    expect(vote1.cleared).toBe(false);
    expect(vote1.goneVotes).toBe(1);

    const vote2 = await t.mutation(api.parking.resolveSpotOpening, {
      sessionToken: s3.sessionToken,
      reportId: opening.reportId,
    });
    expect(vote2.cleared).toBe(true);
    expect(vote2.goneVotes).toBe(2);

    const afterClear = await t.query(api.parking.listParkingLots, {
      sessionToken: s1.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow + 60_000,
    });
    expect(
      afterClear.lots.find((l) => l.slug === "central-parking-deck")
        ?.spotOpenings
    ).toHaveLength(0);
  });
});
