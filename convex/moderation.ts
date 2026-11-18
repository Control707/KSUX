import { describeFeedHealth } from "./lib/syncGuard";
import { ConvexError, v } from "convex/values";
import { setClubMembershipRole } from "./communities";
import { makeStudentPairKey, sha256Hex } from "./lib/crypto";
import {
  isItemVisibleToViewer,
  makeTargetKey,
  moderatorMutation,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { closeStudentArtifactsAndMedia } from "./students";
import { Id } from "./_generated/dataModel";
import { getChatMembership, updateLatestMessagePreview } from "./chats";
import { queueMediaDeletion } from "./lib/mediaCleanup";

export const toggleBlockStudent = viewerMutation({
  args: {
    targetStudentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    if (args.targetStudentId === viewer.actorStudent._id) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "You cannot block yourself.",
      });
    }

    const target = await ctx.db.get(args.targetStudentId);
    if (!target || target.workspaceKey !== viewer.workspaceKey || target.accountStatus !== "active") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Student not found." });
    }

    const dmPairKey = makeStudentPairKey(
      String(viewer.actorStudent._id),
      String(args.targetStudentId)
    );
    const blocks = await ctx.db.query("studentBlocks").withIndex("by_pair", (q) =>
      q.eq("workspaceKey", viewer.workspaceKey).eq("pairKey", dmPairKey),
    ).collect();
    const match = blocks.find((block) => block.blockerId === viewer.actorStudent._id);
    const dmChat = await ctx.db
      .query("chats")
      .withIndex("by_dm_pair", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("dmPairKey", dmPairKey)
      )
      .unique();

    if (match) {
      await ctx.db.delete(match._id);
      const stillBlockedByCounterparty = blocks.some((block) => block.blockerId === target._id);
      if (
        dmChat &&
        dmChat.requestStatus === "locked_readonly" &&
        !stillBlockedByCounterparty
      ) {
        // Legacy DMs stored Block in requestStatus and discarded the earlier state.
        const initiator = dmChat.requestInitiatorId;
        const recipient = initiator === target._id ? viewer.actorStudent._id : target._id;
        const decline = initiator ? await ctx.db.query("interpersonalLedgers").withIndex("by_pair_kind", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("kind", "dm_decline_cooldown")
            .eq("pairKey", `${initiator}->${recipient}`),
        ).unique() : null;
        await ctx.db.patch(dmChat._id, {
          requestStatus: decline ? "declined" : initiator ? "pending_request" : "active",
        });
      }
      return { blocked: false };
    }

    await ctx.db.insert("studentBlocks", {
      workspaceKey: viewer.workspaceKey,
      blockerId: viewer.actorStudent._id,
      blockedId: args.targetStudentId,
      pairKey: dmPairKey,
      createdAt: Date.now(),
    });

    // Sever follow edges in both directions
    const [f1, f2] = await Promise.all([
      ctx.db
        .query("studentFollows")
        .withIndex("by_pair", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("followerId", viewer.actorStudent._id)
            .eq("followeeId", args.targetStudentId)
        )
        .unique(),
      ctx.db
        .query("studentFollows")
        .withIndex("by_pair", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("followerId", args.targetStudentId)
            .eq("followeeId", viewer.actorStudent._id)
        )
        .unique(),
    ]);
    if (f1) await ctx.db.delete(f1._id);
    if (f2) await ctx.db.delete(f2._id);

    return { blocked: true };
  },
});

export const listBlockedStudents = viewerQuery({
  args: {},
  handler: async (ctx) => {
    const blocks = await ctx.db
      .query("studentBlocks")
      .withIndex("by_blocker", (q) =>
        q
          .eq("workspaceKey", ctx.viewer.workspaceKey)
          .eq("blockerId", ctx.viewer.actorStudent._id)
      )
      .take(200);

    const out = [];
    for (const b of blocks) {
      const s = await ctx.db.get(b.blockedId);
      if (s) {
        out.push({
          blockId: b._id,
          createdAt: b.createdAt,
          student: toPublicStudent(s),
        });
      }
    }
    return out;
  },
});

export const submitReport = viewerMutation({
  args: {
    targetType: v.union(
      v.literal("post"),
      v.literal("listing"),
      v.literal("study_session"),
      v.literal("student"),
      v.literal("chat_message")
    ),
    targetId: v.string(),
    reason: v.union(
      v.literal("harassment"),
      v.literal("scam_spam"),
      v.literal("prohibited_item"),
      v.literal("impersonation"),
      v.literal("campus_safety")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const targetKey = makeTargetKey(args.targetType, args.targetId);
    if (viewer.mode === "student" && !viewer.actorStudent.canonicalEmail) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Only verified Students can report items." });
    }

    const existingReports = await ctx.db
      .query("moderationReports")
      .withIndex("by_target", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("targetKey", targetKey)
      )
      .take(100);

    const alreadyByMe = existingReports.find(
      (r) =>
        r.reporterId === viewer.actorStudent._id &&
        r.queueStatus !== "restored"
    );

    let quarantineTarget: (() => Promise<void>) | undefined;
    let authorId: Id<"students"> | undefined;
    let visibilityStatus: string | undefined;
    if (!alreadyByMe) {
      switch (args.targetType) {
        case "post": {
          const id = ctx.db.normalizeId("posts", args.targetId);
          const post = id && await ctx.db.get(id);
          if (post && post.workspaceKey === viewer.workspaceKey) {
            authorId = post.authorId;
            visibilityStatus = post.visibilityStatus;
            quarantineTarget = () => ctx.db.patch(post._id, { visibilityStatus: "under_review", showInCampusFeed: false });
          }
          break;
        }
        case "listing": {
          const id = ctx.db.normalizeId("listings", args.targetId);
          const listing = id && await ctx.db.get(id);
          if (listing && listing.workspaceKey === viewer.workspaceKey) {
            authorId = listing.sellerId;
            visibilityStatus = listing.visibilityStatus;
            quarantineTarget = () => ctx.db.patch(listing._id, { visibilityStatus: "under_review", isBrowseable: false });
          }
          break;
        }
        case "study_session": {
          const id = ctx.db.normalizeId("studySessions", args.targetId);
          const session = id && await ctx.db.get(id);
          if (session && session.workspaceKey === viewer.workspaceKey) {
            authorId = session.hostId;
            visibilityStatus = session.visibilityStatus;
            quarantineTarget = () => ctx.db.patch(session._id, { visibilityStatus: "under_review" });
          }
          break;
        }
        case "student": {
          const id = ctx.db.normalizeId("students", args.targetId);
          const student = id && await ctx.db.get(id);
          if (student && student.workspaceKey === viewer.workspaceKey && student.accountStatus === "active") {
            authorId = student._id;
            visibilityStatus = student.visibilityStatus;
            quarantineTarget = () => ctx.db.patch(student._id, { visibilityStatus: "under_review" });
          }
          break;
        }
        case "chat_message": {
          const id = ctx.db.normalizeId("chatMessages", args.targetId);
          const message = id && await ctx.db.get(id);
          const chat = message && !message.isDeleted && message.workspaceKey === viewer.workspaceKey
            ? await ctx.db.get(message.chatId) : null;
          if (chat && message && chat.workspaceKey === viewer.workspaceKey &&
              await getChatMembership(ctx, chat, viewer.actorStudent._id)) {
            authorId = message.senderId;
            visibilityStatus = message.visibilityStatus;
            quarantineTarget = async () => {
              await ctx.db.patch(message._id, { visibilityStatus: "under_review" });
              await updateLatestMessagePreview(ctx, chat, { ...message, visibilityStatus: "under_review" });
            };
          }
          break;
        }
      }
      if (!quarantineTarget || authorId === viewer.actorStudent._id || !isItemVisibleToViewer(viewer, {
        targetType: args.targetType, targetId: args.targetId, authorId, visibilityStatus,
      })) {
        throw new ConvexError({ code: "NOT_FOUND", message: "This item is not available for reporting." });
      }
    }

    if (!alreadyByMe) {
      await ctx.db.insert("moderationReports", {
        workspaceKey: viewer.workspaceKey,
        reporterId: viewer.actorStudent._id,
        targetType: args.targetType,
        targetKey,
        reason: args.reason,
        notes: args.notes?.trim().slice(0, 300),
        queueStatus: "open",
        createdAt: now,
      });
    }

    // Count distinct active reporters in this workspace
    const allReportsAfter = await ctx.db
      .query("moderationReports")
      .withIndex("by_target", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("targetKey", targetKey)
      )
      .take(100);

    const reporterIds = new Set(
      allReportsAfter
        .filter((r) => r.queueStatus === "open" || r.queueStatus === "quarantined")
        .map((r) => r.reporterId)
    );
    const reporterRows = await Promise.all([...reporterIds].map((id) => ctx.db.get(id)));
    const distinctReporterCount = reporterRows.filter((reporter) =>
      reporter?.workspaceKey === viewer.workspaceKey && reporter.accountStatus === "active" &&
      (viewer.mode === "demo" || reporter.canonicalEmail),
    ).length;

    let quarantined = false;
    if (distinctReporterCount >= 3 && quarantineTarget) {
      await quarantineTarget();
      quarantined = true;
      for (const r of allReportsAfter) {
        if (r.queueStatus === "open") {
          await ctx.db.patch(r._id, { queueStatus: "quarantined" });
        }
      }
    }

    return {
      ok: true,
      quarantined,
      distinctReporterCount,
      showKsuPoliceCallout: args.reason === "campus_safety",
    };
  },
});

const campusFeeds = [
  { key: "localist_events", name: "KSU Calendar (Localist)", maxAge: 2 * 60 * 60_000 },
  { key: "engage_events", name: "Engage Events syndication", maxAge: 2 * 60 * 60_000 },
  { key: "passio_shuttle", name: "Big Owl Bus (Passio GO)", maxAge: 15 * 60_000 },
  { key: "libcal_study_rooms", name: "Study Rooms (LibCal)", maxAge: 15 * 60_000 },
  { key: "ksu_dining_hours", name: "KSU Dining hours", maxAge: 26 * 60 * 60_000 },
  { key: "nutrislice_dining", name: "Dining menus (Nutrislice)", maxAge: 24 * 60 * 60_000 },
];

export const getCampusFeedHealth = viewerQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.viewer.mode !== "student" || !ctx.viewer.isMaintainer) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Campus feed health requires maintainer access." });
    }
    const now = Date.now();
    return Promise.all(campusFeeds.map(async ({ key, name, maxAge }) => {
      const state = await ctx.db.query("feedSyncState").withIndex("by_source", (q) => q.eq("sourceKey", key)).unique();
      return { key, name, ...describeFeedHealth(state, now, maxAge) };
    }));
  },
});

export const getModerationQueue = viewerQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.viewer.isModerator) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Maintainer moderation access is required.",
      });
    }

    const wsKey = ctx.viewer.workspaceKey;
    const [quarantinedReports, openReports, pendingOfficerClaims] =
      await Promise.all([
        ctx.db
          .query("moderationReports")
          .withIndex("by_queue", (q) =>
            q.eq("workspaceKey", wsKey).eq("queueStatus", "quarantined")
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("moderationReports")
          .withIndex("by_queue", (q) =>
            q.eq("workspaceKey", wsKey).eq("queueStatus", "open")
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("clubMembers")
          .withIndex("by_pending_claims", (q) =>
            q.eq("workspaceKey", wsKey).eq("role", "pending_officer_claim")
          )
          .order("desc")
          .take(25),
      ]);

    const grouped = new Map<
      string,
      {
        targetKey: string;
        targetType:
          | "post"
          | "listing"
          | "study_session"
          | "student"
          | "chat_message";
        targetId: string;
        queueStatus: "open" | "quarantined";
        reasons: string[];
        reporterCount: number;
        latestAt: number;
      }
    >();

    for (const r of [...quarantinedReports, ...openReports]) {
      // Incident content belongs to the v2 queue and its CSA/own-item guards.
      if (r.targetType === "incident") continue;
      const targetId = r.targetKey.slice(r.targetType.length + 1);
      const existing = grouped.get(r.targetKey);
      if (!existing) {
        grouped.set(r.targetKey, {
          targetKey: r.targetKey,
          targetType: r.targetType,
          targetId,
          queueStatus:
            r.queueStatus === "quarantined" ? "quarantined" : "open",
          reasons: [r.reason],
          reporterCount: 1,
          latestAt: r.createdAt,
        });
      } else {
        existing.reporterCount += 1;
        if (r.queueStatus === "quarantined") {
          existing.queueStatus = "quarantined";
        }
        if (!existing.reasons.includes(r.reason)) {
          existing.reasons.push(r.reason);
        }
        if (r.createdAt > existing.latestAt) {
          existing.latestAt = r.createdAt;
        }
      }
    }

    const items = [];
    for (const g of grouped.values()) {
      let previewText = "";
      let authorStudentId: Id<"students"> | undefined;
      let visibilityStatus = "visible";

      if (g.targetType === "post") {
        const post = await ctx.db.get(g.targetId as Id<"posts">);
        if (post && post.workspaceKey === wsKey) {
          previewText = post.body;
          authorStudentId = post.authorId;
          visibilityStatus = post.visibilityStatus;
        }
      } else if (g.targetType === "listing") {
        const listing = await ctx.db.get(g.targetId as Id<"listings">);
        if (listing && listing.workspaceKey === wsKey) {
          previewText = `${listing.title} — ${listing.description}`;
          authorStudentId = listing.sellerId;
          visibilityStatus = listing.visibilityStatus;
        }
      } else if (g.targetType === "study_session") {
        const ss = await ctx.db.get(g.targetId as Id<"studySessions">);
        if (ss && ss.workspaceKey === wsKey) {
          previewText = ss.title;
          authorStudentId = ss.hostId;
          visibilityStatus = ss.visibilityStatus;
        }
      } else if (g.targetType === "student") {
        const st = await ctx.db.get(g.targetId as Id<"students">);
        if (st && st.workspaceKey === wsKey) {
          previewText = `@${st.handle} · ${st.displayName}`;
          authorStudentId = st._id;
          visibilityStatus = st.accountStatus;
        }
      } else if (g.targetType === "chat_message") {
        const msg = await ctx.db.get(g.targetId as Id<"chatMessages">);
        if (msg && msg.workspaceKey === wsKey) {
          previewText = msg.body;
          authorStudentId = msg.senderId;
        }
      }

      const author = authorStudentId
        ? await ctx.db.get(authorStudentId)
        : null;

      items.push({
        ...g,
        previewText,
        visibilityStatus,
        author: author ? toPublicStudent(author) : null,
      });
    }

    const officerClaims = [];
    for (const claim of pendingOfficerClaims) {
      const [club, st] = await Promise.all([
        ctx.db.get(claim.clubId),
        ctx.db.get(claim.studentId),
      ]);
      if (club && st) {
        officerClaims.push({
          membershipId: claim._id,
          joinedAt: claim.joinedAt,
          club: {
            _id: club._id,
            slug: club.slug,
            name: club.name,
            campus: club.campus,
          },
          student: toPublicStudent(st),
        });
      }
    }

    return {
      mode: ctx.viewer.mode,
      workspaceKey: wsKey,
      items: items.sort((a, b) => b.latestAt - a.latestAt),
      officerClaims,
    };
  },
});

export const reviewModerationTarget = moderatorMutation({
  args: {
    targetType: v.union(
      v.literal("post"),
      v.literal("listing"),
      v.literal("study_session"),
      v.literal("student"),
      v.literal("chat_message")
    ),
    targetId: v.string(),
    decision: v.union(
      v.literal("restore"),
      v.literal("remove"),
      v.literal("suspend_student")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const wsKey = ctx.viewer.workspaceKey;
    if (args.decision === "suspend_student" && !ctx.viewer.isMaintainer) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Only maintainers can suspend Students." });
    }
    const targetKey = makeTargetKey(args.targetType, args.targetId);

    let targetAuthorId: Id<"students"> | undefined;

    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as Id<"posts">);
      if (!post || post.workspaceKey !== wsKey) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Post not found." });
      }
      targetAuthorId = post.authorId;
      if (args.decision === "restore") {
        await ctx.db.patch(post._id, {
          visibilityStatus: "visible",
          showInCampusFeed: !post.rootPostId && post.crossPostToCampusFeed,
        });
      } else {
        await ctx.db.patch(post._id, {
          visibilityStatus: "removed",
          showInCampusFeed: false,
        });
      }
    } else if (args.targetType === "listing") {
      const listing = await ctx.db.get(args.targetId as Id<"listings">);
      if (!listing || listing.workspaceKey !== wsKey) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Listing not found.",
        });
      }
      targetAuthorId = listing.sellerId;
      if (args.decision === "restore") {
        const nextStatus =
          listing.status === "removed" ? "available" : listing.status;
        await ctx.db.patch(listing._id, {
          status: nextStatus,
          visibilityStatus: "visible",
          isBrowseable: nextStatus === "available" || nextStatus === "pending",
        });
      } else {
        await ctx.db.patch(listing._id, {
          status: "removed",
          visibilityStatus: "removed",
          isBrowseable: false,
        });
      }
    } else if (args.targetType === "study_session") {
      const ss = await ctx.db.get(args.targetId as Id<"studySessions">);
      if (!ss || ss.workspaceKey !== wsKey) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Study Session not found.",
        });
      }
      targetAuthorId = ss.hostId;
      if (args.decision === "restore") {
        await ctx.db.patch(ss._id, { visibilityStatus: "visible" });
      } else {
        await ctx.db.patch(ss._id, {
          status: "cancelled",
          visibilityStatus: "removed",
        });
      }
    } else if (args.targetType === "student") {
      const studentId = ctx.db.normalizeId("students", args.targetId);
      const student = studentId && await ctx.db.get(studentId);
      if (!student || student.workspaceKey !== wsKey) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Student not found." });
      }
      targetAuthorId = student._id;
      if (args.decision !== "suspend_student") {
        await ctx.db.patch(student._id, { visibilityStatus: args.decision === "restore" ? "visible" : "under_review" });
      }
    } else if (args.targetType === "chat_message") {
      const msg = await ctx.db.get(args.targetId as Id<"chatMessages">);
      if (msg && msg.workspaceKey === wsKey) {
        targetAuthorId = msg.senderId;
        const updated = args.decision === "restore" ? { visibilityStatus: "visible" as const }
          : { isDeleted: true, body: "[Message deleted]", visibilityStatus: "visible" as const,
              mediaAssetId: undefined, linkEmbed: undefined };
        if (args.decision !== "restore" && msg.mediaAssetId) {
          const asset = await ctx.db.get(msg.mediaAssetId);
          if (asset && asset.workspaceKey === wsKey && asset.ownerStudentId === msg.senderId) {
            await queueMediaDeletion(ctx, asset);
          }
        }
        await ctx.db.patch(msg._id, updated);
        const chat = await ctx.db.get(msg.chatId);
        if (chat) await updateLatestMessagePreview(ctx, chat, { ...msg, ...updated });
      }
    }

    if (args.decision === "suspend_student" && targetAuthorId) {
      const student = await ctx.db.get(targetAuthorId);
      if (
        student &&
        student.workspaceKey === wsKey &&
        student._id !== ctx.viewer.actorStudent._id
      ) {
        const blockedEmailHash = student.canonicalEmail
          ? await sha256Hex(student.canonicalEmail)
          : undefined;

        // Permanent handle + email hash lock
        await ctx.db.insert("handleReservations", {
          workspaceKey: wsKey,
          handleLower: student.handleLower,
          reason: "suspended",
          blockedEmailHash,
          createdAt: now,
          expiresAt: undefined,
        });

        await closeStudentArtifactsAndMedia(
          ctx,
          wsKey,
          student._id
        );

        const suspendedHandle = `suspended_${String(student._id).slice(-10).toLowerCase()}`;
        await ctx.db.patch(student._id, {
          canonicalEmail: undefined,
          handle: suspendedHandle,
          handleLower: suspendedHandle,
          displayName: "[Removed Student]",
          searchText: "",
          avatarUrl: undefined,
          avatarAssetId: undefined,
          accountStatus: "suspended",
        });

      }
    }

    const reports = await ctx.db
      .query("moderationReports")
      .withIndex("by_target", (q) =>
        q.eq("workspaceKey", wsKey).eq("targetKey", targetKey)
      )
      .take(100);
    for (const r of reports) {
      await ctx.db.patch(r._id, {
        queueStatus: args.decision === "restore" ? "restored" : "removed",
        reviewedById: ctx.viewer.actorStudent._id,
      });
    }

    return { ok: true, decision: args.decision };
  },
});

export const reviewOfficerClaim = moderatorMutation({
  args: {
    membershipId: v.id("clubMembers"),
    approve: v.boolean(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.workspaceKey !== ctx.viewer.workspaceKey) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Officer claim not found in this workspace.",
      });
    }
    const role = args.approve ? "officer" : "member";
    const club = await ctx.db.get(membership.clubId);
    if (!club || (club.workspaceKey !== "ksu" && club.workspaceKey !== membership.workspaceKey)) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Club not found." });
    }
    if (membership.role !== "pending_officer_claim" && membership.role !== role) {
      throw new ConvexError({ code: "FORBIDDEN", message: "The officer claim has already been resolved." });
    }
    await setClubMembershipRole(ctx, club, membership.workspaceKey, membership.studentId, role, Date.now());
    return { ok: true, role };
  },
});
