import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Course Hubs, Banner 9 CRN, Stateless .ics, Schedule Privacy & 500-LRU Syllabus (#18)", () => {
  it("matches 5-digit CRNs, filters My Section vs All Sections, enforces strict schedule privacy, and gates Course Hub Members Only sessions", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });

    const maya = await createVerifiedTestStudent(t, {
      handle: "maya_course",
      displayName: "Maya Course",
      homeCampus: "Kennesaw",
    });
    const jordan = await createVerifiedTestStudent(t, {
      handle: "jordan_course",
      displayName: "Jordan Course",
      homeCampus: "Marietta",
    });
    const outsider = await createVerifiedTestStudent(t, {
      handle: "outsider_course",
      displayName: "Outsider",
      homeCampus: "Kennesaw",
    });

    // Search by exact 5-digit CRN 83190 (CS 3305 Section 01 Kennesaw)
    const crnSearch = await t.query(api.courses.searchCatalog, {
      sessionToken: maya.sessionToken,
      termCode: "202608",
      queryText: "83190",
    });
    expect(crnSearch).toHaveLength(1);
    expect(crnSearch[0]?.subjectCourse).toBe("CS 3305");
    expect(crnSearch[0]?.matchedCrnSection?.crn).toBe("83190");

    // Stateless .ics upload auto-enrolls Maya in CRN 83190 & extracts D2L deadlines without storing URLs
    const sampleIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:banner-cs3305-83190",
      "SUMMARY:CS 3305 Sec 01 (CRN 83190) Data Structures",
      "DTSTART:20261116T110000",
      "DTEND:20261116T121500",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "LOCATION:Clendenin 1009",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:d2l-hw-trees",
      "SUMMARY:CS 3305 Red-Black Tree Implementation https://kennesaw.view.usg.edu/feed?token=secret123",
      "DTEND:20261120T235900Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const imported = await t.mutation(api.courses.importScheduleFromIcs, {
      sessionToken: maya.sessionToken,
      rawIcs: sampleIcs,
      termCode: "202608",
    });
    expect(imported.matchedCourses).toEqual([
      { subjectCourse: "CS 3305", crn: "83190" },
    ]);
    expect(imported.importedDeadlinesCount).toBe(1);

    // Jordan enrolls in Marietta section CRN 83191
    await t.mutation(api.courses.enrollInCourseHub, {
      sessionToken: jordan.sessionToken,
      termCode: "202608",
      crn: "83191",
    });

    // Strict schedule privacy: Jordan CANNOT read Maya's private CRN or .ics deadlines!
    await expect(
      t.query(api.courses.getMyPrivateSchedule, {
        sessionToken: jordan.sessionToken,
        targetStudentId: maya.studentId,
      })
    ).rejects.toThrowError(/private to the owning Student/);

    const mayaOwnSchedule = await t.query(api.courses.getMyPrivateSchedule, {
      sessionToken: maya.sessionToken,
    });
    expect(mayaOwnSchedule[0]?.crn).toBe("83190");
    // Token URL was stripped from deadline title!
    expect(mayaOwnSchedule[0]?.personalDeadlines[0]?.title).not.toContain(
      "secret123"
    );

    // Section filter: Maya posts in Section 01, Jordan posts in Section 02
    const csHubId = crnSearch[0]!._id;
    await t.mutation(api.feed.createPost, {
      sessionToken: maya.sessionToken,
      courseHubId: csHubId,
      body: "Clendenin 1009 whiteboard notes from today!",
    });
    await t.mutation(api.feed.createPost, {
      sessionToken: jordan.sessionToken,
      courseHubId: csHubId,
      body: "Atrium J 202 quiz reminder!",
    });

    const allSectionsDetail = await t.query(api.courses.getCourseHubDetail, {
      sessionToken: maya.sessionToken,
      subjectCourse: "CS 3305",
      sectionFilter: "all",
    });
    expect(allSectionsDetail?.posts).toHaveLength(2);

    const mySectionDetail = await t.query(api.courses.getCourseHubDetail, {
      sessionToken: maya.sessionToken,
      subjectCourse: "CS 3305",
      sectionFilter: "mine",
    });
    expect(mySectionDetail?.posts).toHaveLength(1);
    expect(mySectionDetail?.posts[0]?.body).toContain("Clendenin 1009");

    // Course Hub Members Only Study Session is visible to enrolled Jordan, hidden from non-enrolled Outsider
    await t.run(async (ctx) => {
      const room = await ctx.db.query("studyRooms").first();
      await ctx.db.insert("studySessions", {
        workspaceKey: "prod",
        studyRoomId: room!._id,
        campus: "Kennesaw",
        hostId: maya.studentId,
        courseHubId: csHubId,
        visibility: "course_members_only",
        title: "Members-Only CS 3305 Midterm Review",
        startTime: Date.now(),
        endTime: Date.now() + 3600_000,
        maxSeats: 6,
        attendeeIds: [maya.studentId],
        libcalHostConfirmed: true,
        status: "scheduled",
        visibilityStatus: "visible",
      });
    });

    const jordanHubView = await t.query(api.courses.getCourseHubDetail, {
      sessionToken: jordan.sessionToken,
      subjectCourse: "CS 3305",
    });
    expect(jordanHubView?.studySessions).toHaveLength(1);

    const outsiderHubView = await t.query(api.courses.getCourseHubDetail, {
      sessionToken: outsider.sessionToken,
      subjectCourse: "CS 3305",
    });
    expect(outsiderHubView?.studySessions).toHaveLength(0);
  });

  it("labels syllabus section provenance on CRN fallback and enforces the 500-row LRU cache cap", async () => {
    const t = createTestConvex();
    const student = await createVerifiedTestStudent(t, {
      handle: "syl_student",
      displayName: "Syllabus Student",
    });

    const baseTime = Date.now() - 1_000_000;
    // Insert entry #0 with oldest lastAccessedAt, then 500 newer entries (501 total -> #0 must be evicted!)
    const oldestId = await t.mutation(internal.courses.upsertSyllabusCacheEntry, {
      subjectCourse: "OLD 1000",
      termCode: "202608",
      crn: "10000",
      matchedSectionLabel: "Section 01",
      status: "found",
      summaryJson: JSON.stringify({ instructor: "Old Prof", gradingWeights: [], textbooks: [] }),
      nowOverride: baseTime,
    });

    for (let i = 1; i <= 500; i++) {
      await t.mutation(internal.courses.upsertSyllabusCacheEntry, {
        subjectCourse: `CS ${3000 + i}`,
        termCode: "202608",
        crn: String(70000 + i),
        matchedSectionLabel: `Section 01 (CRN ${70000 + i})`,
        status: "found",
        summaryJson: JSON.stringify({
          instructor: `Prof ${i}`,
          gradingWeights: [],
          textbooks: [],
        }),
        nowOverride: baseTime + i * 1000,
      });
    }

    const evictedCheck = await t.run((ctx) => ctx.db.get(oldestId));
    expect(evictedCheck).toBeNull();

    const totalCount = await t.run(async (ctx) => {
      const rows = await ctx.db.query("courseSyllabiCache").take(550);
      return rows.length;
    });
    expect(totalCount).toBe(500);

    // Querying CS 3001 with a different CRN falls back to published Section 01 with explicit provenance label
    const fallbackSyllabus = await t.query(api.courses.getCourseSyllabus, {
      sessionToken: student.sessionToken,
      subjectCourse: "CS 3001",
      termCode: "202608",
      crn: "99999",
    });
    expect(fallbackSyllabus.isFallbackSection).toBe(true);
    expect(fallbackSyllabus.matchedSectionLabel).toContain(
      "Showing syllabus from Section 01"
    );
  });
});
