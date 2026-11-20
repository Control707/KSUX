/**
 * Official Alerts, P1 (ADR-0007, SPEC-v2 §9–§10, #80).
 *
 * - `runScheduledAlertPoll` reads the two agreed KSU pages every 5 minutes,
 *   only while `OWLSIDE_ALERT_COPY_MODE` is `shadow` or `display`.
 * - In `shadow` the copy is recorded but never shown and never pushed; the
 *   source rows collect the 14-day evidence a maintainer signs off.
 * - Status reads (`alertSourceStatus`) compute stale at read time and fall back
 *   to links-only while hidden, unrecognized or kill-switched.
 * - Alert push is opt-in per device, fires once per item after two identical
 *   fetches, honours a global 3/day cap and fans out 100 subscriptions per
 *   scheduled batch. Demo workspaces never push.
 */
import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveViewerFromDb, viewerAuthArgs, viewerMutation, viewerQuery } from "./lib/viewer";
import { easternDate, localTimestamp } from "./lib/easternDate";
import { computeCircuitBackoffMs } from "./lib/syncGuard";
import {
  alertCopyMode, alertPushRequested, CONFIRMATIONS_TO_PUSH, DAILY_PUSH_CAP, DEFAULT_UNAVAILABLE_BACKOFF_MS,
  FANOUT_BATCH, fetchSource, HEARTBEAT_MS, isStale, ITEM_PURGE_MS, NO_LONGER_LISTED_SHOWN_MS, OFFICIAL_SOURCE_KEYS,
  OFFICIAL_SOURCES, officialAlertPushPayload, SHADOW_MS, shadowGatePassed, shadowReadyForSignOff, shadowWindowMs, sourceInfo, stableHash,
  type AdapterResult, type OfficialSourceKey, type PageFetch, type ParsedAlertItem,
} from "./lib/officialAlerts";

const KSU = "ksu";
const resultValidator = v.union(
  v.object({
    kind: v.literal("ok"),
    items: v.array(v.object({
      itemKey: v.string(), category: v.union(v.literal("timely_warning"), v.literal("emergency_advisory")),
      headline: v.string(), excerpt: v.string(), officialIssuedAt: v.optional(v.number()),
      officialIssuedText: v.optional(v.string()), campus: v.optional(v.union(v.literal("Kennesaw"), v.literal("Marietta"))),
      allClear: v.boolean(), contentHash: v.string(),
    })),
  }),
  v.object({ kind: v.literal("quiet"), quietText: v.string() }),
  v.object({ kind: v.literal("unavailable"), reason: v.string(), retryAfterMs: v.optional(v.number()) }),
  v.object({ kind: v.literal("unrecognized"), reason: v.string() }),
);

async function ksuSource(db: QueryCtx["db"], sourceKey: string) {
  return db.query("alertSources").withIndex("by_source", (q) => q.eq("workspaceKey", KSU).eq("sourceKey", sourceKey)).unique();
}

/** Start of today in Eastern time, for the global daily cap. */
function easternDayStart(now: number) {
  const [year, month, day] = easternDate(now).split("-").map(Number) as [number, number, number];
  return localTimestamp({ year, month, day, hour: 0, minute: 0, second: 0 }) ?? now - 24 * 60 * 60_000;
}

/** Pushes already sent today, derived from today's pushed items (no counter table). */
async function pushesSentToday(db: QueryCtx["db"], now: number) {
  const start = easternDayStart(now);
  const issued = await db.query("alertItems").withIndex("by_pushed", (q) => q.eq("workspaceKey", KSU).gte("pushedAt", start)).take(DAILY_PUSH_CAP + 1);
  const cleared = await db.query("alertItems").withIndex("by_all_clear_pushed", (q) => q.eq("workspaceKey", KSU).gte("allClearPushedAt", start)).take(DAILY_PUSH_CAP + 1);
  return issued.filter((i) => i.pushDecision === "sent").length + cleared.filter((i) => i.allClearPushDecision === "sent").length;
}

/** Why push may not fire for this source right now; null when it may. */
export function pushBlockReason(source: Doc<"alertSources">, now: number, env: { mode: string; push: boolean }) {
  if (source.workspaceKey !== KSU) return "demo";
  if (env.mode !== "display") return "copy_not_displayed";
  if (!env.push) return "push_not_enabled";
  if (!shadowGatePassed(source)) return "shadow_not_signed_off";
  if (source.killSwitch !== "off") return "kill_switched";
  if (source.lastResult === "unrecognized") return "unrecognized";
  if (isStale(source.lastSuccessAt, now)) return "stale";
  return null;
}

// ---------------------------------------------------------------------------
// Poller
// ---------------------------------------------------------------------------

export const getSourcesForPollInternal = internalQuery({
  args: {},
  handler: async ({ db }) => Promise.all(OFFICIAL_SOURCE_KEYS.map(async (sourceKey) => {
    const row = await ksuSource(db, sourceKey);
    return { sourceKey, backoffUntil: row?.backoffUntil, killSwitch: row?.killSwitch ?? "off" };
  })),
});

/** Fetch both sources and apply each result. Injectable fetch for tests. */
export async function pollOfficialAlerts(
  ctx: { runQuery: any; runMutation: any },
  now: number,
  fetchImpl: PageFetch,
) {
  const sources: { sourceKey: OfficialSourceKey; backoffUntil?: number; killSwitch: string }[] =
    await ctx.runQuery(internal.officialAlerts.getSourcesForPollInternal, {});
  const outcomes: Record<string, string> = {};
  for (const source of sources) {
    // A manual kill switch stops fetching entirely; an automatic one keeps polling so recovery is visible.
    if (source.killSwitch === "manual") { outcomes[source.sourceKey] = "manual_kill"; continue; }
    if (source.backoffUntil && source.backoffUntil > now) { outcomes[source.sourceKey] = "backoff"; continue; }
    const result = await fetchSource(source.sourceKey, now, fetchImpl);
    await ctx.runMutation(internal.officialAlerts.applyFetchResultInternal, { sourceKey: source.sourceKey, now, result });
    outcomes[source.sourceKey] = result.kind;
  }
  return outcomes;
}

export const runScheduledAlertPoll = internalAction({
  args: {},
  handler: async (ctx) => {
    if (alertCopyMode() === "off") return { skipped: "links_only" };
    return pollOfficialAlerts(ctx, Date.now(), fetch as unknown as PageFetch);
  },
});

function hashOfResult(result: AdapterResult) {
  if (result.kind === "ok") return stableHash(result.items.map((i) => i.itemKey + ":" + i.contentHash).sort().join("|"));
  if (result.kind === "quiet") return stableHash("quiet:" + result.quietText);
  return undefined;
}

export const applyFetchResultInternal = internalMutation({
  args: { sourceKey: v.string(), now: v.number(), result: resultValidator },
  handler: async (ctx, { sourceKey, now, result }) => {
    const info = sourceInfo(sourceKey);
    if (!info) throw new ConvexError({ code: "BAD_REQUEST", message: "Unknown official source." });
    let source = await ksuSource(ctx.db, sourceKey);
    if (!source) {
      const id = await ctx.db.insert("alertSources", {
        workspaceKey: KSU, sourceKey, adapterKind: "html_copy", lastResult: "unavailable", killSwitch: "off",
      });
      source = (await ctx.db.get(id))!;
    }
    if (source.lastAttemptAt !== undefined && source.lastAttemptAt > now) return { applied: false };
    const shadowStart = source.shadowStartedAt ?? now;

    if (result.kind === "unavailable") {
      const failures = (source.consecutiveFailures ?? 0) + 1;
      const backoff = result.retryAfterMs ?? computeCircuitBackoffMs(failures) ?? (failures >= 2 ? DEFAULT_UNAVAILABLE_BACKOFF_MS : undefined);
      // Only the attempt time moves; last success, items and hash are kept so stale is honest.
      await ctx.db.patch(source._id, {
        adapterKind: "html_copy", lastResult: "unavailable", lastAttemptAt: now, consecutiveFailures: failures,
        backoffUntil: backoff ? now + backoff : undefined, lastError: result.reason.slice(0, 200), shadowStartedAt: shadowStart,
      });
      return { applied: true };
    }

    if (result.kind === "unrecognized") {
      // Auto kill switch: fall back to links-only, keep the reason for the maintainer, never push.
      await ctx.db.patch(source._id, {
        adapterKind: "html_copy", lastResult: "unrecognized", lastAttemptAt: now, consecutiveFailures: 0, backoffUntil: undefined,
        killSwitch: source.killSwitch === "manual" ? "manual" : "auto", killReason: result.reason.slice(0, 200),
        lastError: result.reason.slice(0, 200), shadowStartedAt: shadowStart,
        // Counted against the shadow window only; after sign-off the kill switch alone keeps it links-only.
        shadowUnrecognizedCount: (source.shadowUnrecognizedCount ?? 0) + (source.shadowSignedOffAt === undefined ? 1 : 0),
      });
      return { applied: true };
    }

    const payloadHash = hashOfResult(result)!;
    const changed = payloadHash !== source.lastPayloadHash;
    const recovered = source.lastResult === "unavailable" || source.lastResult === "unrecognized";
    // Heartbeat: an unchanged, healthy page writes last-success at most every 10 minutes.
    const heartbeatDue = source.lastSuccessAt === undefined || now - source.lastSuccessAt >= HEARTBEAT_MS;

    const items = result.kind === "ok" ? result.items : [];
    const listed = new Set(items.map((i) => i.itemKey));
    const pushable: Id<"alertItems">[] = [];
    // Every successful fetch confirms items still listed. Items only change when content changes.
    for (const item of items) {
      const outcome = await upsertItem(ctx, source._id, item, now, recovered);
      if (outcome) pushable.push(outcome);
    }
    if (changed || recovered) {
      const current = await ctx.db.query("alertItems").withIndex("by_source_state", (q) => q.eq("workspaceKey", KSU).eq("sourceId", source._id)).take(200);
      for (const row of current) {
        if (listed.has(row.itemKey) || row.state === "no_longer_listed") continue;
        await ctx.db.patch(row._id, { state: "no_longer_listed", noLongerListedAt: now, stateChangedAt: now, confirmedFetches: 0 });
      }
    }

    const killPatch = source.killSwitch === "auto" ? { killSwitch: "off" as const, killReason: undefined } : {};
    if (changed || recovered || heartbeatDue || pushable.length) {
      await ctx.db.patch(source._id, {
        adapterKind: "html_copy", lastResult: result.kind, quietText: result.kind === "quiet" ? result.quietText : undefined,
        lastAttemptAt: now, lastSuccessAt: now, lastPayloadHash: payloadHash, consecutiveFailures: 0,
        backoffUntil: undefined, lastError: undefined, shadowStartedAt: shadowStart,
        shadowChangeCount: (source.shadowChangeCount ?? 0) + (changed && source.lastPayloadHash !== undefined ? 1 : 0),
        ...killPatch,
      });
    }
    // An unchanged page between heartbeats costs no write unless an item reached its second sighting.

    if (pushable.length) await decidePushes(ctx, (await ctx.db.get(source._id))!, pushable, now);
    return { applied: true, changed };
  },
});

/** Insert or update one item; returns its id when it just became eligible to push. */
async function upsertItem(ctx: MutationCtx, sourceId: Id<"alertSources">, item: ParsedAlertItem, now: number, recovered: boolean) {
  const existing = await ctx.db.query("alertItems").withIndex("by_source_item", (q) =>
    q.eq("workspaceKey", KSU).eq("sourceId", sourceId).eq("itemKey", item.itemKey)).unique();
  const fields = {
    category: item.category, headline: item.headline, excerpt: item.excerpt, campus: item.campus,
    officialIssuedAt: item.officialIssuedAt, officialIssuedText: item.officialIssuedText, contentHash: item.contentHash,
  };
  if (!existing) {
    await ctx.db.insert("alertItems", {
      workspaceKey: KSU, sourceId, itemKey: item.itemKey, ...fields,
      officialUrl: OFFICIAL_SOURCES[item.category === "timely_warning" ? "ksu_timely_warnings" : "ksu_emergency_advisories"].href,
      firstObservedAt: now, lastSeenAt: now, stateChangedAt: now,
      state: item.allClear ? "all_clear" : "issued", confirmedFetches: 1, purgeAt: now + ITEM_PURGE_MS,
    });
    return null;
  }
  if (existing.contentHash !== item.contentHash || existing.state === "no_longer_listed") {
    // New content restarts the seen-twice count; a relisted or edited item is shown as updated.
    await ctx.db.patch(existing._id, {
      ...fields, state: item.allClear ? "all_clear" : "updated", stateChangedAt: now, lastSeenAt: now, confirmedFetches: 1,
      noLongerListedAt: undefined, purgeAt: now + ITEM_PURGE_MS,
    });
    return null;
  }
  if (recovered) {
    // After an unavailable or unrecognized fetch the two sightings must be consecutive again.
    if (existing.confirmedFetches !== 1) await ctx.db.patch(existing._id, { confirmedFetches: 1, lastSeenAt: now });
    return null;
  }
  const confirmedFetches = existing.confirmedFetches + 1;
  // One push per item when it first reaches issued (an edit before confirmation still counts as its first),
  // and one more only for a quoted official all-clear.
  const needsDecision = confirmedFetches >= CONFIRMATIONS_TO_PUSH && (existing.state === "all_clear"
    ? existing.allClearPushDecision === undefined
    : existing.pushDecision === undefined);
  // Only write on the confirming fetch or when a decision is due; later identical sightings cost nothing.
  if (existing.confirmedFetches < CONFIRMATIONS_TO_PUSH || needsDecision) {
    await ctx.db.patch(existing._id, { confirmedFetches, lastSeenAt: now });
  }
  return needsDecision ? existing._id : null;
}

/** Record exactly one push decision per item (sent, capped or blocked) and schedule the fan-out. */
async function decidePushes(ctx: MutationCtx, source: Doc<"alertSources">, itemIds: Id<"alertItems">[], now: number) {
  const blocked = pushBlockReason(source, now, { mode: alertCopyMode(), push: alertPushRequested() });
  let sent = await pushesSentToday(ctx.db, now);
  for (const itemId of itemIds) {
    const item = (await ctx.db.get(itemId))!;
    const allClear = item.state === "all_clear";
    const decision = blocked ? "blocked" as const : sent >= DAILY_PUSH_CAP ? "capped" as const : "sent" as const;
    await ctx.db.patch(itemId, allClear
      ? { allClearPushDecision: decision, allClearPushedAt: now }
      : { pushDecision: decision, pushedAt: now });
    if (decision !== "sent") continue;
    sent++;
    await ctx.scheduler.runAfter(0, internal.officialAlerts.fanOutAlertPushBatch, {
      alertId: itemId, sourceKey: source.sourceKey, allClear, cursor: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Batched fan-out: 100 opted-in subscriptions per scheduled step.
// ---------------------------------------------------------------------------

export const listOptedInBatchInternal = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async ({ db }, { cursor }) => {
    const page = await db.query("pushSubscriptions")
      .withIndex("by_official_alert_opt_in", (q) => q.eq("workspaceKey", "prod").eq("officialAlertOptIn", true))
      .paginate({ cursor, numItems: FANOUT_BATCH });
    return {
      subscriptions: page.page.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const getAlertForFanOutInternal = internalQuery({
  args: { alertId: v.id("alertItems") },
  handler: async ({ db }, { alertId }) => {
    const item = await db.get(alertId);
    if (!item) return null;
    const source = await db.get(item.sourceId);
    return source ? { workspaceKey: item.workspaceKey, blocked: pushBlockReason(source, Date.now(), { mode: alertCopyMode(), push: alertPushRequested() }) } : null;
  },
});

export const fanOutAlertPushBatch = internalAction({
  args: { alertId: v.id("alertItems"), sourceKey: v.string(), allClear: v.boolean(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<{ stopped: true } | { delivered: number; more: boolean }> => {
    const alert = await ctx.runQuery(internal.officialAlerts.getAlertForFanOutInternal, { alertId: args.alertId });
    // Re-check between batches: a kill switch, a bad parse or stale data stops the remaining fan-out.
    if (!alert || alert.workspaceKey !== KSU || alert.blocked) {
      return { stopped: true };
    }
    const payload = officialAlertPushPayload(args.sourceKey, args.alertId, args.allClear);
    if (!payload) return { stopped: true };
    const batch: { subscriptions: { endpoint: string; p256dh: string; auth: string }[]; continueCursor: string | null } =
      await ctx.runQuery(internal.officialAlerts.listOptedInBatchInternal, { cursor: args.cursor });
    if (batch.subscriptions.length) {
      await ctx.runAction(internal.pushNode.sendPushToSubscriptionsNode, { subscriptions: batch.subscriptions, ...payload });
    }
    if (batch.continueCursor) {
      await ctx.scheduler.runAfter(0, internal.officialAlerts.fanOutAlertPushBatch, { ...args, cursor: batch.continueCursor });
    }
    return { delivered: batch.subscriptions.length, more: Boolean(batch.continueCursor) };
  },
});

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

type SourceStatus = {
  sourceKey: string; sourceName: string; pageTitle: string; href: string;
  display: "links_only" | "ok" | "quiet" | "unavailable" | "stale";
  reason?: "not_enabled" | "kill_switched" | "unrecognized";
  quietText?: string; lastSuccessAt?: number; lastAttemptAt?: number; demo: boolean; latestAttemptFailed?: boolean;
};

function demoSourceInfo(sourceKey: string) {
  const named = sourceInfo(sourceKey.replace(/^demo_/, ""));
  if (named) return named;
  return sourceKey.includes("advisory") ? OFFICIAL_SOURCES.ksu_emergency_advisories : OFFICIAL_SOURCES.ksu_timely_warnings;
}

/** What a Student may see for one source. Stale is decided here, at read time. */
export function presentSource(source: Doc<"alertSources">, now: number, demo: boolean): SourceStatus {
  const info = demo ? demoSourceInfo(source.sourceKey) : sourceInfo(source.sourceKey)!;
  const base = {
    sourceKey: source.sourceKey, sourceName: info.sourceName, pageTitle: info.pageTitle, href: info.href,
    lastSuccessAt: source.lastSuccessAt, lastAttemptAt: source.lastAttemptAt, demo,
  };
  if (!demo && (alertCopyMode() !== "display" || !shadowGatePassed(source) || source.adapterKind !== "html_copy")) {
    return { ...base, display: "links_only", reason: "not_enabled" };
  }
  if (source.killSwitch !== "off") return { ...base, display: "links_only", reason: "kill_switched" };
  if (source.lastResult === "unrecognized") return { ...base, display: "links_only", reason: "unrecognized" };
  if (source.lastSuccessAt === undefined) return { ...base, display: "unavailable" };
  if (isStale(source.lastSuccessAt, now)) return { ...base, display: "stale" };
  // A failed latest attempt inside the 20-minute window still shows the last good copy, with its check time.
  const quiet = source.lastResult === "quiet" || (source.lastResult === "unavailable" && source.quietText !== undefined);
  return { ...base, display: quiet ? "quiet" : "ok", quietText: quiet ? source.quietText : undefined, latestAttemptFailed: source.lastResult === "unavailable" };
}

function presentItem(item: Doc<"alertItems">, source: SourceStatus, now: number) {
  const hiddenAfter = (item.noLongerListedAt ?? item.stateChangedAt ?? item.lastSeenAt) + NO_LONGER_LISTED_SHOWN_MS;
  return {
    _id: item._id, sourceKey: source.sourceKey, sourceName: source.sourceName, category: item.category,
    headline: item.headline, excerpt: item.excerpt, campus: item.campus ?? null,
    officialIssuedAt: item.officialIssuedAt ?? null, officialIssuedText: item.officialIssuedText ?? null,
    firstObservedAt: item.firstObservedAt, lastSeenAt: item.lastSeenAt, state: item.state,
    stateChangedAt: item.stateChangedAt ?? item.firstObservedAt, noLongerListedAt: item.noLongerListedAt ?? null,
    lifecycle: item.state === "no_longer_listed" && now > hiddenAfter ? "older" as const : "current" as const,
    officialUrl: item.officialUrl ?? source.href, demoLabel: item.demoLabel ?? null,
    lastSuccessAt: source.lastSuccessAt ?? null, lastAttemptAt: source.lastAttemptAt ?? null,
  };
}

async function sourcesFor(db: QueryCtx["db"], workspaceKey: string) {
  if (workspaceKey === KSU) return (await Promise.all(OFFICIAL_SOURCE_KEYS.map((key) => ksuSource(db, key)))).filter((s) => s !== null);
  return db.query("alertSources").withIndex("by_purge", (q) => q.eq("workspaceKey", workspaceKey)).take(10);
}

/**
 * Official Alerts are public like /safety: no sign-in needed. Only a Judge Demo
 * session switches the read to its own fixtures; anything else reads `ksu`.
 */
async function readScope(ctx: QueryCtx, auth: { demoShortCode?: string; demoPersonaHandle?: string }) {
  if (!auth.demoShortCode) return { demo: false, workspaceKey: KSU };
  try {
    const viewer = await resolveViewerFromDb(ctx, { demoShortCode: auth.demoShortCode, demoPersonaHandle: auth.demoPersonaHandle });
    return viewer.mode === "demo" ? { demo: true, workspaceKey: viewer.workspaceKey } : { demo: false, workspaceKey: KSU };
  } catch {
    return { demo: false, workspaceKey: KSU };
  }
}

/** The tiny status query (SPEC-v2 §14): source states and current items, for /safety and the banner. */
export const alertSourceStatus = query({
  args: viewerAuthArgs,
  handler: async (ctx, auth) => {
    const now = Date.now();
    const { demo, workspaceKey } = await readScope(ctx, auth);
    const sources = await sourcesFor(ctx.db, workspaceKey);
    const out = [];
    for (const source of sources) {
      const status = presentSource(source, now, demo);
      const showItems = status.display === "ok" || status.display === "stale";
      const items = showItems
        ? (await ctx.db.query("alertItems").withIndex("by_source_state", (q) => q.eq("workspaceKey", workspaceKey).eq("sourceId", source._id)).take(20))
          .map((item) => presentItem(item, status, now)).filter((item) => item.lifecycle === "current")
          .sort((a, b) => b.stateChangedAt - a.stateChangedAt)
        : [];
      out.push({ ...status, items });
    }
    return { serverNow: now, mode: demo ? "demo" as const : alertCopyMode(), sources: out };
  },
});

/** The Alert details page. Visible only while its source may be shown. */
export const getOfficialAlert = query({
  args: { ...viewerAuthArgs, alertId: v.string() },
  handler: async (ctx, { alertId, ...auth }) => {
    const now = Date.now();
    const id = ctx.db.normalizeId("alertItems", alertId);
    const item = id ? await ctx.db.get(id) : null;
    const { demo, workspaceKey } = await readScope(ctx, auth);
    if (!item || item.workspaceKey !== workspaceKey) return { serverNow: now, found: false as const };
    const source = await ctx.db.get(item.sourceId);
    if (!source) return { serverNow: now, found: false as const };
    const status = presentSource(source, now, demo);
    if (status.display === "links_only") return { serverNow: now, found: false as const, source: status };
    return { serverNow: now, found: true as const, source: status, alert: presentItem(item, status, now) };
  },
});

// ---------------------------------------------------------------------------
// Preference (pushSubscriptions.officialAlertOptIn), per device
// ---------------------------------------------------------------------------

export const getAlertPushPreference = viewerQuery({
  args: { endpoint: v.optional(v.string()) },
  handler: async (ctx, { endpoint }) => {
    const now = Date.now();
    if (ctx.viewer.mode !== "student") return { available: false as const, reason: "demo" as const };
    const mode = alertCopyMode();
    const sources = await sourcesFor(ctx.db, KSU);
    const env = { mode, push: alertPushRequested() };
    const reasons = sources.map((s) => pushBlockReason(s, now, env));
    const phase = mode !== "display" || !alertPushRequested() || sources.length === 0 || !sources.every(shadowGatePassed)
      ? "not_available" as const
      : reasons.some((r) => r === "kill_switched" || r === "unrecognized") ? "switched_off" as const
        : reasons.some((r) => r === "stale") ? "paused" as const : "active" as const;
    const devices = await ctx.db.query("pushSubscriptions").withIndex("by_student", (q) => q.eq("studentId", ctx.viewer.actorStudent._id)).take(5);
    const thisDevice = endpoint ? devices.find((d) => d.endpoint === endpoint.trim()) : undefined;
    return {
      available: true as const, phase, dailyCap: DAILY_PUSH_CAP,
      thisDeviceRegistered: Boolean(thisDevice), optedIn: Boolean(thisDevice?.officialAlertOptIn),
      optedInDevices: devices.filter((d) => d.officialAlertOptIn).length, deviceCount: devices.length,
    };
  },
});

export const setAlertPushPreference = viewerMutation({
  args: { endpoint: v.string(), optIn: v.boolean(), confirmed: v.optional(v.boolean()) },
  handler: async (ctx, { endpoint, optIn, confirmed }) => {
    if (ctx.viewer.mode !== "student" || ctx.viewer.workspaceKey !== "prod") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Demo Mode: no push." });
    }
    const row = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint.trim())).unique();
    if (!row || row.studentId !== ctx.viewer.actorStudent._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Turn on push for this phone first." });
    }
    if (optIn) {
      if (!confirmed) throw new ConvexError({ code: "BAD_REQUEST", message: "Confirm the Official Alert push limits first." });
      if (alertCopyMode() !== "display" || !alertPushRequested()) {
        throw new ConvexError({ code: "UNAVAILABLE", message: "Official Alert push isn’t available yet." });
      }
      await ctx.db.patch(row._id, { workspaceKey: "prod", officialAlertOptIn: true, officialAlertOptedInAt: row.officialAlertOptedInAt ?? Date.now() });
    } else {
      await ctx.db.patch(row._id, { officialAlertOptIn: false, officialAlertOptedInAt: undefined });
    }
    return { optedIn: optIn };
  },
});

// ---------------------------------------------------------------------------
// Maintainer controls: kill switch, shadow evidence and sign-off.
// ---------------------------------------------------------------------------

function requireMaintainer(viewer: { mode: string; isMaintainer: boolean }) {
  if (viewer.mode !== "student" || !viewer.isMaintainer) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Maintainer access is required." });
  }
}

export const getAlertOps = viewerQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.viewer.mode !== "student" || !ctx.viewer.isMaintainer) return null;
    const now = Date.now();
    const sources = await sourcesFor(ctx.db, KSU);
    return {
      mode: alertCopyMode(), pushRequested: alertPushRequested(), serverNow: now,
      shadowWindowMs: shadowWindowMs(), fullShadowMs: SHADOW_MS,
      sentToday: await pushesSentToday(ctx.db, now), dailyCap: DAILY_PUSH_CAP,
      sources: sources.map((s) => ({
        sourceKey: s.sourceKey, sourceName: sourceInfo(s.sourceKey)?.sourceName ?? s.sourceKey,
        lastResult: s.lastResult, lastSuccessAt: s.lastSuccessAt ?? null, lastAttemptAt: s.lastAttemptAt ?? null,
        stale: isStale(s.lastSuccessAt, now), killSwitch: s.killSwitch, killReason: s.killReason ?? null,
        lastError: s.lastError ?? null, backoffUntil: s.backoffUntil ?? null,
        shadowStartedAt: s.shadowStartedAt ?? null, shadowChangeCount: s.shadowChangeCount ?? 0,
        shadowUnrecognizedCount: s.shadowUnrecognizedCount ?? 0, shadowSignedOffAt: s.shadowSignedOffAt ?? null,
        signedOffWindowMs: s.shadowWindowMs ?? null,
        readyForSignOff: shadowReadyForSignOff(s, now), gatePassed: shadowGatePassed(s),
      })),
    };
  },
});

export const setAlertKillSwitch = viewerMutation({
  args: { sourceKey: v.string(), on: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { sourceKey, on, reason }) => {
    requireMaintainer(ctx.viewer);
    const source = await ksuSource(ctx.db, sourceKey);
    if (!source || !sourceInfo(sourceKey)) throw new ConvexError({ code: "NOT_FOUND", message: "Unknown official source." });
    await ctx.db.patch(source._id, on
      ? { killSwitch: "manual", killReason: (reason?.trim() || "Switched off by a OwlSide maintainer").slice(0, 200) }
      : { killSwitch: "off", killReason: undefined, backoffUntil: undefined });
    return { killSwitch: on ? "manual" : "off" };
  },
});

/** Record the clean 14-day shadow poll. Rejected unless 14 days elapsed with zero unrecognized results. */
export const signOffAlertShadow = viewerMutation({
  args: { sourceKey: v.string() },
  handler: async (ctx, { sourceKey }) => {
    requireMaintainer(ctx.viewer);
    const source = await ksuSource(ctx.db, sourceKey);
    if (!source) throw new ConvexError({ code: "NOT_FOUND", message: "Unknown official source." });
    const now = Date.now();
    const windowMs = shadowWindowMs();
    if (source.lastSuccessAt === undefined || !shadowReadyForSignOff(source, now, windowMs)) {
      throw new ConvexError({ code: "BAD_REQUEST", message: `The shadow poll needs ${windowMs >= SHADOW_MS ? "14 clean days" : `${Math.round(windowMs / 3_600_000 * 10) / 10} clean hours`} with no unrecognized result.` });
    }
    await ctx.db.patch(source._id, {
      shadowSignedOffAt: now, shadowWindowMs: windowMs,
      shadowSignedOffBy: ctx.viewer.actorStudent.canonicalEmail ?? ctx.viewer.actorStudent.handle,
    });
    return { signedOffAt: now };
  },
});

/** Restart the shadow window after a parser fix; also clears an earlier sign-off. */
export const restartAlertShadow = viewerMutation({
  args: { sourceKey: v.string() },
  handler: async (ctx, { sourceKey }) => {
    requireMaintainer(ctx.viewer);
    const source = await ksuSource(ctx.db, sourceKey);
    if (!source) throw new ConvexError({ code: "NOT_FOUND", message: "Unknown official source." });
    await ctx.db.patch(source._id, {
      shadowStartedAt: Date.now(), shadowChangeCount: 0, shadowUnrecognizedCount: 0,
      shadowSignedOffAt: undefined, shadowSignedOffBy: undefined, shadowWindowMs: undefined,
      ...(source.killSwitch === "auto" ? { killSwitch: "off" as const, killReason: undefined } : {}),
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Judge Demo Mode: an on-demand sample Alert (#111 demo path).
// ---------------------------------------------------------------------------

const DEMO_TRIGGER_LIMIT = 10;

/**
 * Add a fresh "Demo · not real" Timely Warning to this Judge Demo session only,
 * so the banner, the /safety card and the Alert details page can be shown live.
 * It never touches `ksu` or `prod`, never fetches and never pushes (ADR-0007).
 */
export const simulateDemoAlert = viewerMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.viewer.mode !== "demo" || !ctx.viewer.workspaceKey.startsWith("demo:")) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Sample Alerts are only available in Judge Demo Mode." });
    }
    const workspaceKey = ctx.viewer.workspaceKey;
    const now = Date.now();
    const sources = await ctx.db.query("alertSources").withIndex("by_purge", (q) => q.eq("workspaceKey", workspaceKey)).take(10);
    let source = sources.find((s) => s.sourceKey === "demo_ksu_timely_warnings");
    const purgeAt = sources[0]?.purgeAt ?? now + 24 * 60 * 60_000;
    if (!source) {
      const id = await ctx.db.insert("alertSources", {
        workspaceKey, sourceKey: "demo_ksu_timely_warnings", adapterKind: "html_copy", lastResult: "ok", killSwitch: "off", purgeAt,
      });
      source = (await ctx.db.get(id))!;
    }
    const existing = await ctx.db.query("alertItems").withIndex("by_source_state", (q) => q.eq("workspaceKey", workspaceKey).eq("sourceId", source._id)).take(50);
    const triggered = existing.filter((i) => i.itemKey.startsWith("demo-trigger-")).length;
    if (triggered >= DEMO_TRIGGER_LIMIT) {
      throw new ConvexError({ code: "RATE_LIMITED", message: "This Demo session already has 10 sample Alerts. Start a new Demo session to reset." });
    }
    // A fresh, healthy check so the sample is current, never stale.
    await ctx.db.patch(source._id, { lastResult: "ok", lastSuccessAt: now, lastAttemptAt: now, killSwitch: "off", quietText: undefined });
    const alertId = await ctx.db.insert("alertItems", {
      workspaceKey, demoLabel: "Demo · not real", sourceId: source._id, itemKey: `demo-trigger-${triggered + 1}`,
      category: "timely_warning", headline: `Demo · not real · Sample Timely Warning ${triggered + 1}`,
      excerpt: "Exercise only. No real campus incident is described. Real Timely Warnings come only from KSU Police’s page.",
      firstObservedAt: now, lastSeenAt: now, stateChangedAt: now, state: "issued", contentHash: `demo-trigger-${triggered + 1}`,
      // Push is recorded as blocked: Demo never sends push.
      confirmedFetches: 2, pushDecision: "blocked", pushedAt: now, purgeAt,
    });
    return { alertId, pushSent: false };
  },
});
