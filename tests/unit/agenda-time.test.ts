import { afterEach, describe, expect, it, vi } from "vitest";
import { agendaTime } from "../../src/lib/agenda";

describe("private agenda time formatting", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["2026-01-15T15:30:00Z", "10:30 AM EST"],
    ["2026-07-15T14:30:00Z", "10:30 AM EDT"],
    ["2026-11-01T05:30:00Z", "1:30 AM EDT"],
    ["2026-11-01T06:30:00Z", "1:30 AM EST"],
  ])("keeps Eastern date and daylight-saving rules for %s", (timestamp, clock) => {
    const time = Date.parse(timestamp);
    const expected = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", weekday: "short",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(time);
    expect(agendaTime(time)).toBe(expected);
    expect(agendaTime(time)).toContain(clock);
  });

  it("reuses its formatter across agenda entries", () => {
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    agendaTime(Date.parse("2026-01-15T15:30:00Z"));
    agendaTime(Date.parse("2026-07-15T14:30:00Z"));
    expect(constructor).not.toHaveBeenCalled();
  });
});
