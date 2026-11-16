import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  computePayloadHash,
  evaluateFailureStatePatch,
  fetchUpstreamWithRetry,
  isSuddenDropOrEmpty,
  UpstreamFetchFn,
} from "../lib/syncGuard";

export interface NormalizedUpstreamEvent {
  externalKey: string;
  source: "localist" | "engage";
  campus: "Kennesaw" | "Marietta";
  campusScope: "Kennesaw" | "Marietta" | "Both";
  isVirtual: boolean;
  title: string;
  description: string;
  locationName: string;
  roomNumber?: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  externalUrl?: string;
  startTime: number;
  endTime: number;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export function normalizeEventTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Deduplicates Localist + Anthology Engage events on `(normalized title + start time ±15m)`,
 * with Localist winning ties and `isVirtual: true` mapped to `campusScope: "Both"`.
 */
export function deduplicateUpstreamEvents(
  localistItems: NormalizedUpstreamEvent[],
  engageItems: NormalizedUpstreamEvent[]
): NormalizedUpstreamEvent[] {
  const winners: NormalizedUpstreamEvent[] = [];

  for (const loc of localistItems) {
    winners.push({
      ...loc,
      campusScope: loc.isVirtual ? "Both" : loc.campus,
    });
  }

  for (const eng of engageItems) {
    const normTitle = normalizeEventTitleForDedup(eng.title);
    const duplicate = winners.some(
      (w) =>
        normalizeEventTitleForDedup(w.title) === normTitle &&
        Math.abs(w.startTime - eng.startTime) <= FIFTEEN_MINUTES_MS
    );
    if (!duplicate) {
      winners.push({
        ...eng,
        campusScope: eng.isVirtual ? "Both" : eng.campus,
      });
    }
  }

  return winners.sort((a, b) => a.startTime - b.startTime);
}

export function parseLocalistEventsPayload(payload: any): NormalizedUpstreamEvent[] {
  const rawEvents: any[] = Array.isArray(payload?.events) ? payload.events : [];
  const out: NormalizedUpstreamEvent[] = [];

  for (const wrapper of rawEvents) {
    const ev = wrapper?.event ?? wrapper;
    if (!ev?.id || !ev?.title) continue;
    const inst =
      ev.event_instances?.[0]?.event_instance ?? ev.first_instance ?? {};
    const startMs = Date.parse(inst.start || ev.start || "");
    if (!Number.isFinite(startMs)) continue;
    const endMs = Number.isFinite(Date.parse(inst.end || ""))
      ? Date.parse(inst.end)
      : startMs + 2 * 3600_000;

    const isVirtual =
      ev.experience === "virtual" ||
      /virtual|online|teams|zoom/i.test(String(ev.location_name ?? ""));
    const rawText = JSON.stringify(ev.filters ?? {}) + " " + String(ev.location_name ?? "");
    const campus: "Kennesaw" | "Marietta" =
      rawText.includes("32503981290035") || /marietta|johnson|atrium|wilson|stingers/i.test(rawText)
        ? "Marietta"
        : "Kennesaw";

    out.push({
      externalKey: `localist:${ev.id}`,
      source: "localist",
      campus,
      campusScope: isVirtual ? "Both" : campus,
      isVirtual,
      title: String(ev.title).trim(),
      description: String(ev.description_text || ev.title).trim().slice(0, 1200),
      locationName: String(
        ev.location_name || (isVirtual ? "Virtual / Online" : `${campus} Campus`)
      ),
      roomNumber: ev.room_number ? String(ev.room_number) : undefined,
      latitude: ev.geo?.latitude ? Number(ev.geo.latitude) : undefined,
      longitude: ev.geo?.longitude ? Number(ev.geo.longitude) : undefined,
      photoUrl: ev.photo_url ? String(ev.photo_url) : undefined,
      externalUrl: ev.localist_url ? String(ev.localist_url) : undefined,
      startTime: startMs,
      endTime: endMs,
    });
  }
  return out;
}

export function parseEngageRssPayload(rssXml: string): NormalizedUpstreamEvent[] {
  const items = rssXml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const out: NormalizedUpstreamEvent[] = [];

  for (const itemXml of items) {
    const title = itemXml
      .match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]
      ?.trim();
    const guid = itemXml
      .match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1]
      ?.trim();
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    const startRaw =
      itemXml.match(/<ev:startdate>([\s\S]*?)<\/ev:startdate>/i)?.[1]?.trim() ||
      itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim();
    const endRaw = itemXml
      .match(/<ev:enddate>([\s\S]*?)<\/ev:enddate>/i)?.[1]
      ?.trim();
    const location =
      itemXml.match(/<ev:location>([\s\S]*?)<\/ev:location>/i)?.[1]?.trim() ||
      "KSU Campus";
    const desc =
      itemXml
        .match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || title;

    if (!title || !startRaw) continue;
    const startMs = Date.parse(startRaw);
    if (!Number.isFinite(startMs)) continue;
    const endMs =
      endRaw && Number.isFinite(Date.parse(endRaw))
        ? Date.parse(endRaw)
        : startMs + 2 * 3600_000;

    const isVirtual = /virtual|online|teams|zoom/i.test(
      `${location} ${itemXml}`
    );
    const campus: "Kennesaw" | "Marietta" = /marietta|johnson|atrium|wilson/i.test(
      `${location} ${itemXml}`
    )
      ? "Marietta"
      : "Kennesaw";

    out.push({
      externalKey: `engage:${guid || link || title}`,
      source: "engage",
      campus,
      campusScope: isVirtual ? "Both" : campus,
      isVirtual,
      title,
      description: String(desc ?? title).slice(0, 1200),
      locationName: location,
      externalUrl: link,
      startTime: startMs,
      endTime: endMs,
    });
  }
  return out;
}

export async function runEventsIngestCycle(params: {
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
  | {
      status: "failed_or_aborted";
      failurePatch: ReturnType<typeof evaluateFailureStatePatch>;
      reason: string;
    }
  | { status: "noop_unchanged"; payloadHash: string }
  | {
      status: "ready_to_upsert";
      payloadHash: string;
      events: NormalizedUpstreamEvent[];
    }
> {
  const { syncState, nowMs, fetchImpl } = params;
  if (syncState.backoffUntil && syncState.backoffUntil > nowMs) {
    return { status: "circuit_open" };
  }

  try {
    const [localistResp, engageResp] = await Promise.all([
      fetchUpstreamWithRetry(
        "https://calendar.kennesaw.edu/api/2/events?pp=50&days=30",
        { headers: { Accept: "application/json" } },
        fetchImpl
      ),
      fetchUpstreamWithRetry(
        "https://kennesaw.campuslabs.com/engage/events.rss",
        { headers: { Accept: "application/rss+xml, application/xml, text/xml" } },
        fetchImpl
      ),
    ]);

    const [localistJson, engageXml] = await Promise.all([
      localistResp.json(),
      engageResp.text(),
    ]);

    const deduped = deduplicateUpstreamEvents(
      parseLocalistEventsPayload(localistJson),
      parseEngageRssPayload(engageXml)
    );

    if (isSuddenDropOrEmpty(syncState.activeRecordCount, deduped.length)) {
      const reason = `Aborted Events upsert: incoming ${deduped.length} vs previous ${syncState.activeRecordCount} (>80% drop or empty).`;
      return {
        status: "failed_or_aborted",
        failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
        reason,
      };
    }

    const payloadHash = await computePayloadHash(deduped);
    if (payloadHash === syncState.lastPayloadHash) {
      return { status: "noop_unchanged", payloadHash };
    }

    return {
      status: "ready_to_upsert",
      payloadHash,
      events: deduped,
    };
  } catch (err: any) {
    const reason = err?.message || "Upstream KSU Events sync error";
    return {
      status: "failed_or_aborted",
      failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
      reason,
    };
  }
}

export const getEventsSyncStateInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "localist_engage_events"))
      .unique();
  },
});

export const applySyncedEventsInternal = internalMutation({
  args: {
    now: v.number(),
    status: v.union(
      v.literal("noop_unchanged"),
      v.literal("ready_to_upsert"),
      v.literal("failed_or_aborted")
    ),
    payloadHash: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    events: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "localist_engage_events"))
      .unique();

    if (args.status === "failed_or_aborted") {
      const base = state ?? {
        consecutiveFailures: 0,
        activeRecordCount: 0,
      };
      const patch = evaluateFailureStatePatch(
        base,
        args.now,
        args.failureReason ?? "Sync failed"
      );
      if (state) {
        await ctx.db.patch(state._id, patch);
      } else {
        await ctx.db.insert("feedSyncState", {
          sourceKey: "localist_engage_events",
          consecutiveFailures: patch.consecutiveFailures ?? 1,
          lastAttemptAt: args.now,
          backoffUntil: patch.backoffUntil,
          activeRecordCount: 0,
          lastError: patch.lastError,
        });
      }
      return { upserted: 0, cancelledUpstream: 0 };
    }

    if (args.status === "noop_unchanged") {
      if (state) {
        await ctx.db.patch(state._id, {
          lastSuccessAt: args.now,
          lastAttemptAt: args.now,
          consecutiveFailures: 0,
          backoffUntil: undefined,
          lastError: undefined,
        });
      }
      return { upserted: 0, cancelledUpstream: 0 };
    }

    const incoming = (args.events ?? []) as NormalizedUpstreamEvent[];
    const seenExternalKeys = new Set<string>();
    let upserted = 0;

    for (const ev of incoming) {
      seenExternalKeys.add(ev.externalKey);
      const existing = await ctx.db
        .query("events")
        .withIndex("by_external_key", (q) =>
          q.eq("externalKey", ev.externalKey)
        )
        .unique();

      if (existing) {
        // Non-destructive upsert: preserves RSVPs, prodGoingCount, prodInterestedCount, and embedding if title/desc unchanged!
        await ctx.db.patch(existing._id, {
          campus: ev.campus,
          campusScope: ev.isVirtual ? "Both" : ev.campus,
          isVirtual: ev.isVirtual,
          title: ev.title,
          description: ev.description,
          searchText: `${ev.title} ${ev.locationName} ${ev.campus}`,
          locationName: ev.locationName,
          roomNumber: ev.roomNumber,
          latitude: ev.latitude,
          longitude: ev.longitude,
          photoUrl: ev.photoUrl,
          externalUrl: ev.externalUrl,
          startTime: ev.startTime,
          endTime: ev.endTime,
          status: "scheduled",
        });
      } else {
        await ctx.db.insert("events", {
          workspaceKey: "ksu",
          externalKey: ev.externalKey,
          source: ev.source,
          campus: ev.campus,
          campusScope: ev.isVirtual ? "Both" : ev.campus,
          isVirtual: ev.isVirtual,
          title: ev.title,
          description: ev.description,
          searchText: `${ev.title} ${ev.locationName} ${ev.campus}`,
          locationName: ev.locationName,
          roomNumber: ev.roomNumber,
          latitude: ev.latitude,
          longitude: ev.longitude,
          photoUrl: ev.photoUrl,
          externalUrl: ev.externalUrl,
          startTime: ev.startTime,
          endTime: ev.endTime,
          status: "scheduled",
          visibilityStatus: "visible",
          prodGoingCount: 0,
          prodInterestedCount: 0,
        });
      }
      upserted++;
    }

    // Cancelled Upstream preservation: if an upcoming synced KSU Event disappears upstream while >= 1 Student RSVPed, mark cancelled_upstream instead of vanishing!
    const existingUpcoming = await ctx.db
      .query("events")
      .withIndex("by_all_start", (q) =>
        q
          .eq("workspaceKey", "ksu")
          .eq("visibilityStatus", "visible")
          .gt("startTime", args.now)
      )
      .take(200);

    let cancelledUpstream = 0;
    for (const row of existingUpcoming) {
      if (
        row.externalKey &&
        !seenExternalKeys.has(row.externalKey) &&
        row.status === "scheduled"
      ) {
        const anyRsvp =
          row.prodGoingCount + row.prodInterestedCount > 0 ||
          Boolean(
            await ctx.db
              .query("eventRsvps")
              .filter((q) => q.eq(q.field("eventId"), row._id))
              .first()
          );
        if (anyRsvp) {
          await ctx.db.patch(row._id, { status: "cancelled_upstream" });
          cancelledUpstream++;
        } else {
          await ctx.db.patch(row._id, { status: "cancelled" });
        }
      }
    }

    if (state) {
      await ctx.db.patch(state._id, {
        lastSuccessAt: args.now,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        backoffUntil: undefined,
        lastPayloadHash: args.payloadHash,
        activeRecordCount: incoming.length,
        lastError: undefined,
      });
    } else {
      await ctx.db.insert("feedSyncState", {
        sourceKey: "localist_engage_events",
        lastSuccessAt: args.now,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        lastPayloadHash: args.payloadHash,
        activeRecordCount: incoming.length,
      });
    }

    return { upserted, cancelledUpstream };
  },
});

export const runScheduledEventsSync = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const now = Date.now();
    const state = (await ctx.runQuery(
      internal.sync.eventsSync.getEventsSyncStateInternal,
      {}
    )) ?? {
      consecutiveFailures: 0,
      activeRecordCount: 0,
    };

    const outcome = await runEventsIngestCycle({
      syncState: state,
      nowMs: now,
    });

    if (outcome.status === "circuit_open") {
      return { status: "circuit_open" };
    }
    if (outcome.status === "failed_or_aborted") {
      await ctx.runMutation(internal.sync.eventsSync.applySyncedEventsInternal, {
        now,
        status: "failed_or_aborted",
        failureReason: outcome.reason,
      });
      return { status: "failed_or_aborted" };
    }
    if (outcome.status === "noop_unchanged") {
      await ctx.runMutation(internal.sync.eventsSync.applySyncedEventsInternal, {
        now,
        status: "noop_unchanged",
        payloadHash: outcome.payloadHash,
      });
      return { status: "noop_unchanged" };
    }

    await ctx.runMutation(internal.sync.eventsSync.applySyncedEventsInternal, {
      now,
      status: "ready_to_upsert",
      payloadHash: outcome.payloadHash,
      events: outcome.events,
    });
    return { status: "updated" };
  },
});
