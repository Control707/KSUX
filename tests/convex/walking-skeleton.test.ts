import { TEST_SERVER_SECRET, reserveTestUpload } from "../helpers/authTest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Walking Skeleton viewerContext & Judge Demo Mode Isolation (#14)", () => {
  beforeEach(() => { vi.stubEnv("OWLSIDE_SERVER_SECRET", TEST_SERVER_SECRET); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("seeds published Banner sections and retires legacy synthetic campus observations", async () => {
    const t = createTestConvex();
    const now = Date.UTC(2026, 10, 17, 16);
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true, now });
    await t.mutation(internal.seed.bootstrapKsu, { now });
    await t.mutation(internal.seed.bootstrapKsu, { now });
    const data = await t.run(async ({ db }) => {
      const course = await db.query("courseHubs").withIndex("by_subject_course", (q) => q.eq("subjectCourse", "CS 3305")).unique();
      const section = await db.query("courseSections")
        .withIndex("by_term_crn", (q) => q.eq("termCode", "202608").eq("crn", "83190")).unique();
      return {
        course,
        section,
        shuttle: await db.query("shuttleSnapshots").first(),
        study: await db.query("studyRoomSnapshots").first(),
        sampleEvent: await db.query("events").first(),
        sampleClub: await db.query("clubs").first(),
      };
    });
    expect(data.course).toMatchObject({ catalogSource: "banner_verified", prodEnrollmentCount: 0 });
    expect(data.section).toMatchObject({ campus: "Marietta", meetings: [{ startMinutes: 670 }] });
    expect(data.shuttle).toBeNull();
    expect(data.study).toBeNull();
    expect(data.sampleEvent?.visibilityStatus).toBe("removed");
    expect(data.sampleClub?.visibilityStatus).toBe("removed");
  });

  it("rejects unauthenticated callers on viewerQuery and viewerMutation", async () => {
    const t = createTestConvex();

    await expect(
      t.query(api.shell.shellSummary, {})
    ).rejects.toThrowError(/Sign in with KSU \.edu email or enter Judge Demo Mode/);

    await expect(
      t.mutation(api.shell.setCampusFilter, {
        campusFilter: "Marietta",
      })
    ).rejects.toThrowError(/Sign in with KSU \.edu email or enter Judge Demo Mode/);

    await expect(
      reserveTestUpload(t, {
        fileKey: "unauth-key",
        url: "https://utfs.io/f/unauth",
        purpose: "post",
        byteSize: 2048,
        width: 800,
        height: 600,
      })
    ).rejects.toThrowError(/Sign in with KSU \.edu email or enter Judge Demo Mode/);
  });

  it("enforces two-way isolation between prod Students, concurrent demoSessionIds, and immutable ksu catalogs", async () => {
    const t = createTestConvex();

    // Seed an immutable "ksu" parking lot and club
    const { ksuClubId } = await t.run(async (ctx) => {
      await ctx.db.insert("parkingLots", {
        slug: "central-parking-deck",
        campus: "Kennesaw",
        name: "Central Parking Deck",
        lotCode: "CD",
        isDeck: true,
        levels: ["P1", "P2", "P3", "P4", "P5", "Roof"],
        permitTiers: ["Central", "Commuter"],
        servedByShuttleRouteIds: ["74761"],
        overflowTargetLotSlugs: [],
        hourlyBaselinePrior: Array.from({ length: 168 }, () => 1),
        latitude: 34.0379,
        longitude: -84.5811,
        geoFeatureId: "lot-central-parking-deck",
      });
      const cid = await ctx.db.insert("clubs", {
        workspaceKey: "ksu",
        slug: "acm-ksu",
        clubKind: "registered_ksu",
        campus: "Kennesaw",
        name: "Association for Computing Machinery at KSU",
        summary: "KSU computing community",
        description: "Official KSU ACM chapter",
        searchText: "ACM Association for Computing Machinery KSU",
        prodMemberCount: 42,
        visibilityStatus: "visible",
      });
      return { ksuClubId: cid };
    });

    const prodStudent = await createVerifiedTestStudent(t, {
      handle: "real_owl",
      displayName: "Real KSU Student",
      homeCampus: "Kennesaw",
    });

    const demoA = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      { preferredPersona: "maya_cs" }
    );
    const demoB = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      { preferredPersona: "maya_cs" }
    );

    expect(demoA.shortCode).not.toBe(demoB.shortCode);

    const summaryProd = await t.query(api.shell.shellSummary, {
      sessionToken: prodStudent.sessionToken,
    });
    const summaryDemoA = await t.query(api.shell.shellSummary, {
      demoShortCode: demoA.shortCode,
      demoPersonaHandle: "maya_cs",
    });
    const summaryDemoAAlex = await t.query(api.shell.shellSummary, {
      demoShortCode: demoA.shortCode,
      demoPersonaHandle: "alex_owl",
    });

    expect(summaryProd.viewer.workspaceKey).toBe("prod");
    expect(summaryDemoA.viewer.workspaceKey).toBe(`demo:${demoA.demoSessionId}`);
    expect(summaryDemoAAlex.viewer.student.handle).toBe("alex_owl");
    // Raw canonical .edu email must NEVER be exposed on student profile views
    expect("canonicalEmail" in summaryProd.viewer.student).toBe(false);

    // Prod student does NOT see demo parking reports or demo unread messages
    expect(summaryProd.unread.numericUnreadCount).toBe(0);
    expect(summaryDemoA.unread.numericUnreadCount).toBeGreaterThan(0);
    expect(
      summaryProd.campusPulse.parkingLots[0]?.activeReportCount
    ).toBe(0);
    expect(
      summaryDemoA.campusPulse.parkingLots[0]?.activeReportCount
    ).toBeGreaterThanOrEqual(2);

    // Immutable "ksu" club prodMemberCount remains untouched by Judge Demo Mode provisioning
    const ksuClubAfter = await t.run(async (ctx) => ctx.db.get(ksuClubId));
    expect(ksuClubAfter?.prodMemberCount).toBe(42);
  });

  it("caps Judge Demo Mode media uploads at 20 per demoSessionId and cleanly resets demo state", async () => {
    const t = createTestConvex();
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );

    // Switch Maya's campus filter to Marietta, then upload 20 WebP assets
    await t.mutation(api.shell.setCampusFilter, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      campusFilter: "Marietta",
    });

    for (let i = 0; i < 20; i++) {
      await t.mutation(api.uploads.registerMediaAsset, await reserveTestUpload(t, {
        demoShortCode: demo.shortCode,
        demoPersonaHandle: "maya_cs",
        fileKey: `demo-asset-${i}`,
        url: `https://utfs.io/f/demo-asset-${i}.webp`,
        purpose: "post",
        byteSize: 40_000,
        width: 1024,
        height: 768,
      }));
    }

    // 21st upload is rejected by viewerContext 20-upload quota
    await expect(
      reserveTestUpload(t, {
        demoShortCode: demo.shortCode,
        demoPersonaHandle: "maya_cs",
        fileKey: "demo-asset-20",
        url: "https://utfs.io/f/demo-asset-20.webp",
        purpose: "post",
        byteSize: 40_000,
        width: 1024,
        height: 768,
      })
    ).rejects.toThrowError(/capped at 20 image uploads/);

    // Reset Demo State restores clean fixtures and resets uploadCount to 0 without changing shortCode
    const resetResult = await t.mutation(api.demo.session.resetDemoWorkspace, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
    });
    expect(resetResult.shortCode).toBe(demo.shortCode);

    const infoAfterReset = await t.query(
      api.demo.session.getDemoWorkspaceInfo,
      {
        demoShortCode: demo.shortCode,
        demoPersonaHandle: "maya_cs",
      }
    );
    expect(infoAfterReset?.uploadCount).toBe(0);
    expect(
      infoAfterReset?.personas.find((p) => p.handle === "maya_cs")
        ?.activeCampusFilter
    ).toBe("Kennesaw");
  });

  it("idempotently bootstraps all KSU institutional catalogs and scopes Now HUD across Campus switches", async () => {
    const t = createTestConvex();

    const firstSeed = await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    expect(firstSeed.parkingInserted).toBe(72);
    expect(firstSeed.studyRoomsInserted).toBe(57);
    expect(firstSeed.shuttleInserted).toBe(11);
    expect(firstSeed.diningInserted).toBe(17);
    expect(firstSeed.clubsInserted).toBe(544);
    expect(firstSeed.meetupInserted).toBe(14);
    expect(firstSeed.hubsInserted).toBeGreaterThanOrEqual(100);
    expect(firstSeed.sectionsInserted).toBeGreaterThanOrEqual(400);

    // Re-running bootstrapKsu is 100% idempotent
    const secondSeed = await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    expect(secondSeed.parkingInserted).toBe(0);
    expect(secondSeed.clubsInserted).toBe(0);

    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      { preferredPersona: "maya_cs" }
    );

    const hudKennesaw = await t.query(api.shell.getNowHud, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
    });
    expect(hudKennesaw.campusFilter).toBe("Kennesaw");
    expect(hudKennesaw.parkingCards.every((p) => p.campus === "Kennesaw")).toBe(
      true
    );
    expect(
      hudKennesaw.parkingCards[0]?.overflowSuggestion?.slug
    ).toBe("town-point-economy-lot");
    expect(
      hudKennesaw.shuttleCards.some((r) => r.passioRouteId === "74760")
    ).toBe(true);
    expect(hudKennesaw.schedule.enrolledCourses.length).toBe(2);

    // Switch Campus to Marietta: local Parking/Dining scope to Marietta, while enrolled Course Hubs & KM Shuttle persist!
    await t.mutation(api.shell.setCampusFilter, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      campusFilter: "Marietta",
    });

    const hudMarietta = await t.query(api.shell.getNowHud, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
    });
    expect(hudMarietta.campusFilter).toBe("Marietta");
    expect(hudMarietta.parkingCards.every((p) => p.campus === "Marietta")).toBe(
      true
    );
    expect(hudMarietta.diningCards.every((d) => d.campus === "Marietta")).toBe(
      true
    );
    expect(
      hudMarietta.shuttleCards.some((r) => r.passioRouteId === "74760")
    ).toBe(true);
    expect(hudMarietta.schedule.enrolledCourses.length).toBe(2);
  });
});
