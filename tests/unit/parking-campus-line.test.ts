import { describe, expect, it } from "vitest";
import { evaluateCampusLine, CAMPUS_LINE_TABLE } from "../../convex/lib/parkingCampusLine";
import { evaluateParkingLotFullness } from "../../convex/lib/parkingMath";

// November 2026 is EST (UTC-5). 2026-11-16 is a Monday.
const et = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 10, day, hour + 5, minute);

describe("campus-wide class-enrollment line (SPEC-v2 §4)", () => {
  it.each([
    ["Mon 10:00", et(16, 10), "busy"],
    ["Mon 12:59", et(16, 12, 59), "busy"],
    ["Mon 13:00", et(16, 13), "quieter"],
    ["Mon 9:59", et(16, 9, 59), "quieter"],
    ["Tue 11:00", et(17, 11), "busy"],
    ["Tue 14:59", et(17, 14, 59), "busy"],
    ["Tue 15:00", et(17, 15), "quieter"],
    ["Tue 10:30", et(17, 10, 30), "quieter"],
    ["Wed 11:00", et(18, 11), "busy"],
    ["Wed 14:00", et(18, 14), "quieter"],
    ["Thu 12:00", et(19, 12), "busy"],
    ["Thu 7:00", et(19, 7), "quieter"],
    ["Thu 17:59", et(19, 17, 59), "quieter"],
  ])("%s → %s", (_label, now, state) => {
    const line = evaluateCampusLine(now)!;
    expect(line.state).toBe(state);
    expect(line.label).toBe(state === "busy" ? "Usually busy now" : "Usually quieter now");
    expect(line.text).toBe(`${line.label} · per KSU class-enrollment chart, ${CAMPUS_LINE_TABLE.checkedOnLabel}`);
    expect(line.sourceUrl).toMatch(/^https:\/\/campus\.kennesaw\.edu\//);
  });

  it.each([
    ["Fri noon", et(20, 12)],
    ["Sat noon", et(21, 12)],
    ["Sun noon", et(22, 12)],
    ["Mon 18:00 (evening)", et(16, 18)],
    ["Tue 23:00 (evening)", et(17, 23)],
    ["Wed 6:59 (before 7 AM)", et(18, 6, 59)],
    ["Thu 0:30", et(19, 0, 30)],
  ])("no line on %s", (_label, now) => {
    expect(evaluateCampusLine(now)).toBeNull();
  });

  it("uses Eastern time across daylight saving (July is EDT)", () => {
    // 2026-07-13 is a Monday; 10:00 EDT = 14:00 UTC.
    expect(evaluateCampusLine(Date.UTC(2026, 6, 13, 14))?.state).toBe("busy");
    expect(evaluateCampusLine(Date.UTC(2026, 6, 13, 13))?.state).toBe("quieter");
  });

  it("is dated and hand-typed", () => {
    expect(CAMPUS_LINE_TABLE.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CAMPUS_LINE_TABLE.busyWindows).toHaveLength(4);
  });
});

describe("fullness only from Student Parking Reports", () => {
  const now = Date.now();
  const report = (authorId: string, tier: 0 | 1 | 2 | 3, minsAgo: number) => ({
    authorId, fullnessTier: tier, publishedAt: now - minsAgo * 60_000,
    expiresAt: now + (45 - minsAgo) * 60_000, status: "active" as const,
  });

  it("0 reports: neutral, no tier, no percentage", () => {
    const ev = evaluateParkingLotFullness([], now);
    expect(ev).toMatchObject({ effectiveTier: null, noRecentReports: true, tierLabel: "No recent reports", provenanceLabel: "No recent reports" });
    expect(`${ev.tierLabel} ${ev.provenanceLabel}`).not.toMatch(/%|Estimated/);
  });

  it("1 report: the reported tier, unconfirmed", () => {
    const ev = evaluateParkingLotFullness([report("a", 2, 4)], now);
    expect(ev).toMatchObject({ effectiveTier: 2, noRecentReports: false, tierLabel: "Nearly Full", provenanceKind: "single_report" });
    expect(ev.provenanceLabel).toBe("Live · 1 Student report (4 min ago) · unconfirmed");
  });

  it("≥2 reports: Student-verified", () => {
    const ev = evaluateParkingLotFullness([report("a", 3, 2), report("b", 3, 6)], now);
    expect(ev).toMatchObject({ effectiveTier: 3, tierLabel: "Full", provenanceKind: "verified_multi" });
    expect(ev.provenanceLabel).toMatch(/^Live · Student-verified/);
    expect(ev.tierLabel).not.toMatch(/%/);
  });
});
