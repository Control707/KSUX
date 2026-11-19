import campusLineSeed from "../../data/ksu-seed/parking-campus-line.json";
import { getEasternDayAndHour } from "./parkingMath";

/**
 * Campus-wide "Usually busy/quieter now" line (SPEC-v2 §4). It comes from a
 * hand-typed, dated table of KSU's class-enrollment chart in the seed, not
 * from any per-lot estimate, and is re-checked by hand once per term.
 *
 * Shown only Mon–Thu daytime in America/New_York:
 * - Fridays, Saturdays and Sundays: no line.
 * - Evenings: no line. "Evening" means 6 PM ET or later, and before 7 AM ET
 *   (hourOfDay >= 18 || hourOfDay < 7).
 */
export const CAMPUS_LINE_DAY_START_HOUR = 7;
export const CAMPUS_LINE_EVENING_START_HOUR = 18;

export interface CampusLineTable {
  checkedOn: string;
  checkedOnLabel: string;
  sourceLabel: string;
  sourceUrl: string;
  /** day: 0 = Sunday … 6 = Saturday; hours are [startHour, endHour) in ET. */
  busyWindows: Array<{ day: number; startHour: number; endHour: number }>;
}

export interface CampusLine {
  state: "busy" | "quieter";
  /** "Usually busy now" or "Usually quieter now". */
  label: string;
  /** "per KSU class-enrollment chart, Nov 18, 2026" */
  sourceText: string;
  sourceUrl: string;
  checkedOn: string;
  /** "Nov 18, 2026" */
  checkedOnLabel: string;
  /** label + " · " + sourceText */
  text: string;
}

export const CAMPUS_LINE_TABLE = campusLineSeed as CampusLineTable;

export function evaluateCampusLine(
  nowMs: number,
  table: CampusLineTable = CAMPUS_LINE_TABLE
): CampusLine | null {
  const { dayOfWeek, hourOfDay } = getEasternDayAndHour(nowMs);
  // Fridays and weekends: no line.
  if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) return null;
  // Evenings (>= 6 PM ET or before 7 AM ET): no line.
  if (hourOfDay >= CAMPUS_LINE_EVENING_START_HOUR || hourOfDay < CAMPUS_LINE_DAY_START_HOUR) {
    return null;
  }
  const busy = table.busyWindows.some(
    (w) => w.day === dayOfWeek && hourOfDay >= w.startHour && hourOfDay < w.endHour
  );
  const label = busy ? "Usually busy now" : "Usually quieter now";
  const sourceText = `per ${table.sourceLabel}, ${table.checkedOnLabel}`;
  return {
    state: busy ? "busy" : "quieter",
    label,
    sourceText,
    sourceUrl: table.sourceUrl,
    checkedOn: table.checkedOn,
    checkedOnLabel: table.checkedOnLabel,
    text: `${label} · ${sourceText}`,
  };
}
