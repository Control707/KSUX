import { v } from "convex/values";
import { campusValidator } from "./schema";
import { weekKeyET } from "./lib/cloutLedger";
import { getLeaderboardGate } from "./lib/v2Launch";
import { viewerQuery } from "./lib/viewer";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * The weekly per-Campus Leaderboard (SPEC-v2 §12, P1). Clients call this as a
 * one-shot query (on visit, pull-to-refresh and the payout toast), never as a
 * subscription. Before gate 2(a) it returns only "coming soon"; earning Clout
 * is unaffected either way.
 */

type Campus = Doc<"cloutWeeklyTotals">["campus"];
const CAMPUSES = ["Kennesaw", "Marietta"] as const satisfies readonly Campus[];
export const LEADERBOARD_TOP = 25;
const TOP_SCAN_LIMIT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Visible rows on one board with any counted Clout. */
function boardRows(ctx: QueryCtx, workspaceKey: string, campus: Campus, weekKey: string) {
  return ctx.db.query("cloutWeeklyTotals").withIndex("by_board", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("campus", campus).eq("weekKey", weekKey).eq("hidden", false).gt("countedTotal", 0));
}

/**
 * Exact competition rank (1 + Students with more counted Clout), counting
 * whichever side of the viewer is shorter: both sides are streamed in
 * lockstep and the first to finish decides, so cost is ~2 × min(above, below).
 */
async function exactRank(
  ctx: QueryCtx, workspaceKey: string, campus: Campus, weekKey: string,
  mine: { _id: Id<"cloutWeeklyTotals">; countedTotal: number }, visibleCount: number,
) {
  const aboveIt = ctx.db.query("cloutWeeklyTotals").withIndex("by_board", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("campus", campus).eq("weekKey", weekKey).eq("hidden", false)
      .gt("countedTotal", mine.countedTotal))[Symbol.asyncIterator]();
  const belowIt = ctx.db.query("cloutWeeklyTotals").withIndex("by_board", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("campus", campus).eq("weekKey", weekKey).eq("hidden", false)
      .gt("countedTotal", 0).lte("countedTotal", mine.countedTotal))[Symbol.asyncIterator]();
  let aboveCount = 0;
  let belowCount = 0; // includes the viewer and ties
  for (;;) {
    const a = await aboveIt.next();
    if (a.done) {
      // Keep the total honest if the board counter has drifted low.
      return { rank: aboveCount + 1, of: Math.max(visibleCount, aboveCount + belowCount + 1) };
    }
    aboveCount += 1;
    const b = await belowIt.next();
    if (b.done) {
      const of = Math.max(visibleCount, aboveCount + belowCount);
      return { rank: Math.max(1, of - belowCount + 1), of };
    }
    belowCount += 1;
  }
}

export const getLeaderboard = viewerQuery({
  args: { campus: v.optional(campusValidator) },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const student = viewer.actorStudent;
    const now = Date.now();
    const weekKey = weekKeyET(now);
    const isDemo = viewer.mode === "demo";

    const mine = new Map<Campus, Doc<"cloutWeeklyTotals"> | null>();
    for (const campus of CAMPUSES) {
      mine.set(campus, await ctx.db.query("cloutWeeklyTotals").withIndex("by_student_week_campus", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", student._id).eq("weekKey", weekKey).eq("campus", campus))
        .unique());
    }
    // Default: where the viewer earned most this week, else their home Campus.
    const kennesaw = mine.get("Kennesaw")?.countedTotal ?? 0;
    const marietta = mine.get("Marietta")?.countedTotal ?? 0;
    const defaultCampus: Campus = kennesaw > marietta ? "Kennesaw" : marietta > kennesaw ? "Marietta" : student.homeCampus;
    const campus = args.campus ?? defaultCampus;

    const gate = getLeaderboardGate(viewer.mode, now);
    if (!gate.open) return { status: "coming_soon" as const, campus, defaultCampus, isDemo };

    const counter = await ctx.db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
      q.eq("workspaceKey", viewer.workspaceKey).eq("campus", campus).eq("weekKey", weekKey)).unique();
    const visibleCount = counter?.visibleCount ?? 0;

    // Top 25 by handle. Suspended or deleted accounts are absent.
    const top: { rank: number; handle: string; total: number; isViewer: boolean }[] = [];
    let scanned = 0;
    let lastTotal = -1;
    let lastRank = 0;
    for await (const row of boardRows(ctx, viewer.workspaceKey, campus, weekKey).order("desc")) {
      if (top.length >= LEADERBOARD_TOP || ++scanned > TOP_SCAN_LIMIT) break;
      const owner = await ctx.db.get(row.studentId);
      if (!owner || owner.workspaceKey !== viewer.workspaceKey || owner.accountStatus !== "active" || owner.leaderboardHidden === true) continue;
      const position = top.length + 1;
      const rank = row.countedTotal === lastTotal ? lastRank : position;
      lastTotal = row.countedTotal;
      lastRank = rank;
      top.push({ rank, handle: owner.handle, total: row.countedTotal, isViewer: owner._id === student._id });
    }

    const myRow = mine.get(campus) ?? null;
    type Me =
      | { state: "suspended" }
      | { state: "hidden" }
      | { state: "nothing_earned" }
      | { state: "ranked"; rank: number; of: number; total: number };
    let me: Me;
    if (student.accountStatus !== "active") me = { state: "suspended" };
    else if (student.leaderboardHidden === true) me = { state: "hidden" };
    else if (!myRow || myRow.countedTotal <= 0 || myRow.hidden) me = { state: "nothing_earned" };
    else {
      const inTop = top.find((row) => row.isViewer);
      const { rank, of } = inTop
        ? { rank: inTop.rank, of: Math.max(visibleCount, top.length) }
        : await exactRank(ctx, viewer.workspaceKey, campus, weekKey, myRow, visibleCount);
      me = { state: "ranked", rank, of, total: myRow.countedTotal };
    }

    // "New week" copy: this week's board is empty but last week's had people on it.
    let afterReset = false;
    if (top.length === 0) {
      const lastWeek = weekKeyET(new Date(weekKey + "T12:00:00Z").getTime() - 3 * DAY_MS);
      const previous = await ctx.db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("campus", campus).eq("weekKey", lastWeek)).unique();
      afterReset = (previous?.visibleCount ?? 0) > 0;
    }

    return {
      status: "open" as const,
      afterReset,
      campus,
      defaultCampus,
      isDemo,
      weekKey,
      boardEmpty: top.length === 0,
      visibleCount: Math.max(visibleCount, top.length),
      top,
      me,
    };
  },
});

/**
 * Maintainer anomaly view (SPEC-v2 §12): top weekly gainers per Campus and the
 * most-reversed accounts over the last 7 days. One-shot, bounded reads.
 */
export const getCloutAnomalies = viewerQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    if (!viewer.isMaintainer) return null;
    const now = Date.now();
    const weekKey = weekKeyET(now);
    const handles = new Map<Id<"students">, string>();
    const handleOf = async (id: Id<"students">) => {
      if (!handles.has(id)) {
        const s = await ctx.db.get(id);
        handles.set(id, s?.workspaceKey === viewer.workspaceKey ? `${s.handle}${s.accountStatus !== "active" ? " (inactive)" : ""}` : "unknown");
      }
      return handles.get(id)!;
    };

    const gainers: { campus: Campus; handle: string; counted: number; held: number; hidden: boolean }[] = [];
    for (const campus of CAMPUSES) {
      const rows: Doc<"cloutWeeklyTotals">[] = [];
      for (const hidden of [false, true]) {
        rows.push(...await ctx.db.query("cloutWeeklyTotals").withIndex("by_board", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("campus", campus).eq("weekKey", weekKey).eq("hidden", hidden))
          .order("desc").take(10));
      }
      rows.sort((a, b) => (b.countedTotal + b.heldTotal) - (a.countedTotal + a.heldTotal));
      for (const row of rows.slice(0, 10)) {
        if (row.countedTotal + row.heldTotal <= 0) continue;
        gainers.push({ campus, handle: await handleOf(row.studentId), counted: row.countedTotal, held: row.heldTotal, hidden: row.hidden });
      }
    }

    // Ledger rows purge 30 days after creation, so purgeAt ≥ now + 23 d is the last 7 days.
    const SCAN = 2000;
    const recent = await ctx.db.query("cloutEvents").withIndex("by_purge", (q) =>
      q.eq("workspaceKey", viewer.workspaceKey).gte("purgeAt", now + 23 * DAY_MS)).take(SCAN);
    const reversed = new Map<Id<"students">, { count: number; amount: number; held: number }>();
    for (const event of recent) {
      if (event.kind !== "reverse" && event.kind !== "hold") continue;
      const entry = reversed.get(event.studentId) ?? { count: 0, amount: 0, held: 0 };
      if (event.kind === "reverse") { entry.count += 1; entry.amount += event.amount; } else entry.held += 1;
      reversed.set(event.studentId, entry);
    }
    const mostReversed = [];
    for (const [studentId, entry] of [...reversed.entries()].filter(([, e]) => e.count > 0)
      .sort((a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount).slice(0, 10)) {
      mostReversed.push({ handle: await handleOf(studentId), reversals: entry.count, reversedAmount: entry.amount, holds: entry.held });
    }

    return { weekKey, gainers, mostReversed, limited: recent.length === SCAN, isDemo: viewer.mode === "demo" };
  },
});
