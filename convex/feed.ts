import { workflowTime } from "./lib/workflowTime";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { campusFilterValidator, campusValidator, postEmbedValidator } from "./schema";
import {
  assertPublishSafety,
  computePostHotScore,
  extractHashtags,
} from "./lib/safety";
import {
  filterVisibleContent,
  isItemVisibleToViewer,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
  ViewerContext,
} from "./lib/viewer";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { queueMediaDeletion } from "./lib/mediaCleanup";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function dayKeyET(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  return parts;
}

async function adjustHashtagCounts(
  ctx: MutationCtx,
  workspaceKey: string,
  campus: "Kennesaw" | "Marietta",
  tags: string[],
  publishedAt: number,
  delta: 1 | -1,
) {
  if (tags.length === 0) return;
  const dayKey = dayKeyET(publishedAt);
  for (const tag of tags) {
    for (const campusScope of [campus, "All"] as const) {
      const existing = await ctx.db
        .query("hashtagDailyCounts")
        .withIndex("by_day_campus_tag", (q) =>
          q
            .eq("workspaceKey", workspaceKey)
            .eq("dayKey", dayKey)
            .eq("campusScope", campusScope)
            .eq("tag", tag)
        )
        .unique();
      if (existing && existing.count + delta <= 0) {
        await ctx.db.delete(existing._id);
      } else if (existing) {
        await ctx.db.patch(existing._id, { count: existing.count + delta });
      } else if (delta > 0) {
        await ctx.db.insert("hashtagDailyCounts", {
          workspaceKey,
          dayKey,
          campusScope,
          tag,
          count: 1,
        });
      }
    }
  }
}

export async function hydratePostCards(
  ctx: QueryCtx,
  posts: Doc<"posts">[],
  viewer: ViewerContext
) {
  const cards = await Promise.all(
    posts.map(async (post) => {
      const [authorDoc, mediaDocs, likedRow, bookmarkedRow, quotedDoc, repostDoc, hubDoc, clubDoc] =
        await Promise.all([
          ctx.db.get(post.authorId),
          Promise.all(post.mediaAssetIds.map((id) => ctx.db.get(id))),
          ctx.db
            .query("savedInteractions")
            .withIndex("by_student_kind_target", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("studentId", viewer.actorStudent._id)
                .eq("kind", "post_like")
                .eq("targetId", String(post._id))
            )
            .unique(),
          ctx.db
            .query("savedInteractions")
            .withIndex("by_student_kind_target", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("studentId", viewer.actorStudent._id)
                .eq("kind", "post_bookmark")
                .eq("targetId", String(post._id))
            )
            .unique(),
          post.quotedPostId ? ctx.db.get(post.quotedPostId) : Promise.resolve(null),
          post.repostOfPostId ? ctx.db.get(post.repostOfPostId) : Promise.resolve(null),
          post.courseHubId ? ctx.db.get(post.courseHubId) : Promise.resolve(null),
          post.clubId ? ctx.db.get(post.clubId) : Promise.resolve(null),
        ]);

      const isTombstone = post.visibilityStatus === "deleted_tombstone";
      if (!isTombstone && authorDoc?.accountStatus !== "active") return null;

      let quotedSummary: {
        _id: Id<"posts">;
        authorHandle: string;
        authorDisplayName: string;
        body: string;
        campus: "Kennesaw" | "Marietta";
      } | null = null;

      const refDoc = quotedDoc ?? repostDoc;
      if (
        refDoc && refDoc.workspaceKey === viewer.workspaceKey &&
        isItemVisibleToViewer(viewer, {
          targetType: "post",
          targetId: String(refDoc._id),
          authorId: refDoc.authorId,
          visibilityStatus: refDoc.visibilityStatus,
        })
      ) {
        const refAuthor = await ctx.db.get(refDoc.authorId);
        if (refAuthor?.accountStatus === "active") {
          const pubRefAuthor = toPublicStudent(refAuthor);
          quotedSummary = {
            _id: refDoc._id,
            authorHandle: pubRefAuthor.handle,
            authorDisplayName: pubRefAuthor.displayName,
            body: refDoc.body,
            campus: refDoc.campus,
          };
        }
      }

      return {
        _id: post._id,
        author: isTombstone
          ? {
              _id: post.authorId,
              handle: "deleted",
              displayName: "[Deleted Post]",
              emailDomainBadge: "verified_student" as const,
              homeCampus: post.campus,
              completedDealCount: 0,
              onboardingCompleted: true,
              joinedAt: 0,
              isRemoved: true,
            }
          : toPublicStudent(authorDoc),
        authorIsScrappy: post.authorIsScrappy,
        isOwnPost: post.authorId === viewer.actorStudent._id,
        campus: post.campus,
        courseHub: hubDoc
          ? {
              _id: hubDoc._id,
              subjectCourse: hubDoc.subjectCourse,
              title: hubDoc.title,
            }
          : null,
        authorSectionId: post.authorSectionId,
        club: clubDoc
          ? {
              _id: clubDoc._id,
              slug: clubDoc.slug,
              name: clubDoc.name,
            }
          : null,
        crossPostToCampusFeed: post.crossPostToCampusFeed,
        body: isTombstone ? "[Deleted Post]" : post.body,
        tags: isTombstone ? [] : post.tags,
        mediaUrls: isTombstone
          ? []
          : mediaDocs
              .filter((m): m is Doc<"mediaAssets"> => Boolean(m && m.status !== "deleted"))
              .map((m) => m.url),
        embed: isTombstone ? undefined : post.embed,
        rootPostId: post.rootPostId,
        replyToPostId: post.replyToPostId,
        quotedPostId: post.quotedPostId,
        repostOfPostId: post.repostOfPostId,
        referencedPost: quotedSummary,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        repostCount: post.repostCount,
        hotScore: post.hotScore,
        likedByViewer: Boolean(likedRow),
        bookmarkedByViewer: Boolean(bookmarkedRow),
        scrappyStatus: post.scrappyStatus,
        scrappyTriggerAuthorId: post.scrappyTriggerAuthorId,
        scrappyCitations: post.scrappyCitations ?? [],
        visibilityStatus: post.visibilityStatus,
        publishedAt: post.publishedAt,
        editedAt: post.editedAt,
      };
    })
  );
  return cards.filter((card) => card !== null);
}

export const listFeedRingsAndTrends = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? "All KSU";
    const todayKey = dayKeyET(now);
    const yesterdayKey = dayKeyET(now - TWENTY_FOUR_HOURS_MS);
    const trendScope = campusFilter === "All KSU" ? "All" : campusFilter;

    const [enrollments, clubMemberships, todayTags, yesterdayTags] =
      await Promise.all([
        ctx.db
          .query("studentEnrollments")
          .withIndex("by_student_hub", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("studentId", viewer.actorStudent._id)
          )
          .take(15),
        ctx.db
          .query("clubMembers")
          .withIndex("by_student", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("studentId", viewer.actorStudent._id)
          )
          .take(20),
        ctx.db
          .query("hashtagDailyCounts")
          .withIndex("by_day_campus_count", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("dayKey", todayKey)
              .eq("campusScope", trendScope)
          )
          .order("desc")
          .take(12),
        ctx.db
          .query("hashtagDailyCounts")
          .withIndex("by_day_campus_count", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("dayKey", yesterdayKey)
              .eq("campusScope", trendScope)
          )
          .order("desc")
          .take(12),
      ]);

    const courseRings = [];
    for (const e of enrollments) {
      const hub = await ctx.db.get(e.courseHubId);
      if (hub) {
        courseRings.push({
          _id: hub._id,
          subjectCourse: hub.subjectCourse,
          title: hub.title,
        });
      }
    }

    const clubRings = [];
    for (const cm of clubMemberships) {
      const club = await ctx.db.get(cm.clubId);
      if (club && club.visibilityStatus === "visible") {
        clubRings.push({
          _id: club._id,
          slug: club.slug,
          name: club.name,
          shortName: club.shortName ?? club.name.slice(0, 4).toUpperCase(),
        });
      }
    }

    const mergedTags = new Map<string, number>();
    for (const row of [...todayTags, ...yesterdayTags]) {
      mergedTags.set(row.tag, (mergedTags.get(row.tag) ?? 0) + row.count);
    }
    const topTrendingTags = Array.from(mergedTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));

    return {
      courseRings,
      clubRings,
      topTrendingTags,
    };
  },
});

export const listCampusOrTrendingFeed = viewerQuery({
  args: {
    stream: v.union(v.literal("campus"), v.literal("trending")),
    campusOverride: v.optional(campusFilterValidator),
    courseHubId: v.optional(v.id("courseHubs")),
    clubId: v.optional(v.id("clubs")),
    tagFilter: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? "All KSU";
    const numItems = Math.min(args.paginationOpts.numItems || 25, 25);
    const boundedOpts = { ...args.paginationOpts, numItems };

    let pageResult;
    if (args.courseHubId) {
      pageResult = await ctx.db
        .query("posts")
        .withIndex("by_course_hub", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("courseHubId", args.courseHubId)
            .eq("visibilityStatus", "visible")
        )
        .order("desc")
        .paginate(boundedOpts);
    } else if (args.clubId) {
      pageResult = await ctx.db
        .query("posts")
        .withIndex("by_club", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("clubId", args.clubId)
            .eq("visibilityStatus", "visible")
        )
        .order("desc")
        .paginate(boundedOpts);
    } else if (args.stream === "trending") {
      pageResult =
        campusFilter === "All KSU"
          ? await ctx.db
              .query("posts")
              .withIndex("by_all_trending", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("showInCampusFeed", true)
              )
              .order("desc")
              .paginate(boundedOpts)
          : await ctx.db
              .query("posts")
              .withIndex("by_campus_trending", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("showInCampusFeed", true)
                  .eq("campus", campusFilter)
              )
              .order("desc")
              .paginate(boundedOpts);
    } else {
      pageResult =
        campusFilter === "All KSU"
          ? await ctx.db
              .query("posts")
              .withIndex("by_all_feed", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("showInCampusFeed", true)
              )
              .order("desc")
              .paginate(boundedOpts)
          : await ctx.db
              .query("posts")
              .withIndex("by_campus_feed", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("showInCampusFeed", true)
                  .eq("campus", campusFilter)
              )
              .order("desc")
              .paginate(boundedOpts);
    }

    const cleanTag = args.tagFilter?.trim().replace(/^#+/, "").toLowerCase();
    const visibleDocs = filterVisibleContent(pageResult.page, viewer, {
      targetType: "post",
      getAuthorId: (p) => p.authorId,
    }).filter((p) => {
      if (p.rootPostId) return false;
      if (
        args.stream === "trending" &&
        now - p.publishedAt > TWENTY_FOUR_HOURS_MS
      ) {
        return false;
      }
      if (cleanTag && !p.tags.includes(cleanTag)) {
        return false;
      }
      return true;
    });

    const hydrated = await hydratePostCards(ctx, visibleDocs, viewer);
    return {
      ...pageResult,
      page: hydrated,
    };
  },
});

export const listFollowingFeed = viewerQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const limit = Math.min(args.limit ?? 25, 25);

    const [follows, clubMemberships, enrollments] = await Promise.all([
      ctx.db
        .query("studentFollows")
        .withIndex("by_follower", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("followerId", viewer.actorStudent._id)
        )
        .take(200),
      ctx.db
        .query("clubMembers")
        .withIndex("by_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("studentId", viewer.actorStudent._id)
        )
        .collect(),
      ctx.db.query("studentEnrollments").withIndex("by_student_hub", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id),
      ).collect(),
    ]);

    const candidateMap = new Map<string, Doc<"posts">>();

    // Preserved across Campus switches: followed Students + joined Clubs + enrolled Course Hubs + own Posts
    const authorIds = [
      viewer.actorStudent._id,
      ...follows.map((f) => f.followeeId),
    ].filter((id) => !viewer.blockedStudentIds.has(id));

    const [authorBatches, clubBatches, hubBatches] = await Promise.all([
      Promise.all(
        authorIds.map((aid) =>
          ctx.db
            .query("posts")
            .withIndex("by_author", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("authorId", aid)
                .eq("visibilityStatus", "visible")
            )
            .filter((q) => q.eq(q.field("rootPostId"), undefined))
            .order("desc")
            .take(limit)
        )
      ),
      Promise.all(
        clubMemberships.map((cm) =>
          ctx.db
            .query("posts")
            .withIndex("by_club", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("clubId", cm.clubId)
                .eq("visibilityStatus", "visible")
            )
            .filter((q) => q.eq(q.field("rootPostId"), undefined))
            .order("desc")
            .take(limit)
        )
      ),
      Promise.all(
        Array.from(new Set(enrollments.map((row) => row.courseHubId)))
          .map((hid) =>
            ctx.db
              .query("posts")
              .withIndex("by_course_hub", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("courseHubId", hid)
                  .eq("visibilityStatus", "visible")
              )
              .filter((q) => q.eq(q.field("rootPostId"), undefined))
              .order("desc")
              .take(limit)
          )
      ),
    ]);

    for (const batch of [...authorBatches, ...clubBatches, ...hubBatches]) {
      for (const p of batch) {
        if (!p.rootPostId) {
          candidateMap.set(String(p._id), p);
        }
      }
    }

    const sorted = filterVisibleContent(
      Array.from(candidateMap.values()),
      viewer,
      {
        targetType: "post",
        getAuthorId: (p) => p.authorId,
      }
    )
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);

    return hydratePostCards(ctx, sorted, viewer);
  },
});

export const getPostThread = viewerQuery({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const target = await ctx.db.get(args.postId);
    if (!target || target.workspaceKey !== viewer.workspaceKey) {
      return null;
    }

    const rootId = target.rootPostId ?? target._id;
    const rootPost = rootId === target._id ? target : await ctx.db.get(rootId);
    if (!rootPost || rootPost.workspaceKey !== viewer.workspaceKey) {
      return null;
    }

    if (
      !isItemVisibleToViewer(viewer, {
        targetType: "post",
        targetId: String(rootPost._id),
        authorId: rootPost.authorId,
        visibilityStatus: rootPost.visibilityStatus,
        allowTombstone: true,
      })
    ) {
      return null;
    }

    const repliesRaw = await ctx.db
      .query("posts")
      .withIndex("by_thread", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("rootPostId", rootPost._id)
      )
      .order("asc")
      .take(100);

    const visibleReplies = filterVisibleContent(repliesRaw, viewer, {
      targetType: "post",
      getAuthorId: (p) => p.authorId,
    }).filter((r) => {
      // Hide failed @scrappy replies from everyone except the triggering author
      if (
        r.authorIsScrappy &&
        r.scrappyStatus === "error" &&
        r.scrappyTriggerAuthorId !== viewer.actorStudent._id
      ) {
        return false;
      }
      return true;
    });

    const [hydratedRoot, hydratedReplies] = await Promise.all([
      hydratePostCards(ctx, [rootPost], viewer),
      hydratePostCards(ctx, visibleReplies, viewer),
    ]);

    if (!hydratedRoot[0]) return null;
    return { rootPost: hydratedRoot[0], replies: hydratedReplies };
  },
});

export const createPost = viewerMutation({
  args: {
    body: v.string(),
    campus: v.optional(campusValidator),
    courseHubId: v.optional(v.id("courseHubs")),
    clubId: v.optional(v.id("clubs")),
    crossPostToCampusFeed: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    mediaAssetIds: v.optional(v.array(v.id("mediaAssets"))),
    embed: v.optional(postEmbedValidator),
    replyToPostId: v.optional(v.id("posts")),
    quotedPostId: v.optional(v.id("posts")),
    repostOfPostId: v.optional(v.id("posts")),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const trimmedBody = args.body.trim();

    if (!args.repostOfPostId && trimmedBody.length === 0) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Post body cannot be empty.",
      });
    }
    if (trimmedBody.length > 500) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Posts are limited to 500 characters.",
      });
    }
    if (trimmedBody.length > 0) {
      assertPublishSafety(trimmedBody);
    }

    const mediaIds = args.mediaAssetIds ?? [];
    if (mediaIds.length > 4) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "You can attach at most 4 WebP images per Post.",
      });
    }
    for (const mid of mediaIds) {
      const asset = await ctx.db.get(mid);
      if (
        !asset ||
        asset.workspaceKey !== viewer.workspaceKey ||
        asset.ownerStudentId !== viewer.actorStudent._id || asset.purpose !== "post" ||
        asset.status !== "pending" || asset.deleteClaimedAt !== undefined
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Invalid media attachment.",
        });
      }
      await ctx.db.patch(asset._id, { status: "attached" });
    }

    let rootPostId: Id<"posts"> | undefined;
    let effectiveCourseHubId = args.courseHubId;
    let effectiveClubId = args.clubId;
    let effectiveCampus: "Kennesaw" | "Marietta" =
      args.campus ?? viewer.actorStudent.homeCampus;

    if (args.replyToPostId) {
      const parent = await ctx.db.get(args.replyToPostId);
      if (
        !parent ||
        parent.workspaceKey !== viewer.workspaceKey ||
        !isItemVisibleToViewer(viewer, {
          targetType: "post",
          targetId: String(parent._id),
          authorId: parent.authorId,
          visibilityStatus: parent.visibilityStatus,
          allowTombstone: true,
        })
      ) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Cannot reply to this Post.",
        });
      }
      rootPostId = parent.rootPostId ?? parent._id;
      effectiveCampus = parent.campus;
      effectiveCourseHubId = parent.courseHubId;
      effectiveClubId = parent.clubId;
    }

    let authorSectionId: Id<"courseSections"> | undefined;
    if (effectiveCourseHubId) {
      const myEnrollment = await ctx.db
        .query("studentEnrollments")
        .withIndex("by_student_hub", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("studentId", viewer.actorStudent._id)
            .eq("courseHubId", effectiveCourseHubId!)
        )
        .first();
      authorSectionId = myEnrollment?.sectionId;
    }

    // Course Hub Posts default crossPostToCampusFeed = false; Club & general Posts default true!
    const crossPostToCampusFeed = effectiveCourseHubId
      ? Boolean(args.crossPostToCampusFeed ?? false)
      : Boolean(args.crossPostToCampusFeed ?? true);

    const showInCampusFeed = !rootPostId && crossPostToCampusFeed;
    const tags = extractHashtags(trimmedBody, args.tags);
    const hotScore = computePostHotScore({
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      publishedAtMs: now,
    });

    const postId = await ctx.db.insert("posts", {
      workspaceKey: viewer.workspaceKey,
      authorId: viewer.actorStudent._id,
      authorIsScrappy: false,
      campus: effectiveCampus,
      courseHubId: effectiveCourseHubId,
      authorSectionId,
      clubId: effectiveClubId,
      crossPostToCampusFeed,
      showInCampusFeed,
      body: trimmedBody,
      searchText: `${trimmedBody} ${tags.map((t) => `#${t}`).join(" ")}`.trim(),
      tags,
      mediaAssetIds: mediaIds,
      embed: args.embed,
      rootPostId,
      replyToPostId: args.replyToPostId,
      quotedPostId: args.quotedPostId,
      repostOfPostId: args.repostOfPostId,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      hotScore,
      visibilityStatus: "visible",
      publishedAt: now,
    });

    if (!rootPostId && tags.length > 0) {
      await adjustHashtagCounts(
        ctx,
        viewer.workspaceKey,
        effectiveCampus,
        tags,
        now,
        1,
      );
    }

    // Update parent thread replyCount & hotScore
    if (rootPostId) {
      const rootDoc = await ctx.db.get(rootPostId);
      if (rootDoc) {
        const nextReplies = rootDoc.replyCount + 1;
        await ctx.db.patch(rootDoc._id, {
          replyCount: nextReplies,
          hotScore: computePostHotScore({
            likeCount: rootDoc.likeCount,
            replyCount: nextReplies,
            repostCount: rootDoc.repostCount,
            publishedAtMs: rootDoc.publishedAt,
          }),
        });
      }
    }

    // Update quoted or reposted Post repostCount & hotScore
    const refId = args.repostOfPostId ?? args.quotedPostId;
    if (refId) {
      const refDoc = await ctx.db.get(refId);
      if (refDoc && refDoc.workspaceKey === viewer.workspaceKey) {
        const nextReposts = refDoc.repostCount + 1;
        await ctx.db.patch(refDoc._id, {
          repostCount: nextReposts,
          hotScore: computePostHotScore({
            likeCount: refDoc.likeCount,
            replyCount: refDoc.replyCount,
            repostCount: nextReposts,
            publishedAtMs: refDoc.publishedAt,
          }),
        });
      }
    }

    // Async @scrappy Feed mention hook
    if (/(?:^|\W)@scrappy\b/i.test(trimmedBody)) {
      await ctx.runMutation(
        internal.scrappy.mentions.enqueueFeedMentionIfEligible,
        {
          workspaceKey: viewer.workspaceKey,
          triggerPostId: postId,
          triggerAuthorId: viewer.actorStudent._id,
          now,
        }
      );
    }

    return { postId };
  },
});

export const editPost = viewerMutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.workspaceKey !== ctx.viewer.workspaceKey ||
      post.authorId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only edit your own Posts.",
      });
    }
    if (post.visibilityStatus !== "visible") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This Post can no longer be edited.",
      });
    }
    if (now - post.publishedAt > FIVE_MINUTES_MS) {
      throw new ConvexError({
        code: "EDIT_WINDOW_EXPIRED",
        message: "Posts can only be edited within 5 minutes of publishing.",
      });
    }

    const trimmed = args.body.trim();
    if (!trimmed || trimmed.length > 500) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Post body must be 1–500 characters.",
      });
    }
    assertPublishSafety(trimmed);

    const tags = extractHashtags(trimmed);
    if (!post.rootPostId) {
      await adjustHashtagCounts(ctx, post.workspaceKey, post.campus,
        post.tags.filter((tag) => !tags.includes(tag)), post.publishedAt, -1);
      await adjustHashtagCounts(ctx, post.workspaceKey, post.campus,
        tags.filter((tag) => !post.tags.includes(tag)), post.publishedAt, 1);
    }
    // Intentionally NEVER re-triggers @scrappy on typo edits per SPEC §6.1!
    await ctx.db.patch(post._id, {
      body: trimmed,
      tags,
      searchText: `${trimmed} ${tags.map((t) => `#${t}`).join(" ")}`.trim(),
      editedAt: now,
    });

    return { ok: true, editedAt: now };
  },
});

export const deletePost = viewerMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.workspaceKey !== ctx.viewer.workspaceKey ||
      post.authorId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own Posts.",
      });
    }

    for (const mid of post.mediaAssetIds) {
      const asset = await ctx.db.get(mid);
      if (asset && asset.workspaceKey === post.workspaceKey && asset.ownerStudentId === post.authorId) {
        await queueMediaDeletion(ctx, asset);
      }
    }
    if (!post.rootPostId && post.visibilityStatus === "visible") {
      await adjustHashtagCounts(ctx, post.workspaceKey, post.campus, post.tags, post.publishedAt, -1);
    }

    // Check if child replies exist under this root Post
    const childReplies = post.rootPostId
      ? []
      : await ctx.db
          .query("posts")
          .withIndex("by_thread", (q) =>
            q
              .eq("workspaceKey", ctx.viewer.workspaceKey)
              .eq("rootPostId", post._id)
          )
          .take(2);

    if (!post.rootPostId && (post.replyCount > 0 || childReplies.length > 0)) {
      await ctx.db.patch(post._id, {
        visibilityStatus: "deleted_tombstone",
        body: "[Deleted Post]",
        searchText: "",
        tags: [],
        mediaAssetIds: [],
        embed: undefined,
        showInCampusFeed: false,
      });
      return { deletedMode: "tombstone" as const };
    }

    if (post.rootPostId) {
      const rootDoc = await ctx.db.get(post.rootPostId);
      if (rootDoc) {
        const nextReplies = Math.max(0, rootDoc.replyCount - 1);
        await ctx.db.patch(rootDoc._id, {
          replyCount: nextReplies,
          hotScore: computePostHotScore({
            likeCount: rootDoc.likeCount,
            replyCount: nextReplies,
            repostCount: rootDoc.repostCount,
            publishedAtMs: rootDoc.publishedAt,
          }),
        });
      }
    }

    await ctx.db.delete(post._id);
    return { deletedMode: "hard_deleted" as const };
  },
});

export const togglePostInteraction = viewerMutation({
  args: {
    postId: v.id("posts"),
    kind: v.union(v.literal("post_like"), v.literal("post_bookmark")),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.workspaceKey !== viewer.workspaceKey ||
      !isItemVisibleToViewer(viewer, {
        targetType: "post",
        targetId: String(post._id),
        authorId: post.authorId,
        visibilityStatus: post.visibilityStatus,
      })
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not available.",
      });
    }

    const existing = await ctx.db
      .query("savedInteractions")
      .withIndex("by_student_kind_target", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("kind", args.kind)
          .eq("targetId", String(post._id))
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      if (args.kind === "post_like") {
        const nextLikes = Math.max(0, post.likeCount - 1);
        await ctx.db.patch(post._id, {
          likeCount: nextLikes,
          hotScore: computePostHotScore({
            likeCount: nextLikes,
            replyCount: post.replyCount,
            repostCount: post.repostCount,
            publishedAtMs: post.publishedAt,
          }),
        });
      }
      return { active: false };
    }

    await ctx.db.insert("savedInteractions", {
      workspaceKey: viewer.workspaceKey,
      studentId: viewer.actorStudent._id,
      kind: args.kind,
      targetId: String(post._id),
      createdAt: Date.now(),
    });

    if (args.kind === "post_like") {
      const nextLikes = post.likeCount + 1;
      await ctx.db.patch(post._id, {
        likeCount: nextLikes,
        hotScore: computePostHotScore({
          likeCount: nextLikes,
          replyCount: post.replyCount,
          repostCount: post.repostCount,
          publishedAtMs: post.publishedAt,
        }),
      });
    }

    return { active: true };
  },
});

export const listEmbeddableEntities = viewerQuery({
  args: {},
  handler: async (ctx) => {
    const { viewer } = ctx;
    const now = Date.now();
    const [listings, ksuEvents, wsEvents, sessions, lots] = await Promise.all([
      ctx.db
        .query("listings")
        .withIndex("by_all_browse", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("isBrowseable", true)
        )
        .order("desc")
        .take(5),
      ctx.db
        .query("events")
        .withIndex("by_all_start", (q) =>
          q
            .eq("workspaceKey", "ksu")
            .eq("visibilityStatus", "visible")
            .gt("startTime", now - 3600_000)
        )
        .take(4),
      ctx.db
        .query("events")
        .withIndex("by_all_start", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("visibilityStatus", "visible")
            .gt("startTime", now - 3600_000)
        )
        .take(4),
      ctx.db
        .query("studySessions")
        .filter((q) =>
          q.and(
            q.eq(q.field("workspaceKey"), viewer.workspaceKey),
            q.eq(q.field("visibilityStatus"), "visible"),
            q.gt(q.field("endTime"), now)
          )
        )
        .take(4),
      ctx.db.query("parkingLots").take(6),
    ]);

    const options: Array<{
      entityType: "listing" | "event" | "study_session" | "parking_lot";
      entityId: string;
      title: string;
      subtitle: string;
      campus: "Kennesaw" | "Marietta";
      href: string;
    }> = [];

    for (const l of listings) {
      options.push({
        entityType: "listing",
        entityId: String(l._id),
        title: l.title,
        subtitle:
          l.pricingMode === "free_pickup"
            ? "Free Pickup"
            : l.pricingMode === "open_to_trade"
              ? "Open to Trade"
              : `$${((l.priceCents ?? 0) / 100).toFixed(0)}`,
        campus: l.campus,
        href: "/marketplace",
      });
    }
    for (const e of [...wsEvents, ...ksuEvents].slice(0, 4)) {
      options.push({
        entityType: "event",
        entityId: String(e._id),
        title: e.title,
        subtitle: e.locationName,
        campus: e.campus,
        href: `/events/${e._id}`,
      });
    }
    for (const s of sessions) {
      if (
        s.visibility === "campus_open" ||
        (s.courseHubId && viewer.enrolledCourseHubIds.has(s.courseHubId))
      ) {
        options.push({
          entityType: "study_session",
          entityId: String(s._id),
          title: s.title,
          subtitle: `${s.attendeeIds.length}/${s.maxSeats} seats`,
          campus: s.campus,
          href: "/study",
        });
      }
    }
    for (const lot of lots) {
      options.push({
        entityType: "parking_lot",
        entityId: String(lot._id),
        title: lot.name,
        subtitle: `${lot.campus} Parking`,
        campus: lot.campus,
        href: "/parking",
      });
    }

    return options;
  },
});
