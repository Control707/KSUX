import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { localTimestamp } from "../lib/easternDate";
import {
  computePayloadHash,
  evaluateFailureStatePatch,
  fetchUpstreamWithRetry,
  isSuddenDropOrEmpty,
  UpstreamFetchFn,
} from "../lib/syncGuard";

export interface NormalizedUpstreamEvent {
  externalKey: string;
  sourceExternalKeys?: string[];
  explicitlyCancelled?: boolean;
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
    const duplicate = winners.find(
      (w) =>
        normalizeEventTitleForDedup(w.title) === normTitle &&
        Math.abs(w.startTime - eng.startTime) <= FIFTEEN_MINUTES_MS &&
        (w.source !== eng.source || w.externalKey === eng.externalKey) &&
        (w.isVirtual || eng.isVirtual || w.campus === eng.campus)
    );
    if (duplicate) {
      duplicate.sourceExternalKeys = [...new Set([
        ...(duplicate.sourceExternalKeys ?? [duplicate.externalKey]),
        ...(eng.sourceExternalKeys ?? [eng.externalKey]),
      ])];
    } else {
      winners.push({ ...eng, campusScope: eng.isVirtual ? "Both" : eng.campus });
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
    const instances = Array.isArray(ev.event_instances) && ev.event_instances.length
      ? ev.event_instances.map((item: any) => item?.event_instance ?? item)
      : [ev.first_instance ?? {}];
    const isVirtual =
      ev.experience === "virtual" ||
      /virtual|online|teams|zoom/i.test(String(ev.location_name ?? ""));
    const rawText = JSON.stringify(ev.filters ?? {}) + " " + String(ev.location_name ?? "");
    const campus: "Kennesaw" | "Marietta" =
      rawText.includes("32503981290035") || /marietta|johnson|atrium|wilson|stingers/i.test(rawText)
        ? "Marietta"
        : "Kennesaw";

    for (const [index, inst] of instances.entries()) {
      const startMs = Date.parse(inst?.start || ev.start || "");
      if (!Number.isFinite(startMs)) continue;
      const parsedEnd = Date.parse(inst?.end || "");
      const endMs = parsedEnd > startMs ? parsedEnd : startMs + 2 * 3600_000;
      const legacyKey = `localist:${ev.id}`;
      const externalKey = `${legacyKey}:${inst?.id ?? startMs}`;
      out.push({
        externalKey,
        sourceExternalKeys: index === 0 ? [externalKey, legacyKey] : [externalKey],
        explicitlyCancelled: inst?.status === "cancelled" || ev.status === "cancelled",
        source: "localist",
        campus,
        campusScope: isVirtual ? "Both" : campus,
        isVirtual,
        title: String(ev.title).trim(),
        description: String(ev.description_text || ev.title).trim().slice(0, 1200),
        locationName: String(ev.location_name || (isVirtual ? "Virtual / Online" : `${campus} Campus`)),
        roomNumber: ev.room_number ? String(ev.room_number) : undefined,
        latitude: ev.geo?.latitude ? Number(ev.geo.latitude) : undefined,
        longitude: ev.geo?.longitude ? Number(ev.geo.longitude) : undefined,
        photoUrl: ev.photo_url ? String(ev.photo_url) : undefined,
        externalUrl: ev.localist_url ? String(ev.localist_url) : undefined,
        startTime: startMs,
        endTime: endMs,
      });
    }
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

function parseEngageIcsTimestamp(value: string, timeZone?: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) return null;
  return localTimestamp({
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4] ?? 0), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0),
  }, match[7] ? "UTC" : timeZone);
}

export function parseEngageIcsPayload(calendar: string): NormalizedUpstreamEvent[] {
  return [...calendar.replace(/\r?\n[ \t]/g, "").matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/gi)]
    .flatMap((event) => {
      const fields = new Map<string, { value: string; timeZone?: string }>();
      for (const line of event[1]!.split(/\r?\n/)) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const [name, ...parameters] = line.slice(0, colon).split(";");
        const value = line.slice(colon + 1).trim().replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? " " : c);
        const timeZone = parameters.find((item) => /^TZID=/i.test(item))?.slice(5).replace(/^"|"$/g, "");
        fields.set(name!.toUpperCase(), { value, timeZone });
      }
      const start = fields.get("DTSTART");
      const end = fields.get("DTEND");
      const uid = fields.get("UID")?.value;
      const title = fields.get("SUMMARY")?.value;
      const url = fields.get("URL")?.value;
      const startTime = start && parseEngageIcsTimestamp(start.value, start.timeZone);
      if (!uid || !title || startTime == null) return [];
      const endTime = end && parseEngageIcsTimestamp(end.value, end.timeZone);
      const locationName = fields.get("LOCATION")?.value || "KSU Campus";
      const isVirtual = /virtual|online|teams|zoom/i.test(locationName);
      const campus = /marietta|johnson|atrium|wilson/i.test(locationName) ? "Marietta" as const : "Kennesaw" as const;
      const recurrenceId = fields.get("RECURRENCE-ID")?.value;
      const externalKey = recurrenceId ? `engage:${uid}:${recurrenceId}` : `engage:${uid}`;
      return [{
        externalKey,
        sourceExternalKeys: url && !recurrenceId ? [externalKey, `engage:${url}`] : [externalKey],
        explicitlyCancelled: fields.get("STATUS")?.value.toUpperCase() === "CANCELLED",
        source: "engage" as const, campus, campusScope: isVirtual ? "Both" as const : campus, isVirtual,
        title, description: (fields.get("DESCRIPTION")?.value || title).slice(0, 1200),
        locationName, externalUrl: url, startTime, endTime: endTime && endTime > startTime ? endTime : startTime + 2 * 3600_000,
      }];
    });
}

async function fetchLocalistEvents(fetchImpl?: UpstreamFetchFn) {
  const events: NormalizedUpstreamEvent[] = [];
  let totalPages: number | undefined;
  let complete = false;
  for (let page = 1; page <= 8; page++) {
    let payload;
    try {
      const response = await fetchUpstreamWithRetry(
        `https://calendar.kennesaw.edu/api/2/events?pp=50&days=30&page=${page}`,
        { headers: { Accept: "application/json" } }, fetchImpl);
      payload = await response.json();
      if (!Array.isArray(payload?.events)) throw new Error("Invalid Localist events response");
      const parsed = parseLocalistEventsPayload(payload);
      if (payload.events.length && !parsed.length) throw new Error("No usable Localist Events");
      events.push(...parsed);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }
    const count = Number(payload.page?.total ?? payload.page?.total_pages);
    const current = Number(payload.page?.current);
    if (page === 1 && count === 0 && !payload.events.length) {
      complete = true;
      break;
    }
    if (!Number.isSafeInteger(count) || count < 1 || current !== page
        || (totalPages !== undefined && totalPages !== count)) break;
    totalPages = count;
    if (current === count) {
      complete = true;
      break;
    }
    if (!payload.events.length) break;
  }
  return { events, complete };
}

async function fetchEngageEvents(fetchImpl?: UpstreamFetchFn) {
  const [ics, rss] = await Promise.allSettled(["ics", "rss"].map(async (kind) => {
    const response = await fetchUpstreamWithRetry(
      `https://kennesaw.campuslabs.com/engage/events.${kind}`,
      { headers: { Accept: kind === "ics" ? "text/calendar" : "application/rss+xml, application/xml, text/xml" } },
      fetchImpl);
    const payload = await response.text();
    if (kind === "ics" && /BEGIN:VCALENDAR/i.test(payload) && /END:VCALENDAR/i.test(payload)) {
      const parsed = parseEngageIcsPayload(payload);
      if (!parsed.length && /BEGIN:VEVENT/i.test(payload)) throw new Error("No usable Engage calendar Events");
      return parsed;
    }
    if (kind === "rss" && /<rss\b/i.test(payload) && /<\/rss>/i.test(payload)) {
      const parsed = parseEngageRssPayload(payload);
      if (!parsed.length && /<item\b/i.test(payload)) throw new Error("No usable Engage RSS Events");
      return parsed;
    }
    throw new Error(`Invalid Engage ${kind} response`);
  }));
  if (ics.status === "rejected" && rss.status === "rejected") throw new Error("Engage feeds unavailable");
  const combined = ics.status === "fulfilled" ? [...ics.value] : [];
  if (rss.status === "fulfilled") {
    for (const row of rss.value) {
      const match = combined.find((item) => item.sourceExternalKeys?.includes(row.externalKey)
        || (item.startTime === row.startTime && normalizeEventTitleForDedup(item.title) === normalizeEventTitleForDedup(row.title)));
      if (match) match.sourceExternalKeys = [...new Set([...(match.sourceExternalKeys ?? [match.externalKey]), row.externalKey])];
      else combined.push(row);
    }
  }
  return combined;
}

const eventSourceObservation = v.object({
  sourceKey: v.union(v.literal("localist_events"), v.literal("engage_events")),
  outcome: v.union(v.literal("accepted"), v.literal("partial"), v.literal("failed")),
  count: v.optional(v.number()),
});

type EventSourceObservation = import("convex/values").Infer<typeof eventSourceObservation>;

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
      sourceObservations: EventSourceObservation[];
    }
  | { status: "noop_unchanged"; payloadHash: string; sourceObservations: EventSourceObservation[] }
  | {
      status: "ready_to_upsert";
      payloadHash: string;
      events: NormalizedUpstreamEvent[];
      localistCoverageComplete: boolean;
      sourceObservations: EventSourceObservation[];
    }
> {
  const { syncState, nowMs, fetchImpl } = params;
  if (syncState.backoffUntil && syncState.backoffUntil > nowMs) {
    return { status: "circuit_open" };
  }

  const sourceObservations: EventSourceObservation[] = [];
  try {
    const [localist, engage] = await Promise.allSettled([fetchLocalistEvents(fetchImpl), fetchEngageEvents(fetchImpl)]);
    sourceObservations.push(
      localist.status === "fulfilled"
        ? { sourceKey: "localist_events", outcome: localist.value.complete ? "accepted" : "partial", count: localist.value.events.length }
        : { sourceKey: "localist_events", outcome: "failed" },
      engage.status === "fulfilled"
        ? { sourceKey: "engage_events", outcome: "accepted", count: engage.value.length }
        : { sourceKey: "engage_events", outcome: "failed" },
    );
    if (localist.status === "rejected" && engage.status === "rejected") {
      throw new Error("Localist and Engage feeds unavailable");
    }
    const deduped = deduplicateUpstreamEvents(
      localist.status === "fulfilled" ? localist.value.events : [],
      engage.status === "fulfilled" ? engage.value : []
    );
    const localistCoverageComplete = localist.status === "fulfilled" && localist.value.complete
      && engage.status === "fulfilled";

    const verifiedEmpty = localistCoverageComplete && !deduped.length && !syncState.activeRecordCount;
    if (!verifiedEmpty && isSuddenDropOrEmpty(syncState.activeRecordCount, deduped.length)) {
      const reason = `Aborted Events upsert: incoming ${deduped.length} vs previous ${syncState.activeRecordCount} (>80% drop or empty).`;
      return {
        status: "failed_or_aborted",
        failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason, "partial"),
        sourceObservations,
        reason,
      };
    }

    const payloadHash = await computePayloadHash({ events: deduped, localistCoverageComplete });
    if (localistCoverageComplete && payloadHash === syncState.lastPayloadHash) {
      return { status: "noop_unchanged", payloadHash, sourceObservations };
    }

    return {
      status: "ready_to_upsert",
      payloadHash,
      events: deduped,
      localistCoverageComplete,
      sourceObservations,
    };
  } catch (err: any) {
    const reason = err?.message || "Upstream KSU Events sync error";
    return {
      status: "failed_or_aborted",
      failurePatch: evaluateFailureStatePatch(syncState, nowMs, reason),
      reason,
      sourceObservations,
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
    localistCoverageComplete: v.optional(v.boolean()),
    sourceObservations: v.optional(v.array(eventSourceObservation)),
    partial: v.optional(v.boolean()),
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

    if (state?.lastAttemptAt !== undefined && state.lastAttemptAt > args.now) {
      return { upserted: 0, cancelledUpstream: 0 };
    }

    for (const observation of args.sourceObservations ?? []) {
      const previous = await ctx.db.query("feedSyncState")
        .withIndex("by_source", (q) => q.eq("sourceKey", observation.sourceKey)).unique();
      const previousCount = previous?.activeRecordCount ?? 0;
      // Same 0-row / >80% drop guard as the combined upsert: keep the last-good count.
      const suddenDrop = previousCount > 0 && isSuddenDropOrEmpty(previousCount, observation.count ?? 0);
      const accepted = observation.outcome === "accepted" && !suddenDrop;
      const fields = {
        lastAttemptAt: args.now,
        lastSuccessAt: accepted ? args.now : previous?.lastSuccessAt,
        lastOutcome: suddenDrop ? "partial" as const : observation.outcome,
        consecutiveFailures: accepted ? 0 : (previous?.consecutiveFailures ?? 0) + 1,
        activeRecordCount: accepted ? observation.count ?? 0 : previous?.activeRecordCount ?? 0,
        lastAcceptedCount: accepted ? observation.count ?? 0 : previous?.lastAcceptedCount,
      };
      if (previous) await ctx.db.patch(previous._id, fields);
      else await ctx.db.insert("feedSyncState", { sourceKey: observation.sourceKey, ...fields });
    }

    if (args.status === "failed_or_aborted") {
      const base = state ?? {
        consecutiveFailures: 0,
        activeRecordCount: 0,
      };
      const patch = evaluateFailureStatePatch(
        base,
        args.now,
        args.failureReason ?? "Sync failed", args.partial ? "partial" : "failed"
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
          lastOutcome: patch.lastOutcome,
        });
      }
      return { upserted: 0, cancelledUpstream: 0 };
    }

    if (args.status === "noop_unchanged") {
      if (state) {
        await ctx.db.patch(state._id, {
          lastSuccessAt: args.now,
          lastAttemptAt: args.now,
          lastOutcome: "accepted",
          consecutiveFailures: 0,
          backoffUntil: undefined,
          lastError: undefined,
        });
      }
      return { upserted: 0, cancelledUpstream: 0 };
    }

    const incoming = (args.events ?? []) as NormalizedUpstreamEvent[];
    const seenEventIds = new Set<string>();
    let upserted = 0;
    let cancelledUpstream = 0;

    for (const ev of incoming) {
      const keys = ev.sourceExternalKeys ?? [ev.externalKey];
      const exactMatches = await Promise.all(keys.map(async (key) => {
        const indexed = await ctx.db.query("eventSourceAliases")
          .withIndex("by_source_key", (q) => q.eq("sourceKey", key)).unique();
        const match = indexed ? await ctx.db.get(indexed.eventId) : null;
        if (match) return match;
        return ctx.db.query("events").withIndex("by_external_key", (q) => q.eq("externalKey", key)).unique();
      }));
      let existing = exactMatches.find((row) => row?.workspaceKey === "ksu" && !seenEventIds.has(row._id) && (
        row.externalKey === ev.externalKey || row.source !== ev.source
          || (row.source === "localist" && row.externalKey?.split(":").length === 2)
          || row.sourceExternalKeys?.includes(ev.externalKey)
      ));
      if (!existing) {
        const candidates = await ctx.db.query("events").withIndex("by_all_start", (q) =>
          q.eq("workspaceKey", "ksu").eq("visibilityStatus", "visible")
            .gte("startTime", ev.startTime - FIFTEEN_MINUTES_MS)
            .lte("startTime", ev.startTime + FIFTEEN_MINUTES_MS)).take(25);
        existing = candidates.find((row) => !seenEventIds.has(row._id)
          && (row.sourceExternalKeys?.some((key) => keys.includes(key))
            || (row.source !== ev.source && (row.isVirtual || ev.isVirtual || row.campus === ev.campus)
              && normalizeEventTitleForDedup(row.title) === normalizeEventTitleForDedup(ev.title))));
      }
      const patch = {
        campus: ev.campus,
        campusScope: ev.isVirtual ? "Both" as const : ev.campus,
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
        source: ev.source,
        sourceExternalKeys: [...new Set([...(existing?.sourceExternalKeys ?? []), ...keys])],
        status: ev.explicitlyCancelled ? "cancelled_upstream" as const : "scheduled" as const,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        seenEventIds.add(existing._id);
      } else {
        const id = await ctx.db.insert("events", {
          ...patch, workspaceKey: "ksu", externalKey: ev.externalKey, visibilityStatus: "visible",
          prodGoingCount: 0, prodInterestedCount: 0,
        });
        seenEventIds.add(id);
        existing = await ctx.db.get(id);
      }
      if (!existing) continue;
      for (const key of keys) {
        // The legacy Localist event ID can describe multiple occurrences.
        if (key !== ev.externalKey && /^localist:[^:]+$/.test(key)) continue;
        const priorAlias = await ctx.db.query("eventSourceAliases")
          .withIndex("by_source_key", (q) => q.eq("sourceKey", key)).unique();
        if (!priorAlias) await ctx.db.insert("eventSourceAliases", { sourceKey: key, eventId: existing._id });
      }
      upserted++;
    }

    if (args.localistCoverageComplete) {
      const localistWindowEnd = args.now + 29 * 24 * 60 * 60_000;
      const existingUpcoming = await ctx.db.query("events").withIndex("by_all_start", (q) =>
        q.eq("workspaceKey", "ksu").eq("visibilityStatus", "visible")
          .gt("startTime", args.now).lt("startTime", localistWindowEnd)).take(200);
      for (const row of existingUpcoming) {
        // RSS/iCalendar feeds do not publish a completeness guarantee. Only
        // infer disappearance for Localist occurrences in its paginated window.
        if (row.source !== "localist" || !row.externalKey || seenEventIds.has(row._id)
            || row.status !== "scheduled") continue;
        const rsvp = await ctx.db.query("eventRsvps").withIndex("by_event", (q) => q.eq("eventId", row._id)).first();
        const hasRsvp = Boolean(rsvp) || row.prodGoingCount + row.prodInterestedCount > 0;
        await ctx.db.patch(row._id, { status: hasRsvp ? "cancelled_upstream" : "cancelled" });
        if (hasRsvp) cancelledUpstream++;
      }
    }

    if (state) {
      await ctx.db.patch(state._id, {
        lastSuccessAt: args.localistCoverageComplete ? args.now : state.lastSuccessAt,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        backoffUntil: undefined,
        lastPayloadHash: args.payloadHash,
        activeRecordCount: args.localistCoverageComplete ? incoming.length : state.activeRecordCount,
        lastOutcome: args.localistCoverageComplete ? "accepted" : "partial",
        lastError: args.localistCoverageComplete ? undefined : "Event feed coverage was incomplete",
      });
    } else {
      await ctx.db.insert("feedSyncState", {
        sourceKey: "localist_engage_events",
        lastSuccessAt: args.localistCoverageComplete ? args.now : undefined,
        lastAttemptAt: args.now,
        consecutiveFailures: 0,
        lastPayloadHash: args.payloadHash,
        activeRecordCount: incoming.length,
        lastOutcome: args.localistCoverageComplete ? "accepted" : "partial",
        lastError: args.localistCoverageComplete ? undefined : "Event feed coverage was incomplete",
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
        partial: outcome.failurePatch.lastOutcome === "partial",
        sourceObservations: outcome.sourceObservations,
      });
      return { status: "failed_or_aborted" };
    }
    if (outcome.status === "noop_unchanged") {
      await ctx.runMutation(internal.sync.eventsSync.applySyncedEventsInternal, {
        now,
        status: "noop_unchanged",
        payloadHash: outcome.payloadHash,
        sourceObservations: outcome.sourceObservations,
      });
      return { status: "noop_unchanged" };
    }

    await ctx.runMutation(internal.sync.eventsSync.applySyncedEventsInternal, {
      now,
      status: "ready_to_upsert",
      payloadHash: outcome.payloadHash,
      events: outcome.events,
      sourceObservations: outcome.sourceObservations,
      localistCoverageComplete: outcome.localistCoverageComplete,
    });
    return { status: "updated" };
  },
});
