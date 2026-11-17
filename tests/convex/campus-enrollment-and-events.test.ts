import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Campus membership and Event workflows", () => {
  it("reuses an enrollment and its Course Hub Group Chat on repeated enrollment", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "repeat_enrollment",
      displayName: "Enrollment Student",
    });
    const enroll = () =>
      t.mutation(api.courses.enrollInCourseHub, {
        sessionToken,
        termCode: "202608",
        crn: "83190",
      });

    const first = await enroll();
    expect(await enroll()).toEqual(first);
    expect(await t.run((ctx) => ctx.db.get(first.groupChatId))).toMatchObject({
      memberCount: 1,
    });
    const schedule = await t.query(api.courses.getMyPrivateSchedule, { sessionToken });
    expect(schedule.map((entry) => entry.crn)).toEqual(["83190"]);
  });

  it("clears the former section and CRN when enrolling in a new term without a section", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "term_change",
      displayName: "Term Change Student",
    });
    const enrollment = await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken,
      termCode: "202608",
      crn: "83190",
    });
    await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken,
      courseHubId: enrollment.courseHubId,
      termCode: "202701",
    });

    const schedule = await t.query(api.courses.getMyPrivateSchedule, {
      sessionToken,
      termCode: "202701",
    });
    expect(schedule[0]?.section).toBeNull();
    expect(schedule[0]?.crn).toBeUndefined();
  });

  it("keeps the Course Hub Group Chat member count in sync when a Student leaves", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "course_departure",
      displayName: "Departing Student",
    });
    const enrollment = await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken,
      termCode: "202608",
      crn: "83190",
    });
    await t.mutation(api.courses.leaveCourseHub, {
      sessionToken,
      courseHubId: enrollment.courseHubId,
    });

    const schedule = await t.query(api.courses.getMyPrivateSchedule, { sessionToken });
    expect(schedule).toEqual([]);
    const chat = await t.run((ctx) => ctx.db.get(enrollment.groupChatId));
    expect(chat?.memberCount ?? 0).toBe(0);
  });

  it("keeps the Club Group Chat member count in sync when a Student leaves", async () => {
    const t = createTestConvex();
    const owner = await createVerifiedTestStudent(t, {
      handle: "club_owner",
      displayName: "Club Owner",
    });
    const member = await createVerifiedTestStudent(t, {
      handle: "club_departure",
      displayName: "Departing Member",
    });
    const { clubId, groupChatId } = await t.mutation(api.communities.createCommunityClub, {
      sessionToken: owner.sessionToken,
      name: "Robotics Workshop",
      campus: "Kennesaw",
      summary: "Build robots together",
      description: "Meet every week to share progress on robotics projects",
    });
    const toggle = () =>
      t.mutation(api.communities.toggleJoinClub, {
        sessionToken: member.sessionToken,
        clubId,
      });
    expect(await toggle()).toMatchObject({ joined: true, groupChatId });
    expect(await toggle()).toMatchObject({ joined: false });

    const chat = await t.run((ctx) => ctx.db.get(groupChatId));
    expect(chat?.memberCount).toBe(1);
  });

  it("applies production RSVP transitions once and clears the count on withdrawal", async () => {
    const t = createTestConvex();
    const organizer = await createVerifiedTestStudent(t, {
      handle: "event_organizer",
      displayName: "Event Organizer",
    });
    const attendee = await createVerifiedTestStudent(t, {
      handle: "event_attendee",
      displayName: "Event Attendee",
    });
    const { eventId } = await t.mutation(api.communities.createNativeEvent, {
      sessionToken: organizer.sessionToken,
      ...eventDetails(),
    });
    const setRsvp = (rsvpStatus: "going" | "interested" | "none") =>
      t.mutation(api.communities.setEventRsvp, {
        sessionToken: attendee.sessionToken,
        eventId,
        rsvpStatus,
      });
    const getCounts = () =>
      t.query(api.communities.getEventDetail, {
        sessionToken: attendee.sessionToken,
        eventId,
      });

    await setRsvp("going");
    await setRsvp("going");
    expect(await getCounts()).toMatchObject({ goingCount: 2, interestedCount: 0 });
    await setRsvp("interested");
    expect(await getCounts()).toMatchObject({ goingCount: 1, interestedCount: 1 });
    await setRsvp("none");
    expect(await getCounts()).toMatchObject({ goingCount: 1, interestedCount: 0, myRsvpStatus: null });
  });

  it("counts the organizer once on a Judge Demo Mode Event for every persona", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const organizer = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
    const peer = { demoShortCode: demo.shortCode, demoPersonaHandle: "alex_owl" };
    const { eventId } = await t.mutation(api.communities.createNativeEvent, {
      ...organizer,
      ...eventDetails(),
    });
    const [organizerView, peerView] = await Promise.all([
      t.query(api.communities.getEventDetail, { ...organizer, eventId }),
      t.query(api.communities.getEventDetail, { ...peer, eventId }),
    ]);

    expect(peerView).toMatchObject({ goingCount: 1, myRsvpStatus: null });
    expect(organizerView).toMatchObject({ goingCount: 1, myRsvpStatus: "going" });
  });
});

function eventDetails() {
  const startTime = Date.now() + 60 * 60_000;
  return {
    title: "Robotics Workshop",
    description: "Compare progress on campus robotics projects",
    campus: "Kennesaw" as const,
    isVirtual: false,
    locationName: "Science Building",
    startTime,
    endTime: startTime + 60 * 60_000,
  };
}
