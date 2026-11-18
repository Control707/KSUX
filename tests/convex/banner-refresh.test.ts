import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

it("records verified coverage, preserves IDs and keeps the last good catalog on incomplete refresh", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "banner_test", displayName: "Banner Test" });
  const termCode = "202708";
  const rows = [{
    subjectCourse: "MATH 1190", title: "Calculus I", campus: "Kennesaw", crn: "87654", sectionNumber: "01",
    deliveryMode: "in_person", instructorName: "Example Instructor",
    meetings: [{ days: ["M"], startMinutes: 600, endMinutes: 650, timeLabel: "10:00–10:50", buildingName: "Sample Building", roomNumber: "10" }],
  }] as const;
  const args = { termCode, courses: ["MATH 1190"], rows: rows.map((row) => ({
    ...row, meetings: row.meetings.map((meeting) => ({ ...meeting, days: [...meeting.days] })),
  })) };
  expect(await t.mutation(internal.courses.applyBannerTerm, args)).toMatchObject({ changedSections: 1, sections: 1 });
  const search = (queryText: string) => t.query(api.courses.searchCatalog, { sessionToken, termCode, queryText });
  const initial = await search("87654");
  expect(initial).toHaveLength(1);
  expect(await t.mutation(internal.courses.applyBannerTerm, args)).toMatchObject({ changedSections: 0 });
  await expect(t.mutation(internal.courses.applyBannerTerm, { ...args, courses: ["MATH 1190", "CS 3305"] }))
    .rejects.toThrow(/Incomplete Banner/);
  await t.mutation(internal.seed.bootstrapKsu, {});
  expect(await search("87654")).toEqual(initial);
  expect(await search("MATH 1190")).toHaveLength(1);
  expect((await t.query(api.courses.listBannerTerms, { sessionToken })).terms).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: termCode, label: "Fall 2027", sections: 1, lastSuccessAt: expect.any(Number) }),
  ]));
});
