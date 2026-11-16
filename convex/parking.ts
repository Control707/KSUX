import { ConvexError, v } from "convex/values";
import { campusFilterValidator } from "./schema";
import { evaluateParkingLotFullness } from "./lib/parkingMath";
import { viewerMutation, viewerQuery } from "./lib/viewer";
import { Doc, Id } from "./_generated/dataModel";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;

export const listParkingLots = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    permitTierFilter: v.optional(v.string()),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowOverride ?? Date.now();
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

    const tierFilter = args.permitTierFilter?.trim();
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

        const evaluated = evaluateParkingLotFullness(lot, fullnessReports, now);
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
        entry.evaluated.effectiveTier >= 2 &&
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
                .take(15);
              targetEntry = {
                lot: fetchedOverflow,
                evaluated: evaluateParkingLotFullness(
                  fetchedOverflow,
                  reports,
                  now
                ),
                activeSpotOpenings: [],
              };
            }
          }

          if (targetEntry && targetEntry.evaluated.effectiveTier <= 1) {
            const routeId = targetEntry.lot.servedByShuttleRouteIds[0];
            const route = allRoutes.find((r) => r.passioRouteId === routeId);
            const eta = latestShuttleSnap?.stopEtas.find(
              (e) => e.passioRouteId === routeId
            );
            overflowReroute = {
              lotId: targetEntry.lot._id,
              slug: targetEntry.lot.slug,
              name: targetEntry.lot.name,
              effectiveTier: targetEntry.evaluated.effectiveTier,
              tierLabel: targetEntry.evaluated.tierLabel,
              shuttleRouteName: route?.name,
              shuttleEtaMinutes: eta?.etaMinutes ?? 5,
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
    };
  },
});

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
      permitTier: patch.permitTier ?? actor.permitTier,
    };
  },
});

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
    const now = args.nowOverride ?? Date.now();
    const { viewer } = ctx;
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
    const cooldownKey = `parking:${viewer.workspaceKey}:${viewer.actorStudent._id}:${lot._id}:${args.reportKind}`;
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
      workspaceKey: viewer.workspaceKey,
      parkingLotId: lot._id,
      authorId: viewer.actorStudent._id,
      reportKind: args.reportKind,
      fullnessTier:
        args.reportKind === "fullness" ? args.fullnessTier : undefined,
      deckLevel: cleanLevel,
      goneVoterIds: [],
      status: "active",
      publishedAt: now,
      expiresAt: now + ttl,
    });

    return {
      reportId,
      expiresAt: now + ttl,
    };
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
