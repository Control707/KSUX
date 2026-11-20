import { describe, expect, it, vi } from "vitest";
import { easternDate, localTimestamp, zonedDateParts } from "../../convex/lib/easternDate";
import { getEasternDayAndHour } from "../../convex/lib/parkingMath";

describe("Eastern date helpers", () => {
  it("reuses the fixed Eastern formatters across repeated campus reads", () => {
    const DateTimeFormat = Intl.DateTimeFormat;
    const formatter = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      (locales, options) => new DateTimeFormat(locales, options)
    );
    try {
      const now = Date.parse("2026-11-20T15:30:00Z");
      expect(zonedDateParts(now)).toMatchObject({ year: 2026, month: 11, day: 20, hour: 10, minute: 30 });
      expect(easternDate(now)).toBe("2026-11-20");
      expect(getEasternDayAndHour(now)).toMatchObject({ dayOfWeek: 5, minuteOfDay: 630, hourLabel: "10 AM" });
      expect(formatter).not.toHaveBeenCalled();
    } finally {
      formatter.mockRestore();
    }
  });

  it("tracks Eastern midnight, date offsets, and both sides of DST changes", () => {
    expect(easternDate(Date.parse("2026-07-01T03:59:00Z"))).toBe("2026-06-30");
    expect(easternDate(Date.parse("2026-12-31T23:00:00Z"), 1)).toBe("2027-01-01");
    expect(zonedDateParts(Date.parse("2026-03-08T06:59:00Z"))).toMatchObject({ hour: 1, minute: 59 });
    expect(zonedDateParts(Date.parse("2026-03-08T07:00:00Z"))).toMatchObject({ hour: 3, minute: 0 });
    expect(getEasternDayAndHour(Date.parse("2026-11-01T05:30:00Z")))
      .toEqual(getEasternDayAndHour(Date.parse("2026-11-01T06:30:00Z")));
    expect(getEasternDayAndHour(Date.parse("2026-11-20T05:00:00Z"))).toMatchObject({ hourOfDay: 0, hourLabel: "12 AM" });
  });

  it("preserves custom time zones without leaking them into Eastern reads", () => {
    const now = Date.parse("2026-11-20T15:30:00Z");
    expect(zonedDateParts(now, "UTC")).toMatchObject({ hour: 15, minute: 30 });
    expect(zonedDateParts(now, "America/Los_Angeles")).toMatchObject({ hour: 7, minute: 30 });
    expect(zonedDateParts(now)).toMatchObject({ hour: 10, minute: 30 });
  });

  it("rejects nonexistent wall times and resolves fall-back ambiguity to the first occurrence", () => {
    expect(localTimestamp({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 })).toBeNull();
    expect(localTimestamp({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }))
      .toBe(Date.parse("2026-11-01T05:30:00Z"));
    expect(localTimestamp({ year: 2026, month: 11, day: 20, hour: 15, minute: 30, second: 0 }, "UTC"))
      .toBe(Date.parse("2026-11-20T15:30:00Z"));
    expect(localTimestamp({ year: 2026, month: 11, day: 20, hour: 15, minute: 30, second: 0 }, "Invalid/Zone"))
      .toBeNull();
  });
});
