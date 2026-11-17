import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const campusValidator = v.union(
  v.literal("Kennesaw"),
  v.literal("Marietta")
);

export const campusFilterValidator = v.union(
  v.literal("Kennesaw"),
  v.literal("Marietta"),
  v.literal("All KSU")
);

export const campusScopeValidator = v.union(
  v.literal("Kennesaw"),
  v.literal("Marietta"),
  v.literal("Both")
);

export const listingCategoryValidator = v.union(
  v.literal("textbooks_gear"),
  v.literal("electronics"),
  v.literal("dorm_furniture"),
  v.literal("subleases_housing"),
  v.literal("services_tutoring")
);

export const listingPricingModeValidator = v.union(
  v.literal("fixed_obo"),
  v.literal("free_pickup"),
  v.literal("open_to_trade")
);

export const citationPillValidator = v.object({
  entityType: v.string(),
  entityId: v.string(),
  label: v.string(),
  href: v.string(),
  campus: v.optional(v.string()),
});

export const draftCardValidator = v.object({
  draftKind: v.union(
    v.literal("post"),
    v.literal("listing"),
    v.literal("parking_report"),
    v.literal("study_session")
  ),
  title: v.string(),
  summary: v.string(),
  payloadJson: v.string(),
});

export const postEmbedValidator = v.object({
  entityType: v.union(
    v.literal("listing"),
    v.literal("event"),
    v.literal("study_session"),
    v.literal("parking_lot")
  ),
  entityId: v.string(),
  title: v.string(),
  subtitle: v.optional(v.string()),
  campus: v.optional(campusValidator),
  href: v.string(),
});

export const handoffCardValidator = v.object({
  meetupSpotId: v.id("meetupSpots"),
  meetupSpotSlug: v.string(),
  meetupSpotName: v.string(),
  meetupCampus: campusValidator,
  safetyNotes: v.string(),
  proposedWindow: v.string(),
  agreedTerms: v.string(),
  proposedById: v.id("students"),
  confirmedByIds: v.array(v.id("students")),
  status: v.union(
    v.literal("proposed"),
    v.literal("confirmed"),
    v.literal("completed")
  ),
  updatedAt: v.number(),
});

export const chatReactionEmojiValidator = v.union(
  v.literal("🦉"),
  v.literal("👍"),
  v.literal("❤️"),
  v.literal("😂"),
  v.literal("🔥")
);

export default defineSchema({
  // =========================================================================
  // A. Identity, .edu OTP, Sessions, Tombstones & Moderation (7 Tables)
  // =========================================================================

  students: defineTable({
    workspaceKey: v.string(),
    canonicalEmail: v.optional(v.string()),
    emailDomainBadge: v.union(
      v.literal("verified_student"),
      v.literal("faculty_staff")
    ),
    handle: v.string(),
    handleLower: v.string(),
    displayName: v.string(),
    searchText: v.string(),
    homeCampus: campusValidator,
    activeCampusFilter: campusFilterValidator,
    major: v.optional(v.string()),
    classYear: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    avatarAssetId: v.optional(v.id("mediaAssets")),
    permitTier: v.optional(v.string()),
    pinnedParkingLotIds: v.array(v.id("parkingLots")),
    completedDealCount: v.number(),
    onboardingCompleted: v.optional(v.boolean()),
    accountStatus: v.union(
      v.literal("active"),
      v.literal("deleted"),
      v.literal("suspended")
    ),
    lastHandleChangedAt: v.optional(v.number()),
    visibilityStatus: v.optional(v.union(v.literal("visible"), v.literal("under_review"))),
    joinedAt: v.number(),
  })
    .index("by_workspace_handle", ["workspaceKey", "handleLower"])
    .index("by_prod_email", ["workspaceKey", "canonicalEmail"])
    .searchIndex("search_students", {
      searchField: "searchText",
      filterFields: ["workspaceKey", "accountStatus", "homeCampus"],
    }),

  emailOtps: defineTable({
    canonicalEmail: v.string(),
    codeHash: v.string(),
    attempts: v.number(),
    ipHash: v.string(),
    invalidated: v.optional(v.boolean()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_email", ["canonicalEmail", "createdAt"])
    .index("by_expires", ["expiresAt"]),

  studentSessions: defineTable({
    tokenHash: v.string(),
    studentId: v.id("students"),
    createdAt: v.number(),
    lastRefreshedAt: v.number(),
    expiresAt: v.number(),
    userAgent: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_student", ["studentId"])
    .index("by_expires", ["expiresAt"]),

  demoSessions: defineTable({
    shortCode: v.string(),
    defaultPersonaHandle: v.string(),
    uploadCount: v.number(),
    createdAt: v.number(),
    lastActiveAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_short_code", ["shortCode"])
    .index("by_expires", ["expiresAt"]),

  handleReservations: defineTable({
    workspaceKey: v.string(),
    handleLower: v.string(),
    reason: v.union(
      v.literal("deleted"),
      v.literal("suspended"),
      v.literal("renamed")
    ),
    blockedEmailHash: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_workspace_handle", ["workspaceKey", "handleLower"])
    .index("by_blocked_email_hash", ["workspaceKey", "blockedEmailHash"])
    .index("by_expires", ["expiresAt"]),

  studentBlocks: defineTable({
    workspaceKey: v.string(),
    blockerId: v.id("students"),
    blockedId: v.id("students"),
    pairKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_blocker", ["workspaceKey", "blockerId"])
    .index("by_blocked", ["workspaceKey", "blockedId"])
    .index("by_pair", ["workspaceKey", "pairKey"]),

  moderationReports: defineTable({
    workspaceKey: v.string(),
    reporterId: v.id("students"),
    targetType: v.union(
      v.literal("post"),
      v.literal("listing"),
      v.literal("study_session"),
      v.literal("student"),
      v.literal("chat_message")
    ),
    targetKey: v.string(),
    reason: v.union(
      v.literal("harassment"),
      v.literal("scam_spam"),
      v.literal("prohibited_item"),
      v.literal("impersonation"),
      v.literal("campus_safety")
    ),
    notes: v.optional(v.string()),
    queueStatus: v.union(
      v.literal("open"),
      v.literal("quarantined"),
      v.literal("restored"),
      v.literal("removed")
    ),
    reviewedById: v.optional(v.id("students")),
    createdAt: v.number(),
  })
    .index("by_reporter", ["workspaceKey", "reporterId"])
    .index("by_target", ["workspaceKey", "targetKey"])
    .index("by_queue", ["workspaceKey", "queueStatus", "createdAt"]),

  // =========================================================================
  // B. Social Feed, Unified Saved Interactions & Trending Topics (4 Tables)
  // =========================================================================

  studentFollows: defineTable({
    workspaceKey: v.string(),
    followerId: v.id("students"),
    followeeId: v.id("students"),
    createdAt: v.number(),
  })
    .index("by_follower", ["workspaceKey", "followerId"])
    .index("by_followee", ["workspaceKey", "followeeId"])
    .index("by_pair", ["workspaceKey", "followerId", "followeeId"]),

  posts: defineTable({
    workspaceKey: v.string(),
    authorId: v.id("students"),
    authorIsScrappy: v.boolean(),
    campus: campusValidator,
    courseHubId: v.optional(v.id("courseHubs")),
    authorSectionId: v.optional(v.id("courseSections")),
    clubId: v.optional(v.id("clubs")),
    crossPostToCampusFeed: v.boolean(),
    showInCampusFeed: v.boolean(),
    body: v.string(),
    searchText: v.string(),
    tags: v.array(v.string()),
    mediaAssetIds: v.array(v.id("mediaAssets")),
    embed: v.optional(postEmbedValidator),
    rootPostId: v.optional(v.id("posts")),
    replyToPostId: v.optional(v.id("posts")),
    quotedPostId: v.optional(v.id("posts")),
    repostOfPostId: v.optional(v.id("posts")),
    likeCount: v.number(),
    replyCount: v.number(),
    repostCount: v.number(),
    hotScore: v.number(),
    scrappyStatus: v.optional(
      v.union(
        v.literal("thinking"),
        v.literal("ready"),
        v.literal("error")
      )
    ),
    scrappyTriggerAuthorId: v.optional(v.id("students")),
    scrappyCitations: v.optional(v.array(citationPillValidator)),
    scrappyToolMeta: v.optional(v.string()),
    visibilityStatus: v.union(
      v.literal("visible"),
      v.literal("under_review"),
      v.literal("deleted_tombstone"),
      v.literal("removed")
    ),
    publishedAt: v.number(),
    editedAt: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_campus_feed", [
      "workspaceKey",
      "showInCampusFeed",
      "campus",
      "publishedAt",
    ])
    .index("by_all_feed", ["workspaceKey", "showInCampusFeed", "publishedAt"])
    .index("by_campus_trending", [
      "workspaceKey",
      "showInCampusFeed",
      "campus",
      "hotScore",
    ])
    .index("by_all_trending", ["workspaceKey", "showInCampusFeed", "hotScore"])
    .index("by_course_hub", [
      "workspaceKey",
      "courseHubId",
      "visibilityStatus",
      "publishedAt",
    ])
    .index("by_club", [
      "workspaceKey",
      "clubId",
      "visibilityStatus",
      "publishedAt",
    ])
    .index("by_author", [
      "workspaceKey",
      "authorId",
      "visibilityStatus",
      "publishedAt",
    ])
    .index("by_thread", ["workspaceKey", "rootPostId", "publishedAt"])
    .searchIndex("search_posts", {
      searchField: "searchText",
      filterFields: [
        "workspaceKey",
        "visibilityStatus",
        "campus",
        "courseHubId",
        "clubId",
      ],
    })
    .vectorIndex("vector_posts", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: [
        "workspaceKey",
        "visibilityStatus",
        "campus",
        "courseHubId",
      ],
    }),

  savedInteractions: defineTable({
    workspaceKey: v.string(),
    studentId: v.id("students"),
    kind: v.union(
      v.literal("post_like"),
      v.literal("post_bookmark"),
      v.literal("listing_bookmark")
    ),
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_student_kind_target", [
      "workspaceKey",
      "studentId",
      "kind",
      "targetId",
    ])
    .index("by_student_kind_time", [
      "workspaceKey",
      "studentId",
      "kind",
      "createdAt",
    ])
    .index("by_target_kind", ["workspaceKey", "targetId", "kind"]),

  hashtagDailyCounts: defineTable({
    workspaceKey: v.string(),
    dayKey: v.string(),
    campusScope: v.union(
      v.literal("Kennesaw"),
      v.literal("Marietta"),
      v.literal("All")
    ),
    tag: v.string(),
    count: v.number(),
  })
    .index("by_day_campus_count", [
      "workspaceKey",
      "dayKey",
      "campusScope",
      "count",
    ])
    .index("by_day_campus_tag", [
      "workspaceKey",
      "dayKey",
      "campusScope",
      "tag",
    ]),

  // =========================================================================
  // C. Marketplace Listings, Meetup Spots, Unified Chats & VAPID Push (6 Tables)
  // =========================================================================

  listings: defineTable({
    workspaceKey: v.string(),
    sellerId: v.id("students"),
    campus: campusValidator,
    category: listingCategoryValidator,
    pricingMode: listingPricingModeValidator,
    priceCents: v.optional(v.number()),
    tradeNote: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    searchText: v.string(),
    mediaAssetIds: v.array(v.id("mediaAssets")),
    status: v.union(
      v.literal("available"),
      v.literal("pending"),
      v.literal("sold"),
      v.literal("expired"),
      v.literal("removed")
    ),
    visibilityStatus: v.union(
      v.literal("visible"),
      v.literal("under_review"),
      v.literal("removed")
    ),
    isBrowseable: v.boolean(),
    activeDealChatId: v.optional(v.id("chats")),
    soldDealChatId: v.optional(v.id("chats")),
    buyerConfirmedPickup: v.boolean(),
    bookmarkCount: v.number(),
    publishedAt: v.number(),
    expiresAt: v.number(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_campus_browse", [
      "workspaceKey",
      "isBrowseable",
      "campus",
      "publishedAt",
    ])
    .index("by_all_browse", ["workspaceKey", "isBrowseable", "publishedAt"])
    .index("by_all_category", ["workspaceKey", "isBrowseable", "category", "publishedAt"])
    .index("by_campus_category", [
      "workspaceKey",
      "isBrowseable",
      "campus",
      "category",
      "publishedAt",
    ])
    .index("by_seller", ["workspaceKey", "sellerId", "publishedAt"])
    .index("by_seller_status_expiry", ["workspaceKey", "sellerId", "status", "expiresAt"])
    .index("by_status_expires", ["status", "expiresAt"])
    .searchIndex("search_listings", {
      searchField: "searchText",
      filterFields: ["workspaceKey", "isBrowseable", "campus", "category"],
    })
    .vectorIndex("vector_listings", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["workspaceKey", "isBrowseable", "campus", "category"],
    }),

  meetupSpots: defineTable({
    slug: v.string(),
    campus: campusValidator,
    name: v.string(),
    buildingCode: v.optional(v.string()),
    safetyNotes: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    geoFeatureId: v.string(),
    sortOrder: v.number(),
  })
    .index("by_campus_order", ["campus", "sortOrder"])
    .index("by_slug", ["slug"]),

  chats: defineTable({
    workspaceKey: v.string(),
    kind: v.union(
      v.literal("dm"),
      v.literal("club_group"),
      v.literal("course_group"),
      v.literal("study_group"),
      v.literal("custom_group"),
      v.literal("deal")
    ),
    parentType: v.optional(
      v.union(
        v.literal("club"),
        v.literal("course_hub"),
        v.literal("study_session")
      )
    ),
    parentId: v.optional(v.string()),
    dmPairKey: v.optional(v.string()),
    dealListingBuyerKey: v.optional(v.string()),
    requestStatus: v.union(
      v.literal("active"),
      v.literal("pending_request"),
      v.literal("declined"),
      v.literal("locked_readonly")
    ),
    requestInitiatorId: v.optional(v.id("students")),
    requestOpenerSeq: v.optional(v.number()),
    title: v.optional(v.string()),
    listingId: v.optional(v.id("listings")),
    primarySellerId: v.optional(v.id("students")),
    primaryBuyerId: v.optional(v.id("students")),
    handoffCard: v.optional(handoffCardValidator),
    memberCount: v.number(),
    messageSeq: v.number(),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    lastSenderHandle: v.optional(v.string()),
    readonlyAfter: v.optional(v.number()),
  })
    .index("by_workspace_parent", ["workspaceKey", "parentType", "parentId"])
    .index("by_dm_pair", ["workspaceKey", "dmPairKey"])
    .index("by_deal_key", ["workspaceKey", "dealListingBuyerKey"])
    .index("by_listing", ["workspaceKey", "listingId"]),

  chatMembers: defineTable({
    workspaceKey: v.string(),
    chatId: v.id("chats"),
    studentId: v.id("students"),
    chatKind: v.union(
      v.literal("dm"),
      v.literal("club_group"),
      v.literal("course_group"),
      v.literal("study_group"),
      v.literal("custom_group"),
      v.literal("deal")
    ),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
      v.literal("primary_seller"),
      v.literal("primary_buyer"),
      v.literal("co_party")
    ),
    badgeMode: v.union(v.literal("count"), v.literal("dot")),
    lastReadSeq: v.number(),
    lastReadAt: v.number(),
    hasUnread: v.boolean(),
    isMuted: v.boolean(),
    isArchived: v.boolean(),
    lastChatMessageAt: v.number(),
    lastPushSentAt: v.optional(v.number()),
    joinedAt: v.number(),
  })
    .index("by_student_inbox", [
      "workspaceKey",
      "studentId",
      "isArchived",
      "lastChatMessageAt",
    ])
    .index("by_student_unread", ["workspaceKey", "studentId", "hasUnread"])
    .index("by_student_kind_inbox", ["workspaceKey", "studentId", "isArchived", "chatKind", "lastChatMessageAt"])
    .index("by_chat_student", ["workspaceKey", "chatId", "studentId"]),

  chatMessages: defineTable({
    workspaceKey: v.string(),
    chatId: v.id("chats"),
    seq: v.number(),
    senderId: v.optional(v.id("students")),
    messageType: v.union(
      v.literal("user"),
      v.literal("system"),
      v.literal("handoff_update")
    ),
    body: v.string(),
    mediaAssetId: v.optional(v.id("mediaAssets")),
    replyToMessageId: v.optional(v.id("chatMessages")),
    linkEmbed: v.optional(
      v.object({
        href: v.string(),
        label: v.string(),
        entityType: v.optional(v.string()),
      })
    ),
    reactions: v.array(
      v.object({
        emoji: chatReactionEmojiValidator,
        studentIds: v.array(v.id("students")),
      })
    ),
    scamWarningTriggered: v.boolean(),
    isDeleted: v.boolean(),
    visibilityStatus: v.optional(v.union(v.literal("visible"), v.literal("under_review"))),
    publishedAt: v.number(),
    editedAt: v.optional(v.number()),
  }).index("by_chat_seq", ["workspaceKey", "chatId", "seq"]),

  pushSubscriptions: defineTable({
    studentId: v.id("students"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_student", ["studentId"])
    .index("by_endpoint", ["endpoint"]),

  // =========================================================================
  // D. KSU Daily-Life Catalogs, Snapshots, Enrollments & Pulses (18 Tables)
  // =========================================================================

  feedSyncState: defineTable({
    sourceKey: v.string(),
    lastSuccessAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    consecutiveFailures: v.number(),
    backoffUntil: v.optional(v.number()),
    refreshInFlightUntil: v.optional(v.number()),
    lastPayloadHash: v.optional(v.string()),
    activeRecordCount: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_source", ["sourceKey"]),

  parkingLots: defineTable({
    slug: v.string(),
    campus: campusValidator,
    name: v.string(),
    lotCode: v.string(),
    isDeck: v.boolean(),
    levels: v.array(v.string()),
    permitTiers: v.array(v.string()),
    servedByShuttleRouteIds: v.array(v.string()),
    overflowTargetLotSlugs: v.array(v.string()),
    hourlyBaselinePrior: v.array(v.number()),
    latitude: v.number(),
    longitude: v.number(),
    geoFeatureId: v.string(),
  })
    .index("by_campus", ["campus", "slug"])
    .index("by_slug", ["slug"]),

  parkingReports: defineTable({
    workspaceKey: v.string(),
    parkingLotId: v.id("parkingLots"),
    authorId: v.id("students"),
    reportKind: v.union(v.literal("fullness"), v.literal("spot_opening")),
    fullnessTier: v.optional(
      v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3))
    ),
    deckLevel: v.optional(v.string()),
    goneVoterIds: v.array(v.id("students")),
    status: v.union(v.literal("active"), v.literal("cleared")),
    publishedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_lot_active", [
      "workspaceKey",
      "parkingLotId",
      "reportKind",
      "expiresAt",
    ])
    .index("by_author_status", ["workspaceKey", "authorId", "status"])
    .index("by_expires", ["expiresAt"]),

  studyRooms: defineTable({
    slug: v.string(),
    campus: campusValidator,
    buildingName: v.string(),
    roomNumber: v.string(),
    roomKind: v.union(v.literal("libcal"), v.literal("walk_in")),
    libcalLid: v.optional(v.number()),
    libcalGid: v.optional(v.number()),
    libcalEid: v.optional(v.number()),
    capacity: v.number(),
    amenities: v.array(v.string()),
    bookingUrl: v.optional(v.string()),
    todayHoursLabel: v.optional(v.string()),
    geoFeatureId: v.optional(v.string()),
  })
    .index("by_campus_kind", ["campus", "roomKind", "slug"])
    .index("by_libcal_eid", ["libcalEid"]),

  studyRoomSnapshots: defineTable({
    studyRoomId: v.id("studyRooms"),
    dateET: v.string(),
    slotMask48: v.int64(),
    updatedAt: v.number(),
    isFixture: v.optional(v.boolean()),
  })
    .index("by_room_date", ["studyRoomId", "dateET"])
    .index("by_date", ["dateET"]),

  studySessions: defineTable({
    workspaceKey: v.string(),
    studyRoomId: v.id("studyRooms"),
    campus: campusValidator,
    hostId: v.id("students"),
    courseHubId: v.optional(v.id("courseHubs")),
    visibility: v.union(
      v.literal("campus_open"),
      v.literal("course_members_only")
    ),
    title: v.string(),
    topicNote: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    maxSeats: v.number(),
    attendeeIds: v.array(v.id("students")),
    libcalHostConfirmed: v.boolean(),
    groupChatId: v.optional(v.id("chats")),
    status: v.union(
      v.literal("scheduled"),
      v.literal("ended"),
      v.literal("cancelled")
    ),
    visibilityStatus: v.union(
      v.literal("visible"),
      v.literal("under_review"),
      v.literal("removed")
    ),
  })
    .index("by_campus_end", [
      "workspaceKey",
      "visibility",
      "campus",
      "endTime",
    ])
    .index("by_room_end", ["workspaceKey", "studyRoomId", "endTime"])
    .index("by_host_status", ["workspaceKey", "hostId", "status"])
    .index("by_course_hub_end", ["workspaceKey", "courseHubId", "endTime"]),

  events: defineTable({
    workspaceKey: v.string(),
    externalKey: v.optional(v.string()),
    sourceExternalKeys: v.optional(v.array(v.string())),
    isFixture: v.optional(v.boolean()),
    source: v.union(
      v.literal("localist"),
      v.literal("engage"),
      v.literal("club"),
      v.literal("student")
    ),
    campus: campusValidator,
    campusScope: campusScopeValidator,
    isVirtual: v.boolean(),
    clubId: v.optional(v.id("clubs")),
    organizerStudentId: v.optional(v.id("students")),
    title: v.string(),
    description: v.string(),
    searchText: v.string(),
    locationName: v.string(),
    roomNumber: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    photoUrl: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("cancelled_upstream"),
      v.literal("cancelled")
    ),
    visibilityStatus: v.union(
      v.literal("visible"),
      v.literal("under_review"),
      v.literal("removed")
    ),
    prodGoingCount: v.number(),
    prodInterestedCount: v.number(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_scope_start", [
      "workspaceKey",
      "visibilityStatus",
      "campusScope",
      "startTime",
    ])
    .index("by_all_start", ["workspaceKey", "visibilityStatus", "startTime"])
    .index("by_all_end", ["workspaceKey", "visibilityStatus", "status", "endTime"])
    .index("by_scope_end", ["workspaceKey", "visibilityStatus", "status", "campusScope", "endTime"])
    .index("by_external_key", ["externalKey"])
    .index("by_club_start", ["workspaceKey", "clubId", "startTime"])
    .searchIndex("search_events", {
      searchField: "searchText",
      filterFields: ["workspaceKey", "visibilityStatus", "campusScope"],
    })
    .vectorIndex("vector_events", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["workspaceKey", "visibilityStatus", "campusScope"],
    }),

  eventRsvps: defineTable({
    workspaceKey: v.string(),
    eventId: v.id("events"),
    studentId: v.id("students"),
    rsvpStatus: v.union(v.literal("going"), v.literal("interested")),
    updatedAt: v.number(),
  })
    .index("by_event_student", ["workspaceKey", "eventId", "studentId"])
    .index("by_event", ["eventId"])
    .index("by_student", ["workspaceKey", "studentId", "updatedAt"]),

  eventSourceAliases: defineTable({
    sourceKey: v.string(),
    eventId: v.id("events"),
  }).index("by_source_key", ["sourceKey"]),

  clubs: defineTable({
    workspaceKey: v.string(),
    isFixture: v.optional(v.boolean()),
    externalEngageId: v.optional(v.string()),
    slug: v.string(),
    clubKind: v.union(
      v.literal("registered_ksu"),
      v.literal("campus_department"),
      v.literal("community")
    ),
    campus: campusValidator,
    name: v.string(),
    shortName: v.optional(v.string()),
    summary: v.string(),
    description: v.string(),
    searchText: v.string(),
    contactEmailCanonical: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    prodMemberCount: v.number(),
    visibilityStatus: v.union(
      v.literal("visible"),
      v.literal("under_review"),
      v.literal("removed")
    ),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_workspace_campus", [
      "workspaceKey",
      "visibilityStatus",
      "campus",
      "name",
    ])
    .index("by_workspace_slug", ["workspaceKey", "slug"])
    .index("by_engage_id", ["externalEngageId"])
    .searchIndex("search_clubs", {
      searchField: "searchText",
      filterFields: ["workspaceKey", "visibilityStatus", "campus", "clubKind"],
    })
    .vectorIndex("vector_clubs", {
      vectorField: "embedding",
      dimensions: 768,
      filterFields: ["workspaceKey", "visibilityStatus", "campus"],
    }),

  clubMembers: defineTable({
    workspaceKey: v.string(),
    clubId: v.id("clubs"),
    studentId: v.id("students"),
    role: v.union(
      v.literal("member"),
      v.literal("officer"),
      v.literal("pending_officer_claim")
    ),
    joinedAt: v.number(),
  })
    .index("by_club_student", ["workspaceKey", "clubId", "studentId"])
    .index("by_student", ["workspaceKey", "studentId"])
    .index("by_pending_claims", ["workspaceKey", "role", "joinedAt"]),

  courseHubs: defineTable({
    subjectCourse: v.string(),
    catalogSource: v.optional(v.union(v.literal("fixture"), v.literal("banner_verified"))),
    isRetiredFixture: v.optional(v.boolean()),
    subjectCode: v.string(),
    courseNumber: v.string(),
    title: v.string(),
    searchText: v.string(),
    campuses: v.array(campusValidator),
    activeTerms: v.array(v.string()),
    prodEnrollmentCount: v.number(),
  })
    .index("by_subject_course", ["subjectCourse"])
    .index("by_subject_code", ["subjectCode", "courseNumber"])
    .searchIndex("search_course_hubs", {
      searchField: "searchText",
      filterFields: ["subjectCode"],
    }),

  // Strictly 2 B-tree indexes, 0 search/vector indexes per ADR-0006
  courseSections: defineTable({
    termCode: v.string(),
    isFixture: v.optional(v.boolean()),
    isRetiredFixture: v.optional(v.boolean()),
    crn: v.string(),
    courseHubId: v.id("courseHubs"),
    sectionNumber: v.string(),
    campus: campusValidator,
    deliveryMode: v.union(
      v.literal("in_person"),
      v.literal("hybrid"),
      v.literal("online")
    ),
    instructorName: v.string(),
    meetings: v.array(
      v.object({
        days: v.array(v.string()),
        startMinutes: v.number(),
        endMinutes: v.number(),
        timeLabel: v.string(),
        buildingName: v.string(),
        roomNumber: v.string(),
      })
    ),
  })
    .index("by_term_crn", ["termCode", "crn"])
    .index("by_hub_term", ["courseHubId", "termCode"]),

  courseSyllabiCache: defineTable({
    cacheKey: v.string(),
    subjectCourse: v.string(),
    termCode: v.string(),
    crn: v.optional(v.string()),
    matchedSectionLabel: v.string(),
    status: v.union(v.literal("found"), v.literal("not_found")),
    summaryJson: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    fetchedAt: v.number(),
    lastAccessedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_cache_key", ["cacheKey"])
    .index("by_subject_course", ["subjectCourse", "termCode"])
    .index("by_lru", ["lastAccessedAt"]),

  studentEnrollments: defineTable({
    workspaceKey: v.string(),
    studentId: v.id("students"),
    termCode: v.string(),
    courseHubId: v.id("courseHubs"),
    sectionId: v.optional(v.id("courseSections")),
    crn: v.optional(v.string()),
    personalDeadlines: v.array(
      v.object({
        uid: v.string(),
        title: v.string(),
        dueAt: v.number(),
        courseCode: v.optional(v.string()),
        location: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_student_term", ["workspaceKey", "studentId", "termCode"])
    .index("by_student_hub", ["workspaceKey", "studentId", "courseHubId"]),

  shuttleRoutes: defineTable({
    passioRouteId: v.string(),
    shortName: v.string(),
    name: v.string(),
    campusScope: campusScopeValidator,
    colorHex: v.string(),
    geoFeatureId: v.string(),
    stops: v.array(
      v.object({
        stopId: v.string(),
        name: v.string(),
        campus: campusValidator,
        latitude: v.number(),
        longitude: v.number(),
        sequence: v.number(),
      })
    ),
    operatingHoursSummary: v.string(),
  })
    .index("by_passio_id", ["passioRouteId"])
    .index("by_campus_scope", ["campusScope"]),

  shuttleSnapshots: defineTable({
    singletonKey: v.literal("latest"),
    vehicles: v.array(
      v.object({
        busId: v.string(),
        busName: v.string(),
        passioRouteId: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        heading: v.number(),
        paxLoad: v.number(),
        totalCap: v.number(),
      })
    ),
    stopEtas: v.array(
      v.object({
        stopId: v.string(),
        passioRouteId: v.string(),
        etaMinutes: v.number(),
        loadLabel: v.string(),
        arrivalAt: v.optional(v.number()),
      })
    ),
    serviceAlerts: v.array(
      v.object({
        alertId: v.string(),
        title: v.string(),
        body: v.string(),
        passioRouteIds: v.array(v.string()),
      })
    ),
    fetchedAt: v.number(),
    isFixture: v.optional(v.boolean()),
    vehiclesFetchedAt: v.optional(v.number()),
    etasFetchedAt: v.optional(v.number()),
    alertsFetchedAt: v.optional(v.number()),
  }).index("by_singleton", ["singletonKey"]),

  diningVenues: defineTable({
    nutrisliceSlug: v.string(),
    nutrisliceId: v.number(),
    campus: campusValidator,
    venueKind: v.union(v.literal("dining_hall"), v.literal("retail")),
    name: v.string(),
    buildingName: v.string(),
    geoFeatureId: v.optional(v.string()),
    doorRatesJson: v.optional(v.string()),
    hoursScheduleJson: v.string(),
    todayMenuJson: v.string(),
    tomorrowMenuJson: v.string(),
    todayMenuDateET: v.optional(v.string()),
    tomorrowMenuDateET: v.optional(v.string()),
    isFixtureMenu: v.optional(v.boolean()),
    isFixtureHours: v.optional(v.boolean()),
    lastHoursSyncAt: v.number(),
    lastMenuSyncAt: v.number(),
  })
    .index("by_campus", ["campus", "venueKind", "name"])
    .index("by_slug", ["nutrisliceSlug"]),

  campusPulses: defineTable({
    workspaceKey: v.string(),
    targetType: v.union(
      v.literal("study_room"),
      v.literal("dining_venue"),
      v.literal("shuttle_stop")
    ),
    targetKey: v.string(),
    authorId: v.id("students"),
    tierValue: v.string(),
    stationChips: v.optional(v.array(v.string())),
    publishedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_target_active", [
      "workspaceKey",
      "targetType",
      "targetKey",
      "expiresAt",
    ])
    .index("by_expires", ["expiresAt"]),

  // =========================================================================
  // E. Scrappy, Media Assets & Rate-Limit / Cooldown Ledgers (5 Tables)
  // =========================================================================

  scrappyThreads: defineTable({
    workspaceKey: v.string(),
    studentId: v.id("students"),
    title: v.string(),
    contextEntity: v.optional(
      v.object({
        entityType: v.string(),
        entityId: v.string(),
        label: v.string(),
      })
    ),
    messageCount: v.number(),
    lastTurnAt: v.number(),
  }).index("by_student_recent", ["workspaceKey", "studentId", "lastTurnAt"]),

  scrappyMessages: defineTable({
    workspaceKey: v.string(),
    threadId: v.id("scrappyThreads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.array(citationPillValidator),
    draftCard: v.optional(draftCardValidator),
    providerUsed: v.optional(v.string()),
    toolCallsSummary: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_thread_created", ["workspaceKey", "threadId", "createdAt"]),

  mediaAssets: defineTable({
    workspaceKey: v.string(),
    demoSessionId: v.optional(v.id("demoSessions")),
    ownerStudentId: v.id("students"),
    fileKey: v.string(),
    url: v.string(),
    purpose: v.union(
      v.literal("avatar"),
      v.literal("post"),
      v.literal("listing"),
      v.literal("chat")
    ),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("attached"),
      v.literal("deleted")
    ),
    createdAt: v.number(),
    deleteClaimedAt: v.optional(v.number()),
  })
    .index("by_file_key", ["fileKey"])
    .index("by_demo_session", ["demoSessionId"])
    .index("by_owner", ["workspaceKey", "ownerStudentId"])
    .index("by_owner_status", ["workspaceKey", "ownerStudentId", "status"])
    .index("by_status_created", ["status", "createdAt"]),

  uploadReservations: defineTable({
    workspaceKey: v.string(),
    demoSessionId: v.optional(v.id("demoSessions")),
    ownerStudentId: v.id("students"),
    purpose: v.union(v.literal("avatar"), v.literal("post"), v.literal("listing"), v.literal("chat")),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
    expiresAt: v.number(),
  })
    .index("by_expires", ["expiresAt"])
    .index("by_demo_session", ["demoSessionId", "expiresAt"]),

  rateLimitBuckets: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expires", ["expiresAt"]),

  interpersonalLedgers: defineTable({
    workspaceKey: v.string(),
    kind: v.union(
      v.literal("dm_decline_cooldown"),
      v.literal("marketplace_trust_pair")
    ),
    pairKey: v.string(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_pair_kind", ["workspaceKey", "kind", "pairKey"])
    .index("by_expires", ["expiresAt"]),
});
