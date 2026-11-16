import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Clubs Directory, Officer Claiming & Hybrid KSU + Student Events (#19)", () => {
  it("auto-approves matching .edu Engage contact email on Claim Officer Role, routes non-matching claims to Moderation Queue, and isolates Community Clubs", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

    const acmPresident = await createVerifiedTestStudent(t, {
      email: "acm@students.kennesaw.edu",
      handle: "acm_pres",
      displayName: "ACM President",
    });
    const regularMember = await createVerifiedTestStudent(t, {
      email: "member@students.kennesaw.edu",
      handle: "regular_owl",
      displayName: "Regular Owl",
    });

    const acmProfile = await t.query(api.communities.getClubBySlug, {
      sessionToken: acmPresident.sessionToken,
      slug: "acm-ksu",
    });
    expect(acmProfile).not.toBeNull();
    const acmClubId = acmProfile!.club._id;

    // Matching Engage contactEmailCanonical auto-approves officer immediately
    const autoClaim = await t.mutation(api.communities.claimClubOfficerRole, {
      sessionToken: acmPresident.sessionToken,
      clubId: acmClubId,
    });
    expect(autoClaim.status).toBe("auto_approved");
    expect(autoClaim.role).toBe("officer");

    // Non-matching .edu email routes to Moderation Queue as pending_officer_claim
    const queuedClaim = await t.mutation(api.communities.claimClubOfficerRole, {
      sessionToken: regularMember.sessionToken,
      clubId: acmClubId,
    });
    expect(queuedClaim.status).toBe("routed_to_moderation");
    expect(queuedClaim.role).toBe("pending_officer_claim");

    // Non-officer cannot publish a Club Event; approved officer can!
    const now = Date.now();
    await expect(
      t.mutation(api.communities.createNativeEvent, {
        sessionToken: regularMember.sessionToken,
        clubId: acmClubId,
        title: "Unauthorized Club Event",
        description: "Test",
        campus: "Kennesaw",
        isVirtual: false,
        locationName: "Clendenin 1009",
        startTime: now + 3600_000,
        endTime: now + 7200_000,
      })
    ).rejects.toThrowError(/Only Club Officers/);

    await t.mutation(api.communities.createNativeEvent, {
      sessionToken: acmPresident.sessionToken,
      clubId: acmClubId,
      title: "ACM Systems Programming Workshop",
      description: "Rust & Linux kernel intro",
      campus: "Kennesaw",
      isVirtual: false,
      locationName: "Clendenin 1009",
      startTime: now + 3600_000,
      endTime: now + 7200_000,
    });

    // Judge Demo Mode Community Club creation stays strictly isolated from "prod"
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );
    const demoClub = await t.mutation(api.communities.createCommunityClub, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      name: "Demo Trail Owls",
      campus: "Kennesaw",
      summary: "Demo hiking group",
      description: "Demo hiking group",
    });

    const prodLookupDemoClub = await t.query(api.communities.getClubBySlug, {
      sessionToken: regularMember.sessionToken,
      slug: demoClub.slug,
    });
    expect(prodLookupDemoClub).toBeNull();
  });

  it("filters Virtual Events under both Kennesaw and Marietta, isolates Demo RSVPs, and marks missing RSVPed synced Events Cancelled Upstream", async () => {
    const t = createTestConvex();
    const now = Date.now();

    const student = await createVerifiedTestStudent(t, {
      handle: "rsvp_owl",
      displayName: "RSVP Owl",
      homeCampus: "Marietta",
    });
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );

    // Sync two initial KSU events: 1 Virtual (Kennesaw origin -> campusScope Both) + 1 Marietta in-person
    await t.mutation(internal.sync.eventsSync.applySyncedEventsInternal, {
      now,
      status: "ready_to_upsert",
      payloadHash: "hash-1",
      events: [
        {
          externalKey: "localist:virtual-career-1",
          source: "localist",
          campus: "Kennesaw",
          campusScope: "Both",
          isVirtual: true,
          title: "KSU Virtual Tech Career Prep",
          description: "Online resume workshop",
          locationName: "Microsoft Teams",
          startTime: now + 2 * 3600_000,
          endTime: now + 4 * 3600_000,
        },
        {
          externalKey: "engage:marietta-robotics-1",
          source: "engage",
          campus: "Marietta",
          campusScope: "Marietta",
          isVirtual: false,
          title: "Marietta Robotics Demo Day",
          description: "Atrium courtyard",
          locationName: "Atrium J",
          startTime: now + 3 * 3600_000,
          endTime: now + 5 * 3600_000,
        },
      ],
    });

    // Virtual Event appears under BOTH Kennesaw and Marietta Campus filters!
    const kennesawView = await t.query(api.communities.listEvents, {
      sessionToken: student.sessionToken,
      campusOverride: "Kennesaw",
    });
    const mariettaView = await t.query(api.communities.listEvents, {
      sessionToken: student.sessionToken,
      campusOverride: "Marietta",
    });
    expect(
      kennesawView.events.some((e) => e.title === "KSU Virtual Tech Career Prep")
    ).toBe(true);
    expect(
      mariettaView.events.some((e) => e.title === "KSU Virtual Tech Career Prep")
    ).toBe(true);

    const roboticsEventId = mariettaView.events.find(
      (e) => e.title === "Marietta Robotics Demo Day"
    )!._id;

    // Demo RSVP overlays in demo workspace WITHOUT mutating "ksu" prodGoingCount!
    await t.mutation(api.communities.setEventRsvp, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "jordan_me",
      eventId: roboticsEventId,
      rsvpStatus: "going",
    });
    const rawAfterDemoRsvp = await t.run((ctx) => ctx.db.get(roboticsEventId));
    expect(rawAfterDemoRsvp?.prodGoingCount).toBe(0);

    // Prod Student RSVPs Going -> prodGoingCount = 1
    await t.mutation(api.communities.setEventRsvp, {
      sessionToken: student.sessionToken,
      eventId: roboticsEventId,
      rsvpStatus: "going",
    });

    // Next sync omits Marietta Robotics Demo Day while it still has an active RSVP -> transitions to cancelled_upstream (non-destructive)!
    const secondSync = await t.mutation(
      internal.sync.eventsSync.applySyncedEventsInternal,
      {
        now: now + 60_000,
        status: "ready_to_upsert",
        payloadHash: "hash-2",
        events: [
          {
            externalKey: "localist:virtual-career-1",
            source: "localist",
            campus: "Kennesaw",
            campusScope: "Both",
            isVirtual: true,
            title: "KSU Virtual Tech Career Prep (Room Updated)",
            description: "Online resume workshop",
            locationName: "Microsoft Teams",
            startTime: now + 2 * 3600_000,
            endTime: now + 4 * 3600_000,
          },
        ],
      }
    );
    expect(secondSync.cancelledUpstream).toBe(1);

    const detailAfterCancel = await t.query(api.communities.getEventDetail, {
      sessionToken: student.sessionToken,
      eventId: roboticsEventId,
    });
    expect(detailAfterCancel?.event.status).toBe("cancelled_upstream");
    expect(detailAfterCancel?.myRsvpStatus).toBe("going");
  });
});
