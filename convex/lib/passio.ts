import { computePayloadHash, evaluateFailureStatePatch, fetchUpstreamWithRetry,
  isSuddenDropOrEmpty, type SyncStateSnapshot, type UpstreamFetchFn } from "./syncGuard";

const PASSIO_URL = "https://passio3.com/kennesaw/passioTransit/gtfs/realtime";

function parseVehicles(entities: any[]) {
  const rows = entities.flatMap(({ id, vehicle }) => {
    const position = vehicle?.position;
    const route = vehicle?.trip?.route_id;
    const busId = vehicle?.vehicle?.id ?? id;
    if (!busId || !route || !Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) return [];
    return [{
      busId: String(busId),
      busName: String(vehicle.vehicle?.label ?? busId),
      passioRouteId: String(route),
      latitude: position.latitude as number,
      longitude: position.longitude as number,
      heading: Number.isFinite(position.bearing) ? Number(position.bearing) : 0,
      paxLoad: Number.isFinite(vehicle.occupancy_percentage) ? Number(vehicle.occupancy_percentage) : 0,
      totalCap: Number.isFinite(vehicle.occupancy_percentage) ? 100 : 0,
    }];
  });
  if (entities.length > 0 && rows.length === 0) throw new Error("No usable Passio vehicle positions");
  return rows;
}

function parseEtas(entities: any[], now: number) {
  if (entities.length && !entities.some((entity) => entity?.trip_update?.trip?.route_id)) {
    throw new Error("No usable Passio trip updates");
  }
  const rows = [];
  for (const entity of entities) {
    const update = entity?.trip_update;
    const route = update?.trip?.route_id;
    if (!route || !Array.isArray(update.stop_time_update)) continue;
    for (const stop of update.stop_time_update) {
      const seconds = Number(stop?.arrival?.time ?? stop?.departure?.time);
      const arrivalAt = seconds * 1000;
      if (!stop?.stop_id || !Number.isFinite(arrivalAt) || arrivalAt < now || arrivalAt - now > 45 * 60_000) continue;
      rows.push({
        stopId: String(stop.stop_id),
        passioRouteId: String(route),
        arrivalAt,
        etaMinutes: Math.ceil((arrivalAt - now) / 60_000),
        loadLabel: "Live GTFS-RT",
      });
    }
  }
  return rows.sort((a, b) => a.arrivalAt - b.arrivalAt).slice(0, 350);
}

function parseAlerts(entities: any[]) {
  const rows = entities.flatMap(({ id, alert }) => {
    const title = alert?.header_text?.translation?.[0]?.text;
    if (!id || typeof title !== "string" || !title.trim()) return [];
    const routeIds = Array.isArray(alert.informed_entity) ? alert.informed_entity
      .flatMap((entity: any) => entity?.route_id ? [String(entity.route_id)] : []) : [];
    return [{
      noticeId: String(id),
      title: title.slice(0, 160),
      body: String(alert.description_text?.translation?.[0]?.text ?? "").slice(0, 600),
      passioRouteIds: routeIds,
    }];
  });
  if (entities.length && !rows.length) throw new Error("No usable Passio service alerts");
  return rows.slice(0, 20);
}

export async function runPassioShuttleIngestCycle(params: {
  syncState: Pick<SyncStateSnapshot, "consecutiveFailures" | "backoffUntil" | "lastPayloadHash" | "activeRecordCount">;
  nowMs: number;
  fetchImpl?: UpstreamFetchFn;
  previousVehicleCount?: number;
}) {
  const { syncState, nowMs, fetchImpl } = params;
  if (syncState.backoffUntil && syncState.backoffUntil > nowMs) return { status: "circuit_open" as const };

  const fetchEntities = async (endpoint: string) => {
    const response = await fetchUpstreamWithRetry(`${PASSIO_URL}/${endpoint}.json`,
      { headers: { Accept: "application/json" } }, fetchImpl);
    const payload = await response.json();
    if (Array.isArray(payload?.entity)) return payload.entity as any[];

    // GTFS-RT JSON may omit the repeated entity field when the full snapshot is empty.
    const header = payload?.header;
    if (payload?.entity === undefined &&
        (header?.gtfs_realtime_version === "1.0" || header?.gtfs_realtime_version === "2.0") &&
        (header.incrementality === undefined || header.incrementality === 0 || header.incrementality === "FULL_DATASET") &&
        (header.timestamp === undefined ||
          (Number.isInteger(header.timestamp) && header.timestamp >= 0) ||
          (typeof header.timestamp === "string" && /^\d+$/.test(header.timestamp)))) {
      return [];
    }
    throw new Error(`Invalid Passio ${endpoint} response`);
  };
  const [positionResult, etaResult, alertResult] = await Promise.allSettled([
    fetchEntities("vehiclePositions").then((entities) => {
      const rows = parseVehicles(entities);
      if (params.previousVehicleCount && isSuddenDropOrEmpty(params.previousVehicleCount, rows.length)) {
        throw new Error("Sudden drop in Passio vehicle coverage");
      }
      return rows;
    }),
    fetchEntities("tripUpdates").then((entities) => parseEtas(entities, nowMs)),
    fetchEntities("serviceAlerts").then(parseAlerts),
  ]);

  const vehicles = positionResult.status === "fulfilled" ? positionResult.value : undefined;
  const stopEtas = etaResult.status === "fulfilled" ? etaResult.value : undefined;
  const shuttleNotices = alertResult.status === "fulfilled" ? alertResult.value : undefined;
  // A successful empty stream replaces its cached rows; only unavailable streams retain them.
  if (vehicles === undefined && stopEtas === undefined && shuttleNotices === undefined) {
    const reason = "Passio provided no usable shuttle data";
    return { status: "failed" as const, reason, failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason) };
  }

  const payloadHash = await computePayloadHash({
    vehicles,
    stopEtas: stopEtas?.map(({ etaMinutes: _relativeMinutes, ...eta }) => eta),
    shuttleNotices,
  });
  return {
    status: vehicles && stopEtas && shuttleNotices && payloadHash === syncState.lastPayloadHash
      ? "noop_unchanged" as const : "ready_to_upsert" as const,
    payloadHash, vehicles, stopEtas, shuttleNotices,
  };
}
