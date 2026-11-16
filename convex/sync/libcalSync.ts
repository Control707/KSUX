import { v } from "convex/values";
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
  isSuddenDropOrEmpty,
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

function formatDateET(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export async function fetchSequentialLibCalGrids(params: {
  todayET: string;
  tomorrowET: string;
  dayAfterET: string;
  fetchImpl?: UpstreamFetchFn;
}): Promise<LibCalRawSlot[]> {
  const allSlots: LibCalRawSlot[] = [];
  // Sequential facility requests respecting LibCal politeness rules
  for (const fac of LIBCAL_FACILITIES) {
    const body = `lid=${fac.lid}&gid=${fac.gid}&eid=-1&seat=0&seatId=0&zone=0&start=${params.todayET}&end=${params.dayAfterET}&pageIndex=0&pageSize=60`;
    const resp = await fetchUpstreamWithRetry(
      "https://kennesaw.libcal.com/spaces/availability/grid",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: fac.referer,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
        body,
      },
      params.fetchImpl
    );
    const json = await resp.json();
    if (Array.isArray(json?.slots)) {
      allSlots.push(...json.slots);
    }
  }
  return allSlots;
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

    if (!args.ok) {
      const patch = evaluateFailureStatePatch(
        state ?? { consecutiveFailures: 0, activeRecordCount: 47 },
        args.now,
        args.failureReason ?? "LibCal refresh failed"
      );
      if (state) {
        await ctx.db.patch(state._id, patch);
      }
      return;
    }

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

    if (state) {
      await ctx.db.patch(state._id, {
        lastSuccessAt: args.now,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        backoffUntil: undefined,
        refreshInFlightUntil: undefined,
        lastError: undefined,
      });
    }
  },
});

export const runSequentialLibCalRefresh = internalAction({
  args: {
    fromWarmCron: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const now = Date.now();
    if (args.fromWarmCron) {
      const { hourOfDay } = getEasternDayAndHour(now);
      if (hourOfDay < 7 || hourOfDay > 23) {
        return { status: "skipped_overnight" };
      }
    }

    const { state, rooms } = await ctx.runQuery(
      internal.sync.libcalSync.getLibCalRoomsAndStateInternal,
      {}
    );

    if (state?.backoffUntil && state.backoffUntil > now) {
      return { status: "circuit_open" };
    }

    const todayET = formatDateET(now);
    const tomorrowET = formatDateET(now + 86_400_000);
    const dayAfterET = formatDateET(now + 2 * 86_400_000);

    try {
      const allSlots = await fetchSequentialLibCalGrids({
        todayET,
        tomorrowET,
        dayAfterET,
      });

      const distinctItems = new Set(allSlots.map((s) => s.itemId));
      if (
        isSuddenDropOrEmpty(
          state?.activeRecordCount ?? 47,
          distinctItems.size
        )
      ) {
        await ctx.runMutation(
          internal.sync.libcalSync.applyLibCalSnapshotsInternal,
          {
            now,
            ok: false,
            failureReason: `Aborted LibCal upsert: only ${distinctItems.size} rooms returned (>80% drop).`,
          }
        );
        return { status: "aborted_sanity_drop" };
      }

      const snapshots = [];
      for (const rm of rooms) {
        if (!rm.libcalEid) continue;
        for (const dateET of [todayET, tomorrowET]) {
          snapshots.push({
            studyRoomId: rm._id,
            dateET,
            slotMask48: encodeLibCalSlotsToMask48(
              allSlots,
              rm.libcalEid,
              dateET
            ),
          });
        }
      }

      await ctx.runMutation(
        internal.sync.libcalSync.applyLibCalSnapshotsInternal,
        {
          now,
          ok: true,
          snapshots,
        }
      );
      return { status: "updated" };
    } catch (err: any) {
      await ctx.runMutation(
        internal.sync.libcalSync.applyLibCalSnapshotsInternal,
        {
          now,
          ok: false,
          failureReason: err?.message || "LibCal network error",
        }
      );
      return { status: "failed" };
    }
  },
});
