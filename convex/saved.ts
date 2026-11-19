import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isItemVisibleToViewer, viewerMutation, viewerQuery, type ViewerContext } from "./lib/viewer";
import { isActiveListing } from "./marketplace";

/**
 * The private Saved view (#77): the viewer's own Post and Listing bookmarks,
 * created by the bookmark actions in Feed and Marketplace. Items the viewer can
 * no longer open (deleted, removed, Report-hidden, Blocked, ended Listings or a
 * reply whose thread is hidden) come back as unavailable with no content.
 */

const SAVED_LIMIT = 50;
const SAVED_BODY_PREVIEW = 280;

type Unavailable = { available: false; reason: "unavailable" };

async function savedPost(ctx: QueryCtx, viewer: ViewerContext, row: Doc<"savedInteractions">) {
  const postId = ctx.db.normalizeId("posts", row.targetId);
  const post = postId ? await ctx.db.get(postId) : null;
  const root = post?.rootPostId ? await ctx.db.get(post.rootPostId) : post;
  const author = post ? await ctx.db.get(post.authorId) : null;
  const visible = (p: Doc<"posts"> | null) => Boolean(p && p.workspaceKey === viewer.workspaceKey &&
    isItemVisibleToViewer(viewer, { targetType: "post", targetId: String(p._id), authorId: p.authorId, visibilityStatus: p.visibilityStatus }));
  // A reply is only reachable through its thread, so its root must be visible too (getPostThread).
  if (!post || !root || !visible(post) || !visible(root) || author?.accountStatus !== "active") {
    return { available: false, reason: "unavailable" } satisfies Unavailable;
  }
  return {
    available: true as const, postId: post._id, rootPostId: root._id,
    body: post.body.slice(0, SAVED_BODY_PREVIEW), campus: post.campus,
    authorHandle: author.handle, authorDisplayName: author.displayName, publishedAt: post.publishedAt,
  };
}

async function savedListing(ctx: QueryCtx, viewer: ViewerContext, row: Doc<"savedInteractions">, now: number) {
  const listingId = ctx.db.normalizeId("listings", row.targetId);
  const listing = listingId ? await ctx.db.get(listingId) : null;
  const seller = listing ? await ctx.db.get(listing.sellerId) : null;
  // Same rule as Marketplace browse: only active Listings are shown.
  if (!listing || listing.workspaceKey !== viewer.workspaceKey || !isActiveListing(listing, now) ||
      seller?.accountStatus !== "active" ||
      !isItemVisibleToViewer(viewer, {
        targetType: "listing", targetId: String(listing._id), authorId: listing.sellerId, visibilityStatus: listing.visibilityStatus,
      })) {
    return { available: false, reason: "unavailable" } satisfies Unavailable;
  }
  return {
    available: true as const, listingId: listing._id, title: listing.title, campus: listing.campus,
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
