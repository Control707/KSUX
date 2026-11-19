import { workflowTime } from "./lib/workflowTime";
import { ConvexError, v } from "convex/values";
import { campusFilterValidator } from "./schema";
import { evaluateParkingLotFullness } from "./lib/parkingMath";
import { evaluateCampusLine } from "./lib/parkingCampusLine";
import { freshShuttleEta } from "./lib/shuttleRead";
import { viewerMutation, viewerQuery } from "./lib/viewer";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { awardClout, CLOUT_REPORT_POINTS, payBothSides } from "./lib/cloutLedger";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;
const TWENTY_MINUTES_MS = 20 * 60 * 1000;
/** Demo persona corroboration delay (SPEC-v2 §14 Judge Demo Mode). */
export const DEMO_CORROBORATION_DELAY_MS = 4_000;

export const listParkingLots = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    permitTierFilter: v.optional(v.string()),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;

    const [kLots, mLots, allRoutes, latestShuttleSnap] = await Promise.all([
      campusFilter === "Marietta"
        ? Promise.resolve([] as Doc<"parkingLots">[])
        : ctx.db
            .query("parkingLots")
            .withIndex("by_campus", (q) => q.eq("campus", "Kennesaw"))
            .take(50),
      campusFilter === "Kennesaw"
        ? Promise.resolve([] as Doc<"parkingLots">[])
        : ctx.db
            .query("parkingLots")
            .withIndex("by_campus", (q) => q.eq("campus", "Marietta"))
            .take(40),
      ctx.db.query("shuttleRoutes").take(15),
      ctx.db
        .query("shuttleSnapshots")
        .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
        .unique(),
    ]);

    const tierFilter = (args.permitTierFilter ?? viewer.actorStudent.permitTier)?.trim();
    const rawLots = [...kLots, ...mLots].filter((lot) => {
      if (!tierFilter || tierFilter === "All") return true;
      return lot.permitTiers.includes(tierFilter);
    });

    const pinnedSet = new Set(
      viewer.actorStudent.pinnedParkingLotIds.map(String)
    );

    // Pre-evaluate all lots in scope so overflow lookups are fast and consistent
    const evaluatedBySlug = new Map<
      string,
      {
        lot: Doc<"parkingLots">;
        evaluated: ReturnType<typeof evaluateParkingLotFullness>;
        activeSpotOpenings: Doc<"parkingReports">[];
      }
    >();

    await Promise.all(
      rawLots.map(async (lot) => {
        const [fullnessReports, spotOpenings] = await Promise.all([
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "fullness")
                .gt("expiresAt", now)
            )
            .order("desc")
            .take(30),
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "spot_opening")
                .gt("expiresAt", now)
            )
            .take(10),
        ]);

        const evaluated = evaluateParkingLotFullness(fullnessReports, now);
        const activeSpotOpenings = spotOpenings.filter(
          (s) => s.status === "active" && s.goneVoterIds.length < 2
        );

        evaluatedBySlug.set(lot.slug, {
          lot,
          evaluated,
          activeSpotOpenings,
        });
      })
    );

    const results = [];
    for (const lot of rawLots) {
      const entry = evaluatedBySlug.get(lot.slug)!;
      let overflowReroute: {
        lotId: Id<"parkingLots">;
        slug: string;
        name: string;
        effectiveTier: 0 | 1 | 2 | 3;
        tierLabel: string;
        shuttleRouteName?: string;
        shuttleEtaMinutes?: number;
      } | null = null;

      if (
        entry.evaluated.effectiveTier !== null && entry.evaluated.effectiveTier >= 2 &&
        lot.overflowTargetLotSlugs.length > 0
      ) {
        for (const targetSlug of lot.overflowTargetLotSlugs) {
          let targetEntry = evaluatedBySlug.get(targetSlug);
          if (!targetEntry) {
            const fetchedOverflow = await ctx.db
              .query("parkingLots")
              .withIndex("by_slug", (q) => q.eq("slug", targetSlug))
              .unique();
            if (fetchedOverflow) {
              const reports = await ctx.db
                .query("parkingReports")
                .withIndex("by_lot_active", (q) =>
                  q
                    .eq("workspaceKey", viewer.workspaceKey)
                    .eq("parkingLotId", fetchedOverflow._id)
                    .eq("reportKind", "fullness")
                    .gt("expiresAt", now)
                )
                .order("desc")
                .take(15);
              targetEntry = {
                lot: fetchedOverflow,
                evaluated: evaluateParkingLotFullness(
                  reports,
                  now
                ),
                activeSpotOpenings: [],
              };
            }
          }

          if (targetEntry && targetEntry.evaluated.effectiveTier !== null && targetEntry.evaluated.effectiveTier <= 1) {
            const routeId = targetEntry.lot.servedByShuttleRouteIds[0];
            const route = allRoutes.find((r) => r.passioRouteId === routeId);
            const eta = routeId ? freshShuttleEta(latestShuttleSnap, routeId, now, viewer.mode === "demo") : null;
            overflowReroute = {
              lotId: targetEntry.lot._id,
              slug: targetEntry.lot.slug,
              name: targetEntry.lot.name,
              effectiveTier: targetEntry.evaluated.effectiveTier,
              tierLabel: targetEntry.evaluated.tierLabel,
              shuttleRouteName: route?.name,
              shuttleEtaMinutes: eta?.etaMinutes,
            };
            break;
          }
        }
      }

      results.push({
        _id: lot._id,
        slug: lot.slug,
        campus: lot.campus,
        name: lot.name,
        lotCode: lot.lotCode,
        isDeck: lot.isDeck,
        levels: lot.levels,
        permitTiers: lot.permitTiers,
        latitude: lot.latitude,
        longitude: lot.longitude,
        geoFeatureId: lot.geoFeatureId,
        servedByShuttle: lot.servedByShuttleRouteIds.length > 0,
        isPinned: pinnedSet.has(String(lot._id)),
        ...entry.evaluated,
        spotOpenings: entry.activeSpotOpenings.map((s) => ({
          _id: s._id,
          deckLevel: s.deckLevel,
          publishedAt: s.publishedAt,
          expiresAt: s.expiresAt,
          goneVotes: s.goneVoterIds.length,
          isAuthor: s.authorId === viewer.actorStudent._id,
          hasVotedGone: s.goneVoterIds.includes(viewer.actorStudent._id),
        })),
        overflowReroute,
      });
    }

    // Sort pinned lots first, then decks, then alphabetical
    results.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isDeck !== b.isDeck) return a.isDeck ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      campusFilter,
      savedPermitTier: viewer.actorStudent.permitTier ?? "All",
      pinnedParkingLotIds: viewer.actorStudent.pinnedParkingLotIds,
      lots: results,
      noRecentReports: results.every((lot) => lot.noRecentReports),
      campusLine: evaluateCampusLine(now),
      bestBet: pickBestBet(results),
    };
  },
});

type BestBetCandidate = {
  _id: Id<"parkingLots">;
  slug: string;
  name: string;
  lotCode: string;
  campus: "Kennesaw" | "Marietta";
  effectiveTier: 0 | 1 | 2 | 3 | null;
  tierLabel: string;
  provenanceLabel: string;
  latestReportMinutesAgo?: number;
  isPinned: boolean;
};

/**
 * "Best bet for your permit" (SPEC-v2 §4). Ranks only lots with a live tier
 * from Student Parking Reports: lowest tier first, then the freshest report,
 * then pinned. With no live tier anywhere it never ranks by an estimate and
 * instead lists the lots with shuttle service.
 */
export function pickBestBet(
  lots: Array<BestBetCandidate & { servedByShuttle: boolean }>
):
  | { kind: "live"; lot: BestBetCandidate }
  | { kind: "no_recent_reports"; shuttleLots: Array<{ slug: string; name: string; lotCode: string }> } {
  const live = lots.filter((lot) => lot.effectiveTier !== null);
  if (live.length > 0) {
    const [best] = [...live].sort((a, b) =>
      (a.effectiveTier! - b.effectiveTier!) ||
      ((a.latestReportMinutesAgo ?? 99) - (b.latestReportMinutesAgo ?? 99)) ||
      (Number(b.isPinned) - Number(a.isPinned)) ||
      a.name.localeCompare(b.name)
    );
    const { servedByShuttle: _ignored, ...lot } = best as BestBetCandidate & { servedByShuttle: boolean };
    return { kind: "live", lot };
  }
  return {
    kind: "no_recent_reports",
    shuttleLots: lots
      .filter((lot) => lot.servedByShuttle)
      .map((lot) => ({ slug: lot.slug, name: lot.name, lotCode: lot.lotCode })),
  };
}

export const saveParkingPreferences = viewerMutation({
  args: {
    permitTier: v.optional(v.string()),
    togglePinLotId: v.optional(v.id("parkingLots")),
  },
  handler: async (ctx, args) => {
    const actor = ctx.viewer.actorStudent;
    const nextPinned = [...actor.pinnedParkingLotIds];

    if (args.togglePinLotId) {
      const lot = await ctx.db.get(args.togglePinLotId);
      if (!lot) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parking Lot not found.",
        });
      }
      const idx = nextPinned.findIndex((id) => id === args.togglePinLotId);
      if (idx >= 0) {
        nextPinned.splice(idx, 1);
      } else {
        if (nextPinned.length >= 2) {
          throw new ConvexError({
            code: "PIN_CAP_REACHED",
            message: "You can pin up to 2 favorite Parking Lots.",
          });
        }
        nextPinned.push(args.togglePinLotId);
      }
    }

    const patch: Record<string, any> = {
      pinnedParkingLotIds: nextPinned,
    };
    if (args.permitTier !== undefined) {
      patch.permitTier =
        args.permitTier === "All" || !args.permitTier.trim()
          ? undefined
          : args.permitTier.trim();
    }

    await ctx.db.patch(actor._id, patch);
    return {
      pinnedParkingLotIds: nextPinned,
      permitTier: args.permitTier === undefined ? actor.permitTier : patch.permitTier,
    };
  },
});

type ParkingReportInput = {
  parkingLotId: Id<"parkingLots">;
  reportKind: "fullness" | "spot_opening";
  fullnessTier?: 0 | 1 | 2 | 3;
  deckLevel?: string;
};

/**
 * Files one Parking Report and runs Clout corroboration (SPEC-v2 §12). Shared
 * by the Student mutation and the Demo persona, so both take the normal path.
 */
async function fileParkingReport(
  ctx: MutationCtx,
  workspaceKey: string,
  author: Doc<"students">,
  blocked: ReadonlySet<Id<"students">>,
  args: ParkingReportInput,
  now: number,
) {
  const lot = await ctx.db.get(args.parkingLotId);
  if (!lot) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Parking Lot not found.",
    });
  }

  if (
    args.reportKind === "fullness" &&
    args.fullnessTier === undefined
  ) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      message: "Select one of the 4 fullness tiers.",
    });
  }

  // Enforce 1 report / 10m cooldown per Student per Parking Lot (per reportKind)
  const cooldownKey = `parking:${workspaceKey}:${author._id}:${lot._id}:${args.reportKind}`;
  const existingCooldown = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key", (q) => q.eq("key", cooldownKey))
    .unique();

  if (existingCooldown && existingCooldown.expiresAt > now) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message:
        "You already submitted an update for this Parking Lot recently (1 per 10 minutes).",
    });
  }

  if (existingCooldown) {
    await ctx.db.patch(existingCooldown._id, {
      count: 1,
      windowStart: now,
      expiresAt: now + TEN_MINUTES_MS,
    });
  } else {
    await ctx.db.insert("rateLimitBuckets", {
      key: cooldownKey,
      count: 1,
      windowStart: now,
      expiresAt: now + TEN_MINUTES_MS,
    });
  }

  const ttl =
    args.reportKind === "spot_opening"
      ? TEN_MINUTES_MS
      : FORTY_FIVE_MINUTES_MS;

  const cleanLevel = args.deckLevel?.trim().slice(0, 12) || undefined;

  const reportId = await ctx.db.insert("parkingReports", {
    workspaceKey,
    parkingLotId: lot._id,
    authorId: author._id,
    reportKind: args.reportKind,
    fullnessTier:
      args.reportKind === "fullness" ? args.fullnessTier : undefined,
    deckLevel: cleanLevel,
    goneVoterIds: [],
    status: "active",
    publishedAt: now,
    expiresAt: now + ttl,
  });

  let corroborated = false;
  if (args.reportKind === "fullness" && args.fullnessTier !== undefined) {
    // A different Student, same lot, within 20 min and one tier, and the same
    // deck floor when both name one.
    const recent = await ctx.db
      .query("parkingReports")
      .withIndex("by_lot_active", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("parkingLotId", lot._id)
          .eq("reportKind", "fullness").gt("expiresAt", now))
      .order("desc")
      .take(50);
    const tier = args.fullnessTier;
    const matches = recent.filter((report) =>
      report._id !== reportId && report.authorId !== author._id && !blocked.has(report.authorId) &&
      report.status === "active" && report.publishedAt >= now - TWENTY_MINUTES_MS && report.publishedAt <= now &&
      report.fullnessTier !== undefined && Math.abs(report.fullnessTier - tier) <= 1 &&
      (!cleanLevel || !report.deckLevel || report.deckLevel.toLowerCase() === cleanLevel.toLowerCase()));
    const result = await payBothSides(ctx, {
      workspaceKey, sourceType: "parking_report", targetKey: `parking_lot:${lot._id}`, campus: lot.campus,
      mine: { sourceKey: String(reportId), authorId: author._id },
      others: matches.map((report) => ({ sourceKey: String(report._id), authorId: report.authorId })),
      now,
    });
    corroborated = result.corroborated;
  }

  return { reportId, expiresAt: now + ttl, corroborated, lot };
}

export const submitParkingReport = viewerMutation({
  args: {
    parkingLotId: v.id("parkingLots"),
    reportKind: v.union(v.literal("fullness"), v.literal("spot_opening")),
    fullnessTier: v.optional(
      v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3))
    ),
    deckLevel: v.optional(v.string()),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const result = await fileParkingReport(ctx, viewer.workspaceKey, viewer.actorStudent, viewer.blockedStudentIds, args, now);

    // Judge Demo Mode: @jordan_me corroborates the judge's report 4 s later,
    // through the same path a real Student's report takes.
    if (
      viewer.mode === "demo" &&
      args.reportKind === "fullness" &&
      !result.corroborated &&
      viewer.actorStudent.handleLower !== "jordan_me"
    ) {
      await ctx.scheduler.runAfter(DEMO_CORROBORATION_DELAY_MS, internal.parking.demoPersonaCorroborate, {
        workspaceKey: viewer.workspaceKey,
        reportId: result.reportId,
      });
    }

    return {
      reportId: result.reportId,
      expiresAt: result.expiresAt,
      corroborated: result.corroborated,
    };
  },
});

export const demoPersonaCorroborate = internalMutation({
  args: { workspaceKey: v.string(), reportId: v.id("parkingReports") },
  handler: async (ctx, args) => {
    if (!args.workspaceKey.startsWith("demo:")) return { filed: false };
    const report = await ctx.db.get(args.reportId);
    if (!report || report.workspaceKey !== args.workspaceKey || report.status !== "active" ||
        report.reportKind !== "fullness" || report.fullnessTier === undefined) return { filed: false };
    const jordan = await ctx.db
      .query("students")
      .withIndex("by_workspace_handle", (q) => q.eq("workspaceKey", args.workspaceKey).eq("handleLower", "jordan_me"))
      .unique();
    if (!jordan || jordan._id === report.authorId || jordan.accountStatus !== "active") return { filed: false };
    const now = Date.now();
    try {
      const result = await fileParkingReport(ctx, args.workspaceKey, jordan, new Set(), {
        parkingLotId: report.parkingLotId,
        reportKind: "fullness",
        fullnessTier: report.fullnessTier,
        deckLevel: report.deckLevel,
      }, Math.max(now, report.publishedAt));
      return { filed: true, corroborated: result.corroborated };
    } catch {
      // Jordan's own 10-minute cooldown on this lot: nothing to file.
      return { filed: false };
    }
  },
});

export const resolveSpotOpening = viewerMutation({
  args: {
    reportId: v.id("parkingReports"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const report = await ctx.db.get(args.reportId);
    if (
      !report ||
      report.workspaceKey !== viewer.workspaceKey ||
      report.reportKind !== "spot_opening"
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Spot Opening pulse not found.",
      });
    }

    // Author can cancel immediately
    if (report.authorId === viewer.actorStudent._id) {
      await ctx.db.patch(report._id, { status: "cleared" });
      return { cleared: true, goneVotes: report.goneVoterIds.length };
    }

    if (report.goneVoterIds.includes(viewer.actorStudent._id)) {
      return {
        cleared: report.status === "cleared",
        goneVotes: report.goneVoterIds.length,
      };
    }

    const nextVoters = [...report.goneVoterIds, viewer.actorStudent._id];
    const shouldClear = nextVoters.length >= 2;

    await ctx.db.patch(report._id, {
      goneVoterIds: nextVoters,
      status: shouldClear ? "cleared" : report.status,
    });

    return {
      cleared: shouldClear,
      goneVotes: nextVoters.length,
    };
  },
});

/**
 * Undo for the arrival strip and "I'm leaving": the author withdraws their own
 * active report. It also lifts the 10-minute cooldown so a corrected report
 * can be published straight away.
 */
export const undoParkingReport = viewerMutation({
  args: { reportId: v.id("parkingReports") },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const report = await ctx.db.get(args.reportId);
    if (
      !report ||
      report.workspaceKey !== viewer.workspaceKey ||
      report.authorId !== viewer.actorStudent._id
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Parking Report not found." });
    }
    if (report.status === "active") {
      await ctx.db.patch(report._id, { status: "cleared" });
    }
    const cooldownKey = `parking:${viewer.workspaceKey}:${viewer.actorStudent._id}:${report.parkingLotId}:${report.reportKind}`;
    const bucket = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", cooldownKey))
      .unique();
    if (bucket) await ctx.db.delete(bucket._id);
    return { undone: true };
  },
});

/**
 * "I took this spot": another Student acknowledges a Spot Opening, which
 * clears it at once. "Gone" still needs 2 votes (resolveSpotOpening).
 * The leaver earns Spot Opening Clout; the taker earns nothing.
 */
export const takeSpotOpening = viewerMutation({
  args: { reportId: v.id("parkingReports"), nowOverride: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const report = await ctx.db.get(args.reportId);
    if (
      !report ||
      report.workspaceKey !== viewer.workspaceKey ||
      report.reportKind !== "spot_opening"
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Spot Opening not found." });
    }
    if (report.authorId === viewer.actorStudent._id) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "You posted this Spot Opening." });
    }
    const wasActive = report.status === "active" && report.expiresAt > now;
    if (report.status === "active") {
      await ctx.db.patch(report._id, { status: "cleared" });
    }
    // Corroborated Spot Opening: 5 to the leaver, 0 to the taker.
    let paid = false;
    if (wasActive && !viewer.blockedStudentIds.has(report.authorId)) {
      const lot = await ctx.db.get(report.parkingLotId);
      if (lot) {
        const result = await awardClout(ctx, {
          workspaceKey: viewer.workspaceKey, studentId: report.authorId, partnerId: viewer.actorStudent._id,
          sourceType: "spot_opening", sourceKey: String(report._id), targetKey: `parking_lot:${lot._id}`,
          campus: lot.campus, amount: CLOUT_REPORT_POINTS, now,
        });
        paid = result.paid;
      }
    }
    return { taken: true, leaverPaid: paid };
  },
});
