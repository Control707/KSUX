import type { Doc } from "../_generated/dataModel";
import { zonedDateParts } from "./easternDate";

const SHUTTLE_TTL_MS = 15 * 60_000;
type Snapshot = Doc<"shuttleSnapshots"> | null;

function isFresh(snapshot: Snapshot, observedAt: number | undefined, now: number, demo: boolean) {
  if (!snapshot) return false;
  if (snapshot.isFixture) return demo;
  return observedAt !== undefined && now - observedAt <= SHUTTLE_TTL_MS;
}

export function freshShuttleVehicles(snapshot: Snapshot, now: number, demo: boolean) {
  return snapshot && isFresh(snapshot, snapshot.vehiclesFetchedAt, now, demo) ? snapshot.vehicles : [];
}

export function freshShuttleNotices(snapshot: Snapshot, now: number, demo: boolean) {
  return snapshot && isFresh(snapshot, snapshot.noticesFetchedAt, now, demo) ? snapshot.shuttleNotices ?? [] : [];
}

/**
 * When the Shuttle Notices were last retrieved from Passio. Passio's
 * serviceAlerts carry no posted time, so the UI shows this retrieval time.
 */
export function shuttleNoticesRetrievedAt(snapshot: Snapshot) {
  if (!snapshot) return null;
  return snapshot.noticesFetchedAt ?? snapshot.fetchedAt ?? null;
}

export function freshShuttleEta(snapshot: Snapshot, routeId: string, now: number, demo: boolean) {
  if (!snapshot || !isFresh(snapshot, snapshot.etasFetchedAt, now, demo)) return null;
  const eta = snapshot.stopEtas.find((row) => row.passioRouteId === routeId
    && (snapshot.isFixture || (row.arrivalAt !== undefined && row.arrivalAt >= now)));
  if (!eta) return null;
  return {
    ...eta,
    etaMinutes: eta.arrivalAt === undefined ? eta.etaMinutes : Math.ceil((eta.arrivalAt - now) / 60_000),
    loadLabel: snapshot.isFixture ? "Demo estimate" : eta.loadLabel,
  };
}

/** Upcoming arrival minutes for one route at one stop (soonest first, at most 3). */
export function freshShuttleStopEtas(snapshot: Snapshot, routeId: string, stopId: string, now: number, demo: boolean) {
  if (!snapshot || !isFresh(snapshot, snapshot.etasFetchedAt, now, demo)) return [];
  return snapshot.stopEtas
    .filter((row) => row.passioRouteId === routeId && row.stopId === stopId
      && (snapshot.isFixture || (row.arrivalAt !== undefined && row.arrivalAt >= now)))
    .map((row) => row.arrivalAt === undefined ? row.etaMinutes : Math.ceil((row.arrivalAt - now) / 60_000))
    .sort((a, b) => a - b)
    .slice(0, 3);
}

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Days a route runs, parsed from its hours summary ("Mon–Fri 7:00 AM – …",
 * "Fri–Sun 11:00 AM – …"). Returns null when the summary has no day range.
 */
export function shuttleRunDays(hoursSummary: string): { days: number[]; label: string } | null {
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*[–-]\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/.exec(hoursSummary.trim());
  if (!match) return null;
  const from = DAY_INDEX[match[1]!]!;
  const to = DAY_INDEX[match[2]!]!;
  const days: number[] = [];
  for (let d = from; ; d = (d + 1) % 7) {
    days.push(d);
    if (d === to || days.length > 7) break;
  }
  return { days, label: `${match[1]}–${match[2]}` };
}

/** Whether a route runs today in Eastern time (true when the hours don't say). */
export function shuttleRunsToday(hoursSummary: string, now: number) {
  const parsed = shuttleRunDays(hoursSummary);
  if (!parsed) return { runsToday: true, runDaysLabel: null as string | null };
  const p = zonedDateParts(now);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { runsToday: parsed.days.includes(weekday), runDaysLabel: parsed.label };
}
