import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Study Rooms (48-bit LibCal SWR + Walk-in Vibes) & Study Sessions (#22)", () => {
  beforeEach(() => {
    process.env.KSUX_SKIP_LIBCAL_SCHEDULER = "true";
  });

  it("enforces single-flight 60s SWR lease locking, 45m walk-in vibe decay, atomic maxSeats, and Course Hub Members Only gating", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

    const maya = await createVerifiedTestStudent(t, {
      handle: "study_maya",
      displayName: "Maya Study",
      homeCampus: "Kennesaw",
    });
    const classmate = await createVerifiedTestStudent(t, {
      handle: "study_peer",
      displayName: "Classmate",
      homeCampus: "Kennesaw",
    });
    const outsider = await createVerifiedTestStudent(t, {
      handle: "study_outsider",
      displayName: "Outsider",
      homeCampus: "Kennesaw",
    });

    const baseNow = Date.now();

    // Advance past 5m SWR TTL: 1st caller acquires 60s single-flight lease; concurrent 2nd caller is gated!
    const lease1 = await t.mutation(api.study.triggerStudySwrRefresh, {
      sessionToken: maya.sessionToken,
      nowOverride: baseNow + 6 * 60_000,
    });
    expect(lease1.acquired).toBe(true);

    const lease2 = await t.mutation(api.study.triggerStudySwrRefresh, {
      sessionToken: classmate.sessionToken,
      nowOverride: baseNow + 6 * 60_000 + 10_000,
    });
    expect(lease2.acquired).toBe(false);
    expect(lease2.reason).toBe("lease_already_held");

    // Walk-in 45m crowd vibe check
    await t.mutation(api.study.submitWalkInVibe, {
      sessionToken: maya.sessionToken,
      roomSlug: "alc-2nd-floor-atrium",
      vibe: "quiet",
      nowOverride: baseNow,
    });
    const checkActiveVibe = await t.query(
      api.study.listStudyRoomsAndSessions,
      {
        sessionToken: maya.sessionToken,
        campusOverride: "Kennesaw",
        nowOverride: baseNow + 10 * 60_000,
      }
    );
    expect(
      checkActiveVibe.rooms.find((r) => r.slug === "alc-2nd-floor-atrium")
        ?.vibe?.label
    ).toBe("Quiet");

    const checkExpiredVibe = await t.query(
      api.study.listStudyRoomsAndSessions,
      {
        sessionToken: maya.sessionToken,
        campusOverride: "Kennesaw",
        nowOverride: baseNow + 46 * 60_000,
      }
    );
    expect(
      checkExpiredVibe.rooms.find((r) => r.slug === "alc-2nd-floor-atrium")
        ?.vibe
    ).toBeNull();

    // Enroll Maya & Classmate in CS 3305; Outsider is NOT enrolled
    await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken: maya.sessionToken,
      termCode: "202608",
      crn: "83190",
    });
    const enrPeer = await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken: classmate.sessionToken,
      termCode: "202608",
      crn: "83190",
    });

    const sturgisRoom = checkActiveVibe.rooms.find(
      (r) => r.roomKind === "libcal"
    )!;

    // Host a Course Hub Members Only Study Session with maxSeats = 2 & libcalHostConfirmed = false
    const hosted = await t.mutation(api.study.createStudySession, {
      sessionToken: maya.sessionToken,
      studyRoomId: sturgisRoom._id,
      title: "CS 3305 Trees Practice",
      visibility: "course_members_only",
      courseHubId: enrPeer.courseHubId,
      startTime: baseNow + 15 * 60_000,
      endTime: baseNow + 75 * 60_000,
      maxSeats: 2,
      libcalHostConfirmed: false,
    });

    // Outsider cannot see or join a Course Hub Members Only session
    const outsiderView = await t.query(api.study.listStudyRoomsAndSessions, {
      sessionToken: outsider.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow,
    });
    expect(outsiderView.sessions).toHaveLength(0);
    await expect(
      t.mutation(api.study.toggleStudySessionAttendance, {
        sessionToken: outsider.sessionToken,
        sessionId: hosted.sessionId,
      })
    ).rejects.toThrowError(/Only Students enrolled in this Course Hub/);

    // Enrolled Classmate sees unreservedLibCalWarning = true and joins seat 2/2
    const peerView = await t.query(api.study.listStudyRoomsAndSessions, {
      sessionToken: classmate.sessionToken,
      campusOverride: "Kennesaw",
      nowOverride: baseNow,
    });
    expect(peerView.sessions).toHaveLength(1);
    expect(peerView.sessions[0]?.unreservedLibCalWarning).toBe(true);

    const joined = await t.mutation(api.study.toggleStudySessionAttendance, {
      sessionToken: classmate.sessionToken,
      sessionId: hosted.sessionId,
    });
    expect(joined.seatCount).toBe(2);

    // 3rd enrolled Student attempting to join 2/2 session hits atomic maxSeats cap!
    const thirdEnrolled = await createVerifiedTestStudent(t, {
      handle: "study_third",
      displayName: "Third Classmate",
    });
    await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken: thirdEnrolled.sessionToken,
      termCode: "202608",
      crn: "83190",
    });
    await expect(
      t.mutation(api.study.toggleStudySessionAttendance, {
        sessionToken: thirdEnrolled.sessionToken,
        sessionId: hosted.sessionId,
      })
    ).rejects.toThrowError(/All 2 seats in this Study Session are currently filled/);
  });
});
