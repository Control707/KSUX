import { v } from "convex/values";
import { easternDate } from "../lib/easternDate";
import type { MutationCtx } from "../_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { getEasternDayAndHour } from "../lib/parkingMath";
import {
  evaluateFailureStatePatch,
  fetchUpstreamWithRetry,
  UpstreamFetchFn,
} from "../lib/syncGuard";

export interface LibCalRawSlot {
  start: string; // "2026-11-16 16:30:00"
  end?: string;
  itemId: number;
  className?: string; // "s-lc-eq-checkout" means booked/unavailable; absent means OPEN!
}

/**
 * Encodes 30-minute LibCal grid slots for `dateET` ("YYYY-MM-DD") into a 48-bit BigInt mask.
 * Bit 0 = 00:00–00:30 ET ... Bit 47 = 23:30–24:00 ET (1n = open, 0n = booked/closed).
 * Uses BigInt (`1n << BigInt(bit)`) to avoid 32-bit JS bitwise truncation on bits 32..47 (4:00 PM–midnight).
 */
export function encodeLibCalSlotsToMask48(
  slots: LibCalRawSlot[],
  targetItemId: number,
  dateET: string
): bigint {
  let mask = 0n;
  for (const slot of slots) {
    if (slot.itemId !== targetItemId) continue;
    // Slots WITH className "s-lc-eq-checkout" (or any checkout class) are booked/unavailable
    if (slot.className && slot.className.trim().length > 0) continue;

    // Match "YYYY-MM-DD HH:MM:SS" or ISO "YYYY-MM-DDTHH:MM:SS"
    const clean = slot.start.trim();
    if (!clean.startsWith(dateET)) continue;
    const m = clean.match(/[T ](\d{2}):(\d{2})/);
    if (!m) continue;
    const hr = Number(m[1]);
    const min = Number(m[2]);
    const bitIndex = hr * 2 + (min >= 30 ? 1 : 0);
    if (bitIndex >= 0 && bitIndex < 48) {
      mask |= 1n << BigInt(bitIndex);
    }
  }
  return mask;
}

export function decodeSlotMask48Slots(mask: bigint): boolean[] {
  const out: boolean[] = [];
  for (let bit = 0; bit < 48; bit++) {
    out.push(((mask >> BigInt(bit)) & 1n) === 1n);
  }
  return out;
}

export function countOpenHalfHourSlots(mask: bigint): number {
  let open = 0;
  for (let bit = 0; bit < 48; bit++) {
    if (((mask >> BigInt(bit)) & 1n) === 1n) {
      open++;
    }
  }
  return open;
}

const LIBCAL_FACILITIES = [
  {
    name: "Sturgis",
    lid: 10524,
    gid: 19509,
    referer: "https://kennesaw.libcal.com/reserve/studyroomsK",
  },
  {
    name: "Johnson",
    lid: 10526,
    gid: 19510,
    referer: "https://kennesaw.libcal.com/reserve/studyroomsM",
  },
  {
    name: "MariettaAILab",
    lid: 24727,
    gid: 39100,
    referer: "https://kennesaw.libcal.com/spaces?lid=24727",
  },
] as const;

const SOURCE_KEY = "libcal_study_rooms";
const FRESH_FOR_MS = 5 * 60_000;
const LEASE_TTL_MS = 60_000;
const ACTION_LEASE_TTL_MS = 5 * 60_000;

export async function acquireLibCalLease(ctx: MutationCtx, now: number, heldUntil?: number) {
  const state = await ctx.db.query("feedSyncState")
    .withIndex("by_source", (q) => q.eq("sourceKey", SOURCE_KEY)).unique();
  if (heldUntil !== undefined) {
    if (heldUntil <= now || state?.refreshInFlightUntil !== heldUntil) {
      return { acquired: false as const, reason: "lease_already_held" as const };
    }
  } else {
    if (state?.lastSuccessAt && now - state.lastSuccessAt <= FRESH_FOR_MS) {
      return { acquired: false as const, reason: "fresh_within_5m_ttl" as const };
    }
    if (state?.backoffUntil && state.backoffUntil > now) {
      return { acquired: false as const, reason: "circuit_open" as const };
    }
    if (state?.refreshInFlightUntil && state.refreshInFlightUntil > now) {
      return { acquired: false as const, reason: "lease_already_held" as const };
    }
  }
  const leaseUntil = now + (heldUntil === undefined ? LEASE_TTL_MS : ACTION_LEASE_TTL_MS);
  if (state) await ctx.db.patch(state._id, { refreshInFlightUntil: leaseUntil });
  else await ctx.db.insert("feedSyncState", {
    sourceKey: SOURCE_KEY, consecutiveFailures: 0, activeRecordCount: 0,
    refreshInFlightUntil: leaseUntil,
  });
  return { acquired: true as const, leaseUntil };
}

export const startLibCalRefresh = internalMutation({
  args: { scheduledLeaseUntil: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const initialLease = args.scheduledLeaseUntil === undefined
      ? await acquireLibCalLease(ctx, now)
      : { acquired: true as const, leaseUntil: args.scheduledLeaseUntil };
    if (!initialLease.acquired) return initialLease;
    return acquireLibCalLease(ctx, now, initialLease.leaseUntil);
  },
});

export async function fetchSequentialLibCalGrids(params: {
  todayET: string;
  tomorrowET: string;
  dayAfterET: string;
  fetchImpl?: UpstreamFetchFn;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<Map<number, LibCalRawSlot[]>> {
  const results = new Map<number, LibCalRawSlot[]>();
  const upstream = params.fetchImpl ?? (fetch as UpstreamFetchFn);
  const sleep = params.sleep ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let lastStartedAt: number | undefined;
  const pacedFetch: UpstreamFetchFn = async (url, init) => {
    if (lastStartedAt !== undefined) await sleep(Math.max(0, 10_000 - (Date.now() - lastStartedAt)));
    lastStartedAt = Date.now();
    return upstream(url, { ...init, signal: AbortSignal.timeout(8_000) });
  };

  for (const fac of LIBCAL_FACILITIES) {
    try {
      const allSlots: LibCalRawSlot[] = [];
      const pageSize = 60;
      let finished = false;
      for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
        const body = `lid=${fac.lid}&gid=${fac.gid}&eid=-1&seat=0&seatId=0&zone=0&start=${params.todayET}&end=${params.dayAfterET}&pageIndex=${pageIndex}&pageSize=${pageSize}`;
        const response = await fetchUpstreamWithRetry(
          "https://kennesaw.libcal.com/spaces/availability/grid",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Referer: fac.referer, "X-Requested-With": "XMLHttpRequest", Accept: "application/json",
            },
            body,
          },
          pacedFetch
        );
        const json = await response.json();
        if (!Array.isArray(json?.slots)) throw new Error("Invalid LibCal availability grid");
        const slots = json.slots.filter((slot: any) => typeof slot?.start === "string"
          && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(slot.start)
          && Number.isSafeInteger(Number(slot.itemId)) && Number(slot.itemId) > 0)
          .map((slot: any) => ({ ...slot, itemId: Number(slot.itemId) }));
        allSlots.push(...slots);
        const totalPages = Number(json.totalPages);
        if (!Number.isSafeInteger(totalPages) || totalPages <= pageIndex + 1) {
          finished = true;
          break;
        }
      }
      if (finished && allSlots.length) results.set(fac.lid, allSlots);
    } catch {
      // A failed facility must never become a fully booked filter in the database.
    }
  }
  return results;
}

export const getLibCalRoomsAndStateInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [state, kRooms, mRooms] = await Promise.all([
      ctx.db
        .query("feedSyncState")
        .withIndex("by_source", (q) => q.eq("sourceKey", "libcal_study_rooms"))
        .unique(),
      ctx.db
        .query("studyRooms")
        .withIndex("by_campus_kind", (q) =>
          q.eq("campus", "Kennesaw").eq("roomKind", "libcal")
        )
        .take(30),
      ctx.db
        .query("studyRooms")
        .withIndex("by_campus_kind", (q) =>
          q.eq("campus", "Marietta").eq("roomKind", "libcal")
        )
        .take(40),
    ]);
    return {
      state,
      rooms: [...kRooms, ...mRooms],
    };
  },
});

export const applyLibCalSnapshotsInternal = internalMutation({
  args: {
    now: v.number(),
    ok: v.boolean(),
    incomplete: v.optional(v.boolean()),
    leaseUntil: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    snapshots: v.optional(
      v.array(
        v.object({
          studyRoomId: v.id("studyRooms"),
          dateET: v.string(),
          slotMask48: v.int64(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "libcal_study_rooms"))
      .unique();

    if (args.leaseUntil !== undefined && state?.refreshInFlightUntil !== args.leaseUntil) return;
    for (const item of args.snapshots ?? []) {
      const existing = await ctx.db
        .query("studyRoomSnapshots")
        .withIndex("by_room_date", (q) =>
          q.eq("studyRoomId", item.studyRoomId).eq("dateET", item.dateET)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          slotMask48: item.slotMask48,
          updatedAt: args.now,
          isFixture: undefined,
        });
      } else {
        await ctx.db.insert("studyRoomSnapshots", {
          studyRoomId: item.studyRoomId,
          dateET: item.dateET,
          slotMask48: item.slotMask48,
          updatedAt: args.now,
        });
      }
    }

    const patch = args.ok ? {
      lastSuccessAt: args.now, lastAttemptAt: args.now, consecutiveFailures: 0,
      lastOutcome: "accepted" as const, lastAcceptedCount: args.snapshots?.length ?? 0,
      backoffUntil: undefined, refreshInFlightUntil: undefined, lastError: undefined,
    } : evaluateFailureStatePatch(
      state ?? { consecutiveFailures: 0, activeRecordCount: 0 },
      args.now, args.failureReason ?? "LibCal refresh failed", args.incomplete ? "partial" : "failed"
    );
    if (state) {
      await ctx.db.patch(state._id, patch);
    } else {
      await ctx.db.insert("feedSyncState", {
        sourceKey: SOURCE_KEY, activeRecordCount: 0, ...patch, consecutiveFailures: patch.consecutiveFailures ?? 0,
      });
    }
  },
});

export const runSequentialLibCalRefresh = internalAction({
  args: {
    fromWarmCron: v.optional(v.boolean()),
    scheduledLeaseUntil: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const now = Date.now();
    if (args.fromWarmCron) {
      const { hourOfDay } = getEasternDayAndHour(now);
      if (hourOfDay < 7 || hourOfDay > 23) {
        return { status: "skipped_overnight" };
      }
    }

    const lease = await ctx.runMutation(internal.sync.libcalSync.startLibCalRefresh, {
      scheduledLeaseUntil: args.scheduledLeaseUntil,
    });
    if (!lease.acquired) return { status: lease.reason };

    try {
      const { rooms } = await ctx.runQuery(internal.sync.libcalSync.getLibCalRoomsAndStateInternal, {});
      const dates = [easternDate(now), easternDate(now, 1)];
      const slotsByFacility = await fetchSequentialLibCalGrids({
        todayET: dates[0]!, tomorrowET: dates[1]!, dayAfterET: easternDate(now, 2),
      });
      const snapshots = [];
      let expectedSnapshots = 0;
      for (const room of rooms) {
        if (!room.libcalEid || !room.libcalLid) continue;
        const slots = slotsByFacility.get(room.libcalLid);
        for (const dateET of dates) {
          expectedSnapshots++;
          if (!slots?.some((slot) => slot.itemId === room.libcalEid && slot.start.startsWith(dateET))) continue;
          snapshots.push({
            studyRoomId: room._id, dateET,
            slotMask48: encodeLibCalSlotsToMask48(slots, room.libcalEid, dateET),
          });
        }
      }
      const complete = expectedSnapshots > 0 && snapshots.length === expectedSnapshots;
      await ctx.runMutation(internal.sync.libcalSync.applyLibCalSnapshotsInternal, {
        now: Date.now(), ok: complete, incomplete: !complete, leaseUntil: lease.leaseUntil, snapshots,
        failureReason: complete ? undefined : "LibCal did not cover every seeded room and date",
      });
      return { status: complete ? "updated" : "incomplete_coverage" };
    } catch (err: any) {
      await ctx.runMutation(internal.sync.libcalSync.applyLibCalSnapshotsInternal, {
        now: Date.now(), ok: false, leaseUntil: lease.leaseUntil,
        failureReason: err?.message || "LibCal network error",
      });
      return { status: "failed" };
    }
  },
});
