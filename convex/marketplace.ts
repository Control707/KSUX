import { ConvexError, v } from "convex/values";
import {
  campusFilterValidator,
  campusValidator,
  listingCategoryValidator,
  listingPricingModeValidator,
} from "./schema";
import { makeStudentPairKey } from "./lib/crypto";
import { assertPublishSafety } from "./lib/safety";
import {
  filterVisibleContent,
  isItemVisibleToViewer,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { appendMessageAndFanoutUnread } from "./chats";
import { Doc } from "./_generated/dataModel";

const MAX_ACTIVE_LISTINGS_PER_STUDENT = 15;
const MAX_DEAL_CHAT_PARTICIPANTS = 6;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const listMeetupSpots = viewerQuery({
  args: {
    campus: v.optional(campusValidator),
  },
  handler: async (ctx, args) => {
    if (args.campus) {
      return ctx.db
        .query("meetupSpots")
        .withIndex("by_campus_order", (q) => q.eq("campus", args.campus!))
        .take(20);
    }
    const [k, m] = await Promise.all([
      ctx.db
        .query("meetupSpots")
        .withIndex("by_campus_order", (q) => q.eq("campus", "Kennesaw"))
        .take(10),
      ctx.db
        .query("meetupSpots")
        .withIndex("by_campus_order", (q) => q.eq("campus", "Marietta"))
        .take(10),
    ]);
    return [...k, ...m];
  },
});

export const listListings = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    category: v.optional(listingCategoryValidator),
    pricingMode: v.optional(listingPricingModeValidator),
    queryText: v.optional(v.string()),
    onlyMine: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;
    const limit = Math.min(args.limit ?? 25, 25);
    const qText = args.queryText?.trim();

    let rawDocs: Doc<"listings">[];

    if (args.onlyMine) {
      rawDocs = await ctx.db
        .query("listings")
        .withIndex("by_seller", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("sellerId", viewer.actorStudent._id)
        )
        .order("desc")
        .take(limit);
    } else if (qText) {
      rawDocs = await ctx.db
        .query("listings")
        .withSearchIndex("search_listings", (q) => {
          let sq = q
            .search("searchText", qText)
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("isBrowseable", true);
          if (campusFilter !== "All KSU") {
            sq = sq.eq("campus", campusFilter);
          }
          if (args.category) {
            sq = sq.eq("category", args.category);
          }
          return sq;
        })
        .take(limit);
    } else if (campusFilter === "All KSU") {
      rawDocs = await ctx.db
        .query("listings")
        .withIndex("by_all_browse", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("isBrowseable", true)
        )
        .order("desc")
        .take(limit);
    } else if (args.category) {
      rawDocs = await ctx.db
        .query("listings")
        .withIndex("by_campus_category", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("isBrowseable", true)
            .eq("campus", campusFilter)
            .eq("category", args.category!)
        )
        .order("desc")
        .take(limit);
    } else {
      rawDocs = await ctx.db
        .query("listings")
        .withIndex("by_campus_browse", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("isBrowseable", true)
            .eq("campus", campusFilter)
        )
        .order("desc")
        .take(limit);
    }

    const visibleDocs = args.onlyMine
      ? rawDocs.filter((l) => l.visibilityStatus !== "removed")
      : filterVisibleContent(rawDocs, viewer, {
          targetType: "listing",
          getAuthorId: (l) => l.sellerId,
        }).filter((l) => {
          if (l.expiresAt <= now && l.status === "available") return false;
          if (args.category && l.category !== args.category) return false;
          if (args.pricingMode && l.pricingMode !== args.pricingMode)
            return false;
          return true;
        });

    return Promise.all(
      visibleDocs.map(async (listing) => {
        const [sellerDoc, mediaDocs, bookmarkRow, existingDealChat] =
          await Promise.all([
            ctx.db.get(listing.sellerId),
            Promise.all(listing.mediaAssetIds.map((id) => ctx.db.get(id))),
            ctx.db
              .query("savedInteractions")
              .withIndex("by_student_kind_target", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("studentId", viewer.actorStudent._id)
                  .eq("kind", "listing_bookmark")
                  .eq("targetId", String(listing._id))
              )
              .unique(),
            ctx.db
              .query("chats")
              .withIndex("by_deal_key", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq(
                    "dealListingBuyerKey",
                    `${listing._id}:${viewer.actorStudent._id}`
                  )
              )
              .unique(),
          ]);

        return {
          _id: listing._id,
          seller: toPublicStudent(sellerDoc),
          isOwnListing: listing.sellerId === viewer.actorStudent._id,
          campus: listing.campus,
          category: listing.category,
          pricingMode: listing.pricingMode,
          priceCents: listing.priceCents,
          tradeNote: listing.tradeNote,
          title: listing.title,
          description: listing.description,
          mediaUrls: mediaDocs
            .filter((m): m is Doc<"mediaAssets"> =>
              Boolean(m && m.status !== "deleted")
            )
            .map((m) => m.url),
          status:
            listing.status === "available" && listing.expiresAt <= now
              ? ("expired" as const)
              : listing.status,
          bookmarkCount: listing.bookmarkCount,
          bookmarkedByViewer: Boolean(bookmarkRow),
          myDealChatId: existingDealChat?._id ?? null,
          publishedAt: listing.publishedAt,
          expiresAt: listing.expiresAt,
        };
      })
    );
  },
});

export const createListing = viewerMutation({
  args: {
    title: v.string(),
    description: v.string(),
    campus: campusValidator,
    category: listingCategoryValidator,
    pricingMode: listingPricingModeValidator,
    priceCents: v.optional(v.number()),
    tradeNote: v.optional(v.string()),
    mediaAssetIds: v.optional(v.array(v.id("mediaAssets"))),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowOverride ?? Date.now();
    const { viewer } = ctx;
    const title = args.title.trim();
    const description = args.description.trim();

    if (title.length < 3 || title.length > 100) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Listing title must be 3–100 characters.",
      });
    }
    if (description.length < 5 || description.length > 1500) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Listing description must be 5–1,500 characters.",
      });
    }

    assertPublishSafety(`${title} ${description} ${args.tradeNote ?? ""}`, {
      isMarketplaceListing: true,
    });

    if (
      args.pricingMode === "fixed_obo" &&
      (args.priceCents === undefined || args.priceCents <= 0)
    ) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Enter a positive dollar price for $ Price / OBO Listings.",
      });
    }

    const mediaIds = args.mediaAssetIds ?? [];
    if (mediaIds.length > 4) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Attach at most 4 WebP photos per Listing.",
      });
    }
    for (const mid of mediaIds) {
      const asset = await ctx.db.get(mid);
      if (
        !asset ||
        asset.workspaceKey !== viewer.workspaceKey ||
        asset.ownerStudentId !== viewer.actorStudent._id
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Invalid photo attachment.",
        });
      }
      await ctx.db.patch(asset._id, { status: "attached" });
    }

    // Enforce <= 15 active Listings per Student
    const myListings = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("sellerId", viewer.actorStudent._id)
      )
      .take(40);
    const activeCount = myListings.filter(
      (l) =>
        (l.status === "available" || l.status === "pending") &&
        l.expiresAt > now
    ).length;

    if (activeCount >= MAX_ACTIVE_LISTINGS_PER_STUDENT) {
      throw new ConvexError({
        code: "LISTING_CAP_REACHED",
        message: "Active Marketplace Listings are capped at 15 per Student.",
      });
    }

    const listingId = await ctx.db.insert("listings", {
      workspaceKey: viewer.workspaceKey,
      sellerId: viewer.actorStudent._id,
      campus: args.campus,
      category: args.category,
      pricingMode: args.pricingMode,
      priceCents:
        args.pricingMode === "fixed_obo" ? Math.round(args.priceCents!) : undefined,
      tradeNote:
        args.pricingMode === "open_to_trade"
          ? args.tradeNote?.trim().slice(0, 200)
          : undefined,
      title,
      description,
      searchText: `${title} ${description} ${args.category} ${args.campus}`,
      mediaAssetIds: mediaIds,
      status: "available",
      visibilityStatus: "visible",
      isBrowseable: true,
      buyerConfirmedPickup: false,
      bookmarkCount: 0,
      publishedAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    });

    return { listingId };
  },
});

export const renewListing = viewerMutation({
  args: {
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const listing = await ctx.db.get(args.listingId);
    if (
      !listing ||
      listing.workspaceKey !== ctx.viewer.workspaceKey ||
      listing.sellerId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the seller can renew this Listing.",
      });
    }
    if (listing.status === "sold" || listing.status === "removed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Sold or removed Listings cannot be renewed.",
      });
    }
    await ctx.db.patch(listing._id, {
      status: "available",
      isBrowseable: listing.visibilityStatus === "visible",
      expiresAt: now + THIRTY_DAYS_MS,
    });
    return { ok: true, expiresAt: now + THIRTY_DAYS_MS };
  },
});

export const toggleListingBookmark = viewerMutation({
  args: {
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const listing = await ctx.db.get(args.listingId);
    if (
      !listing ||
      listing.workspaceKey !== viewer.workspaceKey ||
      !isItemVisibleToViewer(viewer, {
        targetType: "listing",
        targetId: String(listing._id),
        authorId: listing.sellerId,
        visibilityStatus: listing.visibilityStatus,
      })
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Listing not available.",
      });
    }

    const existing = await ctx.db
      .query("savedInteractions")
      .withIndex("by_student_kind_target", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("kind", "listing_bookmark")
          .eq("targetId", String(listing._id))
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(listing._id, {
        bookmarkCount: Math.max(0, listing.bookmarkCount - 1),
      });
      return { bookmarked: false };
    }

    await ctx.db.insert("savedInteractions", {
      workspaceKey: viewer.workspaceKey,
      studentId: viewer.actorStudent._id,
      kind: "listing_bookmark",
      targetId: String(listing._id),
      createdAt: Date.now(),
    });
    await ctx.db.patch(listing._id, {
      bookmarkCount: listing.bookmarkCount + 1,
    });
    return { bookmarked: true };
  },
});

export const openOrResumeDealChat = viewerMutation({
  args: {
    listingId: v.id("listings"),
    openerMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const listing = await ctx.db.get(args.listingId);
    if (
      !listing ||
      listing.workspaceKey !== viewer.workspaceKey ||
      listing.visibilityStatus !== "visible"
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Listing not available.",
      });
    }

    if (listing.sellerId === viewer.actorStudent._id) {
      throw new ConvexError({
        code: "SELF_DEAL_FORBIDDEN",
        message: "You cannot open a buyer Deal Chat on your own Listing.",
      });
    }

    if (viewer.blockedStudentIds.has(listing.sellerId)) {
      throw new ConvexError({
        code: "BLOCKED",
        message: "Deal Chats are unavailable between blocked Students.",
      });
    }

    const dealKey = `${listing._id}:${viewer.actorStudent._id}`;
    const existing = await ctx.db
      .query("chats")
      .withIndex("by_deal_key", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("dealListingBuyerKey", dealKey)
      )
      .unique();

    if (existing) {
      return { chatId: existing._id, created: false };
    }

    if (listing.status !== "available" && listing.status !== "pending") {
      throw new ConvexError({
        code: "LISTING_CLOSED",
        message: "This Listing is no longer accepting new Deal Chats.",
      });
    }

    const chatId = await ctx.db.insert("chats", {
      workspaceKey: viewer.workspaceKey,
      kind: "deal",
      dealListingBuyerKey: dealKey,
      requestStatus: "active",
      title: listing.title,
      listingId: listing._id,
      primarySellerId: listing.sellerId,
      primaryBuyerId: viewer.actorStudent._id,
      memberCount: 2,
      messageSeq: 0,
      lastMessageAt: now,
    });

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId,
      studentId: viewer.actorStudent._id,
      chatKind: "deal",
      role: "primary_buyer",
      badgeMode: "count",
      lastReadSeq: 0,
      lastReadAt: now,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: now,
      joinedAt: now,
    });

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId,
      studentId: listing.sellerId,
      chatKind: "deal",
      role: "primary_seller",
      badgeMode: "count",
      lastReadSeq: 0,
      lastReadAt: 0,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: now,
      joinedAt: now,
    });

    if (args.openerMessage && args.openerMessage.trim()) {
      const trimmed = args.openerMessage.trim();
      assertPublishSafety(trimmed);
      const chatDoc = (await ctx.db.get(chatId))!;
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

    return { chatId, created: true };
  },
});

export const inviteDealCoParty = viewerMutation({
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
      chat.kind !== "deal"
    ) {
      throw new ConvexError({
        code: "INVALID_TARGET",
        message: "Deal Chat not found.",
      });
    }

    const existingMembers = await ctx.db
      .query("chatMembers")
      .filter((q) =>
        q.and(
          q.eq(q.field("workspaceKey"), viewer.workspaceKey),
          q.eq(q.field("chatId"), chat._id)
        )
      )
      .take(10);

    if (!existingMembers.some((m) => m.studentId === viewer.actorStudent._id)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only Deal Chat participants can invite a co-buyer or co-seller.",
      });
    }

    if (existingMembers.length >= MAX_DEAL_CHAT_PARTICIPANTS) {
      throw new ConvexError({
        code: "CO_PARTY_CAP_REACHED",
        message: "Deal Chats support up to 6 total participants.",
      });
    }

    const cleanHandle = args.inviteHandle
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    const invitee = await ctx.db
      .query("students")
      .withIndex("by_workspace_handle", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("handleLower", cleanHandle)
      )
      .first();

    if (!invitee || invitee.accountStatus !== "active") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `@${cleanHandle} not found.`,
      });
    }

    if (existingMembers.some((m) => m.studentId === invitee._id)) {
      return { memberCount: existingMembers.length };
    }

    // Check mutual Block against EVERY existing participant in the Deal Chat!
    for (const member of existingMembers) {
      const pairKey = makeStudentPairKey(
        String(member.studentId),
        String(invitee._id)
      );
      const blockEdge = await ctx.db
        .query("studentBlocks")
        .withIndex("by_pair", (q) =>
          q.eq("workspaceKey", viewer.workspaceKey).eq("pairKey", pairKey)
        )
        .first();
      if (blockEdge) {
        throw new ConvexError({
          code: "BLOCKED",
          message:
            "Cannot invite this Student due to a mutual Block with an existing Deal Chat participant.",
        });
      }
    }

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId: chat._id,
      studentId: invitee._id,
      chatKind: "deal",
      role: "co_party",
      badgeMode: "count",
      lastReadSeq: chat.messageSeq,
      lastReadAt: 0,
      hasUnread: true,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: now,
      joinedAt: now,
    });

    const nextCount = existingMembers.length + 1;
    await ctx.db.patch(chat._id, { memberCount: nextCount });

    const freshChat = (await ctx.db.get(chat._id))!;
    await appendMessageAndFanoutUnread(ctx, {
      workspaceKey: viewer.workspaceKey,
      chat: freshChat,
      senderId: viewer.actorStudent._id,
      senderHandle: viewer.actorStudent.handle,
      messageType: "system",
      body: `@${viewer.actorStudent.handle} invited @${invitee.handle} as a co-party.`,
      now,
    });

    return { memberCount: nextCount };
  },
});

export const proposeOrUpdateHandoffCard = viewerMutation({
  args: {
    chatId: v.id("chats"),
    meetupSpotId: v.id("meetupSpots"),
    proposedWindow: v.string(),
    agreedTerms: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "deal"
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deal Chat not found.",
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

    const spot = await ctx.db.get(args.meetupSpotId);
    if (!spot) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Select one of the 14 vetted public KSU Meetup Spots.",
      });
    }

    const proposedWindow = args.proposedWindow.trim().slice(0, 100);
    const agreedTerms = args.agreedTerms.trim().slice(0, 200);
    assertPublishSafety(`${proposedWindow} ${agreedTerms}`);

    await ctx.db.patch(chat._id, {
      handoffCard: {
        meetupSpotId: spot._id,
        meetupSpotSlug: spot.slug,
        meetupSpotName: spot.name,
        meetupCampus: spot.campus,
        safetyNotes: spot.safetyNotes,
        proposedWindow,
        agreedTerms,
        proposedById: viewer.actorStudent._id,
        confirmedByIds: [viewer.actorStudent._id],
        status: "proposed",
        updatedAt: now,
      },
    });

    const freshChat = (await ctx.db.get(chat._id))!;
    await appendMessageAndFanoutUnread(ctx, {
      workspaceKey: viewer.workspaceKey,
      chat: freshChat,
      senderId: viewer.actorStudent._id,
      senderHandle: viewer.actorStudent.handle,
      messageType: "handoff_update",
      body: `Proposed Meetup Spot: ${spot.name} (${spot.campus}) · ${proposedWindow} · ${agreedTerms}`,
      now,
    });

    return { status: "proposed" as const };
  },
});

export const confirmHandoffMeetup = viewerMutation({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "deal" ||
      !chat.handoffCard
    ) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "No Handoff Card proposed yet.",
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

    const card = chat.handoffCard;
    const nextConfirmed = card.confirmedByIds.includes(viewer.actorStudent._id)
      ? card.confirmedByIds
      : [...card.confirmedByIds, viewer.actorStudent._id];

    const isCounterpartyConfirmed = nextConfirmed.some(
      (id) => id !== card.proposedById
    );
    const nextStatus =
      card.status === "completed"
        ? "completed"
        : isCounterpartyConfirmed
          ? "confirmed"
          : "proposed";

    await ctx.db.patch(chat._id, {
      handoffCard: {
        ...card,
        confirmedByIds: nextConfirmed,
        status: nextStatus,
        updatedAt: now,
      },
    });

    const freshChat = (await ctx.db.get(chat._id))!;
    await appendMessageAndFanoutUnread(ctx, {
      workspaceKey: viewer.workspaceKey,
      chat: freshChat,
      senderId: viewer.actorStudent._id,
      senderHandle: viewer.actorStudent.handle,
      messageType: "handoff_update",
      body: `✓ Confirmed Meetup at ${card.meetupSpotName} (${card.proposedWindow})`,
      now,
    });

    return { status: nextStatus };
  },
});

export const transitionListingStatus = viewerMutation({
  args: {
    listingId: v.id("listings"),
    nextStatus: v.union(
      v.literal("available"),
      v.literal("pending"),
      v.literal("sold")
    ),
    dealChatId: v.optional(v.id("chats")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const listing = await ctx.db.get(args.listingId);
    if (!listing || listing.workspaceKey !== viewer.workspaceKey) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Listing not found.",
      });
    }

    // Strictly primary Listing seller only!
    if (listing.sellerId !== viewer.actorStudent._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "Only the primary Listing seller can transition Available, Pending, or Sold.",
      });
    }

    if (args.nextStatus === "available") {
      await ctx.db.patch(listing._id, {
        status: "available",
        isBrowseable: listing.visibilityStatus === "visible",
        activeDealChatId: undefined,
      });
      return { status: "available" as const };
    }

    if (args.nextStatus === "pending") {
      if (!args.dealChatId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Select the Deal Chat to mark Pending.",
        });
      }
      const chosenChat = await ctx.db.get(args.dealChatId);
      if (
        !chosenChat ||
        chosenChat.workspaceKey !== viewer.workspaceKey ||
        chosenChat.listingId !== listing._id
      ) {
        throw new ConvexError({
          code: "INVALID_TARGET",
          message: "Deal Chat does not belong to this Listing.",
        });
      }

      await ctx.db.patch(listing._id, {
        status: "pending",
        isBrowseable: listing.visibilityStatus === "visible",
        activeDealChatId: chosenChat._id,
      });

      await appendMessageAndFanoutUnread(ctx, {
        workspaceKey: viewer.workspaceKey,
        chat: chosenChat,
        senderId: viewer.actorStudent._id,
        senderHandle: viewer.actorStudent.handle,
        messageType: "handoff_update",
        body: "Seller marked this Listing Pending for your handoff.",
        now,
      });

      // Post privacy-safe notice in competing Deal Chats without leaking the winning buyer!
      const allDealChats = await ctx.db
        .query("chats")
        .withIndex("by_listing", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("listingId", listing._id)
        )
        .take(30);

      for (const rival of allDealChats) {
        if (rival._id === chosenChat._id) continue;
        await appendMessageAndFanoutUnread(ctx, {
          workspaceKey: viewer.workspaceKey,
          chat: rival,
          messageType: "system",
          body: "Update: Seller marked this Listing Pending for an upcoming meetup. You will be notified if it becomes Available again.",
          now,
        });
      }

      return { status: "pending" as const };
    }

    // Sold transition (completedDealCount does NOT increment until primaryBuyer taps Confirm Pickup!)
    const winningChatId = args.dealChatId ?? listing.activeDealChatId;
    await ctx.db.patch(listing._id, {
      status: "sold",
      isBrowseable: false,
      soldDealChatId: winningChatId,
    });

    if (winningChatId) {
      const winChat = await ctx.db.get(winningChatId);
      if (winChat && winChat.workspaceKey === viewer.workspaceKey) {
        await appendMessageAndFanoutUnread(ctx, {
          workspaceKey: viewer.workspaceKey,
          chat: winChat,
          senderId: viewer.actorStudent._id,
          senderHandle: viewer.actorStudent.handle,
          messageType: "handoff_update",
          body: "Seller marked this Listing Sold! Primary buyer: tap 'Confirm Pickup' once you receive the item.",
          now,
        });
      }
    }

    return { status: "sold" as const };
  },
});

export const confirmBuyerPickup = viewerMutation({
  args: {
    chatId: v.id("chats"),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowOverride ?? Date.now();
    const { viewer } = ctx;
    const chat = await ctx.db.get(args.chatId);
    if (
      !chat ||
      chat.workspaceKey !== viewer.workspaceKey ||
      chat.kind !== "deal" ||
      !chat.listingId ||
      !chat.primarySellerId ||
      !chat.primaryBuyerId
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Deal Chat not found.",
      });
    }

    // Strictly primaryBuyer only!
    if (viewer.actorStudent._id !== chat.primaryBuyerId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the primary buyer can Confirm Pickup.",
      });
    }

    const listing = await ctx.db.get(chat.listingId);
    if (
      !listing ||
      listing.status !== "sold" ||
      listing.soldDealChatId !== chat._id
    ) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message:
          "The seller must mark this Listing Sold to your Deal Chat before Confirm Pickup.",
      });
    }

    if (listing.buyerConfirmedPickup) {
      return { ok: true, trustIncremented: false };
    }

    await ctx.db.patch(listing._id, {
      buyerConfirmedPickup: true,
    });

    if (chat.handoffCard) {
      await ctx.db.patch(chat._id, {
        handoffCard: {
          ...chat.handoffCard,
          status: "completed",
          updatedAt: now,
        },
      });
    }

    // 1 / 7d pair trust-count throttle in interpersonalLedgers
    const pairKey = makeStudentPairKey(
      String(chat.primarySellerId),
      String(chat.primaryBuyerId)
    );
    const pairLedger = await ctx.db
      .query("interpersonalLedgers")
      .withIndex("by_pair_kind", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("kind", "marketplace_trust_pair")
          .eq("pairKey", pairKey)
      )
      .unique();

    let trustIncremented = false;
    if (!pairLedger || pairLedger.expiresAt <= now) {
      const [sellerDoc, buyerDoc] = await Promise.all([
        ctx.db.get(chat.primarySellerId),
        ctx.db.get(chat.primaryBuyerId),
      ]);
      if (sellerDoc) {
        await ctx.db.patch(sellerDoc._id, {
          completedDealCount: sellerDoc.completedDealCount + 1,
        });
      }
      if (buyerDoc) {
        await ctx.db.patch(buyerDoc._id, {
          completedDealCount: buyerDoc.completedDealCount + 1,
        });
      }

      if (pairLedger) {
        await ctx.db.patch(pairLedger._id, {
          updatedAt: now,
          expiresAt: now + SEVEN_DAYS_MS,
        });
      } else {
        await ctx.db.insert("interpersonalLedgers", {
          workspaceKey: viewer.workspaceKey,
          kind: "marketplace_trust_pair",
          pairKey,
          updatedAt: now,
          expiresAt: now + SEVEN_DAYS_MS,
        });
      }
      trustIncremented = true;
    }

    const freshChat = (await ctx.db.get(chat._id))!;
    await appendMessageAndFanoutUnread(ctx, {
      workspaceKey: viewer.workspaceKey,
      chat: freshChat,
      senderId: viewer.actorStudent._id,
      senderHandle: viewer.actorStudent.handle,
      messageType: "handoff_update",
      body: "🎉 Pickup confirmed by buyer! Handoff completed.",
      now,
    });

    return { ok: true, trustIncremented };
  },
});

export const listSellerDealChatsForListing = viewerQuery({
  args: {
    listingId: v.id("listings"),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (
      !listing ||
      listing.workspaceKey !== ctx.viewer.workspaceKey ||
      listing.sellerId !== ctx.viewer.actorStudent._id
    ) {
      return [];
    }

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_listing", (q) =>
        q
          .eq("workspaceKey", ctx.viewer.workspaceKey)
          .eq("listingId", listing._id)
      )
      .take(25);

    return Promise.all(
      chats.map(async (c) => {
        const buyer = c.primaryBuyerId
          ? await ctx.db.get(c.primaryBuyerId)
          : null;
        return {
          _id: c._id,
          buyer: toPublicStudent(buyer),
          handoffStatus: c.handoffCard?.status ?? null,
          lastMessagePreview: c.lastMessagePreview,
        };
      })
    );
  },
});
