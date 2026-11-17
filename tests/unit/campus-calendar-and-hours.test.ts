import { describe, expect, it } from "vitest";
import { parseStatelessScheduleIcs } from "../../convex/lib/icsParser";
import { evaluateDiningOpenStatus } from "../../convex/lib/parkingMath";

function easternDeadline(value: string) {
  return parseStatelessScheduleIcs([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:deadline-1",
    "SUMMARY:Project submission",
    `DTSTART;TZID=America/New_York:${value}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")).deadlines[0]?.dueAt;
}

describe("Eastern calendar conversion and dining hours", () => {
  it("uses Eastern Standard Time for a November local deadline", () => {
    expect(easternDeadline("20261117T180000")).toBe(Date.parse("2026-11-17T23:00:00Z"));
  });

  it("uses Eastern Daylight Time for a September local deadline", () => {
    expect(easternDeadline("20260901T180000")).toBe(Date.parse("2026-09-01T22:00:00Z"));
  });

  it("converts a September UTC class start to Eastern Daylight Time before section matching", () => {
    const { classBlocks } = parseStatelessScheduleIcs([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:course-1",
      "SUMMARY:CS 3305 Data Structures",
      "DTSTART:20260901T140000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"));

    expect(classBlocks[0]?.startMinutes).toBe(10 * 60);
  });

  it("transitions from closing soon to closed at the posted dining close time", () => {
    const schedule = JSON.stringify({ weekdayOpenMin: 420, weekdayCloseMin: 1_080 });
    expect(evaluateDiningOpenStatus(schedule, Date.parse("2026-11-17T22:59:00Z"))).toEqual({
      state: "closing_soon",
      label: "Closing in 1m",
    });
    expect(evaluateDiningOpenStatus(schedule, Date.parse("2026-11-17T23:00:00Z")).state).toBe("closed");
  });

  it("avoids an Open Now claim when venue hours cannot be parsed", () => {
    const result = evaluateDiningOpenStatus("", Date.parse("2026-11-17T23:00:00Z"));
    expect(result.state).not.toBe("open");
  });
});
