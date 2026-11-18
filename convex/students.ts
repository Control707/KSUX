import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { campusValidator } from "./schema";
import { validateHandleRules } from "./lib/crypto";
import { assertPublishSafety } from "./lib/safety";
import {
  isItemVisibleToViewer,
  toPublicStudent,
  verifiedStudentMutation,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { MutationCtx, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { queueMediaDeletion } from "./lib/mediaCleanup";

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
        asset.ownerStudentId === ctx.viewer.actorStudent._id && asset.purpose === "avatar" &&
        asset.status === "pending" && asset.deleteClaimedAt === undefined
      ) {
        avatarUrl = asset.url;
        await ctx.db.patch(asset._id, { status: "attached" });
      } else {
        throw new ConvexError({ code: "FORBIDDEN", message: "Invalid avatar attachment." });
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
        asset.ownerStudentId === actor._id && asset.purpose === "avatar" &&
        asset.status === "pending" && asset.deleteClaimedAt === undefined
      ) {
        patch.avatarAssetId = asset._id;
        patch.avatarUrl = asset.url;
        await ctx.db.patch(asset._id, { status: "attached" });
      } else {
        throw new ConvexError({ code: "FORBIDDEN", message: "Invalid avatar attachment." });
      }
    }

    const effectiveMajor = args.major !== undefined ? patch.major : actor.major;
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
    if (!isSelf && !isItemVisibleToViewer(viewer, {
      targetType: "student", targetId: target._id, visibilityStatus: target.visibilityStatus,
    })) return null;

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
          isItemVisibleToViewer(viewer, {
            targetType: "student", targetId: s._id, authorId: s._id, visibilityStatus: s.visibilityStatus,
          })
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
  studentId: Id<"students">,
  deletePrivateSchedule = false,
): Promise<number> {
  const batchSize = 25;
  const [sessions, pushes, postBatches, listingBatches, hostedSessions, reports, mediaBatches, privateSchedules] = await Promise.all([
    ctx.db.query("studentSessions").withIndex("by_student", (q) => q.eq("studentId", studentId)).take(batchSize),
    ctx.db.query("pushSubscriptions").withIndex("by_student", (q) => q.eq("studentId", studentId)).take(batchSize),
    Promise.all((["visible", "under_review"] as const).map((status) => ctx.db.query("posts")
      .withIndex("by_author", (q) => q.eq("workspaceKey", workspaceKey).eq("authorId", studentId)
        .eq("visibilityStatus", status)).take(batchSize))),
    Promise.all((["available", "pending"] as const).map((status) => ctx.db.query("listings")
      .withIndex("by_seller_status_expiry", (q) => q.eq("workspaceKey", workspaceKey).eq("sellerId", studentId)
        .eq("status", status)).take(batchSize))),
    ctx.db.query("studySessions").withIndex("by_host_status", (q) => q.eq("workspaceKey", workspaceKey)
      .eq("hostId", studentId).eq("status", "scheduled")).take(batchSize),
    ctx.db.query("parkingReports").withIndex("by_author_status", (q) => q.eq("workspaceKey", workspaceKey)
      .eq("authorId", studentId).eq("status", "active")).take(batchSize),
    Promise.all((["pending", "attached"] as const).map((status) => ctx.db.query("mediaAssets")
      .withIndex("by_owner_status", (q) => q.eq("workspaceKey", workspaceKey).eq("ownerStudentId", studentId)
        .eq("status", status)).take(batchSize))),
    deletePrivateSchedule ? ctx.db.query("privateScheduleTerms").withIndex("by_student_term", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("studentId", studentId)).take(batchSize) : Promise.resolve([]),
  ]);
  for (const schedule of privateSchedules) await ctx.db.delete(schedule._id);
  for (const s of sessions) await ctx.db.delete(s._id);
  for (const p of pushes) await ctx.db.delete(p._id);
  for (const p of postBatches.flat()) {
    await ctx.db.patch(p._id, {
      visibilityStatus: p.replyCount > 0 ? "deleted_tombstone" : "removed",
      body: "[Deleted Post]",
      searchText: "",
      tags: [],
      embed: undefined,
      showInCampusFeed: false,
      mediaAssetIds: [],
    });
  }
  for (const l of listingBatches.flat()) {
    await ctx.db.patch(l._id, { status: "removed", visibilityStatus: "removed", isBrowseable: false });
  }
  for (const ss of hostedSessions) {
    await ctx.db.patch(ss._id, { status: "cancelled", visibilityStatus: "removed" });
  }
  for (const r of reports) await ctx.db.patch(r._id, { status: "cleared" });
  const media = mediaBatches.flat();
  for (const asset of media) await queueMediaDeletion(ctx, asset);

  const batches = [sessions, pushes, ...postBatches, ...listingBatches, hostedSessions, reports, ...mediaBatches, privateSchedules];
  if (batches.some((batch) => batch.length === batchSize)) {
    await ctx.scheduler.runAfter(0, internal.students.continueStudentCleanup, { workspaceKey, studentId });
  }
  return media.length;
}

export const continueStudentCleanup = internalMutation({
  args: { workspaceKey: v.string(), studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (student?.workspaceKey === args.workspaceKey && student.accountStatus !== "active") {
      await closeStudentArtifactsAndMedia(ctx, args.workspaceKey, student._id, student.accountStatus === "deleted");
    }
  },
});

// Keep v2 privacy cleanup independently bounded: each continuation advances the
// append-only ledger cursor while destructive queries remove their own results.
export async function cleanupV2Student(
  ctx: MutationCtx, workspaceKey: string, studentId: Id<"students">,
  deleted: boolean, cloutCursor: string | null = null, cloutDone = false,
) {
  const now = Date.now();
  const limit = 25;
  const incidentRows = (await Promise.all((deleted
    ? ["visible", "under_review", "removed"] as const
    : ["visible", "under_review"] as const).map((visibility) => ctx.db.query("incidents")
    .withIndex("by_author_visibility", (q) => q.eq("workspaceKey", workspaceKey)
      .eq("authorId", studentId).eq("visibility", visibility)).take(limit))));
  for (const incident of incidentRows.flat()) {
    await ctx.db.patch(incident._id, deleted
      ? { visibility: "deleted", text: "", areaDetail: undefined, photoAssetId: undefined, nameLevel: "hidden", updateCount: 0 }
      : { visibility: "removed", purgeAt: now + THIRTY_DAYS_MS });
  }
  const updates = deleted ? await ctx.db.query("incidentUpdates").withIndex("by_author_kind", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("authorId", studentId).eq("kind", "author_update")).take(limit) : [];
  for (const update of updates) {
    const incident = await ctx.db.get(update.incidentId);
    if (incident?.workspaceKey === workspaceKey) {
      await ctx.db.patch(incident._id, { updateCount: Math.max(0, incident.updateCount - 1) });
    }
    await ctx.db.delete(update._id);
  }
  const notes = deleted ? await ctx.db.query("incidentUpdates").withIndex("by_author_kind", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("authorId", studentId).eq("kind", "moderator_note")).take(limit) : [];
  for (const note of notes) await ctx.db.patch(note._id, { authorId: undefined });

  const totals = await ctx.db.query("cloutWeeklyTotals").withIndex("by_student_week_campus", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("studentId", studentId)).take(limit);
  for (const total of totals) {
    if (!total.hidden && total.countedTotal > 0) {
      const board = await ctx.db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("campus", total.campus).eq("weekKey", total.weekKey)).unique();
      if (board) await ctx.db.patch(board._id, { visibleCount: Math.max(0, board.visibleCount - 1) });
    }
    await ctx.db.delete(total._id);
  }
  let nextCursor = cloutCursor;
  let ledgerDone = cloutDone;
  let deletedEvents = 0;
  if (deleted) {
    const events = await ctx.db.query("cloutEvents").withIndex("by_student_day", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("studentId", studentId)).take(limit);
    for (const event of events) await ctx.db.delete(event._id);
    deletedEvents = events.length;
  } else if (!cloutDone) {
    const page = await ctx.db.query("cloutEvents").withIndex("by_student_day", (q) =>
      q.eq("workspaceKey", workspaceKey).eq("studentId", studentId)).paginate({ numItems: limit, cursor: cloutCursor });
    for (const event of page.page) {
      if (event.kind !== "earn") continue;
      const reversed = await ctx.db.query("cloutEvents").withIndex("by_source", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("sourceType", event.sourceType).eq("sourceKey", event.sourceKey)
          .eq("studentId", studentId).eq("kind", "reverse")).first();
      if (!reversed) await ctx.db.insert("cloutEvents", {
        workspaceKey, studentId, kind: "reverse", amount: event.amount, sourceType: event.sourceType,
        sourceKey: event.sourceKey, targetKey: event.targetKey, partnerId: event.partnerId,
        campus: event.campus, weekKey: event.weekKey, dayKeyET: event.dayKeyET, createdAt: now, purgeAt: now + THIRTY_DAYS_MS,
      });
    }
    nextCursor = page.continueCursor;
    ledgerDone = page.isDone;
  }
  await ctx.db.patch(studentId, { lifetimeClout: deleted ? undefined : 0, leaderboardHidden: true });
  if (workspaceKey === "prod") {
    const appointment = await ctx.db.query("moderators").withIndex("by_student", (q) =>
      q.eq("workspaceKey", "prod").eq("studentId", studentId)).unique();
    if (appointment && appointment.revokedAt === undefined) {
      await ctx.db.patch(appointment._id, { revokedAt: now, purgeAt: now + THIRTY_DAYS_MS });
    }
  }
  if ([...incidentRows, updates, notes, totals].some((rows) => rows.length === limit) ||
    (deleted ? deletedEvents === limit : !ledgerDone)) {
    await ctx.scheduler.runAfter(0, internal.students.continueV2StudentCleanup, {
      workspaceKey, studentId, cloutCursor: nextCursor, cloutDone: ledgerDone,
    });
  }
}

export const continueV2StudentCleanup = internalMutation({
  args: { workspaceKey: v.string(), studentId: v.id("students"), cloutCursor: v.union(v.string(), v.null()), cloutDone: v.boolean() },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (student?.workspaceKey === args.workspaceKey && student.accountStatus !== "active") {
      await cleanupV2Student(ctx, args.workspaceKey, student._id, student.accountStatus === "deleted", args.cloutCursor, args.cloutDone);
    }
  },
});

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

    const purgedAssetCount = await closeStudentArtifactsAndMedia(ctx, "prod", actor._id, true);
    await cleanupV2Student(ctx, "prod", actor._id, true);

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

    return { ok: true, purgedAssetCount };
  },
});
