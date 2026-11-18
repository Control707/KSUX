import { afterEach, expect, it, vi } from "vitest";
import type { BannerSection } from "../../convex/lib/bannerCatalog";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function section(crn: string, overrides: Partial<BannerSection> = {}): BannerSection {
  return {
    subjectCourse: "CS 3305", title: "Data Structures", campus: "Marietta", crn, sectionNumber: "01",
    deliveryMode: "in_person", instructorName: "Example Instructor",
    meetings: [{ days: ["T"], startMinutes: 600, endMinutes: 650, timeLabel: "10:00–10:50", buildingName: "Atrium", roomNumber: "10" }],
    ...overrides,
  };
}

it("does not rewrite unchanged sections when another section changes", async () => {
  const t = createTestConvex();
  const args = { termCode: "202708", courses: ["CS 3305"], rows: [section("80001"), section("80002")] };
  await t.mutation(internal.courses.applyBannerTerm, args);
  expect(await t.mutation(internal.courses.applyBannerTerm, {
    ...args, rows: [args.rows[0]!, section("80002", { instructorName: "New Instructor" })],
  })).toMatchObject({ changedSections: 1 });
});

it("keeps unverified fixture sections hidden when promoting a Course Hub", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "banner_fixture", displayName: "Fixture" });
  await t.mutation(internal.courses.applyBannerTerm, {
    termCode: "202608", courses: ["CS 3305"], rows: [section("83190")],
  });
  const detail = await t.query(api.courses.getCourseHubDetail, { sessionToken, termCode: "202608", subjectCourse: "CS 3305" });
  expect(detail?.sections.map(({ crn }) => crn)).toEqual(["83190"]);
  expect(detail?.hub.prodEnrollmentCount).toBe(0);
  expect(await t.query(api.courses.searchCatalog, { sessionToken, termCode: "202608", queryText: "83191" })).toEqual([]);
  await expect(t.mutation(api.courses.enrollInCourseHub, { sessionToken, termCode: "202608", crn: "83191" })).rejects.toThrow(/No Banner/);
});

it("does not reassign an existing verified CRN to another Course Hub", async () => {
  const t = createTestConvex();
  await t.mutation(internal.courses.applyBannerTerm, { termCode: "202708", courses: ["CS 3305"], rows: [section("80001")] });
  await expect(t.mutation(internal.courses.applyBannerTerm, {
    termCode: "202708", courses: ["MATH 1190"], rows: [section("80001", { subjectCourse: "MATH 1190", title: "Calculus I" })],
  })).rejects.toThrow(/another Course Hub/);
});

it("retains cached coverage and opens the circuit after three failed public refreshes", async () => {
  const t = createTestConvex();
  const args = { termCode: "202708", courses: ["CS 3305"] };
  await t.mutation(internal.courses.applyBannerTerm, { ...args, rows: [section("80001")] });
  const fetch = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
  vi.stubGlobal("fetch", fetch);
  for (let i = 0; i < 3; i++) await expect(t.action(internal.courses.refreshBannerTerm, args)).rejects.toThrow(/unavailable/);
  const state = await t.run((ctx) => ctx.db.query("feedSyncState").withIndex("by_source", (q) => q.eq("sourceKey", "banner_catalog:202708")).unique());
  expect(state).toMatchObject({ consecutiveFailures: 3, lastOutcome: "failed", activeRecordCount: 1, backoffUntil: expect.any(Number) });
  await expect(t.action(internal.courses.refreshBannerTerm, args)).rejects.toThrow(/backoff/i);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("does not advertise a term whose first refresh failed", async () => {
  const t = createTestConvex();
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "banner_failed", displayName: "Failed term" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(t.action(internal.courses.refreshBannerTerm, { termCode: "202908", courses: ["CS 3305"] })).rejects.toThrow(/offline/);
  expect((await t.query(api.courses.listBannerTerms, { sessionToken })).terms.map(({ code }) => code)).not.toContain("202908");
});

it("single-flights public refreshes and rejects stale lease writes", async () => {
  const t = createTestConvex();
  const termCode = "202708";
  const leaseUntil = await t.mutation(internal.courses.beginBannerRefresh, { termCode });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(t.action(internal.courses.refreshBannerTerm, { termCode, courses: ["CS 3305"] })).rejects.toThrow(/already in progress/);
  expect(fetch).not.toHaveBeenCalled();
  await expect(t.mutation(internal.courses.applyBannerTerm, {
    termCode, courses: ["CS 3305"], rows: [section("80001")], leaseUntil: leaseUntil - 1,
  })).rejects.toThrow(/lease expired/);
});

it("rejects invalid scopes before fetching any course", async () => {
  const t = createTestConvex();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(t.action(internal.courses.refreshBannerTerm, { termCode: "202708", courses: ["CS 3305", "ZZ invalid"] })).rejects.toThrow(/published Banner/);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps default CRN and course-code searches usable across the Eastern term rollover", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2027, 0, 1, 4, 59));
  const t = createTestConvex();
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "banner_rollover", displayName: "Rollover" });
  for (const [termCode, crn] of [["202608", "80001"], ["202701", "10001"]]) {
    await t.mutation(internal.courses.applyBannerTerm, { termCode: termCode!, courses: ["CS 3305"], rows: [section(crn!)] });
  }
  expect((await t.query(api.courses.searchCatalog, { sessionToken, queryText: "80001" }))[0]?.subjectCourse).toBe("CS 3305");
  clock.mockReturnValue(Date.UTC(2027, 0, 1, 5));
  expect((await t.query(api.courses.listBannerTerms, { sessionToken })).activeTerm).toBe("202701");
  expect((await t.query(api.courses.searchCatalog, { sessionToken, queryText: "10001" }))[0]?.subjectCourse).toBe("CS 3305");
  expect((await t.query(api.courses.searchCatalog, { sessionToken, queryText: "CS 3305" }))[0]?.sections.map(({ crn }) => crn)).toEqual(["10001"]);
});

it("deduplicates repeats and retains the last good catalog on a sudden same-scope drop", async () => {
  const t = createTestConvex();
  const args = { termCode: "202708", courses: ["CS 3305"], rows: Array.from({ length: 10 }, (_, i) => section(String(80000 + i))) };
  expect(await t.mutation(internal.courses.applyBannerTerm, { ...args, rows: [...args.rows, args.rows[0]!] })).toMatchObject({ sections: 10, changedSections: 10 });
  const readState = () => t.run((ctx) => ctx.db.query("feedSyncState").withIndex("by_source", (q) => q.eq("sourceKey", "banner_catalog:202708")).unique());
  const before = await readState();
  await expect(t.mutation(internal.courses.applyBannerTerm, { ...args, rows: [args.rows[0]!] })).rejects.toThrow(/Unexpected drop/);
  expect(await readState()).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("courseSections").collect())).toHaveLength(10);
});

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
