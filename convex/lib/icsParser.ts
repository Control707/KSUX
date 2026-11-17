import { localTimestamp, zonedDateParts } from "./easternDate";

export interface ParsedIcsClassBlock {
  uid: string;
  summary: string;
  crnCandidate?: string;
  courseCodeCandidate?: string;
  byDays: string[];
  startMinutes?: number;
  location?: string;
}

export interface ParsedIcsDeadline {
  uid: string;
  title: string;
  dueAt: number;
  courseCode?: string;
  location?: string;
}

export interface StatelessIcsParseResult {
  classBlocks: ParsedIcsClassBlock[];
  deadlines: ParsedIcsDeadline[];
}

const ICAL_DAY_MAP: Record<string, string> = {
  MO: "M",
  TU: "T",
  WE: "W",
  TH: "R",
  FR: "F",
  SA: "S",
  SU: "U",
};

function unfoldIcsLines(rawIcs: string): string[] {
  const unfolded = rawIcs.replace(/\r?\n[ \t]/g, "");
  return unfolded
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function stripAnyTokenUrls(text: string): string {
  // Never persist live D2L/LMS subscription URLs or query tokens
  return text.replace(/https?:\/\/\S+/gi, "").trim();
}

function parseIcsTimestamp(rawVal: string, timeZone?: string): {
  epochMs: number;
  minutesOfDay: number;
} | null {
  // Matches YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD
  const clean = rawVal.trim();
  const m = clean.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 23;
  const min = m[5] ? Number(m[5]) : 59;
  const sec = m[6] ? Number(m[6]) : 0;
  const isUtc = m[7] === "Z";

  const epochMs = localTimestamp({ year, month, day, hour, minute: min, second: sec },
    isUtc ? "UTC" : timeZone);
  if (epochMs === null) return null;
  const eastern = zonedDateParts(epochMs);
  return {
    epochMs,
    minutesOfDay: eastern.hour * 60 + eastern.minute,
  };
}

function extractCourseCode(text: string): string | undefined {
  const m = text.match(/\b([A-Z]{2,4})\s*[- ]?\s*(\d{4}[A-Z]?)\b/i);
  if (!m) return undefined;
  return `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`;
}

export function parseStatelessScheduleIcs(
  rawIcs: string
): StatelessIcsParseResult {
  if (!rawIcs || rawIcs.length > 512_000) {
    throw new Error("Invalid or oversized .ics calendar file (max 512 KB).");
  }

  const lines = unfoldIcsLines(rawIcs);
  const classBlocks: ParsedIcsClassBlock[] = [];
  const deadlines: ParsedIcsDeadline[] = [];

  let inEvent = false;
  let fields: Record<string, string> = {};
  let timeZones: Record<string, string | undefined> = {};

  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      inEvent = true;
      fields = {};
      timeZones = {};
      continue;
    }
    if (line.toUpperCase() === "END:VEVENT") {
      inEvent = false;
      const summary = stripAnyTokenUrls(
        unescapeIcsText(fields.SUMMARY ?? "Untitled Event")
      );
      const description = stripAnyTokenUrls(
        unescapeIcsText(fields.DESCRIPTION ?? "")
      );
      const location = stripAnyTokenUrls(
        unescapeIcsText(fields.LOCATION ?? "")
      );
      const uid =
        unescapeIcsText(fields.UID ?? "") ||
        `ics-${classBlocks.length + deadlines.length + 1}`;
      const rrule = (fields.RRULE ?? "").toUpperCase();
      const dtStart = fields.DTSTART ? parseIcsTimestamp(fields.DTSTART, timeZones.DTSTART) : null;
      const dtEnd = fields.DTEND ? parseIcsTimestamp(fields.DTEND, timeZones.DTEND) : null;

      const combinedText = `${summary} ${description}`;
      const crnMatch = combinedText.match(/\b(?:CRN[:\s#-]*)?(\d{5})\b/i);
      const courseCode = extractCourseCode(combinedText);

      if (rrule.includes("FREQ=WEEKLY")) {
        const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
        const byDays = byDayMatch
          ? byDayMatch[1]!
              .split(",")
              .map((d) => ICAL_DAY_MAP[d.slice(-2)] ?? "")
              .filter(Boolean)
          : [];

        classBlocks.push({
          uid,
          summary,
          crnCandidate: crnMatch?.[1],
          courseCodeCandidate: courseCode,
          byDays,
          startMinutes: dtStart?.minutesOfDay,
          location: location || undefined,
        });
      } else if (dtEnd || dtStart) {
        const dueAt = (dtEnd ?? dtStart)!.epochMs;
        if (deadlines.length < 100) {
          deadlines.push({
            uid: uid.slice(0, 80),
            title: summary.slice(0, 140),
            dueAt,
            courseCode,
            location: location ? location.slice(0, 80) : undefined,
          });
        }
      }
      continue;
    }

    if (inEvent) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const [key, ...parameters] = line.slice(0, colonIdx).split(";");
        const rawKey = key!.toUpperCase();
        const rawVal = line.slice(colonIdx + 1);
        fields[rawKey] = rawVal;
        if (rawKey === "DTSTART" || rawKey === "DTEND") {
          const zone = parameters.find((parameter) => /^TZID=/i.test(parameter));
          timeZones[rawKey] = zone?.slice(5).replace(/^"|"$/g, "");
        }
      }
    }
  }

  return {
    classBlocks,
    deadlines: deadlines.slice(0, 100),
  };
}
