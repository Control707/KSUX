import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const mixedSchedule = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:matched", "SUMMARY:CS 3305 CRN 83190",
  "DTSTART;TZID=America/New_York:20260901T111000", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH", "END:VEVENT",
  "BEGIN:VEVENT", "UID:unmatched", "SUMMARY:BIOL 9900 Private Lab https://example.test/feed?token=private",
  "DTSTART:20260902T140000Z", "DTEND:20260902T153000Z", "RRULE:FREQ=WEEKLY;BYDAY=WE",
  "LOCATION:Lab 201", "END:VEVENT",
  "BEGIN:VEVENT", "UID:deadline", "SUMMARY:BIOL 9900 Worksheet",
  "DTEND:" + tomorrow, "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

it("previews matched and unmatched classes, saves only after confirmation and deduplicates reimports", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const owner = await createVerifiedTestStudent(t, { handle: "schedule_owner", displayName: "Schedule Owner" });
  const other = await createVerifiedTestStudent(t, { handle: "schedule_other", displayName: "Other Student" });
  const { sessionToken } = owner;
  const termCode = "202608";
  const args = { sessionToken, termCode, rawIcs: mixedSchedule };

  const preview = await t.query(api.courses.previewScheduleFromIcs, args);
  expect(preview.blocks.map(({ status }) => status)).toEqual(["exact", "unmatched"]);
  expect(preview.blocks[1]?.entry).toMatchObject({
    title: "BIOL 9900 Private Lab", days: ["W"], startMinutes: 600, endMinutes: 690, location: "Lab 201",
  });
  expect(preview.deadlineCount).toBe(1);
  expect(await t.query(api.courses.listMyPrivateClasses, { sessionToken, termCode })).toEqual([]);

  expect(await t.mutation(api.courses.importScheduleFromIcs, args)).toMatchObject({
    matchedCourses: [{ subjectCourse: "CS 3305", crn: "83190" }],
    importedPrivateClassCount: 2, importedDeadlinesCount: 1,
  });
  const entries = await t.query(api.courses.listMyPrivateClasses, { sessionToken, termCode });
  const entry = entries.find(({ title }) => title === "BIOL 9900 Private Lab");
  await t.mutation(api.courses.savePrivateClass, {
    sessionToken, termCode, key: entry!.key, title: "Edited Lab", days: ["W"], startMinutes: 615, location: "Lab 202",
  });
  expect(await t.mutation(api.courses.importScheduleFromIcs, args)).toMatchObject({
    importedPrivateClassCount: 0, importedDeadlinesCount: 0,
  });

  const hud = await t.query(api.shell.getNowHud, { sessionToken });
  expect(hud.schedule.privateClasses).toContainEqual(expect.objectContaining({ title: "Edited Lab", termCode }));
  expect(hud.schedule.personalDeadlines).toMatchObject([{ title: "BIOL 9900 Worksheet" }]);
  const otherHud = await t.query(api.shell.getNowHud, { sessionToken: other.sessionToken });
  expect(otherHud.schedule.privateClasses).toEqual([]);
  expect(otherHud.schedule.enrolledCourses).toEqual([]);
  expect(otherHud.schedule.personalDeadlines).toEqual([]);

  await t.mutation(api.courses.removePrivateClass, { sessionToken, termCode, key: entry!.key });
  await t.mutation(api.courses.leaveCourseHub, { sessionToken, courseHubId: hud.schedule.enrolledCourses[0]!.courseHubId });
  expect(await t.query(api.courses.listMyPrivateClasses, { sessionToken, termCode })).toMatchObject([
    { title: "CS 3305 CRN 83190" },
  ]);
});

it("resolves an ambiguous section and isolates manual classes across Judge Demo workspaces", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const provision = () => t.mutation(api.demo.session.provisionOrAttachDemoSession, { preferredPersona: "maya_cs" });
  const [demo, other] = [await provision(), await provision()];
  const auth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
  const termCode = "202608";
  const rawIcs = mixedSchedule.replace("CS 3305 CRN 83190", "CS 3305").replace("T111000", "T080000");
  const preview = await t.query(api.courses.previewScheduleFromIcs, { ...auth, termCode, rawIcs });
  expect(preview.blocks[0]?.status).toBe("ambiguous");
  const sectionId = preview.blocks[0]!.options[0]!._id;
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode, rawIcs, selections: [{ index: 0, sectionId }] });
  const key = await t.mutation(api.courses.savePrivateClass, { ...auth, termCode, title: "Manual class", days: ["F"], startMinutes: 600 });
  expect(await t.query(api.courses.listMyPrivateClasses, { ...auth, termCode })).toEqual(
    expect.arrayContaining([expect.objectContaining({ key, title: "Manual class" })])
  );
  expect(await t.query(api.courses.listMyPrivateClasses, { ...auth, demoShortCode: other.shortCode, termCode })).toEqual([]);
});

it("purges private schedules with expired Judge Demo workspaces and deleted Student profiles", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, { preferredPersona: "maya_cs" });
  const auth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202608", title: "Demo class", days: ["M"], startMinutes: 600 });
  const owner = await createVerifiedTestStudent(t, { handle: "schedule_leaver", displayName: "Schedule Leaver" });
  await t.mutation(api.courses.savePrivateClass, {
    sessionToken: owner.sessionToken, termCode: "202608", title: "Prod class", days: ["T"], startMinutes: 600,
  });
  expect(await t.run(({ db }) => db.query("privateScheduleTerms").take(10))).toHaveLength(2);

  await t.run(async ({ db }) => {
    const row = await db.query("demoSessions").withIndex("by_short_code", (q) => q.eq("shortCode", demo.shortCode)).unique();
    await db.patch(row!._id, { expiresAt: 0 });
  });
  await t.action(internal.housekeeping.runHourlyPurge, {});
  await t.mutation(api.students.deleteMyProfile, { sessionToken: owner.sessionToken });
  expect(await t.run(({ db }) => db.query("privateScheduleTerms").take(10))).toEqual([]);
});
