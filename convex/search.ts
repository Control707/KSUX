import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { campusValidator } from "./schema";
import { isItemVisibleToViewer, viewerMutation, viewerQuery, type ViewerContext } from "./lib/viewer";

/**
 * One KSU-wide search entry point and the private saved-items view (#77).
 *
 * Search is KSU-wide (ADR-0008): it never reads the persisted location setting
 * and narrows to a Campus only when the caller passes one. It reuses each
 * source's bounded search index and the same Block, Report-hide, moderation,
 * expiry and workspace rules as the screen that owns the result. Buildings are
 * searched on the client from the shared campus place catalog. Incidents,
 * Incident Updates and Alerts are never searched (ADR-0009).
 */

/** Results per group. Measure query usage before raising (SPEC-v2 §14). */
const GROUP_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;
const SAVED_LIMIT = 50;
const SAVED_BODY_PREVIEW = 280;

type Campus = Doc<"listings">["campus"];

function isActiveListing(listing: Doc<"listings">, now: number) {
  return (listing.status === "available" || listing.status === "pending") && listing.expiresAt > now;
}

async function searchEvents(ctx: QueryCtx, viewer: ViewerContext, qText: string, campus: Campus | undefined, now: number) {
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
      return ev.status !== "cancelled" && ev.endTime > now && isItemVisibleToViewer(viewer, {
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
    .take(GROUP_LIMIT * 2);
  return hubs
    .filter((hub) => !hub.isRetiredFixture && (!campus || hub.campuses.includes(campus)))
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
      searchEvents(ctx, ctx.viewer, qText, args.campus, now),
      searchClubs(ctx, ctx.viewer, qText, args.campus),
      searchCourseHubs(ctx, qText, args.campus),
      searchListings(ctx, ctx.viewer, qText, args.campus, now),
    ]);
    return { events, clubs, courseHubs, listings };
  },
});

type Unavailable = { available: false; reason: "unavailable" };

async function savedPost(ctx: QueryCtx, viewer: ViewerContext, row: Doc<"savedInteractions">) {
  const postId = ctx.db.normalizeId("posts", row.targetId);
  const post = postId ? await ctx.db.get(postId) : null;
  const author = post ? await ctx.db.get(post.authorId) : null;
  if (!post || post.workspaceKey !== viewer.workspaceKey || author?.accountStatus !== "active" ||
      !isItemVisibleToViewer(viewer, {
        targetType: "post", targetId: String(post._id), authorId: post.authorId, visibilityStatus: post.visibilityStatus,
      })) {
    return { available: false, reason: "unavailable" } satisfies Unavailable;
  }
  return {
    available: true as const, postId: post._id, rootPostId: post.rootPostId ?? post._id,
    body: post.body.slice(0, SAVED_BODY_PREVIEW), campus: post.campus,
    authorHandle: author.handle, authorDisplayName: author.displayName, publishedAt: post.publishedAt,
  };
}

async function savedListing(ctx: QueryCtx, viewer: ViewerContext, row: Doc<"savedInteractions">, now: number) {
  const listingId = ctx.db.normalizeId("listings", row.targetId);
  const listing = listingId ? await ctx.db.get(listingId) : null;
  const seller = listing ? await ctx.db.get(listing.sellerId) : null;
  if (!listing || listing.workspaceKey !== viewer.workspaceKey || listing.status === "removed" ||
      seller?.accountStatus !== "active" ||
      !isItemVisibleToViewer(viewer, {
        targetType: "listing", targetId: String(listing._id), authorId: listing.sellerId, visibilityStatus: listing.visibilityStatus,
      })) {
    return { available: false, reason: "unavailable" } satisfies Unavailable;
  }
  const active = isActiveListing(listing, now);
  return {
    available: active, reason: active ? undefined : "ended" as const,
    listingId: listing._id, title: listing.title, campus: listing.campus,
    pricingMode: listing.pricingMode, priceCents: listing.priceCents,
  };
}

export const listSavedItems = viewerQuery({
  args: { type: v.optional(v.union(v.literal("all"), v.literal("posts"), v.literal("listings"))) },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const type = args.type ?? "all";
    const now = Date.now();
    const kinds = type === "posts" ? ["post_bookmark" as const] : type === "listings" ? ["listing_bookmark" as const]
      : ["post_bookmark" as const, "listing_bookmark" as const];
    const rows = (await Promise.all(kinds.map((kind) => ctx.db.query("savedInteractions")
      .withIndex("by_student_kind_time", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id).eq("kind", kind))
      .order("desc").take(SAVED_LIMIT))))
      .flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, SAVED_LIMIT);

    return Promise.all(rows.map(async (row) => {
      const base = { savedId: row._id, savedAt: row.createdAt };
      return row.kind === "post_bookmark"
        ? { ...base, kind: "post" as const, ...await savedPost(ctx, viewer, row) }
        : { ...base, kind: "listing" as const, ...await savedListing(ctx, viewer, row, now) };
    }));
  },
});

export const removeSavedItem = viewerMutation({
  args: { savedId: v.id("savedInteractions") },
  handler: async (ctx, { savedId }) => {
    const { viewer } = ctx;
    const row = await ctx.db.get(savedId);
    if (!row || row.workspaceKey !== viewer.workspaceKey || row.studentId !== viewer.actorStudent._id ||
        row.kind === "post_like") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Saved item not found." });
    }
    await ctx.db.delete(row._id);
    if (row.kind === "listing_bookmark") {
      const listingId = ctx.db.normalizeId("listings", row.targetId);
      const listing = listingId ? await ctx.db.get(listingId) : null;
      if (listing && listing.workspaceKey === viewer.workspaceKey) {
        await ctx.db.patch(listing._id, { bookmarkCount: Math.max(0, listing.bookmarkCount - 1) });
      }
    }
    return { removed: true };
  },
});
