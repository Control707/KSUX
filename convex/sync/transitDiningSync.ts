import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getEasternDayAndHour } from "../lib/parkingMath";
import { fetchOfficialDiningHours, fetchNutrisliceDirectory, fetchNutrisliceMenus } from "../lib/diningFeeds";
import {
  computePayloadHash,
  evaluateFailureStatePatch,
  fetchUpstreamWithRetry,
  isSuddenDropOrEmpty,
  UpstreamFetchFn,
} from "../lib/syncGuard";

import { runPassioShuttleIngestCycle } from "../lib/passio";
export { runPassioShuttleIngestCycle } from "../lib/passio";

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

    if (state?.lastAttemptAt !== undefined && state.lastAttemptAt > args.now) return;
    if (args.status === "failed") {
      const patch = evaluateFailureStatePatch(
        state ?? { consecutiveFailures: 0, activeRecordCount: 0 },
        args.now,
        args.failureReason ?? "Passio error"
      );
      if (state) await ctx.db.patch(state._id, patch);
      else await ctx.db.insert("feedSyncState", {
        sourceKey: "passio_shuttle", activeRecordCount: 0, ...patch,
        consecutiveFailures: patch.consecutiveFailures ?? 1,
      });
      return;
    }

    const snap = await ctx.db.query("shuttleSnapshots")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest")).unique();
    const prior = snap?.isFixture ? null : snap;
    const streamPatch = {
      vehicles: args.vehicles ?? prior?.vehicles ?? [],
      stopEtas: args.stopEtas ?? prior?.stopEtas ?? [],
      serviceAlerts: args.serviceAlerts ?? prior?.serviceAlerts ?? [],
      vehiclesFetchedAt: args.vehicles !== undefined ? args.now : prior?.vehiclesFetchedAt,
      etasFetchedAt: args.stopEtas !== undefined ? args.now : prior?.etasFetchedAt,
      alertsFetchedAt: args.serviceAlerts !== undefined ? args.now : prior?.alertsFetchedAt,
      fetchedAt: args.now,
      isFixture: undefined,
    };
    if (snap) await ctx.db.patch(snap._id, streamPatch);
    else await ctx.db.insert("shuttleSnapshots", { singletonKey: "latest", ...streamPatch });

    const allStreamsAvailable = args.vehicles !== undefined && args.stopEtas !== undefined
      && args.serviceAlerts !== undefined;
    const syncPatch = {
      lastSuccessAt: allStreamsAvailable ? args.now : state?.lastSuccessAt,
      lastAttemptAt: args.now,
      consecutiveFailures: 0,
      backoffUntil: undefined,
      lastPayloadHash: allStreamsAvailable ? args.payloadHash : state?.lastPayloadHash,
      activeRecordCount: streamPatch.vehicles.length,
      lastAcceptedCount: allStreamsAvailable ? streamPatch.vehicles.length : state?.lastAcceptedCount,
      lastOutcome: allStreamsAvailable ? "accepted" as const : "partial" as const,
      lastError: allStreamsAvailable ? undefined : "Part of the Passio response was unavailable",
    };
    if (state) await ctx.db.patch(state._id, syncPatch);
    else await ctx.db.insert("feedSyncState", { sourceKey: "passio_shuttle", ...syncPatch });
  },
});

export const listDiningVenuesForSync = internalQuery({
  args: {},
  handler: async ({ db }) => (await db.query("diningVenues").take(60)).map((venue) => ({
    slug: venue.nutrisliceSlug, name: venue.name, campus: venue.campus,
  })),
});

export const applyDiningSyncInternal = internalMutation({
  args: {
    now: v.number(),
    stream: v.union(v.literal("hours"), v.literal("menus")),
    payloadHash: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    partial: v.optional(v.boolean()),
    hours: v.optional(v.array(v.object({ slug: v.string(), hoursScheduleJson: v.string() }))),
    menus: v.optional(v.array(v.object({
      slug: v.string(), todayMenuDateET: v.string(), tomorrowMenuDateET: v.string(),
      todayMenuJson: v.string(), tomorrowMenuJson: v.string(),
    }))),
  },
  handler: async ({ db }, args) => {
    const sourceKey = args.stream === "hours" ? "ksu_dining_hours" : "nutrislice_dining";
    const state = await db.query("feedSyncState").withIndex("by_source", (q) => q.eq("sourceKey", sourceKey)).unique();
    if (state?.lastAttemptAt !== undefined && state.lastAttemptAt > args.now) return { updated: 0 };

    const rows = args.stream === "hours" ? args.hours ?? [] : args.menus ?? [];
    if (args.failureReason || !rows.length) {
      const patch = evaluateFailureStatePatch(state ?? { consecutiveFailures: 0, activeRecordCount: 0 },
        args.now, args.failureReason ?? "No validated dining results", args.partial ? "partial" : "failed");
      if (state) await db.patch(state._id, patch);
      else await db.insert("feedSyncState", {
        sourceKey, ...patch, activeRecordCount: 0, consecutiveFailures: patch.consecutiveFailures ?? 1,
      });
      return { updated: 0 };
    }

    let updated = 0;
    for (const { slug, ...payload } of rows) {
      const venue = await db.query("diningVenues").withIndex("by_slug", (q) => q.eq("nutrisliceSlug", slug)).unique();
      if (!venue) continue;
      if ("hoursScheduleJson" in payload) {
        await db.patch(venue._id, {
          hoursScheduleJson: payload.hoursScheduleJson,
          lastHoursSyncAt: args.now,
          isFixtureHours: undefined,
        });
      } else {
        await db.patch(venue._id, {
          ...payload,
          lastMenuSyncAt: args.now,
          isFixtureMenu: undefined,
        });
      }
      updated++;
    }
    const complete = updated > 0 && updated === rows.length
      && updated >= (state?.activeRecordCount ?? 0) && !args.partial;
    const next = {
      lastSuccessAt: complete ? args.now : state?.lastSuccessAt,
      lastAttemptAt: args.now,
      lastPayloadHash: complete ? args.payloadHash : state?.lastPayloadHash,
      activeRecordCount: complete ? updated : state?.activeRecordCount ?? 0,
      lastAcceptedCount: complete ? updated : state?.lastAcceptedCount,
      lastOutcome: complete ? "accepted" as const : "partial" as const,
      consecutiveFailures: 0,
      backoffUntil: undefined,
      lastError: complete ? undefined : "Dining results did not cover all previously accepted venues",
    };
    if (state) await db.patch(state._id, next);
    else await db.insert("feedSyncState", { sourceKey, ...next });
    return { updated };
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
      previousVehicleCount: isBigOwlBusOperatingHours(now) ? state.activeRecordCount : undefined,
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
    await ctx.runMutation(
      internal.sync.transitDiningSync.applyShuttleSyncInternal,
      {
        now,
        status: outcome.status,
        payloadHash: outcome.payloadHash,
        vehicles: outcome.vehicles,
        stopEtas: outcome.stopEtas,
        serviceAlerts: outcome.serviceAlerts,
      }
    );
    return { status: outcome.status === "noop_unchanged" ? outcome.status : "updated" };
  },
});

export const runScheduledDiningSync = internalAction({
  args: { force: v.optional(v.union(v.literal("hours"), v.literal("menus"))) },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const now = Date.now();
    const { minuteOfDay } = getEasternDayAndHour(now);
    const stream = args.force ?? (
      minuteOfDay >= 300 && minuteOfDay < 306 ? "hours" :
      ((minuteOfDay >= 315 && minuteOfDay < 321) || (minuteOfDay >= 675 && minuteOfDay < 681)) ? "menus" : null
    );
    if (!stream) return { status: "skipped_outside_cadence" };
    const sourceKey = stream === "hours" ? "ksu_dining_hours" : "nutrislice_dining";
    const state = await ctx.runQuery(internal.sync.transitDiningSync.getSyncStateInternal, { sourceKey });
    if (!args.force && state?.backoffUntil && state.backoffUntil > now) return { status: "circuit_open" };

    try {
      const venues = await ctx.runQuery(internal.sync.transitDiningSync.listDiningVenuesForSync, {});
      const hours = stream === "hours" ? await fetchOfficialDiningHours(venues) : undefined;
      const slugs = new Set(venues.map((venue) => venue.slug));
      const menuSchools = stream === "menus" ? (await fetchNutrisliceDirectory())
        .filter((school) => slugs.has(school.slug) && school.types.length > 0) : [];
      const menus = stream === "menus" ? await fetchNutrisliceMenus(menuSchools, slugs, now) : undefined;
      const payload = hours ?? menus ?? [];
      const partial = menus !== undefined && menus.length < menuSchools.length;
      if (isSuddenDropOrEmpty(state?.activeRecordCount ?? 0, payload.length)) {
        await ctx.runMutation(internal.sync.transitDiningSync.applyDiningSyncInternal, {
          now, stream, partial: true, failureReason: "Dining results failed the coverage check",
        });
        return { status: "failed_or_aborted" };
      }
      const payloadHash = await computePayloadHash(payload);
      await ctx.runMutation(internal.sync.transitDiningSync.applyDiningSyncInternal, {
        now, stream, payloadHash, hours, menus, partial,
      });
      return { status: partial ? "incomplete_coverage" : payloadHash === state?.lastPayloadHash ? "noop_unchanged" : "updated" };
    } catch (error) {
      await ctx.runMutation(internal.sync.transitDiningSync.applyDiningSyncInternal, {
        now, stream, failureReason: error instanceof Error ? error.message : "Dining request failed",
      });
      return { status: "failed_or_aborted" };
    }
  },
});
