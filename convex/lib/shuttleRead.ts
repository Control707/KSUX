import type { Doc } from "../_generated/dataModel";

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
