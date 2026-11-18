import { workflowTime } from "./lib/workflowTime";
import { ConvexError, v } from "convex/values";
import { campusFilterValidator } from "./schema";
import { evaluateDiningOpenStatus } from "./lib/parkingMath";
import { formatStalenessBadge } from "./lib/syncGuard";
import { viewerMutation, viewerQuery } from "./lib/viewer";
import { Doc } from "./_generated/dataModel";
import { freshShuttleNotices, freshShuttleEta, freshShuttleVehicles } from "./lib/shuttleRead";
import { easternDate } from "./lib/easternDate";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const listShuttleOverview = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;

    const [allRoutes, latestSnap] = await Promise.all([
      ctx.db.query("shuttleRoutes").take(20),
      ctx.db
        .query("shuttleSnapshots")
        .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
        .unique(),
    ]);

    // Always preserve intercampus 74760 KM Kennesaw / Marietta across Campus filter switches!
    const scopedRoutes = allRoutes.filter((r) => {
      if (r.campusScope === "Both" || r.passioRouteId === "74760") return true;
      if (campusFilter === "All KSU") return true;
      return r.campusScope === campusFilter;
    });

    // Collect unique stopIds across scoped routes and evaluate 15m rider stop pulses
    const uniqueStops = new Map<
      string,
      Doc<"shuttleRoutes">["stops"][number]
    >();
    for (const r of scopedRoutes) {
      for (const s of r.stops) {
        uniqueStops.set(s.stopId, s);
      }
    }

    const stopPulseMap = new Map<
      string,
      { tierValue: string; label: string; count: number }
    >();
    await Promise.all(
      Array.from(uniqueStops.keys()).map(async (stopId) => {
        const pulses = await ctx.db
          .query("campusPulses")
          .withIndex("by_target_active", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("targetType", "shuttle_stop")
              .eq("targetKey", stopId)
              .gt("expiresAt", now)
          )
          .take(10);
        if (pulses.length > 0) {
          const latest = pulses.sort(
            (a, b) => b.publishedAt - a.publishedAt
          )[0]!;
          const label =
            latest.tierValue === "stop_clear"
              ? "Stop clear"
              : latest.tierValue === "long_line"
                ? "Long line"
                : "Bus just passed full";
          stopPulseMap.set(stopId, {
            tierValue: latest.tierValue,
            label,
            count: pulses.length,
          });
        }
      })
    );

    const staleness = formatStalenessBadge(
      latestSnap?.vehiclesFetchedAt,
      now,
      FIFTEEN_MINUTES_MS
    );

    return {
      campusFilter,
      staleness,
      routes: scopedRoutes.map((r) => {
        const eta = freshShuttleEta(latestSnap, r.passioRouteId, now, viewer.mode === "demo");
        return {
          ...r,
          nextEtaMinutes: eta?.etaMinutes ?? null,
          loadLabel: eta?.loadLabel ?? "Live ETA unavailable",
          stops: r.stops.map((st) => ({
            ...st,
            activePulse: stopPulseMap.get(st.stopId) ?? null,
          })),
        };
      }),
      vehicles: freshShuttleVehicles(latestSnap, now, viewer.mode === "demo"),
      shuttleNotices: freshShuttleNotices(latestSnap, now, viewer.mode === "demo"),
      fetchedAt: latestSnap?.vehiclesFetchedAt ?? null,
      isFixture: viewer.mode === "demo" && Boolean(latestSnap?.isFixture),
    };
  },
});

export const submitShuttleStopPulse = viewerMutation({
  args: {
    stopId: v.string(),
    pulseKind: v.union(
      v.literal("stop_clear"),
      v.literal("long_line"),
      v.literal("bus_passed_full")
    ),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;

    await ctx.db.insert("campusPulses", {
      workspaceKey: viewer.workspaceKey,
      targetType: "shuttle_stop",
      targetKey: args.stopId.trim(),
      authorId: viewer.actorStudent._id,
      tierValue: args.pulseKind,
      publishedAt: now,
      expiresAt: now + FIFTEEN_MINUTES_MS,
    });

    return { ok: true, expiresAt: now + FIFTEEN_MINUTES_MS };
  },
});

export const listDiningVenues = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    dietaryFilter: v.optional(v.string()),
    excludeAllergen: v.optional(v.string()),
    menuDay: v.optional(v.union(v.literal("today"), v.literal("tomorrow"))),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;

    const [kVenues, mVenues, syncState] = await Promise.all([
      campusFilter === "Marietta"
        ? Promise.resolve([] as Doc<"diningVenues">[])
        : ctx.db
            .query("diningVenues")
            .withIndex("by_campus", (q) => q.eq("campus", "Kennesaw"))
            .take(20),
      campusFilter === "Kennesaw"
        ? Promise.resolve([] as Doc<"diningVenues">[])
        : ctx.db
            .query("diningVenues")
            .withIndex("by_campus", (q) => q.eq("campus", "Marietta"))
            .take(20),
      ctx.db
        .query("feedSyncState")
        .withIndex("by_source", (q) => q.eq("sourceKey", "nutrislice_dining"))
        .unique(),
    ]);

    const rawVenues = [...kVenues, ...mVenues];
    const todayET = easternDate(now);
    const tomorrowET = easternDate(now, 1);
    const dietary = args.dietaryFilter?.trim().toLowerCase();
    const allergenExclude = args.excludeAllergen?.trim().toLowerCase();

    const staleness = formatStalenessBadge(
      syncState?.lastSuccessAt,
      now,
      TWENTY_FOUR_HOURS_MS
    );

    const venues = await Promise.all(
      rawVenues.map(async (venue) => {
        const pulses = await ctx.db
          .query("campusPulses")
          .withIndex("by_target_active", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("targetType", "dining_venue")
              .eq("targetKey", venue.nutrisliceSlug)
              .gt("expiresAt", now)
          )
          .take(10);

        const openStatus = evaluateDiningOpenStatus(
          venue.hoursScheduleJson,
          now
        );

        const latestLine = pulses.sort(
          (a, b) => b.publishedAt - a.publishedAt
        )[0];

        const lineStatus = latestLine
          ? {
              isLive: true,
              tierValue: latestLine.tierValue,
              label:
                latestLine.tierValue === "no_wait"
                  ? "No Wait (Live)"
                  : latestLine.tierValue === "short_wait"
                    ? "5–10m Line (Live)"
                    : "Packed 15m+ (Live)",
              stationChips: latestLine.stationChips ?? [],
            }
          : {
              isLive: false,
              tierValue: "typical",
              label: "Estimated · Typical meal-hour rush",
              stationChips: [] as string[],
            };

        const parseStations = (jsonStr: string) => {
          try {
            const parsed = JSON.parse(jsonStr) as {
              stations?: Array<{
                name: string;
                items: Array<{
                  name: string;
                  calories: number;
                  dietaryTags?: string[];
                  allergens?: string[];
                }>;
              }>;
            };
            return (parsed.stations ?? [])
              .map((st) => ({
                name: st.name,
                items: st.items.filter((it) => {
                  if (
                    dietary &&
                    !(it.dietaryTags ?? []).includes(dietary)
                  ) {
                    return false;
                  }
                  if (
                    allergenExclude &&
                    (!it.allergens || it.allergens.some(
                      (a) => a.toLowerCase() === allergenExclude
                    ))
                  ) {
                    return false;
                  }
                  return true;
                }),
              }))
              .filter((st) => st.items.length > 0);
          } catch {
            return [];
          }
        };

        const menuFor = (date: string, fixtureMenu: string) => {
          if (venue.todayMenuDateET === date) return venue.todayMenuJson;
          if (venue.tomorrowMenuDateET === date) return venue.tomorrowMenuJson;
          return venue.isFixtureMenu ? fixtureMenu : "{}";
        };
        return {
          _id: venue._id,
          slug: venue.nutrisliceSlug,
          name: venue.name,
          campus: venue.campus,
          venueKind: venue.venueKind,
          buildingName: venue.buildingName,
          doorRates: venue.doorRatesJson
            ? JSON.parse(venue.doorRatesJson)
            : null,
          openStatus,
          hoursAreFixture: venue.isFixtureHours ?? false,
          hoursFreshness: venue.lastHoursSyncAt === undefined || venue.isFixtureHours
            ? null : formatStalenessBadge(venue.lastHoursSyncAt, now, 26 * 60 * 60_000),
          menuFreshness: venue.lastMenuSyncAt === undefined || venue.isFixtureMenu
            ? null : formatStalenessBadge(venue.lastMenuSyncAt, now, TWENTY_FOUR_HOURS_MS),
          hasTodayMenu: venue.todayMenuDateET === todayET || venue.tomorrowMenuDateET === todayET,
          hasTomorrowMenu: venue.todayMenuDateET === tomorrowET || venue.tomorrowMenuDateET === tomorrowET,
          lineStatus,
          menuIsFixture: venue.isFixtureMenu ?? false,
          todayStations: parseStations(menuFor(todayET, venue.todayMenuJson)),
          tomorrowStations: parseStations(menuFor(tomorrowET, venue.tomorrowMenuJson)),
        };
      })
    );

    return {
      campusFilter,
      staleness,
      venues: venues.filter(
        (v) => {
          if (!dietary && !allergenExclude) return true;
          if (args.menuDay === "today") return v.todayStations.length > 0;
          if (args.menuDay === "tomorrow") return v.tomorrowStations.length > 0;
          return v.todayStations.length > 0 || v.tomorrowStations.length > 0;
        }
      ),
    };
  },
});

export const submitDiningLineCheck = viewerMutation({
  args: {
    venueSlug: v.string(),
    lineTier: v.union(
      v.literal("no_wait"),
      v.literal("short_wait"),
      v.literal("packed")
    ),
    stationChips: v.optional(v.array(v.string())),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const cleanSlug = args.venueSlug.trim().toLowerCase();

    const venue = await ctx.db
      .query("diningVenues")
      .withIndex("by_slug", (q) => q.eq("nutrisliceSlug", cleanSlug))
      .unique();
    if (!venue) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Dining Venue not found.",
      });
    }

    // Enforce 1 / 15m cooldown per Student per Dining Venue
    const cooldownKey = `dining:${viewer.workspaceKey}:${viewer.actorStudent._id}:${cleanSlug}`;
    const existingCooldown = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_key", (q) => q.eq("key", cooldownKey))
      .unique();

    if (existingCooldown && existingCooldown.expiresAt > now) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message:
          "You already submitted a Line Check for this Dining Venue (1 per 15 minutes).",
      });
    }

    if (existingCooldown) {
      await ctx.db.patch(existingCooldown._id, {
        count: 1,
        windowStart: now,
        expiresAt: now + FIFTEEN_MINUTES_MS,
      });
    } else {
      await ctx.db.insert("rateLimitBuckets", {
        key: cooldownKey,
        count: 1,
        windowStart: now,
        expiresAt: now + FIFTEEN_MINUTES_MS,
      });
    }

    const allowedChips = (args.stationChips ?? []).slice(0, 3);
    await ctx.db.insert("campusPulses", {
      workspaceKey: viewer.workspaceKey,
      targetType: "dining_venue",
      targetKey: cleanSlug,
      authorId: viewer.actorStudent._id,
      tierValue: args.lineTier,
      stationChips: allowedChips,
      publishedAt: now,
      expiresAt: now + THIRTY_MINUTES_MS,
    });

    return { ok: true, expiresAt: now + THIRTY_MINUTES_MS };
  },
});
