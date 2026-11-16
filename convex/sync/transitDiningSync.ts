import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getEasternDayAndHour } from "../lib/parkingMath";
import {
  computePayloadHash,
  evaluateFailureStatePatch,
  fetchUpstreamWithRetry,
  isSuddenDropOrEmpty,
  UpstreamFetchFn,
} from "../lib/syncGuard";

export function isBigOwlBusOperatingHours(nowMs: number): boolean {
  const { dayOfWeek, minuteOfDay } = getEasternDayAndHour(nowMs);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) {
    // Sat-Sun 10:00 - 19:00 ET
    return minuteOfDay >= 600 && minuteOfDay <= 1140;
  }
  // Mon-Fri 06:30 - 23:30 ET
  return minuteOfDay >= 390 && minuteOfDay <= 1410;
}

export async function runPassioShuttleIngestCycle(params: {
  syncState: {
    consecutiveFailures: number;
    backoffUntil?: number;
    lastPayloadHash?: string;
    activeRecordCount: number;
  };
  nowMs: number;
  fetchImpl?: UpstreamFetchFn;
}): Promise<
  | { status: "circuit_open" }
  | { status: "noop_unchanged"; payloadHash: string }
  | {
      status: "failed";
      failurePatch: ReturnType<typeof evaluateFailureStatePatch>;
      reason: string;
    }
  | {
      status: "ready_to_upsert";
      payloadHash: string;
      vehicles: Array<{
        busId: string;
        busName: string;
        passioRouteId: string;
        latitude: number;
        longitude: number;
        heading: number;
        paxLoad: number;
        totalCap: number;
      }>;
      stopEtas: Array<{
        stopId: string;
        passioRouteId: string;
        etaMinutes: number;
        loadLabel: string;
      }>;
      serviceAlerts: Array<{
        alertId: string;
        title: string;
        body: string;
        passioRouteIds: string[];
      }>;
    }
> {
  const { syncState, nowMs, fetchImpl } = params;
  if (syncState.backoffUntil && syncState.backoffUntil > nowMs) {
    return { status: "circuit_open" };
  }

  try {
    const [vehResp, tripResp, alertResp] = await Promise.all([
      fetchUpstreamWithRetry(
        "https://passio3.com/kennesaw/passioTransit/gtfs/realtime/vehiclePositions.json",
        { headers: { Accept: "application/json" } },
        fetchImpl
      ),
      fetchUpstreamWithRetry(
        "https://passio3.com/kennesaw/passioTransit/gtfs/realtime/tripUpdates.json",
        { headers: { Accept: "application/json" } },
        fetchImpl
      ),
      fetchUpstreamWithRetry(
        "https://passio3.com/kennesaw/passioTransit/gtfs/realtime/serviceAlerts.json",
        { headers: { Accept: "application/json" } },
        fetchImpl
      ),
    ]);

    const [vehJson, tripJson, alertJson] = await Promise.all([
      vehResp.json(),
      tripResp.json(),
      alertResp.json(),
    ]);

    const vehEntities: any[] = Array.isArray(vehJson?.entity)
      ? vehJson.entity
      : [];
    const vehicles = vehEntities
      .map((ent, idx) => {
        const vObj = ent?.vehicle;
        const pos = vObj?.position;
        if (!pos || typeof pos.latitude !== "number") return null;
        return {
          busId: String(vObj?.vehicle?.id || ent.id || `bus-${idx}`),
          busName: String(vObj?.vehicle?.label || `BOB #${idx + 1}`),
          passioRouteId: String(vObj?.trip?.route_id || "74760"),
          latitude: Number(pos.latitude),
          longitude: Number(pos.longitude),
          heading: Number(pos.bearing || 0),
          paxLoad: Number(vObj?.occupancy_percentage || 15),
          totalCap: 42,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const tripEntities: any[] = Array.isArray(tripJson?.entity)
      ? tripJson.entity
      : [];
    const stopEtas = tripEntities
      .slice(0, 35)
      .map((ent) => {
        const tu = ent?.trip_update;
        const stu = tu?.stop_time_update?.[0];
        if (!stu?.stop_id) return null;
        const arrSec = Number(stu.arrival?.time || nowMs / 1000 + 300);
        const etaMinutes = Math.max(
          1,
          Math.min(45, Math.round((arrSec * 1000 - nowMs) / 60_000))
        );
        return {
          stopId: String(stu.stop_id),
          passioRouteId: String(tu?.trip?.route_id || "74760"),
          etaMinutes,
          loadLabel: "Live GTFS-RT",
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const alertEntities: any[] = Array.isArray(alertJson?.entity)
      ? alertJson.entity
      : [];
    const serviceAlerts = alertEntities.slice(0, 10).map((ent, idx) => {
      const al = ent?.alert ?? {};
      const title =
        al.header_text?.translation?.[0]?.text || "Big Owl Bus Service Alert";
      const body =
        al.description_text?.translation?.[0]?.text || "Check route map.";
      const routeIds = Array.isArray(al.informed_entity)
        ? al.informed_entity
            .map((ie: any) => ie.route_id)
            .filter(Boolean)
            .map(String)
        : [];
      return {
        alertId: String(ent?.id || `alert-${idx}`),
        title: String(title),
        body: String(body),
        passioRouteIds: routeIds,
      };
    });

    const combinedPayload = { vehicles, stopEtas, serviceAlerts };
    const payloadHash = await computePayloadHash(combinedPayload);
    if (payloadHash === syncState.lastPayloadHash) {
      return { status: "noop_unchanged", payloadHash };
    }

    return {
      status: "ready_to_upsert",
      payloadHash,
      vehicles,
      stopEtas,
      serviceAlerts,
    };
  } catch (err: any) {
    const reason = err?.message || "Passio GO sync failed";
    return {
      status: "failed",
      failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
      reason,
    };
  }
}

export async function runNutrisliceDiningIngestCycle(params: {
  syncState: {
    consecutiveFailures: number;
    backoffUntil?: number;
    lastPayloadHash?: string;
    activeRecordCount: number;
  };
  nowMs: number;
  fetchImpl?: UpstreamFetchFn;
}): Promise<
  | { status: "circuit_open" }
  | { status: "noop_unchanged"; payloadHash: string }
  | {
      status: "failed_or_aborted";
      failurePatch: ReturnType<typeof evaluateFailureStatePatch>;
      reason: string;
    }
  | {
      status: "ready_to_upsert";
      payloadHash: string;
      schools: Array<{
        slug: string;
        nutrisliceId: number;
        name: string;
      }>;
    }
> {
  const { syncState, nowMs, fetchImpl } = params;
  if (syncState.backoffUntil && syncState.backoffUntil > nowMs) {
    return { status: "circuit_open" };
  }

  try {
    const resp = await fetchUpstreamWithRetry(
      "https://ksu.api.nutrislice.com/menu/api/schools/?format=json",
      { headers: { Accept: "application/json" } },
      fetchImpl
    );
    const schoolsRaw: any[] = await resp.json();
    const schools = (Array.isArray(schoolsRaw) ? schoolsRaw : [])
      .filter((s) => s?.slug && s?.name)
      .map((s) => ({
        slug: String(s.slug),
        nutrisliceId: Number(s.id || 0),
        name: String(s.name),
      }));

    if (isSuddenDropOrEmpty(syncState.activeRecordCount, schools.length)) {
      const reason = `Aborted Nutrislice upsert: incoming ${schools.length} vs previous ${syncState.activeRecordCount} (>80% drop or empty).`;
      return {
        status: "failed_or_aborted",
        failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
        reason,
      };
    }

    const payloadHash = await computePayloadHash(schools);
    if (payloadHash === syncState.lastPayloadHash) {
      return { status: "noop_unchanged", payloadHash };
    }

    return {
      status: "ready_to_upsert",
      payloadHash,
      schools,
    };
  } catch (err: any) {
    const reason = err?.message || "Nutrislice dining sync failed";
    return {
      status: "failed_or_aborted",
      failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
      reason,
    };
  }
}

export const getSyncStateInternal = internalQuery({
  args: { sourceKey: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", args.sourceKey))
      .unique();
  },
});

export const applyShuttleSyncInternal = internalMutation({
  args: {
    now: v.number(),
    status: v.union(
      v.literal("noop_unchanged"),
      v.literal("ready_to_upsert"),
      v.literal("failed")
    ),
    payloadHash: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    vehicles: v.optional(v.array(v.any())),
    stopEtas: v.optional(v.array(v.any())),
    serviceAlerts: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "passio_shuttle"))
      .unique();

    if (args.status === "failed") {
      const patch = evaluateFailureStatePatch(
        state ?? { consecutiveFailures: 0, activeRecordCount: 11 },
        args.now,
        args.failureReason ?? "Passio error"
      );
      if (state) await ctx.db.patch(state._id, patch);
      return;
    }

    if (args.status === "ready_to_upsert") {
      const snap = await ctx.db
        .query("shuttleSnapshots")
        .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
        .unique();
      const nextVehicles = args.vehicles ?? snap?.vehicles ?? [];
      const nextEtas =
        (args.stopEtas?.length ?? 0) > 0
          ? args.stopEtas!
          : (snap?.stopEtas ?? []);
      const nextAlerts = args.serviceAlerts ?? snap?.serviceAlerts ?? [];

      if (snap) {
        await ctx.db.patch(snap._id, {
          vehicles: nextVehicles,
          stopEtas: nextEtas,
          serviceAlerts: nextAlerts,
          fetchedAt: args.now,
        });
      } else {
        await ctx.db.insert("shuttleSnapshots", {
          singletonKey: "latest",
          vehicles: nextVehicles,
          stopEtas: nextEtas,
          serviceAlerts: nextAlerts,
          fetchedAt: args.now,
        });
      }
    }

    if (state) {
      await ctx.db.patch(state._id, {
        lastSuccessAt: args.now,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        backoffUntil: undefined,
        lastPayloadHash: args.payloadHash ?? state.lastPayloadHash,
        lastError: undefined,
      });
    }
  },
});

export const applyDiningSyncInternal = internalMutation({
  args: {
    now: v.number(),
    status: v.union(
      v.literal("noop_unchanged"),
      v.literal("ready_to_upsert"),
      v.literal("failed_or_aborted")
    ),
    payloadHash: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    schools: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "nutrislice_dining"))
      .unique();

    if (args.status === "failed_or_aborted") {
      const patch = evaluateFailureStatePatch(
        state ?? { consecutiveFailures: 0, activeRecordCount: 17 },
        args.now,
        args.failureReason ?? "Nutrislice error"
      );
      if (state) await ctx.db.patch(state._id, patch);
      return;
    }

    if (args.status === "ready_to_upsert" && args.schools) {
      for (const s of args.schools) {
        const existing = await ctx.db
          .query("diningVenues")
          .withIndex("by_slug", (q) => q.eq("nutrisliceSlug", s.slug))
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, {
            lastMenuSyncAt: args.now,
            lastHoursSyncAt: args.now,
          });
        }
      }
    }

    if (state) {
      await ctx.db.patch(state._id, {
        lastSuccessAt: args.now,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        backoffUntil: undefined,
        lastPayloadHash: args.payloadHash ?? state.lastPayloadHash,
        activeRecordCount: args.schools?.length ?? state.activeRecordCount,
        lastError: undefined,
      });
    }
  },
});

export const runScheduledShuttleSync = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const now = Date.now();
    // 2m during operating hours, 30m overnight!
    if (!isBigOwlBusOperatingHours(now)) {
      const { minuteOfDay } = getEasternDayAndHour(now);
      if (minuteOfDay % 30 >= 2) {
        return { status: "skipped_overnight_cadence" };
      }
    }

    const state = (await ctx.runQuery(
      internal.sync.transitDiningSync.getSyncStateInternal,
      { sourceKey: "passio_shuttle" }
    )) ?? {
      consecutiveFailures: 0,
      activeRecordCount: 11,
    };

    const outcome = await runPassioShuttleIngestCycle({
      syncState: state,
      nowMs: now,
    });

    if (outcome.status === "circuit_open") return { status: "circuit_open" };
    if (outcome.status === "failed") {
      await ctx.runMutation(
        internal.sync.transitDiningSync.applyShuttleSyncInternal,
        {
          now,
          status: "failed",
          failureReason: outcome.reason,
        }
      );
      return { status: "failed" };
    }
    if (outcome.status === "noop_unchanged") {
      await ctx.runMutation(
        internal.sync.transitDiningSync.applyShuttleSyncInternal,
        {
          now,
          status: "noop_unchanged",
          payloadHash: outcome.payloadHash,
        }
      );
      return { status: "noop_unchanged" };
    }

    await ctx.runMutation(
      internal.sync.transitDiningSync.applyShuttleSyncInternal,
      {
        now,
        status: "ready_to_upsert",
        payloadHash: outcome.payloadHash,
        vehicles: outcome.vehicles,
        stopEtas: outcome.stopEtas,
        serviceAlerts: outcome.serviceAlerts,
      }
    );
    return { status: "updated" };
  },
});

export const runScheduledDiningSync = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const now = Date.now();
    const state = (await ctx.runQuery(
      internal.sync.transitDiningSync.getSyncStateInternal,
      { sourceKey: "nutrislice_dining" }
    )) ?? {
      consecutiveFailures: 0,
      activeRecordCount: 17,
    };

    const outcome = await runNutrisliceDiningIngestCycle({
      syncState: state,
      nowMs: now,
    });

    if (outcome.status === "circuit_open") return { status: "circuit_open" };
    if (outcome.status === "failed_or_aborted") {
      await ctx.runMutation(
        internal.sync.transitDiningSync.applyDiningSyncInternal,
        {
          now,
          status: "failed_or_aborted",
          failureReason: outcome.reason,
        }
      );
      return { status: "failed_or_aborted" };
    }
    if (outcome.status === "noop_unchanged") {
      await ctx.runMutation(
        internal.sync.transitDiningSync.applyDiningSyncInternal,
        {
          now,
          status: "noop_unchanged",
          payloadHash: outcome.payloadHash,
        }
      );
      return { status: "noop_unchanged" };
    }

    await ctx.runMutation(
      internal.sync.transitDiningSync.applyDiningSyncInternal,
      {
        now,
        status: "ready_to_upsert",
        payloadHash: outcome.payloadHash,
        schools: outcome.schools,
      }
    );
    return { status: "updated" };
  },
});
