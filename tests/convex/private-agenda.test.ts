import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const NOW = Date.parse("2026-11-19T14:00:00Z"); // Thursday, 09:00 EST
const allOn = { class: true, deadline: true, event: true, study: true };
const allOff = { class: false, deadline: false, event: false, study: false };
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

async function setup(includeFixtures = true) {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, { includeFixtures });
  const owner = await createVerifiedTestStudent(t, { handle: "agenda_owner", displayName: "Agenda Owner" });
  const other = await createVerifiedTestStudent(t, { handle: "agenda_other", displayName: "Other Student" });
  return { t, owner, other, auth: { sessionToken: owner.sessionToken } };
}

const calendar = ["BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:class-match", "SUMMARY:CS 3305 CRN 83190", "DTSTART;TZID=America/New_York:20261119T111000",
  "DTEND;TZID=America/New_York:20261119T122500", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH", "END:VEVENT",
  "BEGIN:VEVENT", "UID:deadline", "SUMMARY:CS 3305 Private worksheet", "DTEND:20261119T150000Z", "END:VEVENT",
  "END:VCALENDAR"].join("\r\n");

async function createEvent(t: ReturnType<typeof createTestConvex>, auth: { sessionToken: string }, startTime = NOW + 10 * 60_000) {
  return t.mutation(api.communities.createNativeEvent, { ...auth, title: "Campus gathering", description: "Meet classmates",
    campus: "Marietta", isVirtual: false, locationName: "Student Center", startTime, endTime: startTime + 3600_000 });
}
async function createStudy(t: ReturnType<typeof createTestConvex>, auth: { sessionToken: string }) {
  const room = await t.run(({ db }) => db.query("studyRooms").first());
  return t.mutation(api.study.createStudySession, { ...auth, title: "Practice together", studyRoomId: room!._id,
    visibility: "campus_open", startTime: NOW + 12 * 60_000, endTime: NOW + 72 * 60_000, maxSeats: 6 });
}

it("combines canonical private sources once, follows edits and cancellations, and ignores the location setting", async () => {
  const { t, auth } = await setup();
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: calendar });
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: calendar });
  const { eventId } = await createEvent(t, auth);
  const { sessionId, groupChatId } = await createStudy(t, auth);
  // An archived chat must not hide a joined Study Session from the agenda.
  await t.run(async ({ db }) => {
    const member = await db.query("chatMembers").withIndex("by_chat_student", (q) =>
      q.eq("workspaceKey", "prod").eq("chatId", groupChatId)).first();
    await db.patch(member!._id, { isArchived: true });
  });
  const read = () => t.query(api.agenda.listMyAgenda, auth);
  const before = await read();
  expect(before.items.filter((item) => item.kind === "class")).toHaveLength(4);
  expect(before.items.filter((item) => item.kind === "deadline")).toMatchObject([{ title: "CS 3305 Private worksheet" }]);
  expect(before.items.filter((item) => item.kind === "event")).toMatchObject([{ campus: "Marietta", href: "/events/" + eventId }]);
  expect(before.items.filter((item) => item.kind === "study")).toMatchObject([{ href: "/study/" + sessionId }]);
  expect(before.items.map((item) => item.startsAt)).toEqual(before.items.map((item) => item.startsAt).sort((a, b) => a - b));
  await t.mutation(api.shell.setCampusFilter, { ...auth, campusFilter: "Kennesaw" });
  expect((await read()).items).toEqual(before.items);
  await t.run(({ db }) => db.patch(eventId, { title: "Moved gathering", startTime: NOW + 20 * 60_000, status: "cancelled_upstream" }));
  expect((await read()).items.filter((item) => item.kind === "event")).toMatchObject([{ title: "Moved gathering", cancelled: true }]);
  await t.mutation(api.study.endStudySession, { ...auth, sessionId });
  expect((await read()).items.filter((item) => item.kind === "study")).toMatchObject([{ cancelled: true }]);
  await t.mutation(api.communities.setEventRsvp, { ...auth, eventId, rsvpStatus: "none" });
  expect((await read()).items.filter((item) => item.kind === "event")).toEqual([]);
});

it("removes departed Study Sessions, denies their details and suppresses hidden or blocked sources", async () => {
  const { t, auth, other } = await setup();
  const hosted = await createStudy(t, { sessionToken: other.sessionToken });
  await t.mutation(api.study.toggleStudySessionAttendance, { ...auth, sessionId: hosted.sessionId });
  expect((await t.query(api.agenda.listMyAgenda, auth)).items).toMatchObject([{ kind: "study" }]);
  await t.mutation(api.study.toggleStudySessionAttendance, { ...auth, sessionId: hosted.sessionId });
  expect((await t.query(api.agenda.listMyAgenda, auth)).items).toEqual([]);
  expect(await t.query(api.agenda.getMyStudySession, { ...auth, sessionId: hosted.sessionId })).toBeNull();
  const { eventId } = await createEvent(t, { sessionToken: other.sessionToken });
  await t.mutation(api.communities.setEventRsvp, { ...auth, eventId, rsvpStatus: "interested" });
  expect((await t.query(api.agenda.listMyAgenda, auth)).items).toMatchObject([{ kind: "event" }]);
  await t.run(({ db }) => db.patch(eventId, { visibilityStatus: "under_review" }));
  expect((await t.query(api.agenda.listMyAgenda, auth)).items).toEqual([]);
  await t.run(({ db }) => db.patch(eventId, { visibilityStatus: "visible" }));
  await t.mutation(api.moderation.toggleBlockStudent, { ...auth, targetStudentId: other.studentId });
  expect((await t.query(api.agenda.listMyAgenda, auth)).items).toEqual([]);
});

it("exports only RSVPed Events with stable UIDs, UTC instants, cancellation and safe folded text", async () => {
  const { t, auth } = await setup();
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: calendar });
  await createStudy(t, auth);
  const { eventId } = await createEvent(t, auth);
  await t.run(({ db }) => db.patch(eventId, { title: "Campus, gathering; " + "🦉".repeat(40) + "\nSecond line" }));
  const first = await t.query(api.agenda.exportMyEvents, auth);
  expect(first.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(first).toContain("DTSTART:20261119T141000Z");
  expect(first).toContain("SUMMARY:Campus\\, gathering\\; ");
  expect(first.replace(/\r\n /g, "")).toContain("\\nSecond line");
  expect(first).not.toMatch(/Private worksheet|Practice together|CRN 83190|VALARM|ATTENDEE/);
  for (const line of first.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  await t.run(({ db }) => db.patch(eventId, { status: "cancelled" }));
  const second = await t.query(api.agenda.exportMyEvents, auth);
  expect(second.match(/UID:.+/)?.[0]).toBe(first.match(/UID:.+/)?.[0]);
  expect(second).toContain("STATUS:CANCELLED");
});

it("opts in per type, atomically deduplicates claims and rearms only for changed times", async () => {
  const { t, auth } = await setup();
  const { eventId } = await createEvent(t, auth);
  await createStudy(t, auth);
  expect(await t.query(api.agenda.getReminderSettings, auth)).toEqual(allOff);
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: { ...allOff, event: true } });
  const claims = await Promise.all([t.mutation(api.agenda.claimDueReminders, auth), t.mutation(api.agenda.claimDueReminders, auth)]);
  expect(claims.flat()).toMatchObject([{ kind: "event" }]);
  await t.run(({ db }) => db.patch(eventId, { title: "Edited name", locationName: "New building" }));
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: allOff });
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: allOn });
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toMatchObject([{ kind: "study" }]);
  await t.run(({ db }) => db.patch(eventId, { startTime: NOW + 11 * 60_000 }));
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toMatchObject([{ kind: "event", title: "Edited name" }]);
  await t.run(({ db }) => db.patch(eventId, { startTime: NOW + 10 * 60_000 }));
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
});

it("cancels pending reminders for source changes and never replays late occurrences", async () => {
  const { t, auth, other } = await setup();
  const { eventId } = await createEvent(t, auth);
  const { eventId: removedId } = await createEvent(t, auth);
  const hosted = await createStudy(t, { sessionToken: other.sessionToken });
  await t.mutation(api.study.toggleStudySessionAttendance, { ...auth, sessionId: hosted.sessionId });
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: allOn });
  await t.run(({ db }) => db.patch(eventId, { status: "cancelled" }));
  await t.mutation(api.communities.setEventRsvp, { ...auth, eventId: removedId, rsvpStatus: "none" });
  await t.mutation(api.study.toggleStudySessionAttendance, { ...auth, sessionId: hosted.sessionId });
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
  await t.run(({ db }) => db.patch(eventId, { status: "scheduled", startTime: NOW + 16 * 60_000 }));
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
  vi.setSystemTime(NOW + 60_000);
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toMatchObject([{ kind: "event" }]);
  await t.run(({ db }) => db.patch(eventId, { startTime: NOW + 30_000 }));
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
});

it("delivers private class and imported deadline reminders through their own switches", async () => {
  const { t, auth } = await setup();
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202608", title: "Soon class", days: ["R"], startMinutes: 550 });
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:soon-deadline", "SUMMARY:Soon worksheet", "DTEND:20261119T141500Z", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n") });
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: { ...allOff, class: true } });
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toMatchObject([{ kind: "class", title: "Soon class" }]);
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: { ...allOff, deadline: true } });
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toMatchObject([{ kind: "deadline", title: "Soon worksheet" }]);
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
});

it("retains a class occurrence identity across Banner enrollment, duplicate imports and leaving its Course Hub", async () => {
  vi.setSystemTime(Date.parse("2026-11-19T16:00:00Z"));
  const { t, auth } = await setup(false);
  const enrollment = await t.mutation(api.courses.enrollInCourseHub, { ...auth, termCode: "202608", crn: "83190" });
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: { ...allOff, class: true } });
  const first = await t.mutation(api.agenda.claimDueReminders, auth);
  expect(first).toMatchObject([{ kind: "class", campus: "Marietta" }]);
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: calendar });
  await t.mutation(api.courses.importScheduleFromIcs, { ...auth, termCode: "202608", rawIcs: calendar.replace("UID:class-match", "UID:another-source") });
  const read = () => t.query(api.agenda.listMyAgenda, auth);
  expect((await read()).items.filter((item) => item.kind === "class")).toHaveLength(4);
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
  await t.mutation(api.courses.leaveCourseHub, { ...auth, courseHubId: enrollment.courseHubId });
  expect((await read()).items.filter((item) => item.kind === "class")[0]).toMatchObject({ key: first[0]!.key, campus: "Marietta" });
  expect(await t.mutation(api.agenda.claimDueReminders, auth)).toEqual([]);
});

it("expands weekly classes across DST with Eastern wall times", async () => {
  vi.setSystemTime(Date.parse("2026-10-25T12:00:00Z"));
  const { t, auth } = await setup();
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202608", title: "Morning seminar", days: ["M"], startMinutes: 600 });
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202701", title: "Next term seminar", days: ["M"], startMinutes: 600 });
  const dates = (await t.query(api.agenda.listMyAgenda, auth)).items.map((item) => new Date(item.startsAt).toISOString());
  expect(dates).toEqual(["2026-10-26T14:00:00.000Z", "2026-11-02T15:00:00.000Z"]);
});

it("stops weekly recurrences at the calendar-term and year boundary", async () => {
  vi.setSystemTime(Date.parse("2026-12-28T05:00:00Z"));
  const { t, auth } = await setup();
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202608", title: "Morning seminar", days: ["M"], startMinutes: 600 });
  await t.mutation(api.courses.savePrivateClass, { ...auth, termCode: "202701", title: "Next term seminar", days: ["M"], startMinutes: 600 });
  const boundary = (await t.query(api.agenda.listMyAgenda, auth)).items;
  expect(boundary.map((item) => item.title)).toEqual(["Morning seminar", "Next term seminar"]);
  expect(boundary.map((item) => new Date(item.startsAt).toISOString())).toEqual(["2026-12-28T15:00:00.000Z", "2027-01-04T15:00:00.000Z"]);
});

it("keeps agenda, reminders and details private across Students, Demo personas and workspaces, and cleans them up", async () => {
  const { t, auth, owner, other } = await setup();
  const hosted = await createStudy(t, auth);
  await createEvent(t, auth);
  await t.mutation(api.agenda.setReminderSettings, { ...auth, settings: allOn });
  expect((await t.query(api.agenda.listMyAgenda, { sessionToken: other.sessionToken })).items).toEqual([]);
  expect(await t.query(api.agenda.getMyStudySession, { sessionToken: other.sessionToken, sessionId: hosted.sessionId })).toBeNull();
  expect(await t.query(api.agenda.getReminderSettings, { sessionToken: other.sessionToken })).toEqual(allOff);
  await expect(t.query(api.agenda.listMyAgenda, {})).rejects.toThrow();
  await expect(t.query(api.agenda.exportMyEvents, {})).rejects.toThrow();
  await expect(t.mutation(api.agenda.claimDueReminders, {})).rejects.toThrow();
  const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const demo2 = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const demoAuth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
  await t.mutation(api.courses.savePrivateClass, { ...demoAuth, termCode: "202608", title: "Only Maya", days: ["R"], startMinutes: 550 });
  await t.mutation(api.agenda.setReminderSettings, { ...demoAuth, settings: allOn });
  const own = (await t.query(api.agenda.listMyAgenda, demoAuth)).items;
  expect(own.some((item) => item.title === "Only Maya")).toBe(true);
  for (const args of [{ ...demoAuth, demoPersonaHandle: "alex_owl" }, { ...demoAuth, demoShortCode: demo2.shortCode }, auth]) {
    expect((await t.query(api.agenda.listMyAgenda, args)).items.some((item) => item.title === "Only Maya")).toBe(false);
  }
  expect(await t.query(api.agenda.getReminderSettings, { ...demoAuth, demoPersonaHandle: "alex_owl" })).toEqual(allOff);
  await t.mutation(api.demo.session.resetDemoWorkspace, demoAuth);
  expect(await t.query(api.agenda.getReminderSettings, demoAuth)).toEqual(allOff);
  await t.mutation(api.students.deleteMyProfile, { sessionToken: owner.sessionToken });
  await t.action(internal.housekeeping.runHourlyPurge, { now: NOW + 60_000 });
  expect(await t.run(({ db }) => db.query("agendaReminderState").take(10))).toEqual([]);
});
