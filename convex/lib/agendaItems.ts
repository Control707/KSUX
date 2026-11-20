import { easternDate, localTimestamp } from "./easternDate";

export type AgendaKind = "class" | "deadline" | "event" | "study";
export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  title: string;
  startsAt: number;
  endsAt?: number;
  campus?: "Kennesaw" | "Marietta";
  location?: string;
  source: string;
  href: string;
  cancelled: boolean;
}

export function calendarTerm(date: string) {
  const month = Number(date.slice(5, 7));
  return date.slice(0, 4) + (month >= 8 ? "08" : month >= 5 ? "05" : "01");
}

/** Weekly meetings use Eastern wall time, with calendar-term (not holiday) bounds. */
export function classOccurrences(meeting: {
  key: string; title: string; days: string[]; startMinutes: number; endMinutes?: number;
  termCode: string; campus?: "Kennesaw" | "Marietta"; location?: string; source: string; href: string;
}, now: number, days: number): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = easternDate(now, offset);
    if (calendarTerm(date) !== meeting.termCode) continue;
    const day = new Date(date + "T12:00:00Z");
    const weekday = ["U", "M", "T", "W", "R", "F", "S"][day.getUTCDay()]!;
    if (!meeting.days.includes(weekday)) continue;
    const timestamp = (minutes: number) => localTimestamp({
      year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(),
      hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0,
    });
    const startsAt = timestamp(meeting.startMinutes);
    const endsAt = meeting.endMinutes === undefined ? undefined : timestamp(meeting.endMinutes) ?? undefined;
    if (startsAt === null || (endsAt ?? startsAt) < now) continue;
    items.push({ ...meeting, key: meeting.key + ":" + date, kind: "class", startsAt, endsAt, cancelled: false });
  }
  return items;
}

export const reminderKey = (item: AgendaItem) => item.key + ":" + item.startsAt;

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
const icsTime = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RFC 5545 folds at 75 UTF-8 octets; never split a multibyte character. */
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "", current = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += current + "\r\n"; current = " "; bytes = 1; }
    current += character;
    bytes += size;
  }
  return result + current;
}

/** A download snapshot of RSVPed Events only: no class, deadline or attendance data. */
export function exportEventsCalendar(items: AgendaItem[], now: number) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OwlSide//Private Event Agenda//EN", "CALSCALE:GREGORIAN"];
  for (const item of items.filter((item) => item.kind === "event")) {
    lines.push("BEGIN:VEVENT", "UID:" + icsText(item.key) + "@owlside", "DTSTAMP:" + icsTime(now),
      "DTSTART:" + icsTime(item.startsAt), "DTEND:" + icsTime(item.endsAt ?? item.startsAt),
      "SUMMARY:" + icsText(item.title), "LOCATION:" + icsText(item.location ?? ""),
      "DESCRIPTION:" + icsText(item.source), "STATUS:" + (item.cancelled ? "CANCELLED" : "CONFIRMED"), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
