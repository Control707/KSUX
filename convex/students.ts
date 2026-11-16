import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { campusValidator } from "./schema";
import { validateHandleRules } from "./lib/crypto";
import { assertPublishSafety } from "./lib/safety";
import {
  toPublicStudent,
  verifiedStudentMutation,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_FOLLOWS = 200;

async function assertHandleAvailableInWorkspace(
  ctx: MutationCtx,
  workspaceKey: string,
  handleLower: string,
  currentStudentId: Id<"students">,
  now: number
) {
  const existingStudent = await ctx.db
    .query("students")
    .withIndex("by_workspace_handle", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("handleLower", handleLower)
    )
    .first();

  if (existingStudent && existingStudent._id !== currentStudentId) {
    throw new ConvexError({
      code: "HANDLE_TAKEN",
      message: `@${handleLower} is already taken on KSUX.`,
    });
  }

  const reservations = await ctx.db
    .query("handleReservations")
    .withIndex("by_workspace_handle", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("handleLower", handleLower)
    )
    .take(10);

  for (const res of reservations) {
    if (res.expiresAt === undefined || res.expiresAt > now) {
      throw new ConvexError({
        code: "HANDLE_RESERVED",
        message: `@${handleLower} is currently reserved and cannot be claimed.`,
      });
    }
  }
}

export const completeOnboarding = verifiedStudentMutation({
  args: {
    displayName: v.string(),
    handle: v.string(),
    homeCampus: campusValidator,
    major: v.optional(v.string()),
    classYear: v.optional(v.string()),
    avatarAssetId: v.optional(v.id("mediaAssets")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const displayName = args.displayName.trim();
    if (displayName.length < 2 || displayName.length > 50) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Display name must be between 2 and 50 characters.",
      });
    }
    assertPublishSafety(displayName);

    const validated = validateHandleRules(args.handle);
    if (!validated.ok) {
      throw new ConvexError({
        code: "INVALID_HANDLE",
        message: validated.error,
      });
    }

    await assertHandleAvailableInWorkspace(
      ctx,
      "prod",
      validated.handleLower,
      ctx.viewer.actorStudent._id,
      now
    );

    let avatarUrl: string | undefined = ctx.viewer.actorStudent.avatarUrl;
    if (args.avatarAssetId) {
      const asset = await ctx.db.get(args.avatarAssetId);
      if (
        asset &&
        asset.workspaceKey === "prod" &&
        asset.ownerStudentId === ctx.viewer.actorStudent._id
      ) {
        avatarUrl = asset.url;
        await ctx.db.patch(asset._id, { status: "attached" });
      }
    }

    const major = args.major?.trim() || undefined;
    const classYear = args.classYear?.trim() || undefined;
    if (major) assertPublishSafety(major);

    await ctx.db.patch(ctx.viewer.actorStudent._id, {
      displayName,
      handle: validated.handle,
      handleLower: validated.handleLower,
      searchText: `@${validated.handleLower} ${displayName} ${major ?? ""}`.trim(),
      homeCampus: args.homeCampus,
      activeCampusFilter: args.homeCampus,
      major,
      classYear,
      avatarAssetId: args.avatarAssetId,
      avatarUrl,
      onboardingCompleted: true,
      lastHandleChangedAt: now,
    });

    const updated = await ctx.db.get(ctx.viewer.actorStudent._id);
    return toPublicStudent(updated);
  },
});

export const updateProfile = viewerMutation({
  args: {
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    homeCampus: v.optional(campusValidator),
    major: v.optional(v.string()),
    classYear: v.optional(v.string()),
    avatarAssetId: v.optional(v.id("mediaAssets")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const actor = ctx.viewer.actorStudent;
    const patch: Record<string, any> = {};

    const nextDisplayName =
      args.displayName !== undefined
        ? args.displayName.trim()
        : actor.displayName;
    if (nextDisplayName.length < 2 || nextDisplayName.length > 50) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Display name must be between 2 and 50 characters.",
      });
    }
    assertPublishSafety(nextDisplayName);
    patch.displayName = nextDisplayName;

    let nextHandleLower = actor.handleLower;
    if (args.handle !== undefined) {
      const validated = validateHandleRules(args.handle, {
        allowDemoPersonas: ctx.viewer.mode === "demo",
      });
      if (!validated.ok) {
        throw new ConvexError({
          code: "INVALID_HANDLE",
          message: validated.error,
        });
      }
      if (validated.handleLower !== actor.handleLower) {
        if (
          actor.onboardingCompleted &&
          actor.lastHandleChangedAt &&
          now - actor.lastHandleChangedAt < THIRTY_DAYS_MS
        ) {
          throw new ConvexError({
            code: "HANDLE_COOLDOWN",
            message: "Handles can only be changed once every 30 days.",
          });
        }
        await assertHandleAvailableInWorkspace(
          ctx,
          ctx.viewer.workspaceKey,
          validated.handleLower,
          actor._id,
          now
        );
        // Reserve old handle for 30 days against impersonation
        await ctx.db.insert("handleReservations", {
          workspaceKey: ctx.viewer.workspaceKey,
          handleLower: actor.handleLower,
          reason: "renamed",
          createdAt: now,
          expiresAt: now + THIRTY_DAYS_MS,
        });
        patch.handle = validated.handle;
        patch.handleLower = validated.handleLower;
        patch.lastHandleChangedAt = now;
        nextHandleLower = validated.handleLower;
      }
    }

    if (args.homeCampus !== undefined) {
      patch.homeCampus = args.homeCampus;
    }
    if (args.major !== undefined) {
      const cleanMajor = args.major.trim() || undefined;
      if (cleanMajor) assertPublishSafety(cleanMajor);
      patch.major = cleanMajor;
    }
    if (args.classYear !== undefined) {
      patch.classYear = args.classYear.trim() || undefined;
    }
    if (args.avatarAssetId !== undefined) {
      const asset = await ctx.db.get(args.avatarAssetId);
      if (
        asset &&
        asset.workspaceKey === ctx.viewer.workspaceKey &&
        asset.ownerStudentId === actor._id
      ) {
        patch.avatarAssetId = asset._id;
        patch.avatarUrl = asset.url;
        await ctx.db.patch(asset._id, { status: "attached" });
      }
    }

    const effectiveMajor =
      patch.major !== undefined ? patch.major : actor.major;
    patch.searchText =
      `@${nextHandleLower} ${nextDisplayName} ${effectiveMajor ?? ""}`.trim();

    await ctx.db.patch(actor._id, patch);
    const updated = await ctx.db.get(actor._id);
    return toPublicStudent(updated);
  },
});

export const getProfile = viewerQuery({
  args: {
    handle: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    let target = viewer.actorStudent;

    if (args.studentId) {
      const found = await ctx.db.get(args.studentId);
      if (!found || found.workspaceKey !== viewer.workspaceKey) {
        return null;
      }
      target = found;
    } else if (args.handle) {
      const cleanHandle = args.handle.trim().replace(/^@+/, "").toLowerCase();
      const found = await ctx.db
        .query("students")
        .withIndex("by_workspace_handle", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("handleLower", cleanHandle)
        )
        .first();
      if (!found) return null;
      target = found;
    }

    const isSelf = target._id === viewer.actorStudent._id;
    const isBlocked = !isSelf && viewer.blockedStudentIds.has(target._id);

    if (target.accountStatus !== "active" || isBlocked) {
      return {
        student: toPublicStudent(isBlocked ? null : target),
        isSelf: false,
        isBlocked,
        isFollowedByViewer: false,
        followerCount: 0,
        followingCount: 0,
        joinedClubs: [],
      };
    }

    const [followers, following, viewerFollowRow, clubMemberships] =
      await Promise.all([
        ctx.db
          .query("studentFollows")
          .withIndex("by_followee", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey).eq("followeeId", target._id)
          )
          .take(250),
        ctx.db
          .query("studentFollows")
          .withIndex("by_follower", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey).eq("followerId", target._id)
          )
          .take(250),
        isSelf
          ? Promise.resolve(null)
          : ctx.db
              .query("studentFollows")
              .withIndex("by_pair", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("followerId", viewer.actorStudent._id)
                  .eq("followeeId", target._id)
              )
              .unique(),
        ctx.db
          .query("clubMembers")
          .withIndex("by_student", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", target._id)
          )
          .take(25),
      ]);

    const joinedClubs = [];
    for (const cm of clubMemberships) {
      const club = await ctx.db.get(cm.clubId);
      if (club && club.visibilityStatus === "visible") {
        joinedClubs.push({
          _id: club._id,
          slug: club.slug,
          name: club.name,
          campus: club.campus,
          role: cm.role,
        });
      }
    }

    return {
      student: toPublicStudent(target),
      isSelf,
      isBlocked: false,
      isFollowedByViewer: Boolean(viewerFollowRow),
      followerCount: followers.length,
      followingCount: following.length,
      joinedClubs,
    };
  },
});

export const searchStudents = viewerQuery({
  args: {
    queryText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const qText = args.queryText?.trim();
    const rows = qText
      ? await ctx.db
          .query("students")
          .withSearchIndex("search_students", (q) =>
            q
              .search("searchText", qText)
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("accountStatus", "active")
          )
          .take(20)
      : await ctx.db
          .query("students")
          .withIndex("by_workspace_handle", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey)
          )
          .take(25);

    return rows
      .filter(
        (s) =>
          s.accountStatus === "active" &&
          s.handleLower !== "scrappy" &&
          !viewer.blockedStudentIds.has(s._id)
      )
      .map((s) => toPublicStudent(s));
  },
});

export const toggleFollow = viewerMutation({
  args: {
    targetStudentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (args.targetStudentId === viewer.actorStudent._id) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "You cannot follow yourself.",
      });
    }
    if (viewer.blockedStudentIds.has(args.targetStudentId)) {
      throw new ConvexError({
        code: "BLOCKED",
        message: "Cannot follow a blocked Student.",
      });
    }

    const target = await ctx.db.get(args.targetStudentId);
    if (
      !target ||
      target.workspaceKey !== viewer.workspaceKey ||
      target.accountStatus !== "active"
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Student not found.",
      });
    }

    const existing = await ctx.db
      .query("studentFollows")
      .withIndex("by_pair", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("followerId", viewer.actorStudent._id)
          .eq("followeeId", args.targetStudentId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { following: false };
    }

    const myFollows = await ctx.db
      .query("studentFollows")
      .withIndex("by_follower", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("followerId", viewer.actorStudent._id)
      )
      .take(MAX_ACTIVE_FOLLOWS + 1);

    if (myFollows.length >= MAX_ACTIVE_FOLLOWS) {
      throw new ConvexError({
        code: "FOLLOW_CAP_REACHED",
        message: "Active follows are capped at 200 Students.",
      });
    }

    await ctx.db.insert("studentFollows", {
      workspaceKey: viewer.workspaceKey,
      followerId: viewer.actorStudent._id,
      followeeId: args.targetStudentId,
      createdAt: Date.now(),
    });

    return { following: true };
  },
});

export async function closeStudentArtifactsAndMedia(
  ctx: MutationCtx,
  workspaceKey: string,
  studentId: Id<"students">
): Promise<string[]> {
  // Revoke sessions & push subscriptions
  const sessions = await ctx.db
    .query("studentSessions")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .take(50);
  for (const s of sessions) await ctx.db.delete(s._id);

  const pushes = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .take(20);
  for (const p of pushes) await ctx.db.delete(p._id);

  // Close open Posts
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_author", (q) =>
      q
        .eq("workspaceKey", workspaceKey)
        .eq("authorId", studentId)
        .eq("visibilityStatus", "visible")
    )
    .take(200);
  for (const p of posts) {
    await ctx.db.patch(p._id, {
      visibilityStatus: p.replyCount > 0 ? "deleted_tombstone" : "removed",
      body: p.replyCount > 0 ? "[Deleted Post]" : p.body,
      showInCampusFeed: false,
      mediaAssetIds: [],
    });
  }

  // Close open Listings
  const listings = await ctx.db
    .query("listings")
    .withIndex("by_seller", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("sellerId", studentId)
    )
    .take(100);
  for (const l of listings) {
    if (l.status === "available" || l.status === "pending") {
      await ctx.db.patch(l._id, {
        status: "removed",
        visibilityStatus: "removed",
        isBrowseable: false,
      });
    }
  }

  // Cancel hosted Study Sessions & clear active Parking Reports
  const hostedSessions = await ctx.db
    .query("studySessions")
    .filter((q) =>
      q.and(
        q.eq(q.field("workspaceKey"), workspaceKey),
        q.eq(q.field("hostId"), studentId)
      )
    )
    .take(50);
  for (const ss of hostedSessions) {
    if (ss.status === "scheduled") {
      await ctx.db.patch(ss._id, {
        status: "cancelled",
        visibilityStatus: "removed",
      });
    }
  }

  const reports = await ctx.db
    .query("parkingReports")
    .filter((q) =>
      q.and(
        q.eq(q.field("workspaceKey"), workspaceKey),
        q.eq(q.field("authorId"), studentId)
      )
    )
    .take(50);
  for (const r of reports) {
    if (r.status === "active") {
      await ctx.db.patch(r._id, { status: "cleared" });
    }
  }

  // Mark media assets deleted and return fileKeys for UploadThing purge
  const assets = await ctx.db
    .query("mediaAssets")
    .withIndex("by_owner", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("ownerStudentId", studentId)
    )
    .take(200);
  const fileKeys: string[] = [];
  for (const a of assets) {
    if (a.status !== "deleted") {
      fileKeys.push(a.fileKey);
      await ctx.db.patch(a._id, { status: "deleted" });
    }
  }

  return fileKeys;
}

export const deleteMyProfile = verifiedStudentMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const actor = ctx.viewer.actorStudent;

    // Reserve @handle for 30 days against impersonation
    await ctx.db.insert("handleReservations", {
      workspaceKey: "prod",
      handleLower: actor.handleLower,
      reason: "deleted",
      createdAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });

    const fileKeys = await closeStudentArtifactsAndMedia(ctx, "prod", actor._id);

    // Scrub stored canonicalEmail and release live handle slot to handleReservations (30d) while retaining tombstone row
    const tombstoneHandle = `deleted_${String(actor._id).slice(-10).toLowerCase()}`;
    await ctx.db.patch(actor._id, {
      canonicalEmail: undefined,
      handle: tombstoneHandle,
      handleLower: tombstoneHandle,
      displayName: "[Removed Student]",
      searchText: "",
      major: undefined,
      classYear: undefined,
      avatarUrl: undefined,
      avatarAssetId: undefined,
      permitTier: undefined,
      pinnedParkingLotIds: [],
      accountStatus: "deleted",
    });

    if (fileKeys.length > 0 && process.env.KSUX_SKIP_STORAGE_SCHEDULER !== "true") {
      await ctx.scheduler.runAfter(
        0,
        internal.storageNode.deleteUploadThingFiles,
        { fileKeys }
      );
    }

    return { ok: true, purgedAssetCount: fileKeys.length };
  },
});
