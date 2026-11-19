import { workflowTime } from "./lib/workflowTime";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { chatReactionEmojiValidator } from "./schema";
import { makeStudentPairKey } from "./lib/crypto";
import { buildPrivacySafePushIfEligible } from "./lib/pushAdapter";
import { assertPublishSafety, detectDealScamWarning } from "./lib/safety";
import {
  makeTargetKey,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { isCurrentCampusChatMember } from "./lib/campusChat";
import { queueMediaDeletion } from "./lib/mediaCleanup";
import { getChatPreview } from "./lib/chatPreview";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CUSTOM_GROUP_MEMBERS = 50;
const GROUP_CHAT_KINDS = ["club_group", "course_group", "study_group", "custom_group"] as const;

async function isDirectMessageBlocked(ctx: QueryCtx | MutationCtx, chat: Doc<"chats">) {
  if (chat.kind !== "dm" || !chat.dmPairKey) return false;
  const pairKey = chat.dmPairKey;
  const block = await ctx.db.query("studentBlocks").withIndex("by_pair", (q) =>
    q.eq("workspaceKey", chat.workspaceKey).eq("pairKey", pairKey),
  ).first();
  return Boolean(block);
}

export async function updateLatestMessagePreview(
  ctx: MutationCtx,
  chat: Doc<"chats">,
  message: Pick<Doc<"chatMessages">, "seq" | "body" | "isDeleted" | "visibilityStatus">,
) {
  if (message.seq === chat.messageSeq) {
    await ctx.db.patch(chat._id, {
      lastMessagePreview: message.isDeleted ? "[Message deleted]" :
        message.visibilityStatus === "under_review" ? "[Message under review]" : message.body.slice(0, 120),
    });
  }
}

export async function getChatMembership(
  ctx: QueryCtx | MutationCtx,
  chat: Doc<"chats">,
  studentId: Id<"students">,
) {
  const membership = await ctx.db.query("chatMembers").withIndex("by_chat_student", (q) =>
    q.eq("workspaceKey", chat.workspaceKey).eq("chatId", chat._id).eq("studentId", studentId),
  ).unique();
  return membership && await isCurrentCampusChatMember(ctx, chat, studentId) ? membership : null;
}

function detectInternalKsuxLink(body: string):
  | { href: string; label: string; entityType?: string }
  | undefined {
  const m = body.match(
    /(?:https?:\/\/[^\s]+)?(\/(?:courses|clubs|events|marketplace|parking|study|transit|dining)(?:\/[^\s]*)?)/i
  );
  if (!m?.[1]) return undefined;
  const href = m[1];
  return {
    href,
    label: `KSUX Link · ${href}`,
  };
}

async function areStudentsConnectedForDirectMessage(
  ctx: MutationCtx,
  workspaceKey: string,
  senderId: Id<"students">,
  recipientId: Id<"students">,
  now: number
): Promise<boolean> {
  // 1. Recipient follows sender
  const recipientFollowsSender = await ctx.db
    .query("studentFollows")
    .withIndex("by_pair", (q) =>
      q
        .eq("workspaceKey", workspaceKey)
        .eq("followerId", recipientId)
        .eq("followeeId", senderId)
    )
    .unique();
  if (recipientFollowsSender) return true;

  // 2. Shared Club officer roster
  const [senderClubs, recipientClubs] = await Promise.all([
    ctx.db
      .query("clubMembers")
      .withIndex("by_student", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("studentId", senderId)
      )
      .take(30),
    ctx.db
      .query("clubMembers")
      .withIndex("by_student", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("studentId", recipientId)
      )
      .take(30),
  ]);
  const senderOfficerClubs = new Set(
    senderClubs.filter((c) => c.role === "officer").map((c) => String(c.clubId))
  );
  if (
    recipientClubs.some(
      (c) => c.role === "officer" && senderOfficerClubs.has(String(c.clubId))
    )
  ) {
    return true;
  }

  // 3. Shared active Study Session
  const activeSessions = await ctx.db
    .query("studySessions")
    .filter((q) =>
      q.and(
        q.eq(q.field("workspaceKey"), workspaceKey),
        q.eq(q.field("status"), "scheduled"),
        q.gt(q.field("endTime"), now)
      )
    )
    .take(30);

  return activeSessions.some(
    (s) => s.attendeeIds.includes(senderId) && s.attendeeIds.includes(recipientId)
  );
}

export async function appendMessageAndFanoutUnread(
  ctx: MutationCtx,
  params: {
    workspaceKey: string;
    chat: Doc<"chats">;
    senderId?: Id<"students">;
    senderHandle?: string;
    messageType: "user" | "system" | "handoff_update";
    body: string;
    mediaAssetId?: Id<"mediaAssets">;
    replyToMessageId?: Id<"chatMessages">;
    now: number;
  }
): Promise<Id<"chatMessages">> {
  const nextSeq = params.chat.messageSeq + 1;
  const scamWarningTriggered =
    params.chat.kind === "deal" && detectDealScamWarning(params.body);
  const linkEmbed =
    params.messageType === "user"
      ? detectInternalKsuxLink(params.body)
      : undefined;

  const messageId = await ctx.db.insert("chatMessages", {
    workspaceKey: params.workspaceKey,
    chatId: params.chat._id,
    seq: nextSeq,
    senderId: params.senderId,
    messageType: params.messageType,
    body: params.body,
    mediaAssetId: params.mediaAssetId,
    replyToMessageId: params.replyToMessageId,
    linkEmbed,
    reactions: [],
    scamWarningTriggered,
    isDeleted: false,
    publishedAt: params.now,
  });

  await ctx.db.patch(params.chat._id, {
    messageSeq: nextSeq,
    lastMessageAt: params.now,
    lastMessagePreview: params.body.slice(0, 120),
    lastSenderHandle: params.senderHandle,
  });

  const members = await ctx.db
    .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q.eq("workspaceKey", params.workspaceKey).eq("chatId", params.chat._id)
      )
    .take(60);

  for (const m of members) {
    if (params.senderId && m.studentId === params.senderId) {
      await ctx.db.patch(m._id, {
        lastReadSeq: nextSeq,
        lastReadAt: params.now,
        hasUnread: false,
        lastChatMessageAt: params.now,
      });
      continue;
    }

    await ctx.db.patch(m._id, {
      hasUnread: true,
      isArchived: false,
      lastChatMessageAt: params.now,
    });

    // Evaluate opt-in VAPID Web Push strictly for low-fan-out personal events in "prod"
    if (
      params.workspaceKey === "prod" &&
      params.senderHandle &&
      (params.chat.kind === "dm" || params.chat.kind === "deal")
    ) {
      const eventKind =
        params.chat.kind === "deal"
          ? "deal"
          : params.chat.requestStatus === "pending_request"
            ? "message_request"
            : "dm";

      const pushDecision = buildPrivacySafePushIfEligible({
        workspaceKey: params.workspaceKey,
        eventKind,
        senderHandle: params.senderHandle,
        chatId: String(params.chat._id),
        href: `/chats/${params.chat._id}`,
        isMuted: m.isMuted,
        isBlocked: false,
        lastReadAt: m.lastReadAt,
        lastPushSentAt: m.lastPushSentAt,
        nowMs: params.now,
      });

      if (pushDecision.send) {
        await ctx.db.patch(m._id, { lastPushSentAt: params.now });
        if (process.env.KSUX_SKIP_PUSH_SCHEDULER !== "true") {
          await ctx.scheduler.runAfter(0, internal.pushNode.sendPushPayloadNode, {
            studentId: m.studentId,
            title: pushDecision.payload.title,
            body: pushDecision.payload.body,
            href: pushDecision.payload.href,
            tag: pushDecision.payload.tag,
          });
        }
      }
    }
  }

  return messageId;
}

export const listInbox = viewerQuery({
  args: {
    tabFilter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("dm"),
        v.literal("group"),
        v.literal("deal")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const filter = args.tabFilter ?? "all";

    const kinds = filter === "group" ? GROUP_CHAT_KINDS : filter === "all" ? [] : [filter];
    const memberships = filter === "all" ? await ctx.db.query("chatMembers")
      .withIndex("by_student_inbox", (q) => q.eq("workspaceKey", viewer.workspaceKey)
        .eq("studentId", viewer.actorStudent._id).eq("isArchived", false))
      .order("desc").take(50) : (await Promise.all(kinds.map((kind) =>
      ctx.db.query("chatMembers").withIndex("by_student_kind_inbox", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id)
          .eq("isArchived", false).eq("chatKind", kind),
      ).order("desc").take(50),
    ))).flat().sort((a, b) => b.lastChatMessageAt - a.lastChatMessageAt).slice(0, 50);

    const rows = [];
    for (const m of memberships) {
      const chat = await ctx.db.get(m.chatId);
      if (!chat || chat.requestStatus === "declined" ||
          !await isCurrentCampusChatMember(ctx, chat, viewer.actorStudent._id)) continue;

      let displayTitle = chat.title ?? "Conversation";
      let counterparty: ReturnType<typeof toPublicStudent> | null = null;

      if (chat.kind === "dm") {
        const allMembers = await ctx.db
          .query("chatMembers")
          .withIndex("by_chat_student", (q) => q.eq("workspaceKey", viewer.workspaceKey).eq("chatId", chat._id))
          .take(4);
        const other = allMembers.find(
          (om) => om.studentId !== viewer.actorStudent._id
        );
        if (other) {
          const otherDoc = await ctx.db.get(other.studentId);
          counterparty = toPublicStudent(otherDoc);
          displayTitle = counterparty.isRemoved
            ? "[Removed Student]"
            : `${counterparty.displayName} (@${counterparty.handle})`;
        }
      }

      const unreadCount = Math.max(0, chat.messageSeq - m.lastReadSeq);
      const isBlocked = await isDirectMessageBlocked(ctx, chat);
      const isStudyGraceLocked = Boolean(
        chat.readonlyAfter !== undefined && now >= chat.readonlyAfter
      );

      rows.push({
        chatId: chat._id,
        kind: chat.kind,
        title: displayTitle,
        counterparty,
        requestStatus: chat.requestStatus,
        isPendingIncomingRequest:
          !isBlocked && chat.requestStatus === "pending_request" &&
          chat.requestInitiatorId !== viewer.actorStudent._id,
        isReadOnlyLocked:
          chat.requestStatus === "locked_readonly" || isStudyGraceLocked || isBlocked,
        badgeMode: m.badgeMode,
        unreadCount: m.badgeMode === "count" && !m.isMuted ? unreadCount : 0,
        hasDotUnread:
          m.badgeMode === "dot" && !m.isMuted && unreadCount > 0,
        isMuted: m.isMuted,
        role: m.role,
        lastMessageAt: chat.lastMessageAt,
        lastMessagePreview: await getChatPreview(ctx, chat, viewer),
        lastSenderHandle: chat.lastSenderHandle,
        handoffStatus: chat.handoffCard?.status ?? null,
      });
    }

    return rows;
  },
});

export const getChatThread = viewerQuery({
  args: {
    chatId: v.id("chats"),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.workspaceKey !== viewer.workspaceKey) {
      return null;
    }

    const membership = await getChatMembership(ctx, chat, viewer.actorStudent._id);
    if (!membership) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation.",
      });
    }

    const [allMembersRaw, latestMessagesRaw, listingDoc] = await Promise.all([
      ctx.db
        .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("chatId", chat._id)
      )
        .take(55),
      ctx.db
        .query("chatMessages")
        .withIndex("by_chat_seq", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("chatId", chat._id)
        )
        .order("desc")
        .take(50),
      chat.listingId ? ctx.db.get(chat.listingId) : Promise.resolve(null),
    ]);

    const participants = await Promise.all(
      allMembersRaw.map(async (m) => {
        const s = await ctx.db.get(m.studentId);
        return {
          membershipId: m._id,
          role: m.role,
          student: toPublicStudent(s),
        };
      })
    );

    const canReadMessage = (message: Doc<"chatMessages">) =>
      message.chatId === chat._id && message.workspaceKey === viewer.workspaceKey &&
      message.visibilityStatus !== "under_review" &&
      !viewer.hiddenTargetKeys.has(makeTargetKey("chat_message", message._id));
    const chronological = latestMessagesRaw.filter(canReadMessage).reverse();
    const msgById = new Map<string, Doc<"chatMessages">>();
    for (const m of chronological) msgById.set(String(m._id), m);

    const isGroupChat = chat.kind !== "dm" && chat.kind !== "deal";

    const messages = await Promise.all(
      chronological.map(async (msg) => {
        const [senderDoc, mediaDoc] = await Promise.all([
          msg.senderId ? ctx.db.get(msg.senderId) : Promise.resolve(null),
          msg.mediaAssetId ? ctx.db.get(msg.mediaAssetId) : Promise.resolve(null),
        ]);

        const collapsedBlocked = Boolean(
          isGroupChat &&
            msg.senderId &&
            viewer.blockedStudentIds.has(msg.senderId)
        );

        let replyPreview: { senderHandle: string; body: string } | null = null;
        if (msg.replyToMessageId) {
          const quoted =
            msgById.get(String(msg.replyToMessageId)) ??
            (await ctx.db.get(msg.replyToMessageId));
          if (quoted && canReadMessage(quoted) &&
              !(quoted.senderId && viewer.blockedStudentIds.has(quoted.senderId))) {
            const qSender = quoted.senderId
              ? await ctx.db.get(quoted.senderId)
              : null;
            replyPreview = {
              senderHandle: toPublicStudent(qSender).handle,
              body: quoted.isDeleted
                ? "[Message deleted]"
                : quoted.body.slice(0, 90),
            };
          }
        }

        return {
          _id: msg._id,
          seq: msg.seq,
          messageType: msg.messageType,
          sender: msg.senderId ? toPublicStudent(senderDoc) : null,
          isOwnMessage: msg.senderId === viewer.actorStudent._id,
          collapsedBlocked,
          body: msg.isDeleted ? "[Message deleted]" : msg.body,
          mediaUrl:
            !msg.isDeleted && mediaDoc && mediaDoc.status !== "deleted"
              ? mediaDoc.url
              : undefined,
          replyPreview,
          linkEmbed: msg.isDeleted ? undefined : msg.linkEmbed,
          reactions: msg.reactions.map((r) => ({
            emoji: r.emoji,
            count: r.studentIds.length,
            reactedByViewer: r.studentIds.includes(viewer.actorStudent._id),
          })),
          scamWarningTriggered: msg.scamWarningTriggered,
          isDeleted: msg.isDeleted,
          publishedAt: msg.publishedAt,
          editedAt: msg.editedAt,
        };
      })
    );

    const isStudyGraceLocked = Boolean(
      chat.readonlyAfter !== undefined && now >= chat.readonlyAfter
    );
    const isBlocked = await isDirectMessageBlocked(ctx, chat);
    const canSeeDealChatId = (dealChatId: Id<"chats"> | undefined) =>
      dealChatId === chat._id || viewer.actorStudent._id === listingDoc?.sellerId ? dealChatId : undefined;

    return {
      chat: {
        _id: chat._id,
        kind: chat.kind,
        title: chat.title,
        requestStatus: chat.requestStatus,
        requestInitiatorId: chat.requestInitiatorId,
        primarySellerId: chat.primarySellerId,
        primaryBuyerId: chat.primaryBuyerId,
        handoffCard: chat.handoffCard ?? null,
        memberCount: chat.memberCount,
        messageSeq: chat.messageSeq,
        readonlyAfter: chat.readonlyAfter,
        isStudyGraceLocked,
        isReadOnlyLocked:
          chat.requestStatus === "locked_readonly" ||
          chat.requestStatus === "declined" ||
          isBlocked ||
          isStudyGraceLocked,
      },
      myMembership: {
        role: membership.role,
        isMuted: membership.isMuted,
        badgeMode: membership.badgeMode,
      },
      listing: listingDoc
        ? {
            _id: listingDoc._id,
            title: listingDoc.title,
            campus: listingDoc.campus,
            pricingMode: listingDoc.pricingMode,
            priceCents: listingDoc.priceCents,
            tradeNote: listingDoc.tradeNote,
            status: listingDoc.status,
            activeDealChatId: canSeeDealChatId(listingDoc.activeDealChatId),
            soldDealChatId: canSeeDealChatId(listingDoc.soldDealChatId),
            buyerConfirmedPickup: listingDoc.buyerConfirmedPickup,
          }
        : null,
      participants,
      messages,
    };
  },
});

export const markChatRead = viewerMutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.workspaceKey !== viewer.workspaceKey) return { ok: false };
    const membership = await getChatMembership(ctx, chat, viewer.actorStudent._id);
    if (!membership) return { ok: false };
    await ctx.db.patch(membership._id, {
      lastReadSeq: chat.messageSeq,
      lastReadAt: now,
      hasUnread: false,
    });
    return { ok: true, lastReadSeq: chat.messageSeq };
  },
});

export const toggleChatMute = viewerMutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", ctx.viewer.workspaceKey)
          .eq("chatId", args.chatId)
          .eq("studentId", ctx.viewer.actorStudent._id)
      )
      .unique();
    if (!membership) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Chat not found." });
    }
    const nextMuted = !membership.isMuted;
    await ctx.db.patch(membership._id, { isMuted: nextMuted });
    return { isMuted: nextMuted };
  },
});

export const startOrOpenDirectMessage = viewerMutation({
  args: {
    recipientHandleOrId: v.string(),
    openerBody: v.optional(v.string()),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;

    const cleanTarget = args.recipientHandleOrId
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    let recipient = await ctx.db
      .query("students")
      .withIndex("by_workspace_handle", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("handleLower", cleanTarget)
      )
      .first();

    if (!recipient) {
      try {
        const byId = await ctx.db.get(args.recipientHandleOrId as Id<"students">);
        if (byId && byId.workspaceKey === viewer.workspaceKey) {
          recipient = byId;
        }
      } catch {
        // Not an ID
      }
    }

    if (!recipient || recipient.accountStatus !== "active") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Recipient Student not found.",
      });
    }
    if (recipient._id === viewer.actorStudent._id) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "You cannot start a Direct Message with yourself.",
      });
    }
    if (viewer.blockedStudentIds.has(recipient._id)) {
      throw new ConvexError({
        code: "BLOCKED",
        message: "Direct Messages are unavailable between blocked Students.",
      });
    }

    const dmPairKey = makeStudentPairKey(
      String(viewer.actorStudent._id),
      String(recipient._id)
    );
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_dm_pair", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("dmPairKey", dmPairKey)
      )
      .unique();

    if (existing && await isDirectMessageBlocked(ctx, existing)) {
      throw new ConvexError({ code: "BLOCKED", message: "Direct Messages are unavailable between blocked Students." });
    }

    const connected = await areStudentsConnectedForDirectMessage(
      ctx,
      viewer.workspaceKey,
      viewer.actorStudent._id,
      recipient._id,
      now
    );

    // Check 30-day cold request decline cooldown if unconnected
    if (!connected) {
      const declineCooldown = await ctx.db
        .query("interpersonalLedgers")
        .withIndex("by_pair_kind", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("kind", "dm_decline_cooldown")
            .eq("pairKey", `${viewer.actorStudent._id}->${recipient!._id}`)
        )
        .unique();
      if (declineCooldown && declineCooldown.expiresAt > now) {
        throw new ConvexError({
          code: "DECLINE_COOLDOWN",
          message:
            "This Student declined a previous Message Request (30-day cooldown active).",
        });
      }
    }

    let chatDoc = existing;
    if (!chatDoc) {
      const requestStatus = connected ? "active" : "pending_request";
      const chatId = await ctx.db.insert("chats", {
        workspaceKey: viewer.workspaceKey,
        kind: "dm",
        dmPairKey,
        requestStatus,
        requestInitiatorId: connected ? undefined : viewer.actorStudent._id,
        memberCount: 2,
        messageSeq: 0,
        lastMessageAt: now,
      });

      for (const sid of [viewer.actorStudent._id, recipient._id]) {
        await ctx.db.insert("chatMembers", {
          workspaceKey: viewer.workspaceKey,
          chatId,
          studentId: sid,
          chatKind: "dm",
          role: "member",
          badgeMode: "count",
          lastReadSeq: 0,
          lastReadAt: sid === viewer.actorStudent._id ? now : 0,
          hasUnread: false,
          isMuted: false,
          isArchived: false,
          lastChatMessageAt: now,
          joinedAt: now,
        });
      }
      chatDoc = (await ctx.db.get(chatId))!;
    } else if (chatDoc.requestStatus === "declined") {
      await ctx.db.patch(chatDoc._id, {
        requestStatus: connected ? "active" : "pending_request",
        requestInitiatorId: connected ? undefined : viewer.actorStudent._id,
        requestOpenerSeq: connected ? undefined : chatDoc.messageSeq,
      });
      chatDoc = (await ctx.db.get(chatDoc._id))!;
    }

    if (args.openerBody && args.openerBody.trim()) {
      const trimmed = args.openerBody.trim();
      assertPublishSafety(trimmed);
      if (
        chatDoc.requestStatus === "pending_request" &&
        chatDoc.requestInitiatorId === viewer.actorStudent._id &&
        chatDoc.messageSeq > (chatDoc.requestOpenerSeq ?? 0)
      ) {
        throw new ConvexError({
          code: "MESSAGE_REQUEST_CAP",
          message:
            "Cold Message Requests allow 1 text-only opener until accepted.",
        });
      }
      if (chatDoc.requestStatus === "pending_request" && chatDoc.requestInitiatorId !== viewer.actorStudent._id) {
        await ctx.db.patch(chatDoc._id, { requestStatus: "active", requestInitiatorId: undefined, requestOpenerSeq: undefined });
        chatDoc = (await ctx.db.get(chatDoc._id))!;
      }
      await appendMessageAndFanoutUnread(ctx, {
        workspaceKey: viewer.workspaceKey,
        chat: chatDoc,
        senderId: viewer.actorStudent._id,
        senderHandle: viewer.actorStudent.handle,
        messageType: "user",
        body: trimmed.slice(0, 2000),
        now,
      });
    }

    return {
      chatId: chatDoc._id,
      requestStatus: chatDoc.requestStatus,
    };
  },
});

export const respondToMessageRequest = viewerMutation({
  args: {
    chatId: v.id("chats"),
    decision: v.union(v.literal("accept"), v.literal("decline")),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "dm" ||
      chat.requestStatus !== "pending_request"
    ) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "No pending Message Request found.",
      });
    }

    if (chat.requestInitiatorId === viewer.actorStudent._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the recipient can accept or decline a Message Request.",
      });
    }

    if (!await getChatMembership(ctx, chat, viewer.actorStudent._id) || await isDirectMessageBlocked(ctx, chat)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "This Message Request cannot be changed." });
    }

    if (args.decision === "accept") {
      await ctx.db.patch(chat._id, {
        requestStatus: "active",
        requestInitiatorId: undefined,
        requestOpenerSeq: undefined,
      });
      return { requestStatus: "active" as const };
    }

    // Decline: record 30-day cold-request cooldown in interpersonalLedgers
    await ctx.db.patch(chat._id, {
      requestStatus: "declined",
    });

    if (chat.requestInitiatorId) {
      const pairKey = `${chat.requestInitiatorId}->${viewer.actorStudent._id}`;
      const existingLedger = await ctx.db
        .query("interpersonalLedgers")
        .withIndex("by_pair_kind", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("kind", "dm_decline_cooldown")
            .eq("pairKey", pairKey)
        )
        .unique();
      if (existingLedger) {
        await ctx.db.patch(existingLedger._id, {
          updatedAt: now,
          expiresAt: now + THIRTY_DAYS_MS,
        });
      } else {
        await ctx.db.insert("interpersonalLedgers", {
          workspaceKey: viewer.workspaceKey,
          kind: "dm_decline_cooldown",
          pairKey,
          updatedAt: now,
          expiresAt: now + THIRTY_DAYS_MS,
        });
      }
    }

    return { requestStatus: "declined" as const };
  },
});

export const sendMessage = viewerMutation({
  args: {
    chatId: v.id("chats"),
    body: v.string(),
    mediaAssetId: v.optional(v.id("mediaAssets")),
    replyToMessageId: v.optional(v.id("chatMessages")),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.workspaceKey !== viewer.workspaceKey) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Chat not found." });
    }

    const membership = await getChatMembership(ctx, chat, viewer.actorStudent._id);
    if (!membership) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You are not a member of this chat.",
      });
    }

    if (
      chat.requestStatus === "locked_readonly" ||
      chat.requestStatus === "declined" ||
      await isDirectMessageBlocked(ctx, chat) ||
      (chat.readonlyAfter !== undefined && now >= chat.readonlyAfter)
    ) {
      throw new ConvexError({
        code: "CHAT_LOCKED",
        message:
          "This conversation is locked read-only (convert Study Session chat to Closed Group Chat to continue).",
      });
    }

    // Cold Message Request rules: 1 text-only opener from initiator; recipient replying auto-accepts!
    if (chat.requestStatus === "pending_request") {
      if (args.mediaAssetId) {
        throw new ConvexError({
          code: "MEDIA_LOCKED_PENDING_REQUEST",
          message:
            "Image attachments are locked until the Message Request is accepted.",
        });
      }
      if (
        chat.requestInitiatorId === viewer.actorStudent._id &&
        chat.messageSeq > (chat.requestOpenerSeq ?? 0)
      ) {
        throw new ConvexError({
          code: "MESSAGE_REQUEST_CAP",
          message:
            "Wait for the recipient to accept your Message Request before sending another message.",
        });
      }
      if (chat.requestInitiatorId !== viewer.actorStudent._id) {
        await ctx.db.patch(chat._id, { requestStatus: "active", requestInitiatorId: undefined, requestOpenerSeq: undefined });
      }
    }

    const trimmed = args.body.trim();
    if (!trimmed && !args.mediaAssetId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Message cannot be empty.",
      });
    }
    if (trimmed.length > 2000) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Messages are limited to 2,000 characters.",
      });
    }
    if (trimmed) {
      assertPublishSafety(trimmed);
    }

    if (args.mediaAssetId) {
      const asset = await ctx.db.get(args.mediaAssetId);
      if (
        !asset ||
        asset.workspaceKey !== viewer.workspaceKey ||
        asset.ownerStudentId !== viewer.actorStudent._id || asset.purpose !== "chat" ||
        asset.status !== "pending" || asset.deleteClaimedAt !== undefined
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Invalid image attachment.",
        });
      }
      await ctx.db.patch(asset._id, { status: "attached" });
    }

    if (args.replyToMessageId) {
      const quoted = await ctx.db.get(args.replyToMessageId);
      if (!quoted || quoted.workspaceKey !== chat.workspaceKey || quoted.chatId !== chat._id ||
          quoted.visibilityStatus === "under_review" ||
          viewer.hiddenTargetKeys.has(makeTargetKey("chat_message", quoted._id)) ||
          (quoted.senderId && viewer.blockedStudentIds.has(quoted.senderId))) {
        throw new ConvexError({ code: "INVALID_TARGET", message: "This Chat message cannot be quoted." });
      }
    }

    const freshChat = (await ctx.db.get(chat._id))!;
    const messageId = await appendMessageAndFanoutUnread(ctx, {
      workspaceKey: viewer.workspaceKey,
      chat: freshChat,
      senderId: viewer.actorStudent._id,
      senderHandle: viewer.actorStudent.handle,
      messageType: "user",
      body: trimmed,
      mediaAssetId: args.mediaAssetId,
      replyToMessageId: args.replyToMessageId,
      now,
    });

    return {
      messageId,
      scamWarningTriggered:
        freshChat.kind === "deal" && detectDealScamWarning(trimmed),
    };
  },
});

export const toggleMessageReaction = viewerMutation({
  args: {
    messageId: v.id("chatMessages"),
    emoji: chatReactionEmojiValidator,
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.workspaceKey !== viewer.workspaceKey || msg.isDeleted ||
        msg.visibilityStatus === "under_review" ||
        viewer.hiddenTargetKeys.has(makeTargetKey("chat_message", msg._id))) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Message not available.",
      });
    }

    const chat = await ctx.db.get(msg.chatId);
    if (!chat || chat.workspaceKey !== viewer.workspaceKey ||
        !await getChatMembership(ctx, chat, viewer.actorStudent._id) ||
        await isDirectMessageBlocked(ctx, chat)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not a member." });
    }

    const nextReactions = msg.reactions.map((r) => ({
      emoji: r.emoji,
      studentIds: [...r.studentIds],
    }));
    const target = nextReactions.find((r) => r.emoji === args.emoji);
    if (!target) {
      nextReactions.push({
        emoji: args.emoji,
        studentIds: [viewer.actorStudent._id],
      });
    } else if (target.studentIds.includes(viewer.actorStudent._id)) {
      target.studentIds = target.studentIds.filter(
        (id) => id !== viewer.actorStudent._id
      );
    } else {
      target.studentIds.push(viewer.actorStudent._id);
    }

    await ctx.db.patch(msg._id, {
      reactions: nextReactions.filter((r) => r.studentIds.length > 0),
    });
    return { ok: true };
  },
});

export const editChatMessage = viewerMutation({
  args: {
    messageId: v.id("chatMessages"),
    body: v.string(),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const msg = await ctx.db.get(args.messageId);
    if (
      !msg ||
      msg.workspaceKey !== ctx.viewer.workspaceKey ||
      msg.senderId !== ctx.viewer.actorStudent._id ||
      msg.isDeleted
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only edit your own messages.",
      });
    }
    if (now - msg.publishedAt > FIVE_MINUTES_MS) {
      throw new ConvexError({
        code: "EDIT_WINDOW_EXPIRED",
        message: "Messages can only be edited within 5 minutes.",
      });
    }
    const trimmed = args.body.trim();
    if (!trimmed || trimmed.length > 2000) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Message body must be 1–2,000 characters.",
      });
    }
    assertPublishSafety(trimmed);

    const chat = await ctx.db.get(msg.chatId);
    if (!chat || chat.workspaceKey !== msg.workspaceKey || msg.visibilityStatus === "under_review" ||
        !await getChatMembership(ctx, chat, ctx.viewer.actorStudent._id) ||
        await isDirectMessageBlocked(ctx, chat)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You cannot edit this message." });
    }
    await ctx.db.patch(msg._id, {
      body: trimmed,
      linkEmbed: detectInternalKsuxLink(trimmed),
      scamWarningTriggered: Boolean(
        chat?.kind === "deal" && detectDealScamWarning(trimmed)
      ),
      editedAt: now,
    });
    await updateLatestMessagePreview(ctx, chat, { ...msg, body: trimmed });
    return { ok: true };
  },
});

export const deleteChatMessage = viewerMutation({
  args: {
    messageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (
      !msg ||
      msg.workspaceKey !== ctx.viewer.workspaceKey ||
      msg.senderId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own messages.",
      });
    }

    const chat = await ctx.db.get(msg.chatId);
    if (!chat || chat.workspaceKey !== msg.workspaceKey ||
        !await getChatMembership(ctx, chat, ctx.viewer.actorStudent._id)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "You cannot delete this message." });
    }

    if (msg.mediaAssetId) {
      const asset = await ctx.db.get(msg.mediaAssetId);
      if (asset && asset.workspaceKey === msg.workspaceKey && asset.ownerStudentId === msg.senderId) {
        await queueMediaDeletion(ctx, asset);
      }
    }

    await ctx.db.patch(msg._id, {
      isDeleted: true,
      body: "[Message deleted]",
      mediaAssetId: undefined,
      linkEmbed: undefined,
    });
    await updateLatestMessagePreview(ctx, chat, { ...msg, isDeleted: true });
    return { ok: true };
  },
});

export const createCustomGroupChat = viewerMutation({
  args: {
    title: v.string(),
    inviteHandles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const title = args.title.trim();
    if (title.length < 2 || title.length > 60) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Group Chat title must be 2–60 characters.",
      });
    }
    assertPublishSafety(title);

    const invitees: Doc<"students">[] = [];
    for (const rawHandle of (args.inviteHandles ?? []).slice(0, 49)) {
      const clean = rawHandle.trim().replace(/^@+/, "").toLowerCase();
      if (!clean) continue;
      const found = await ctx.db
        .query("students")
        .withIndex("by_workspace_handle", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("handleLower", clean)
        )
        .first();
      if (
        found &&
        found._id !== viewer.actorStudent._id &&
        found.accountStatus === "active" &&
        !viewer.blockedStudentIds.has(found._id) &&
        !invitees.some((x) => x._id === found._id)
      ) {
        invitees.push(found);
      }
    }

    const totalMembers = 1 + invitees.length;
    if (totalMembers > MAX_CUSTOM_GROUP_MEMBERS) {
      throw new ConvexError({
        code: "GROUP_CAP_EXCEEDED",
        message: "Invite-only custom Group Chats are capped at 50 Students.",
      });
    }

    const chatId = await ctx.db.insert("chats", {
      workspaceKey: viewer.workspaceKey,
      kind: "custom_group",
      requestStatus: "active",
      title,
      memberCount: totalMembers,
      messageSeq: 0,
      lastMessageAt: now,
    });

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId,
      studentId: viewer.actorStudent._id,
      chatKind: "custom_group",
      role: "owner",
      badgeMode: "count",
      lastReadSeq: 0,
      lastReadAt: now,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: now,
      joinedAt: now,
    });

    for (const inv of invitees) {
      await ctx.db.insert("chatMembers", {
        workspaceKey: viewer.workspaceKey,
        chatId,
        studentId: inv._id,
        chatKind: "custom_group",
        role: "member",
        badgeMode: "count",
        lastReadSeq: 0,
        lastReadAt: 0,
        hasUnread: false,
        isMuted: false,
        isArchived: false,
        lastChatMessageAt: now,
        joinedAt: now,
      });
    }

    return { chatId, memberCount: totalMembers };
  },
});

export const inviteToCustomGroup = viewerMutation({
  args: {
    chatId: v.id("chats"),
    inviteHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "custom_group"
    ) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "Invites are only available on custom Group Chats.",
      });
    }
    if (chat.memberCount >= MAX_CUSTOM_GROUP_MEMBERS) {
      throw new ConvexError({
        code: "GROUP_CAP_EXCEEDED",
        message: "Custom Group Chats are capped at 50 Students.",
      });
    }

    const myMembership = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("chatId", chat._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();
    if (!myMembership) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not a member." });
    }

    const clean = args.inviteHandle.trim().replace(/^@+/, "").toLowerCase();
    const invitee = await ctx.db
      .query("students")
      .withIndex("by_workspace_handle", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("handleLower", clean)
      )
      .first();
    if (!invitee || invitee.accountStatus !== "active") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `@${clean} not found.`,
      });
    }
    if (viewer.blockedStudentIds.has(invitee._id)) {
      throw new ConvexError({
        code: "BLOCKED",
        message: "Cannot invite a blocked Student.",
      });
    }

    const existing = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("chatId", chat._id)
          .eq("studentId", invitee._id)
      )
      .unique();
    if (existing) {
      return { memberCount: chat.memberCount };
    }

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId: chat._id,
      studentId: invitee._id,
      chatKind: "custom_group",
      role: "member",
      badgeMode: "count",
      lastReadSeq: chat.messageSeq,
      lastReadAt: 0,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: chat.lastMessageAt,
      joinedAt: now,
    });
    await ctx.db.patch(chat._id, { memberCount: chat.memberCount + 1 });

    return { memberCount: chat.memberCount + 1 };
  },
});

export const removeOrLeaveGroupChat = viewerMutation({
  args: {
    chatId: v.id("chats"),
    targetStudentId: v.optional(v.id("students")),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind === "dm" ||
      chat.kind === "deal"
    ) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "Invalid Group Chat.",
      });
    }

    const myMembership = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("chatId", chat._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();
    if (!myMembership) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not a member." });
    }

    const removeId = args.targetStudentId ?? viewer.actorStudent._id;
    if (
      removeId !== viewer.actorStudent._id &&
      myMembership.role !== "owner" &&
      myMembership.role !== "admin"
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only group owners/admins can remove members.",
      });
    }

    const targetMembership = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("chatId", chat._id)
          .eq("studentId", removeId)
      )
      .unique();

    if (targetMembership) {
      await ctx.db.delete(targetMembership._id);
      await ctx.db.patch(chat._id, {
        memberCount: Math.max(0, chat.memberCount - 1),
      });
    }
    return { ok: true };
  },
});

export const convertStudyChatToClosedGroup = viewerMutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "study_group"
    ) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "Only Study Session Group Chats can be upgraded.",
      });
    }

    const myMembership = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("chatId", chat._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();
    if (!myMembership) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not a member." });
    }

    await ctx.db.patch(chat._id, {
      kind: "custom_group",
      parentType: undefined,
      parentId: undefined,
      readonlyAfter: undefined,
      requestStatus: "active",
    });

    const members = await ctx.db
      .query("chatMembers")
      .withIndex("by_chat_student", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("chatId", chat._id)
      )
      .take(55);
    for (const m of members) {
      await ctx.db.patch(m._id, { chatKind: "custom_group" });
    }

    return { ok: true, kind: "custom_group" as const };
  },
});
