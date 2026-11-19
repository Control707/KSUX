import { v } from "convex/values";
import { easternDate } from "./lib/easternDate";
import { weekKeyET } from "./lib/cloutLedger";
import { viewerMutation, viewerQuery } from "./lib/viewer";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Read side of the private Profile "Your Clout" card (SPEC-v2 §12). Awarding,
 * holds and reversals live in lib/cloutLedger.ts and run inside the report
 * mutations; this file only reads the viewer's own rows and flips their own
 * "Hide me from leaderboards". Other Students' Clout is never returned here.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CAMPUSES = ["Kennesaw", "Marietta"] as const;

/** Monday (ET) of the week containing `now`, as YYYY-MM-DD. */
export function currentWeekKeyET(now: number): string {
  return weekKeyET(now);
}

/** A short, non-identifying place label for the payout toast and log. */
async function payoutPlace(ctx: QueryCtx, event: Doc<"cloutEvents">): Promise<string | undefined> {
  const [kind, key] = event.targetKey.split(":", 2);
  if (kind === "parking_lot" && key) {
    const lotId = ctx.db.normalizeId("parkingLots", key);
    const lot = lotId && await ctx.db.get(lotId as Id<"parkingLots">);
    return lot ? `Lot ${lot.lotCode}` : undefined;
  }
  if ((kind === "dining_venue" || kind === "study_room") && key) return key.replace(/-/g, " ");
  return undefined;
}

export const getMyClout = viewerQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    const student = viewer.actorStudent;
    const now = Date.now();
    const weekKey = currentWeekKeyET(now);

    const thisWeek = [] as { campus: (typeof CAMPUSES)[number]; counted: number; held: number }[];
    for (const campus of CAMPUSES) {
      const row = await ctx.db
        .query("cloutWeeklyTotals")
        .withIndex("by_student_week_campus", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", student._id).eq("weekKey", weekKey).eq("campus", campus))
        .unique();
      thisWeek.push({ campus, counted: row?.countedTotal ?? 0, held: row?.heldTotal ?? 0 });
    }

    const since = easternDate(now - THIRTY_DAYS_MS);
    const events = await ctx.db
      .query("cloutEvents")
      .withIndex("by_student_day", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", student._id).gte("dayKeyET", since))
      .order("desc")
      .take(50);

    // Own active Parking Reports that haven't been corroborated yet.
    const activeReports = await ctx.db
      .query("parkingReports")
      .withIndex("by_author_status", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("authorId", student._id).eq("status", "active"))
      .take(20);
    let pendingReports = 0;
    for (const report of activeReports) {
      if (report.expiresAt <= now) continue;
      const sourceType = report.reportKind === "fullness" ? "parking_report" : "spot_opening";
      const paid = await ctx.db.query("cloutEvents").withIndex("by_source", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("sourceType", sourceType).eq("sourceKey", String(report._id))
          .eq("studentId", student._id).eq("kind", "earn")).first();
      if (!paid) pendingReports += 1;
    }

    const payouts = [];
    for (const [index, event] of events.entries()) {
      payouts.push({
        id: String(event._id),
        kind: event.kind,
        amount: event.amount,
        sourceType: event.sourceType,
        campus: event.campus,
        createdAt: event.createdAt,
        place: index < 10 ? await payoutPlace(ctx, event) : undefined,
      });
    }

    return {
      weekKey,
      pendingReports,
      thisWeek,
      lifetime: student.lifetimeClout ?? 0,
      hidden: student.leaderboardHidden === true,
      isDemo: viewer.mode === "demo",
      payouts,
    };
  },
});

export const setLeaderboardHidden = viewerMutation({
  args: { hidden: v.boolean() },
  handler: async (ctx, { hidden }) => {
    const { viewer } = ctx;
    const student = viewer.actorStudent;
    if ((student.leaderboardHidden === true) === hidden) return { hidden };
    await ctx.db.patch(student._id, { leaderboardHidden: hidden });

    // Keep this week's board rows and visible counts consistent with the flag.
    const weekKey = currentWeekKeyET(Date.now());
    for (const campus of CAMPUSES) {
      const total = await ctx.db
        .query("cloutWeeklyTotals")
        .withIndex("by_student_week_campus", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", student._id).eq("weekKey", weekKey).eq("campus", campus))
        .unique();
      if (!total || total.hidden === hidden) continue;
      await ctx.db.patch(total._id, { hidden });
      if (total.countedTotal <= 0) continue;
      const board = await ctx.db
        .query("cloutBoardCounts")
        .withIndex("by_campus_week", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("campus", campus).eq("weekKey", weekKey))
        .unique();
      if (board) {
        await ctx.db.patch(board._id, { visibleCount: Math.max(0, board.visibleCount + (hidden ? -1 : 1)) });
      }
    }
    return { hidden };
  },
});
