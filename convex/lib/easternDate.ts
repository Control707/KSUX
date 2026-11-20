const EASTERN_TIME_ZONE = "America/New_York";

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function dateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

// Campus reads and calendar timestamp resolution repeatedly use this fixed zone.
// Keep custom zones uncached so imported calendar TZIDs cannot grow a global cache.
const easternFormatter = dateTimeFormatter(EASTERN_TIME_ZONE);

export function zonedDateParts(
  instant: number,
  timeZone = EASTERN_TIME_ZONE
): LocalDateTime {
  const formatter = timeZone === EASTERN_TIME_ZONE ? easternFormatter : dateTimeFormatter(timeZone);
  const fields = formatter.formatToParts(instant);

  const field = (kind: Intl.DateTimeFormatPartTypes) =>
    Number(fields.find((part) => part.type === kind)?.value);
  return {
    year: field("year"),
    month: field("month"),
    day: field("day"),
    hour: field("hour"),
    minute: field("minute"),
    second: field("second"),
  };
}

function calendarTimestamp(parts: LocalDateTime): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

export function easternDate(instant: number, dayOffset = 0): string {
  const parts = zonedDateParts(instant);
  return new Date(calendarTimestamp({
    ...parts,
    day: parts.day + dayOffset,
  })).toISOString().slice(0, 10);
}

export function localTimestamp(
  parts: LocalDateTime,
  timeZone = EASTERN_TIME_ZONE
): number | null {
  const wall = calendarTimestamp(parts);
  if (!Number.isFinite(wall)) return null;
  try {
    // Compare both sides of a possible offset change. Ambiguous fall-back times
    // resolve to the earlier occurrence, as iCalendar specifies.
    const offsets = new Set([wall - 86_400_000, wall, wall + 86_400_000].map(
      (probe) => calendarTimestamp(zonedDateParts(probe, timeZone)) - probe
    ));
    const candidates = [...offsets].map((offset) => wall - offset).filter((candidate) => {
      const actual = zonedDateParts(candidate, timeZone);
      return Object.keys(parts).every((part) => {
        const field = part as keyof LocalDateTime;
        return actual[field] === parts[field];
      });
    });
    return candidates.length ? Math.min(...candidates) : null;
  } catch {
    return null;
  }
}
