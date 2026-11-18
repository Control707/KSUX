import { seedV2DemoStates } from "./v2Fixtures";
import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { makeStudentPairKey } from "../lib/crypto";
import { computePostHotScore } from "../lib/safety";
import { makeTargetKey } from "../lib/viewer";

function dayKeyET(ms: number): string {
  const d = new Date(ms - 5 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export async function cloneDemoWorkspaceFixtures(
  ctx: MutationCtx,
  demoSessionId: Id<"demoSessions">,
  now = Date.now()
): Promise<{
  mayaId: Id<"students">;
  jordanId: Id<"students">;
  alexId: Id<"students">;
}> {
  const workspaceKey = `demo:${demoSessionId}`;
  const MIN = 60_000;
  const HR = 60 * MIN;
  const DAY = 24 * HR;

  // Look up read-only "ksu" institutional anchors (gracefully optional if seed hasn't run yet)
  const [
    centralDeck,
    townPointLot,
    mariettaWestDeck,
    mariettaShuttleLot,
    cs3305Hub,
    swe3313Hub,
    me3101Hub,
    acmClub,
    owlInvestClub,
    roboticsClub,
    carmichaelSpot,
    sturgisRooms,
    johnsonRooms,
    upcomingKsuEvents,
  ] = await Promise.all([
    ctx.db
      .query("parkingLots")
      .withIndex("by_slug", (q) => q.eq("slug", "central-parking-deck"))
      .unique(),
    ctx.db
      .query("parkingLots")
      .withIndex("by_slug", (q) => q.eq("slug", "town-point-economy-lot"))
      .unique(),
    ctx.db
      .query("parkingLots")
      .withIndex("by_slug", (q) => q.eq("slug", "marietta-west-deck"))
      .unique(),
    ctx.db
      .query("parkingLots")
      .withIndex("by_slug", (q) => q.eq("slug", "marietta-shuttle-lot"))
      .unique(),
    ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", "CS 3305"))
      .unique(),
    ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", "SWE 3313"))
      .unique(),
    ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", "ME 3101"))
      .unique(),
    ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", "ksu").eq("slug", "acm-ksu")
      )
      .unique(),
    ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", "ksu").eq("slug", "owl-investment-group")
      )
      .unique(),
    ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", "ksu").eq("slug", "ksu-autonomous-robotics")
      )
      .unique(),
    ctx.db
      .query("meetupSpots")
      .withIndex("by_slug", (q) =>
        q.eq("slug", "carmichael-student-center-atrium")
      )
      .unique(),
    ctx.db
      .query("studyRooms")
      .withIndex("by_campus_kind", (q) =>
        q.eq("campus", "Kennesaw").eq("roomKind", "libcal")
      )
      .take(2),
    ctx.db
      .query("studyRooms")
      .withIndex("by_campus_kind", (q) =>
        q.eq("campus", "Marietta").eq("roomKind", "libcal")
      )
      .take(2),
    ctx.db
      .query("events")
      .withIndex("by_all_start", (q) =>
        q.eq("workspaceKey", "ksu").eq("visibilityStatus", "visible")
      )
      .take(4),
  ]);

  // 1. Seed the 5 isolated demo Students (3 switchable personas + 2 background classmates + Scrappy system author)
  const scrappyStudentId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "faculty_staff",
    handle: "scrappy",
    handleLower: "scrappy",
    displayName: "Scrappy the Owl",
    searchText: "@scrappy Scrappy the Owl KSU Campus AI",
    homeCampus: "Kennesaw",
    activeCampusFilter: "All KSU",
    major: "Campus Owl Assistant",
    pinnedParkingLotIds: [],
    completedDealCount: 0,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 120 * DAY,
  });

  const mayaId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "verified_student",
    handle: "maya_cs",
    handleLower: "maya_cs",
    displayName: "Maya Patel",
    searchText: "@maya_cs Maya Patel Computer Science",
    homeCampus: "Kennesaw",
    activeCampusFilter: "Kennesaw",
    major: "Computer Science",
    classYear: "2027",
    permitTier: "Central",
    pinnedParkingLotIds: [
      ...(centralDeck ? [centralDeck._id] : []),
      ...(townPointLot ? [townPointLot._id] : []),
    ],
    completedDealCount: 3,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 75 * DAY,
  });

  const jordanId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "verified_student",
    handle: "jordan_me",
    handleLower: "jordan_me",
    displayName: "Jordan Brooks",
    searchText: "@jordan_me Jordan Brooks Mechanical Engineering",
    homeCampus: "Marietta",
    activeCampusFilter: "Marietta",
    major: "Mechanical Engineering",
    classYear: "2026",
    permitTier: "Marietta West",
    pinnedParkingLotIds: mariettaWestDeck ? [mariettaWestDeck._id] : [],
    completedDealCount: 2,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 90 * DAY,
  });

  const alexId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "verified_student",
    handle: "alex_owl",
    handleLower: "alex_owl",
    displayName: "Alex Rivera",
    searchText: "@alex_owl Alex Rivera Finance Information Systems",
    homeCampus: "Kennesaw",
    activeCampusFilter: "Kennesaw",
    major: "Finance & Information Systems",
    classYear: "2026",
    permitTier: "East",
    pinnedParkingLotIds: centralDeck ? [centralDeck._id] : [],
    completedDealCount: 7,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 110 * DAY,
  });

  const samId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "verified_student",
    handle: "sam_cpe",
    handleLower: "sam_cpe",
    displayName: "Sam Nguyen",
    searchText: "@sam_cpe Sam Nguyen Computer Engineering",
    homeCampus: "Marietta",
    activeCampusFilter: "Marietta",
    major: "Computer Engineering",
    classYear: "2028",
    pinnedParkingLotIds: [],
    completedDealCount: 1,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 30 * DAY,
  });

  const taylorId = await ctx.db.insert("students", {
    workspaceKey,
    emailDomainBadge: "verified_student",
    handle: "taylor_bio",
    handleLower: "taylor_bio",
    displayName: "Taylor Morgan",
    searchText: "@taylor_bio Taylor Morgan Biology",
    homeCampus: "Kennesaw",
    activeCampusFilter: "Kennesaw",
    major: "Biology",
    classYear: "2027",
    pinnedParkingLotIds: [],
    completedDealCount: 4,
    onboardingCompleted: true,
    accountStatus: "active",
    joinedAt: now - 55 * DAY,
  });

  // 2. Social Follows
  const followPairs: Array<[Id<"students">, Id<"students">]> = [
    [mayaId, jordanId],
    [jordanId, mayaId],
    [mayaId, alexId],
    [alexId, mayaId],
    [jordanId, alexId],
    [mayaId, taylorId],
  ];
  for (const [followerId, followeeId] of followPairs) {
    await ctx.db.insert("studentFollows", {
      workspaceKey,
      followerId,
      followeeId,
      createdAt: now - 14 * DAY,
    });
  }

  // 3. Enrollments & Private .ics Deadlines
  let cs3305KennesawSection: Doc<"courseSections"> | null = null;
  let cs3305MariettaSection: Doc<"courseSections"> | null = null;
  if (cs3305Hub) {
    cs3305KennesawSection = await ctx.db
      .query("courseSections")
      .withIndex("by_term_crn", (q) => q.eq("termCode", "202608").eq("crn", "83190"))
      .unique();
    cs3305MariettaSection = await ctx.db
      .query("courseSections")
      .withIndex("by_term_crn", (q) => q.eq("termCode", "202608").eq("crn", "83191"))
      .unique();

    await ctx.db.insert("studentEnrollments", {
      workspaceKey,
      studentId: mayaId,
      termCode: "202608",
      courseHubId: cs3305Hub._id,
      sectionId: cs3305KennesawSection?._id,
      crn: "83190",
      personalDeadlines: [
        {
          uid: "d2l-cs3305-avl",
          title: "CS 3305 Lab 6: AVL Tree Balancing",
          dueAt: now + 18 * HR,
          courseCode: "CS 3305",
          location: "D2L Brightspace Dropbox",
        },
        {
          uid: "d2l-cs3305-quiz",
          title: "CS 3305 Quiz 5: Heaps & Priority Queues",
          dueAt: now + 66 * HR,
          courseCode: "CS 3305",
        },
      ],
      createdAt: now - 40 * DAY,
    });

    await ctx.db.insert("studentEnrollments", {
      workspaceKey,
      studentId: jordanId,
      termCode: "202608",
      courseHubId: cs3305Hub._id,
      sectionId: cs3305MariettaSection?._id,
      crn: "83191",
      personalDeadlines: [],
      createdAt: now - 40 * DAY,
    });

    await ctx.db.insert("studentEnrollments", {
      workspaceKey,
      studentId: samId,
      termCode: "202608",
      courseHubId: cs3305Hub._id,
      sectionId: cs3305MariettaSection?._id,
      crn: "83191",
      personalDeadlines: [],
      createdAt: now - 35 * DAY,
    });
  }

  if (swe3313Hub) {
    const sweSection = await ctx.db
      .query("courseSections")
      .withIndex("by_term_crn", (q) => q.eq("termCode", "202608").eq("crn", "84210"))
      .unique();
    await ctx.db.insert("studentEnrollments", {
      workspaceKey,
      studentId: mayaId,
      termCode: "202608",
      courseHubId: swe3313Hub._id,
      sectionId: sweSection?._id,
      crn: "84210",
      personalDeadlines: [
        {
          uid: "d2l-swe3313-milestone",
          title: "SWE 3313 Milestone 3 Architecture Spec",
          dueAt: now + 42 * HR,
          courseCode: "SWE 3313",
        },
      ],
      createdAt: now - 40 * DAY,
    });
  }

  if (me3101Hub) {
    const meSection = await ctx.db
      .query("courseSections")
      .withIndex("by_term_crn", (q) => q.eq("termCode", "202608").eq("crn", "85105"))
      .unique();
    await ctx.db.insert("studentEnrollments", {
      workspaceKey,
      studentId: jordanId,
      termCode: "202608",
      courseHubId: me3101Hub._id,
      sectionId: meSection?._id,
      crn: "85105",
      personalDeadlines: [
        {
          uid: "d2l-me3101-tensile",
          title: "ME 3101 Stress-Strain Lab Report",
          dueAt: now + 26 * HR,
          courseCode: "ME 3101",
          location: "Engineering Lab Q 112",
        },
      ],
      createdAt: now - 40 * DAY,
    });
  }

  // 4. Club Memberships & Officer Roles (scoped strictly to demo workspace)
  if (acmClub) {
    await ctx.db.insert("clubMembers", {
      workspaceKey,
      clubId: acmClub._id,
      studentId: alexId,
      role: "officer",
      joinedAt: now - 60 * DAY,
    });
    await ctx.db.insert("clubMembers", {
      workspaceKey,
      clubId: acmClub._id,
      studentId: mayaId,
      role: "member",
      joinedAt: now - 30 * DAY,
    });
  }
  if (owlInvestClub) {
    await ctx.db.insert("clubMembers", {
      workspaceKey,
      clubId: owlInvestClub._id,
      studentId: alexId,
      role: "officer",
      joinedAt: now - 80 * DAY,
    });
  }
  if (roboticsClub) {
    await ctx.db.insert("clubMembers", {
      workspaceKey,
      clubId: roboticsClub._id,
      studentId: jordanId,
      role: "member",
      joinedAt: now - 50 * DAY,
    });
  }

  // Event RSVPs in demo workspace
  if (upcomingKsuEvents[0]) {
    await ctx.db.insert("eventRsvps", {
      workspaceKey,
      eventId: upcomingKsuEvents[0]._id,
      studentId: mayaId,
      rsvpStatus: "going",
      updatedAt: now - 2 * HR,
    });
    await ctx.db.insert("eventRsvps", {
      workspaceKey,
      eventId: upcomingKsuEvents[0]._id,
      studentId: alexId,
      rsvpStatus: "going",
      updatedAt: now - 3 * HR,
    });
  }

  // 5. Study Sessions
  let johnsonSessionId: Id<"studySessions"> | undefined;
  if (johnsonRooms[0]) {
    johnsonSessionId = await ctx.db.insert("studySessions", {
      workspaceKey,
      studyRoomId: johnsonRooms[0]._id,
      campus: "Marietta",
      hostId: jordanId,
      visibility: "campus_open",
      title: "Marietta CAD & ME 3101 Exam Prep",
      topicNote: "Working through practice problems + free whiteboard markers",
      startTime: now - 15 * MIN,
      endTime: now + 105 * MIN,
      maxSeats: Math.min(johnsonRooms[0].capacity, 6),
      attendeeIds: [jordanId, samId],
      libcalHostConfirmed: true,
      status: "scheduled",
      visibilityStatus: "visible",
    });
  }

  if (sturgisRooms[0] && cs3305Hub) {
    await ctx.db.insert("studySessions", {
      workspaceKey,
      studyRoomId: sturgisRooms[0]._id,
      campus: "Kennesaw",
      hostId: mayaId,
      courseHubId: cs3305Hub._id,
      visibility: "course_members_only",
      title: "CS 3305 AVL & Graph Traversal Study Group",
      topicNote: "Reviewing tree rotations before Friday's lab",
      startTime: now + 45 * MIN,
      endTime: now + 165 * MIN,
      maxSeats: Math.min(sturgisRooms[0].capacity, 6),
      attendeeIds: [mayaId],
      libcalHostConfirmed: false,
      status: "scheduled",
      visibilityStatus: "visible",
    });
  }

  // 6. Marketplace Listings (4 items)
  const ti84ListingId = await ctx.db.insert("listings", {
    workspaceKey,
    sellerId: alexId,
    campus: "Kennesaw",
    category: "electronics",
    pricingMode: "fixed_obo",
    priceCents: 6500,
    title: "TI-84 Plus CE Python Calculator + Charging Cable",
    description:
      "Mint condition matte black TI-84 Plus CE Python edition used for MATH 1190 & STAT. Holds full charge, screen has zero scratches.",
    searchText:
      "TI-84 Plus CE Python Calculator Charging Cable electronics Kennesaw",
    mediaAssetIds: [],
    status: "available",
    visibilityStatus: "visible",
    isBrowseable: true,
    buyerConfirmedPickup: false,
    bookmarkCount: 1,
    publishedAt: now - 3 * HR,
    expiresAt: now + 27 * DAY,
  });

  await ctx.db.insert("listings", {
    workspaceKey,
    sellerId: alexId,
    campus: "Kennesaw",
    category: "textbooks_gear",
    pricingMode: "fixed_obo",
    priceCents: 4200,
    title: "Introduction to Algorithms (CLRS 4th Ed) — CS 3305",
    description:
      "Clean hardcover copy, zero highlighting. Happy to meet at Carmichael Atrium or Sturgis Library entrance.",
    searchText:
      "Introduction to Algorithms CLRS 4th Ed CS 3305 textbooks Kennesaw",
    mediaAssetIds: [],
    status: "available",
    visibilityStatus: "visible",
    isBrowseable: true,
    buyerConfirmedPickup: false,
    bookmarkCount: 0,
    publishedAt: now - 5 * HR,
    expiresAt: now + 28 * DAY,
  });

  await ctx.db.insert("listings", {
    workspaceKey,
    sellerId: jordanId,
    campus: "Marietta",
    category: "electronics",
    pricingMode: "open_to_trade",
    tradeNote: "Open to trade for Mitutoyo digital calipers or Arduino Mega kit",
    title: "3Dconnexion SpaceMouse Compact for SolidWorks",
    description:
      "Works great for ME & Aero CAD labs on Marietta Campus. Meet at Wilson Student Center or Atrium lobby.",
    searchText:
      "3Dconnexion SpaceMouse Compact SolidWorks CAD Marietta trade",
    mediaAssetIds: [],
    status: "available",
    visibilityStatus: "visible",
    isBrowseable: true,
    buyerConfirmedPickup: false,
    bookmarkCount: 0,
    publishedAt: now - 6 * HR,
    expiresAt: now + 28 * DAY,
  });

  await ctx.db.insert("listings", {
    workspaceKey,
    sellerId: taylorId,
    campus: "Kennesaw",
    category: "dorm_furniture",
    pricingMode: "free_pickup",
    title: "Compact 3.2 cu ft Mini Fridge — Free Pickup",
    description:
      "Moving off campus! Cleaned and defrosted, free to any Owl who can pick up outside ARC Lobby.",
    searchText: "Compact Mini Fridge Free Pickup dorm furniture Kennesaw",
    mediaAssetIds: [],
    status: "available",
    visibilityStatus: "visible",
    isBrowseable: true,
    buyerConfirmedPickup: false,
    bookmarkCount: 0,
    publishedAt: now - 8 * HR,
    expiresAt: now + 26 * DAY,
  });

  await ctx.db.insert("savedInteractions", {
    workspaceKey,
    studentId: mayaId,
    kind: "listing_bookmark",
    targetId: String(ti84ListingId),
    createdAt: now - 2 * HR,
  });

  // 7. Feed Posts, Hashtag Counts, & Grounded @scrappy Thread
  const p1Time = now - 14 * MIN;
  await ctx.db.insert("posts", {
    workspaceKey,
    authorId: alexId,
    authorIsScrappy: false,
    campus: "Kennesaw",
    clubId: acmClub?._id,
    crossPostToCampusFeed: true,
    showInCampusFeed: true,
    body: "Heads up commuters: Central Parking Deck P1–P5 is circling right now, Town Point Economy has wide open rows + Economy BOB bus in 4m! #parking #bobshuttle",
    searchText:
      "Central Parking Deck P1 P5 circling Town Point Economy BOB bus #parking #bobshuttle",
    tags: ["parking", "bobshuttle"],
    mediaAssetIds: [],
    embed: centralDeck
      ? {
          entityType: "parking_lot",
          entityId: String(centralDeck._id),
          title: "Central Parking Deck",
          subtitle: "Kennesaw · Live Student-verified fullness",
          campus: "Kennesaw",
          href: "/parking",
        }
      : undefined,
    likeCount: 6,
    replyCount: 0,
    repostCount: 2,
    hotScore: computePostHotScore({
      likeCount: 6,
      replyCount: 0,
      repostCount: 2,
      publishedAtMs: p1Time,
    }),
    visibilityStatus: "visible",
    publishedAt: p1Time,
  });

  const p2Time = now - 28 * MIN;
  await ctx.db.insert("posts", {
    workspaceKey,
    authorId: jordanId,
    authorIsScrappy: false,
    campus: "Marietta",
    crossPostToCampusFeed: true,
    showInCampusFeed: true,
    body: "Hosting an open CAD & ME 3101 review table in Johnson Library right now on Marietta Campus — Stingers also has zero line for lunch! #marietta #study",
    searchText:
      "Hosting open CAD ME 3101 review Johnson Library Marietta Stingers #marietta #study",
    tags: ["marietta", "study"],
    mediaAssetIds: [],
    embed: johnsonSessionId
      ? {
          entityType: "study_session",
          entityId: String(johnsonSessionId),
          title: "Marietta CAD & ME 3101 Exam Prep",
          subtitle: "Lawrence V. Johnson Library · Open seats",
          campus: "Marietta",
          href: "/study",
        }
      : undefined,
    likeCount: 4,
    replyCount: 0,
    repostCount: 1,
    hotScore: computePostHotScore({
      likeCount: 4,
      replyCount: 0,
      repostCount: 1,
      publishedAtMs: p2Time,
    }),
    visibilityStatus: "visible",
    publishedAt: p2Time,
  });

  const p3Time = now - 42 * MIN;
  const csThreadRootId = await ctx.db.insert("posts", {
    workspaceKey,
    authorId: mayaId,
    authorIsScrappy: false,
    campus: "Kennesaw",
    courseHubId: cs3305Hub?._id,
    authorSectionId: cs3305KennesawSection?._id,
    crossPostToCampusFeed: true,
    showInCampusFeed: true,
    body: "@scrappy Where are open study rooms on Kennesaw right now for CS 3305, and is anyone selling the CLRS textbook? #cs3305",
    searchText:
      "@scrappy open study rooms Kennesaw CS 3305 CLRS textbook #cs3305",
    tags: ["cs3305"],
    mediaAssetIds: [],
    likeCount: 5,
    replyCount: 1,
    repostCount: 0,
    hotScore: computePostHotScore({
      likeCount: 5,
      replyCount: 1,
      repostCount: 0,
      publishedAtMs: p3Time,
    }),
    visibilityStatus: "visible",
    publishedAt: p3Time,
  });

  await ctx.db.insert("posts", {
    workspaceKey,
    authorId: scrappyStudentId,
    authorIsScrappy: true,
    campus: "Kennesaw",
    courseHubId: cs3305Hub?._id,
    crossPostToCampusFeed: false,
    showInCampusFeed: false,
    body: "Hoot! Sturgis Library has open collaborative study slots on Kennesaw right now, and @alex_owl has a $42 CLRS 4th Ed textbook listed on Marketplace.",
    searchText:
      "Sturgis Library open study slots Kennesaw CLRS 4th Ed textbook Marketplace",
    tags: [],
    mediaAssetIds: [],
    rootPostId: csThreadRootId,
    replyToPostId: csThreadRootId,
    likeCount: 3,
    replyCount: 0,
    repostCount: 0,
    hotScore: computePostHotScore({
      likeCount: 3,
      replyCount: 0,
      repostCount: 0,
      publishedAtMs: p3Time + 6_000,
    }),
    scrappyStatus: "ready",
    scrappyTriggerAuthorId: mayaId,
    scrappyCitations: [
      {
        entityType: "study_room",
        entityId: sturgisRooms[0] ? String(sturgisRooms[0]._id) : "sturgis",
        label: "Sturgis Library Study Rooms",
        href: "/study",
        campus: "Kennesaw",
      },
      {
        entityType: "course_hub",
        entityId: cs3305Hub ? String(cs3305Hub._id) : "CS 3305",
        label: "CS 3305 · Data Structures",
        href: "/courses/CS%203305",
        campus: "Kennesaw",
      },
      {
        entityType: "listing",
        entityId: String(ti84ListingId),
        label: "Marketplace · Textbooks & Gear",
        href: "/marketplace",
        campus: "Kennesaw",
      },
    ],
    visibilityStatus: "visible",
    publishedAt: p3Time + 6_000,
  });

  // Pre-quarantined Under Review Post (3 distinct demo reporters) for Moderation Queue (Demo)
  const quarantinedPostId = await ctx.db.insert("posts", {
    workspaceKey,
    authorId: samId,
    authorIsScrappy: false,
    campus: "Kennesaw",
    crossPostToCampusFeed: true,
    showInCampusFeed: false,
    body: "Flash campus giveaway link — click external promo form for instant gift cards!",
    searchText: "Flash campus giveaway link external promo form",
    tags: [],
    mediaAssetIds: [],
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    hotScore: 0,
    visibilityStatus: "under_review",
    publishedAt: now - 50 * MIN,
  });

  const quarantinedTargetKey = makeTargetKey("post", String(quarantinedPostId));
  for (const reporterId of [mayaId, jordanId, taylorId]) {
    await ctx.db.insert("moderationReports", {
      workspaceKey,
      reporterId,
      targetType: "post",
      targetKey: quarantinedTargetKey,
      reason: "scam_spam",
      queueStatus: "quarantined",
      priority: 3,
      createdAt: now - 45 * MIN,
    });
  }

  // Daily hashtag counts for Trending (24h)
  const todayKey = dayKeyET(now);
  const tagSeeds: Array<{
    tag: string;
    campusScope: "Kennesaw" | "Marietta" | "All";
    count: number;
  }> = [
    { tag: "parking", campusScope: "Kennesaw", count: 8 },
    { tag: "parking", campusScope: "All", count: 9 },
    { tag: "cs3305", campusScope: "Kennesaw", count: 6 },
    { tag: "cs3305", campusScope: "All", count: 7 },
    { tag: "bobshuttle", campusScope: "Kennesaw", count: 5 },
    { tag: "bobshuttle", campusScope: "All", count: 6 },
    { tag: "marietta", campusScope: "Marietta", count: 5 },
    { tag: "marietta", campusScope: "All", count: 5 },
    { tag: "study", campusScope: "Marietta", count: 4 },
    { tag: "study", campusScope: "All", count: 4 },
  ];
  for (const t of tagSeeds) {
    await ctx.db.insert("hashtagDailyCounts", {
      workspaceKey,
      dayKey: todayKey,
      campusScope: t.campusScope,
      tag: t.tag,
      count: t.count,
    });
  }

  // 8. Chats: 1 active DM, 1 pending Message Request, Club/Course/Custom Group Chats, and 1 live Deal Chat
  // 8a. Active DM: @maya_cs <-> @jordan_me
  const dmChatId = await ctx.db.insert("chats", {
    workspaceKey,
    kind: "dm",
    dmPairKey: makeStudentPairKey(String(mayaId), String(jordanId)),
    requestStatus: "active",
    memberCount: 2,
    messageSeq: 2,
    lastMessageAt: now - 9 * MIN,
    lastMessagePreview: "Taking the KM Big Owl Bus over after CS 3305!",
    lastSenderHandle: "jordan_me",
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: dmChatId,
    studentId: mayaId,
    chatKind: "dm",
    role: "member",
    badgeMode: "count",
    lastReadSeq: 1,
    lastReadAt: now - 20 * MIN,
    hasUnread: true,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 9 * MIN,
    joinedAt: now - 10 * DAY,
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: dmChatId,
    studentId: jordanId,
    chatKind: "dm",
    role: "member",
    badgeMode: "count",
    lastReadSeq: 2,
    lastReadAt: now - 9 * MIN,
    hasUnread: false,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 9 * MIN,
    joinedAt: now - 10 * DAY,
  });
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: dmChatId,
    seq: 1,
    senderId: mayaId,
    messageType: "user",
    body: "Hey Jordan! Are you still on Marietta Campus this afternoon?",
    reactions: [],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 22 * MIN,
  });
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: dmChatId,
    seq: 2,
    senderId: jordanId,
    messageType: "user",
    body: "Taking the KM Big Owl Bus over after CS 3305!",
    reactions: [{ emoji: "🦉", studentIds: [mayaId] }],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 9 * MIN,
  });

  // 8b. Pending Cold Message Request: @sam_cpe -> @maya_cs
  const reqChatId = await ctx.db.insert("chats", {
    workspaceKey,
    kind: "dm",
    dmPairKey: makeStudentPairKey(String(samId), String(mayaId)),
    requestStatus: "pending_request",
    requestInitiatorId: samId,
    memberCount: 2,
    messageSeq: 1,
    lastMessageAt: now - 18 * MIN,
    lastMessagePreview:
      "Hi Maya! Saw your CS 3305 post — mind if I join the AVL review?",
    lastSenderHandle: "sam_cpe",
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: reqChatId,
    studentId: samId,
    chatKind: "dm",
    role: "member",
    badgeMode: "count",
    lastReadSeq: 1,
    lastReadAt: now - 18 * MIN,
    hasUnread: false,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 18 * MIN,
    joinedAt: now - 18 * MIN,
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: reqChatId,
    studentId: mayaId,
    chatKind: "dm",
    role: "member",
    badgeMode: "count",
    lastReadSeq: 0,
    lastReadAt: 0,
    hasUnread: true,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 18 * MIN,
    joinedAt: now - 18 * MIN,
  });
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: reqChatId,
    seq: 1,
    senderId: samId,
    messageType: "user",
    body: "Hi Maya! Saw your CS 3305 post — mind if I join the AVL review?",
    reactions: [],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 18 * MIN,
  });

  // 8c. Course Hub Group Chat (CS 3305, dot mode) & Club Group Chat (ACM, dot mode) & Custom Group Chat
  if (cs3305Hub) {
    const courseChatId = await ctx.db.insert("chats", {
      workspaceKey,
      kind: "course_group",
      parentType: "course_hub",
      parentId: String(cs3305Hub._id),
      requestStatus: "active",
      title: "CS 3305 · Data Structures",
      memberCount: 3,
      messageSeq: 1,
      lastMessageAt: now - 35 * MIN,
      lastMessagePreview: "Anyone comparing O(log n) AVL rotations for Lab 6?",
      lastSenderHandle: "maya_cs",
    });
    for (const sid of [mayaId, jordanId, samId]) {
      await ctx.db.insert("chatMembers", {
        workspaceKey,
        chatId: courseChatId,
        studentId: sid,
        chatKind: "course_group",
        role: "member",
        badgeMode: "dot",
        lastReadSeq: sid === mayaId ? 1 : 0,
        lastReadAt: now - 35 * MIN,
        hasUnread: sid !== mayaId,
        isMuted: false,
        isArchived: false,
        lastChatMessageAt: now - 35 * MIN,
        joinedAt: now - 30 * DAY,
      });
    }
    await ctx.db.insert("chatMessages", {
      workspaceKey,
      chatId: courseChatId,
      seq: 1,
      senderId: mayaId,
      messageType: "user",
      body: "Anyone comparing O(log n) AVL rotations for Lab 6?",
      reactions: [],
      scamWarningTriggered: false,
      isDeleted: false,
      publishedAt: now - 35 * MIN,
    });
  }

  if (acmClub) {
    const clubChatId = await ctx.db.insert("chats", {
      workspaceKey,
      kind: "club_group",
      parentType: "club",
      parentId: String(acmClub._id),
      requestStatus: "active",
      title: acmClub.name,
      memberCount: 2,
      messageSeq: 1,
      lastMessageAt: now - 55 * MIN,
      lastMessagePreview: "Pizza + lightning talks tonight at 6 PM in Clendenin!",
      lastSenderHandle: "alex_owl",
    });
    for (const [sid, role] of [
      [alexId, "admin"],
      [mayaId, "member"],
    ] as const) {
      await ctx.db.insert("chatMembers", {
        workspaceKey,
        chatId: clubChatId,
        studentId: sid,
        chatKind: "club_group",
        role,
        badgeMode: "dot",
        lastReadSeq: sid === alexId ? 1 : 0,
        lastReadAt: now - 55 * MIN,
        hasUnread: sid !== alexId,
        isMuted: false,
        isArchived: false,
        lastChatMessageAt: now - 55 * MIN,
        joinedAt: now - 30 * DAY,
      });
    }
    await ctx.db.insert("chatMessages", {
      workspaceKey,
      chatId: clubChatId,
      seq: 1,
      senderId: alexId,
      messageType: "user",
      body: "Pizza + lightning talks tonight at 6 PM in Clendenin!",
      reactions: [],
      scamWarningTriggered: false,
      isDeleted: false,
      publishedAt: now - 55 * MIN,
    });
  }

  const customChatId = await ctx.db.insert("chats", {
    workspaceKey,
    kind: "custom_group",
    requestStatus: "active",
    title: "OwlHacks Team 7",
    memberCount: 3,
    messageSeq: 1,
    lastMessageAt: now - 70 * MIN,
    lastMessagePreview: "Demo deck looks super clean — see y'all after class!",
    lastSenderHandle: "alex_owl",
  });
  for (const [sid, role] of [
    [mayaId, "owner"],
    [jordanId, "member"],
    [alexId, "member"],
  ] as const) {
    await ctx.db.insert("chatMembers", {
      workspaceKey,
      chatId: customChatId,
      studentId: sid,
      chatKind: "custom_group",
      role,
      badgeMode: "count",
      lastReadSeq: 1,
      lastReadAt: now - 65 * MIN,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: now - 70 * MIN,
      joinedAt: now - 5 * DAY,
    });
  }
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: customChatId,
    seq: 1,
    senderId: alexId,
    messageType: "user",
    body: "Demo deck looks super clean — see y'all after class!",
    reactions: [],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 70 * MIN,
  });

  // 8d. Live Deal Chat: @maya_cs (primaryBuyer) <-> @alex_owl (primarySeller) on TI-84 Listing
  const dealChatId = await ctx.db.insert("chats", {
    workspaceKey,
    kind: "deal",
    dealListingBuyerKey: `${ti84ListingId}:${mayaId}`,
    requestStatus: "active",
    title: "TI-84 Plus CE Python Calculator + Charging Cable",
    listingId: ti84ListingId,
    primarySellerId: alexId,
    primaryBuyerId: mayaId,
    handoffCard: carmichaelSpot
      ? {
          meetupSpotId: carmichaelSpot._id,
          meetupSpotSlug: carmichaelSpot.slug,
          meetupSpotName: carmichaelSpot.name,
          meetupCampus: carmichaelSpot.campus,
          safetyNotes: carmichaelSpot.safetyNotes,
          proposedWindow: "Today · 2:15 PM – 2:30 PM",
          agreedTerms: "$60 cash in person after testing screen",
          proposedById: alexId,
          confirmedByIds: [alexId],
          status: "proposed",
          updatedAt: now - 6 * MIN,
        }
      : undefined,
    memberCount: 2,
    messageSeq: 2,
    lastMessageAt: now - 6 * MIN,
    lastMessagePreview:
      "Proposed Meetup Spot: Carmichael Student Center Atrium ($60)",
    lastSenderHandle: "alex_owl",
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: dealChatId,
    studentId: mayaId,
    chatKind: "deal",
    role: "primary_buyer",
    badgeMode: "count",
    lastReadSeq: 1,
    lastReadAt: now - 12 * MIN,
    hasUnread: true,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 6 * MIN,
    joinedAt: now - 15 * MIN,
  });
  await ctx.db.insert("chatMembers", {
    workspaceKey,
    chatId: dealChatId,
    studentId: alexId,
    chatKind: "deal",
    role: "primary_seller",
    badgeMode: "count",
    lastReadSeq: 2,
    lastReadAt: now - 6 * MIN,
    hasUnread: false,
    isMuted: false,
    isArchived: false,
    lastChatMessageAt: now - 6 * MIN,
    joinedAt: now - 15 * MIN,
  });
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: dealChatId,
    seq: 1,
    senderId: mayaId,
    messageType: "user",
    body: "Hey Alex! Would you take $60 if I meet you on Kennesaw Campus today?",
    reactions: [],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 14 * MIN,
  });
  await ctx.db.insert("chatMessages", {
    workspaceKey,
    chatId: dealChatId,
    seq: 2,
    senderId: alexId,
    messageType: "handoff_update",
    body: "Works for me! Proposed Carmichael Student Center Atrium at 2:15 PM for $60.",
    reactions: [],
    scamWarningTriggered: false,
    isDeleted: false,
    publishedAt: now - 6 * MIN,
  });

  // 9. Live Crowdsourced Pulses (Parking Reports + Spot Opening + Dining Line Checks + Walk-in Vibe)
  if (centralDeck) {
    for (const [authorId, tier, minsAgo, level] of [
      [alexId, 3, 7, "P4"],
      [taylorId, 2, 12, "P3"],
      [mayaId, 3, 16, "P5"],
    ] as const) {
      await ctx.db.insert("parkingReports", {
        workspaceKey,
        parkingLotId: centralDeck._id,
        authorId,
        reportKind: "fullness",
        fullnessTier: tier,
        deckLevel: level,
        goneVoterIds: [],
        status: "active",
        publishedAt: now - minsAgo * MIN,
        expiresAt: now + (45 - minsAgo) * MIN,
      });
    }
    // Live 10-minute Spot Opening pulse on Central Parking Deck
    await ctx.db.insert("parkingReports", {
      workspaceKey,
      parkingLotId: centralDeck._id,
      authorId: taylorId,
      reportKind: "spot_opening",
      deckLevel: "P3",
      goneVoterIds: [],
      status: "active",
      publishedAt: now - 2 * MIN,
      expiresAt: now + 8 * MIN,
    });
  }

  if (townPointLot) {
    for (const [authorId, minsAgo] of [
      [alexId, 8],
      [mayaId, 19],
    ] as const) {
      await ctx.db.insert("parkingReports", {
        workspaceKey,
        parkingLotId: townPointLot._id,
        authorId,
        reportKind: "fullness",
        fullnessTier: 0,
        goneVoterIds: [],
        status: "active",
        publishedAt: now - minsAgo * MIN,
        expiresAt: now + (45 - minsAgo) * MIN,
      });
    }
  }

  if (mariettaWestDeck) {
    for (const [authorId, minsAgo] of [
      [jordanId, 10],
      [samId, 17],
    ] as const) {
      await ctx.db.insert("parkingReports", {
        workspaceKey,
        parkingLotId: mariettaWestDeck._id,
        authorId,
        reportKind: "fullness",
        fullnessTier: 1,
        deckLevel: "P2",
        goneVoterIds: [],
        status: "active",
        publishedAt: now - minsAgo * MIN,
        expiresAt: now + (45 - minsAgo) * MIN,
      });
    }
  }

  if (mariettaShuttleLot) {
    await ctx.db.insert("parkingReports", {
      workspaceKey,
      parkingLotId: mariettaShuttleLot._id,
      authorId: jordanId,
      reportKind: "fullness",
      fullnessTier: 0,
      goneVoterIds: [],
      status: "active",
      publishedAt: now - 14 * MIN,
      expiresAt: now + 31 * MIN,
    });
  }

  // Dining Line Checks & Shuttle Stop Pulse
  await ctx.db.insert("campusPulses", {
    workspaceKey,
    targetType: "dining_venue",
    targetKey: "the-commons",
    authorId: mayaId,
    tierValue: "short_wait",
    stationChips: ["Fresh batch out"],
    publishedAt: now - 9 * MIN,
    expiresAt: now + 21 * MIN,
  });

  await ctx.db.insert("campusPulses", {
    workspaceKey,
    targetType: "dining_venue",
    targetKey: "stingers",
    authorId: jordanId,
    tierValue: "no_wait",
    stationChips: [],
    publishedAt: now - 11 * MIN,
    expiresAt: now + 19 * MIN,
  });

  await ctx.db.insert("campusPulses", {
    workspaceKey,
    targetType: "shuttle_stop",
    targetKey: "361", // Passio stop: Rec Center
    authorId: alexId,
    tierValue: "stop_clear",
    publishedAt: now - 4 * MIN,
    expiresAt: now + 11 * MIN,
  });

  await seedV2DemoStates(ctx, demoSessionId, { mayaId, jordanId, alexId }, now);

  return { mayaId, jordanId, alexId };
}
