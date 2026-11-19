import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { easternDate, localTimestamp, zonedDateParts } from "../../convex/lib/easternDate";
import { distanceMeters, normalizeQuery, type Campus, type CampusPlace } from "./campusPlaces";
import shuttleCatalog from "../../data/ksu-seed/shuttle-routes.json";

export type Schedule = FunctionReturnType<typeof api.shell.getNowHud>["schedule"];
export const wayfindingRoutes = shuttleCatalog.routes;
export type ClassMeeting = {
  key: string; title: string; days: string[]; startMinutes: number; endMinutes?: number;
  campus?: Campus; location: string; room?: string; online: boolean; termCode: string;
};
export type NextClass = ClassMeeting & { startsAt: number };

/** Imported meetings override their matched Banner meeting, without dropping unmatched classes. */
export function classMeetings(schedule: Schedule): ClassMeeting[] {
  const imported = schedule.privateClasses ?? [];
  const meetings: ClassMeeting[] = imported.map((entry) => {
    const course = schedule.enrolledCourses.find((course) => course.sectionId && course.sectionId === entry.sectionId);
    const banner = course?.meetings[0];
    return {
      ...entry, key: entry.termCode + ":" + entry.key,
      campus: course?.campus, location: entry.location || banner?.buildingName || "",
      room: entry.location ? undefined : banner?.roomNumber,
      online: course?.deliveryMode === "online" || /\b(online|virtual|zoom|webex|teams|asynchronous)\b|https?:\/\//i.test(entry.location ?? ""),
    };
  });
  for (const course of schedule.enrolledCourses) {
    if (course.sectionId && imported.some((entry) => entry.sectionId === course.sectionId)) continue;
    course.meetings.forEach((meeting, index) => meetings.push({
      ...meeting, key: String(course.enrollmentId) + ":" + index,
      title: course.subjectCourse + " · " + course.title, termCode: course.termCode,
      campus: course.campus, location: meeting.buildingName, room: meeting.roomNumber,
      online: course.deliveryMode === "online",
    }));
  }
  return meetings;
}

/** Next weekly start in Eastern time; never revive a past semester or shift at DST. */
export function nextClass(schedule: Schedule, now: number): NextClass | null {
  const date = zonedDateParts(now);
  const season = date.month >= 8 ? "08" : date.month >= 5 ? "05" : "01";
  const term = String(date.year) + season;
  const candidates: NextClass[] = [];
  for (const meeting of classMeetings(schedule).filter((entry) => entry.termCode === term)) {
    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(easternDate(now, offset) + "T12:00:00Z");
      const month = day.getUTCMonth() + 1;
      const candidateTerm = String(day.getUTCFullYear()) + (month >= 8 ? "08" : month >= 5 ? "05" : "01");
      if (candidateTerm !== meeting.termCode) continue;
      const weekday = ["U", "M", "T", "W", "R", "F", "S"][day.getUTCDay()]!;
      if (!meeting.days.includes(weekday)) continue;
      const startsAt = localTimestamp({
        year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(),
        hour: Math.floor(meeting.startMinutes / 60), minute: meeting.startMinutes % 60, second: 0,
      });
      if (startsAt !== null && startsAt >= now) { candidates.push({ ...meeting, startsAt }); break; }
    }
  }
  return candidates.sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key))[0] ?? null;
}

/** Resolve a named building or code plus room. Ambiguous/unknown locations stay unlinked. */
export function classDestination(meeting: ClassMeeting, places: CampusPlace[]): CampusPlace | null {
  if (meeting.online || !meeting.location.trim()) return null;
  const location = normalizeQuery(meeting.location.replace(/\b(?:room|rm)\.?\s*[a-z]?\d[\w-]*\b/gi, ""));
  const hits = places.filter((place) => (!meeting.campus || meeting.campus === place.campus) &&
    [place.name, place.code ?? "", ...place.aliases].some((name) => {
      const normalized = normalizeQuery(name);
      return normalized && (location === normalized || location.startsWith(normalized + " ") && /^\d[\w -]*$/.test(location.slice(normalized.length + 1)));
    }));
  return hits.length === 1 ? hits[0]! : null;
}

type Origin = { campus: string; latitude?: number; longitude?: number; stopId?: string; name: string };
export function classTrip(destination: CampusPlace, origin: Origin) {
  const crossCampus = origin.campus !== "All KSU" && origin.campus !== destination.campus;
  const routes = wayfindingRoutes.filter((route) => route.stops.some((stop) => stop.campus === destination.campus) &&
    (!crossCampus || route.stops.some((stop) => stop.campus === origin.campus)));
  const possible = routes.flatMap((route) => route.stops.filter((stop) => stop.campus === destination.campus)
    .map((stop) => ({ route, stop, distance: distanceMeters(destination, stop) })));
  const savedRoutes = possible.filter(({ route }) => origin.stopId && route.stops.some((stop) => stop.stopId === origin.stopId));
  const nearest = (savedRoutes.length ? savedRoutes : possible).sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) return null;
  const stops = nearest.route.stops.filter((stop) => stop.campus === (crossCampus ? origin.campus : destination.campus));
  const originPoint = origin.latitude !== undefined && origin.longitude !== undefined
    ? { latitude: origin.latitude, longitude: origin.longitude } : null;
  const boarding = stops.find((stop) => stop.stopId === origin.stopId) ??
    (originPoint
      ? [...stops].sort((a, b) => distanceMeters(originPoint, a) - distanceMeters(originPoint, b))[0]
      : crossCampus ? stops[0] : nearest.stop);
  return { ...nearest, boarding, crossCampus };
}
