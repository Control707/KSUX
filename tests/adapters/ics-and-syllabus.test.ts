import { describe, expect, it } from "vitest";
import { parseStatelessScheduleIcs } from "../../convex/lib/icsParser";
import { fetchSimpleSyllabusSummary } from "../../convex/lib/syllabusAdapter";

describe("Seam 2 — Stateless .ics Parser & Simple Syllabus Fetch Adapter (#18)", () => {
  it("unfolds multiline RFC 5545 .ics VEVENTs, extracts weekly classes + deadlines, and strips LMS token URLs", () => {
    const raw = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:evt-1",
      "SUMMARY:ME 3101 - Materials Science",
      " and Engineering (CRN: 85105)",
      "DTSTART:20261116T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
      "LOCATION:Engineering Lab Q 112",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-2",
      "SUMMARY:Lab 4 Submission https://kennesaw.view.usg.edu/d2l/ics?tok=abc",
      "DTEND:20261122T045900Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsed = parseStatelessScheduleIcs(raw);
    expect(parsed.classBlocks).toHaveLength(1);
    expect(parsed.classBlocks[0]?.crnCandidate).toBe("85105");
    expect(parsed.classBlocks[0]?.courseCodeCandidate).toBe("ME 3101");
    expect(parsed.classBlocks[0]?.byDays).toEqual(["M", "W", "F"]);

    expect(parsed.deadlines).toHaveLength(1);
    expect(parsed.deadlines[0]?.title).toBe("Lab 4 Submission");
  });

  it("matches Simple Syllabus CRN or degrades gracefully with official link when upstream fails", async () => {
    const okRes = await fetchSimpleSyllabusSummary(
      { subjectCourse: "CS 3305", termCode: "202608", crn: "83190" },
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              section: "01",
              crn: "83190",
              instructor_name: "Dr. Elena Vance",
              office_hours: "MW 1:30–3:00 PM",
              grading_weights: [{ label: "Labs", weight: "30%" }],
              textbooks: ["CLRS 4th Ed"],
              url: "https://kennesaw.simplesyllabus.com/en-US/doc/cs3305",
            },
          ],
        }),
      })
    );
    expect(okRes.status).toBe("found");
    expect(okRes.summary?.instructor).toBe("Dr. Elena Vance");

    let calls = 0;
    const downRes = await fetchSimpleSyllabusSummary(
      { subjectCourse: "CS 3305", termCode: "202608" },
      async () => {
        calls++;
        throw new Error("ETIMEDOUT");
      }
    );
    expect(calls).toBe(2); // Initial attempt + max 1 retry
    expect(downRes.status).toBe("upstream_unreachable");
    expect(downRes.sourceUrl).toContain("kennesaw.simplesyllabus.com");
  });
});

it("projects weekly calendar days into Eastern time and keeps their meeting end times", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:late-tuesday", "SUMMARY:Weekly Lab",
    "DTSTART:20261117T020000Z", "DTEND:20261117T033000Z",
    "RRULE:FREQ=WEEKLY;BYDAY=TU", "END:VEVENT",
    "BEGIN:VEVENT", "UID:floating", "SUMMARY:Local seminar",
    "DTSTART;TZID=America/New_York:20261118T090000", "RRULE:FREQ=WEEKLY",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  expect(parseStatelessScheduleIcs(calendar).classBlocks).toMatchObject([
    { byDays: ["M"], startMinutes: 1260, endMinutes: 1350 },
    { byDays: ["W"], startMinutes: 540 },
  ]);
});

it("keeps one-off recurrence overrides out of deadlines and gives UID-less events stable keys", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "SUMMARY:BIOL 9900 Lab", "DTSTART:20260902T140000Z", "RRULE:FREQ=WEEKLY;BYDAY=WE", "END:VEVENT",
    "BEGIN:VEVENT", "UID:override", "RECURRENCE-ID:20260909T140000Z", "SUMMARY:BIOL 9900 Lab (moved)",
    "DTSTART:20260910T140000Z", "DTEND:20260910T153000Z", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const first = parseStatelessScheduleIcs(calendar);
  expect(first.deadlines).toEqual([]);
  expect(first.classBlocks).toHaveLength(1);
  const reordered = calendar.replace("BEGIN:VCALENDAR", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Extra\r\nDTEND:20260911T040000Z\r\nEND:VEVENT");
  expect(parseStatelessScheduleIcs(reordered).classBlocks[0]!.uid).toBe(first.classBlocks[0]!.uid);
});
