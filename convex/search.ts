import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { campusValidator } from "./schema";
import { isItemVisibleToViewer, viewerQuery, type ViewerContext } from "./lib/viewer";
import { isActiveListing } from "./marketplace";

/**
 * One KSU-wide search entry point (#77).
 *
 * Search is KSU-wide (ADR-0008): it never reads the persisted location setting
 * and narrows to a Campus only when the caller passes one. It reuses each
 * source's bounded search index and the same Block, Report-hide, moderation,
 * expiry and workspace rules as the screen that owns the result. Buildings are
 * searched on the client from the shared campus place catalog. Incidents,
 * Incident Updates and Alerts are never searched (ADR-0009). Saved items live
 * in saved.ts.
 */

/** Results per group. Measure query usage before raising (SPEC-v2 §14). */
const GROUP_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

type Campus = Doc<"listings">["campus"];

async function searchEvents(ctx: QueryCtx, viewer: ViewerContext, qText: string, campus: Campus | undefined) {
  const scopes = campus ? [campus, "Both" as const] : [undefined];
  const batches = await Promise.all(["ksu", viewer.workspaceKey].flatMap((workspaceKey) =>
    scopes.map((scope) => ctx.db.query("events").withSearchIndex("search_events", (q) => {
      const sq = q.search("searchText", qText).eq("workspaceKey", workspaceKey).eq("visibilityStatus", "visible");
      return scope ? sq.eq("campusScope", scope) : sq;
    }).take(GROUP_LIMIT))));
  const seen = new Set<string>();
  return batches.flat()
    .filter((ev) => {
      if (seen.has(String(ev._id))) return false;
      seen.add(String(ev._id));
      return ev.status !== "cancelled" && isItemVisibleToViewer(viewer, {
        targetType: "post", targetId: String(ev._id), authorId: ev.organizerStudentId, visibilityStatus: ev.visibilityStatus,
      });
    })
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, GROUP_LIMIT)
    .map((ev) => ({
      _id: ev._id, title: ev.title, campus: ev.campus, campusScope: ev.campusScope, isVirtual: ev.isVirtual,
      locationName: ev.locationName, startTime: ev.startTime,
    }));
}

async function searchClubs(ctx: QueryCtx, viewer: ViewerContext, qText: string, campus: Campus | undefined) {
  const batches = await Promise.all(["ksu", viewer.workspaceKey].map((workspaceKey) =>
    ctx.db.query("clubs").withSearchIndex("search_clubs", (q) => {
      const sq = q.search("searchText", qText).eq("workspaceKey", workspaceKey).eq("visibilityStatus", "visible");
      return campus ? sq.eq("campus", campus) : sq;
    }).take(GROUP_LIMIT)));
  return [...batches[1]!, ...batches[0]!]
    .filter((club) => !club.isFixture || viewer.mode === "demo")
    .slice(0, GROUP_LIMIT)
    .map((club) => ({ _id: club._id, slug: club.slug, name: club.name, campus: club.campus, summary: club.summary }));
}

async function searchCourseHubs(ctx: QueryCtx, qText: string, campus: Campus | undefined) {
  const hubs = await ctx.db.query("courseHubs")
    .withSearchIndex("search_course_hubs", (q) => q.search("searchText", qText))
    .filter((q) => q.neq(q.field("isRetiredFixture"), true))
    .take(GROUP_LIMIT * 2);
  // Course Hubs have no Campus filter field; narrow after the bounded read.
  return hubs
    .filter((hub) => !campus || hub.campuses.includes(campus))
    .slice(0, GROUP_LIMIT)
    .map((hub) => ({ _id: hub._id, subjectCourse: hub.subjectCourse, title: hub.title, campuses: hub.campuses }));
}

async function searchListings(ctx: QueryCtx, viewer: ViewerContext, qText: string, campus: Campus | undefined, now: number) {
  const home = viewer.actorStudent.homeCampus;
  const campuses: Campus[] = campus ? [campus] : [home, home === "Kennesaw" ? "Marietta" : "Kennesaw"];
  const batches = await Promise.all(campuses.map((c) =>
    ctx.db.query("listings").withSearchIndex("search_listings", (q) =>
      q.search("searchText", qText).eq("workspaceKey", viewer.workspaceKey).eq("isBrowseable", true).eq("campus", c),
    ).take(GROUP_LIMIT)));
  const visible = batches.flat().filter((listing) => isActiveListing(listing, now) && isItemVisibleToViewer(viewer, {
    targetType: "listing", targetId: String(listing._id), authorId: listing.sellerId, visibilityStatus: listing.visibilityStatus,
  }));
  const sellers = await Promise.all(visible.map((listing) => ctx.db.get(listing.sellerId)));
  return visible
    .filter((_, index) => sellers[index]?.accountStatus === "active")
    .slice(0, GROUP_LIMIT)
    .map((listing) => ({
      _id: listing._id, title: listing.title, campus: listing.campus,
      pricingMode: listing.pricingMode, priceCents: listing.priceCents,
    }));
}

export const searchCampus = viewerQuery({
  args: {
    queryText: v.string(),
    /** Explicit, visible Campus filter. Omit for KSU-wide. */
    campus: v.optional(campusValidator),
  },
  handler: async (ctx, args) => {
    const qText = args.queryText.trim().slice(0, 100);
    if (qText.length < MIN_QUERY_LENGTH) return { events: [], clubs: [], courseHubs: [], listings: [] };
    const now = Date.now();
    const [events, clubs, courseHubs, listings] = await Promise.all([
      searchEvents(ctx, ctx.viewer, qText, args.campus),
      searchClubs(ctx, ctx.viewer, qText, args.campus),
      searchCourseHubs(ctx, qText, args.campus),
      searchListings(ctx, ctx.viewer, qText, args.campus, now),
    ]);
    return { events, clubs, courseHubs, listings };
  },
});

