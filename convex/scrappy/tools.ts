import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import {
  evaluateDiningOpenStatus,
  evaluateParkingLotFullness,
} from "../lib/parkingMath";
import {
  filterVisibleContent,
  resolveViewerFromDb,
  toPublicStudent,
  viewerAuthArgs,
} from "../lib/viewer";
import { normalizeSubjectCourse } from "../courses";
import { countOpenHalfHourSlots } from "../sync/libcalSync";
import { fenceUntrustedCampusText, ScrappyToolSpec } from "./router";

const MAX_TOOL_ROWS = 8;

const PUBLIC_SIX_TOOL_SPECS: ScrappyToolSpec[] = [
  {
    name: "searchFeedPosts",
    description:
      "Search public KSUX Feed Posts in the active workspace (up to 8 compact rows).",
    parameters: {
      type: "object",
      properties: {
        queryText: { type: "string" },
        campus: { type: "string", enum: ["Kennesaw", "Marietta"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "searchMarketplaceListings",
    description:
      "Search active Student Marketplace Listings (textbooks, electronics, furniture, tutoring).",
    parameters: {
      type: "object",
      properties: {
        queryText: { type: "string" },
        campus: { type: "string", enum: ["Kennesaw", "Marietta"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "searchEventsAndClubs",
    description:
      "Search public KSU Events and active Clubs across Kennesaw and Marietta.",
    parameters: {
      type: "object",
      properties: {
        queryText: { type: "string" },
        campus: { type: "string", enum: ["Kennesaw", "Marietta"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "getCampusDailyPulse",
    description:
      "Inspect live Parking Lot fullness, Big Owl Bus Shuttle Routes, Study Rooms, and Dining Venues.",
    parameters: {
      type: "object",
      properties: {
        campus: { type: "string", enum: ["Kennesaw", "Marietta"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "lookupCourseHubAndSyllabus",
    description:
      "Look up KSU Course Hub metadata, Banner 9 sections, and cached Simple Syllabus summary.",
    parameters: {
      type: "object",
      properties: {
        subjectCourse: { type: "string" },
      },
      required: ["subjectCourse"],
      additionalProperties: false,
    },
  },
  {
    name: "getEntityDetail",
    description:
      "Fetch compact detail for a public campus entity (parking_lot, dining_venue, club, course_hub).",
    parameters: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          enum: ["parking_lot", "dining_venue", "club", "course_hub"],
        },
        slugOrCode: { type: "string" },
      },
      required: ["entityType", "slugOrCode"],
      additionalProperties: false,
    },
  },
];

// 6 public read-only tools for @scrappy Feed mentions (physically omits getMyPersonalContext!)
export const FEED_MENTION_TOOLS: readonly ScrappyToolSpec[] =
  Object.freeze(PUBLIC_SIX_TOOL_SPECS);

// 7 read-only tools for private 1:1 Ask Scrappy threads
export const ASK_SCRAPPY_TOOLS: readonly ScrappyToolSpec[] = Object.freeze([
  ...PUBLIC_SIX_TOOL_SPECS,
  {
    name: "getMyPersonalContext",
    description:
      "Read the asking Student's private enrolled Course Hubs, CRN schedule, .ics deadlines, and enrolled Study Sessions.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
]);

export const searchFeedPosts = internalQuery({
  args: {
    ...viewerAuthArgs,
    queryText: v.optional(v.string()),
    campus: v.optional(v.union(v.literal("Kennesaw"), v.literal("Marietta"))),
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerFromDb(ctx, args);
    const qText = args.queryText?.trim();

    const raw = qText
      ? await ctx.db
          .query("posts")
          .withSearchIndex("search_posts", (q) => {
            let sq = q
              .search("searchText", qText)
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("visibilityStatus", "visible");
            if (args.campus) sq = sq.eq("campus", args.campus);
            return sq;
          })
          .take(16)
      : await ctx.db
          .query("posts")
          .withIndex("by_all_feed", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("showInCampusFeed", true)
          )
          .order("desc")
          .take(16);

    const visible = filterVisibleContent(raw, viewer, {
      targetType: "post",
      getAuthorId: (p) => p.authorId,
    })
      .filter((p) => !p.authorIsScrappy)
      .slice(0, MAX_TOOL_ROWS);

    const rows = await Promise.all(
      visible.map(async (p) => {
        const author = toPublicStudent(await ctx.db.get(p.authorId));
        return {
          id: String(p._id),
          campus: p.campus,
          authorHandle: `@${author.handle}`,
          body: fenceUntrustedCampusText(p.body),
          likes: p.likeCount,
        };
      })
    );

    return {
      rows,
      citations: visible.slice(0, 3).map((p) => ({
        entityType: "post",
        entityId: String(p._id),
        label: `Campus Feed (${p.campus})`,
        href: "/feed",
        campus: p.campus,
      })),
    };
  },
});

export const searchMarketplaceListings = internalQuery({
  args: {
    ...viewerAuthArgs,
    queryText: v.optional(v.string()),
    campus: v.optional(v.union(v.literal("Kennesaw"), v.literal("Marietta"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewer = await resolveViewerFromDb(ctx, args);
    const qText = args.queryText?.trim();

    const raw = qText
      ? await ctx.db
          .query("listings")
          .withSearchIndex("search_listings", (q) => {
            let sq = q
              .search("searchText", qText)
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("isBrowseable", true);
            if (args.campus) sq = sq.eq("campus", args.campus);
            return sq;
          })
          .take(16)
      : await ctx.db
          .query("listings")
          .withIndex("by_all_browse", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey).eq("isBrowseable", true)
          )
          .order("desc")
          .take(16);

    const visible = filterVisibleContent(raw, viewer, {
      targetType: "listing",
      getAuthorId: (l) => l.sellerId,
    })
      .filter((l) => l.expiresAt > now)
      .slice(0, MAX_TOOL_ROWS);

    const rows = await Promise.all(
      visible.map(async (l) => {
        const seller = toPublicStudent(await ctx.db.get(l.sellerId));
        const price =
          l.pricingMode === "free_pickup"
            ? "Free Pickup"
            : l.pricingMode === "open_to_trade"
              ? "Open to Trade"
              : `$${((l.priceCents ?? 0) / 100).toFixed(0)}`;
        return {
          id: String(l._id),
          campus: l.campus,
          sellerHandle: `@${seller.handle}`,
          price,
          title: fenceUntrustedCampusText(l.title, 100),
          description: fenceUntrustedCampusText(l.description, 180),
        };
      })
    );

    return {
      rows,
      citations: visible.slice(0, 3).map((l) => ({
        entityType: "listing",
        entityId: String(l._id),
        label: `Marketplace · ${l.title.slice(0, 34)}`,
        href: "/marketplace",
        campus: l.campus,
      })),
    };
  },
});

export const searchEventsAndClubs = internalQuery({
  args: {
    ...viewerAuthArgs,
    queryText: v.optional(v.string()),
    campus: v.optional(v.union(v.literal("Kennesaw"), v.literal("Marietta"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewer = await resolveViewerFromDb(ctx, args);
    const qText = args.queryText?.trim();

    // Dual-scope read across shared "ksu" catalog + viewer.workspaceKey!
    const [ksuEvents, wsEvents, ksuClubs, wsClubs] = await Promise.all([
      qText
        ? ctx.db
            .query("events")
            .withSearchIndex("search_events", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", "ksu")
                .eq("visibilityStatus", "visible")
            )
            .take(MAX_TOOL_ROWS)
        : ctx.db
            .query("events")
            .withIndex("by_all_start", (q) =>
              q
                .eq("workspaceKey", "ksu")
                .eq("visibilityStatus", "visible")
                .gt("startTime", now - 3600_000)
            )
            .take(MAX_TOOL_ROWS),
      qText
        ? ctx.db
            .query("events")
            .withSearchIndex("search_events", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("visibilityStatus", "visible")
            )
            .take(MAX_TOOL_ROWS)
        : ctx.db
            .query("events")
            .withIndex("by_all_start", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("visibilityStatus", "visible")
                .gt("startTime", now - 3600_000)
            )
            .take(MAX_TOOL_ROWS),
      qText
        ? ctx.db
            .query("clubs")
            .withSearchIndex("search_clubs", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", "ksu")
                .eq("visibilityStatus", "visible")
            )
            .take(MAX_TOOL_ROWS)
        : ctx.db
            .query("clubs")
            .withIndex("by_workspace_campus", (q) =>
              q
                .eq("workspaceKey", "ksu")
                .eq("visibilityStatus", "visible")
                .eq("campus", args.campus ?? "Kennesaw")
            )
            .take(4),
      qText
        ? ctx.db
            .query("clubs")
            .withSearchIndex("search_clubs", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("visibilityStatus", "visible")
            )
            .take(MAX_TOOL_ROWS)
        : Promise.resolve([]),
    ]);

    const events = [...wsEvents, ...ksuEvents]
      .filter((e) => {
        if (e.status === "cancelled") return false;
        if (
          args.campus &&
          e.campusScope !== "Both" &&
          e.campusScope !== args.campus
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 4);

    const clubs = [...wsClubs, ...ksuClubs]
      .filter((c) => !args.campus || c.campus === args.campus)
      .slice(0, 4);

    return {
      events: events.map((e) => ({
        id: String(e._id),
        title: fenceUntrustedCampusText(e.title, 100),
        campus: e.isVirtual ? "Both (Virtual)" : e.campus,
        locationName: e.locationName,
        startTimeIso: new Date(e.startTime).toISOString(),
      })),
      clubs: clubs.map((c) => ({
        slug: c.slug,
        name: fenceUntrustedCampusText(c.name, 90),
        campus: c.campus,
        summary: fenceUntrustedCampusText(c.summary, 140),
      })),
      citations: [
        ...events.slice(0, 2).map((e) => ({
          entityType: "event",
          entityId: String(e._id),
          label: e.title.slice(0, 36),
          href: `/events/${e._id}`,
          campus: e.campus,
        })),
        ...clubs.slice(0, 2).map((c) => ({
          entityType: "club",
          entityId: String(c._id),
          label: c.name.slice(0, 36),
          href: `/clubs/${c.slug}`,
          campus: c.campus,
        })),
      ],
    };
  },
});

export const getCampusDailyPulse = internalQuery({
  args: {
    ...viewerAuthArgs,
    campus: v.optional(v.union(v.literal("Kennesaw"), v.literal("Marietta"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewer = await resolveViewerFromDb(ctx, args);
    const targetCampus =
      args.campus ??
      (viewer.actorStudent.activeCampusFilter === "Marietta"
        ? "Marietta"
        : "Kennesaw");

    const [lots, routes, shuttleSnap, studyRooms, diningVenues] =
      await Promise.all([
        ctx.db
          .query("parkingLots")
          .withIndex("by_campus", (q) => q.eq("campus", targetCampus))
          .take(6),
        ctx.db.query("shuttleRoutes").take(11),
        ctx.db
          .query("shuttleSnapshots")
          .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
          .unique(),
        ctx.db
          .query("studyRooms")
          .withIndex("by_campus_kind", (q) =>
            q.eq("campus", targetCampus).eq("roomKind", "libcal")
          )
          .take(4),
        ctx.db
          .query("diningVenues")
          .withIndex("by_campus", (q) => q.eq("campus", targetCampus))
          .take(4),
      ]);

    const parking = await Promise.all(
      lots.slice(0, 4).map(async (lot) => {
        const reports = await ctx.db
          .query("parkingReports")
          .withIndex("by_lot_active", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("parkingLotId", lot._id)
              .eq("reportKind", "fullness")
              .gt("expiresAt", now)
          )
          .take(15);
        const ev = evaluateParkingLotFullness(lot, reports, now);
        return {
          name: lot.name,
          slug: lot.slug,
          status: ev.tierLabel,
          provenance: ev.provenanceLabel,
        };
      })
    );

    const shuttles = routes
      .filter(
        (r) => r.campusScope === "Both" || r.campusScope === targetCampus
      )
      .slice(0, 4)
      .map((r) => {
        const eta = shuttleSnap?.stopEtas.find(
          (e) => e.passioRouteId === r.passioRouteId
        );
        return {
          name: r.name,
          etaMinutes: eta?.etaMinutes ?? 6,
          load: eta?.loadLabel ?? "Seats Open",
        };
      });

    const todayET = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));

    const study = await Promise.all(
      studyRooms.map(async (rm) => {
        const snap = await ctx.db
          .query("studyRoomSnapshots")
          .withIndex("by_room_date", (q) =>
            q.eq("studyRoomId", rm._id).eq("dateET", todayET)
          )
          .unique();
        return {
          building: rm.buildingName,
          room: rm.roomNumber,
          openHalfHourSlots: countOpenHalfHourSlots(snap?.slotMask48 ?? 0n),
        };
      })
    );

    const dining = diningVenues.map((d) => ({
      name: d.name,
      openStatus: evaluateDiningOpenStatus(d.hoursScheduleJson, now).label,
    }));

    return {
      campus: targetCampus,
      parking,
      shuttles,
      study,
      dining,
      citations: [
        {
          entityType: "parking_lot",
          entityId: lots[0] ? String(lots[0]._id) : targetCampus,
          label: `${targetCampus} Parking Lots`,
          href: "/parking",
          campus: targetCampus,
        },
        {
          entityType: "study_room",
          entityId: studyRooms[0] ? String(studyRooms[0]._id) : targetCampus,
          label: `${targetCampus} Study Rooms`,
          href: "/study",
          campus: targetCampus,
        },
        {
          entityType: "dining_venue",
          entityId: diningVenues[0]
            ? String(diningVenues[0]._id)
            : targetCampus,
          label: `${targetCampus} Dining Venues`,
          href: "/dining",
          campus: targetCampus,
        },
      ],
    };
  },
});

export const lookupCourseHubAndSyllabus = internalQuery({
  args: {
    ...viewerAuthArgs,
    subjectCourse: v.string(),
  },
  handler: async (ctx, args) => {
    await resolveViewerFromDb(ctx, args);
    const normalized = normalizeSubjectCourse(args.subjectCourse);
    const hub = await ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", normalized))
      .unique();
    if (!hub) {
      return { found: false, citations: [] };
    }

    const [sections, syllabusRows] = await Promise.all([
      ctx.db
        .query("courseSections")
        .withIndex("by_hub_term", (q) =>
          q.eq("courseHubId", hub._id).eq("termCode", "202608")
        )
        .take(6),
      ctx.db
        .query("courseSyllabiCache")
        .withIndex("by_subject_course", (q) =>
          q.eq("subjectCourse", normalized).eq("termCode", "202608")
        )
        .take(3),
    ]);

    const foundSyl = syllabusRows.find((s) => s.status === "found");

    return {
      found: true,
      subjectCourse: hub.subjectCourse,
      title: hub.title,
      campuses: hub.campuses,
      sections: sections.map((s) => ({
        crn: s.crn,
        section: s.sectionNumber,
        campus: s.campus,
        instructor: s.instructorName,
        time: s.meetings[0]?.timeLabel ?? "TBA",
      })),
      syllabusSummary: foundSyl?.summaryJson
        ? JSON.parse(foundSyl.summaryJson)
        : null,
      citations: [
        {
          entityType: "course_hub",
          entityId: String(hub._id),
          label: `${hub.subjectCourse} · ${hub.title}`,
          href: `/courses/${encodeURIComponent(hub.subjectCourse)}`,
          campus: hub.campuses[0],
        },
      ],
    };
  },
});

export const getEntityDetail = internalQuery({
  args: {
    ...viewerAuthArgs,
    entityType: v.union(
      v.literal("parking_lot"),
      v.literal("dining_venue"),
      v.literal("club"),
      v.literal("course_hub")
    ),
    slugOrCode: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewer = await resolveViewerFromDb(ctx, args);
    const key = args.slugOrCode.trim();

    if (args.entityType === "parking_lot") {
      const lot = await ctx.db
        .query("parkingLots")
        .withIndex("by_slug", (q) => q.eq("slug", key.toLowerCase()))
        .unique();
      if (!lot) return { found: false, citations: [] };
      const reports = await ctx.db
        .query("parkingReports")
        .withIndex("by_lot_active", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("parkingLotId", lot._id)
            .eq("reportKind", "fullness")
            .gt("expiresAt", now)
        )
        .take(15);
      const ev = evaluateParkingLotFullness(lot, reports, now);
      return {
        found: true,
        detail: {
          name: lot.name,
          campus: lot.campus,
          permitTiers: lot.permitTiers,
          status: ev.tierLabel,
          provenance: ev.provenanceLabel,
        },
        citations: [
          {
            entityType: "parking_lot",
            entityId: String(lot._id),
            label: lot.name,
            href: "/parking",
            campus: lot.campus,
          },
        ],
      };
    }

    if (args.entityType === "dining_venue") {
      const venue = await ctx.db
        .query("diningVenues")
        .withIndex("by_slug", (q) => q.eq("nutrisliceSlug", key.toLowerCase()))
        .unique();
      if (!venue) return { found: false, citations: [] };
      return {
        found: true,
        detail: {
          name: venue.name,
          campus: venue.campus,
          buildingName: venue.buildingName,
          openStatus: evaluateDiningOpenStatus(venue.hoursScheduleJson, now)
            .label,
        },
        citations: [
          {
            entityType: "dining_venue",
            entityId: String(venue._id),
            label: venue.name,
            href: "/dining",
            campus: venue.campus,
          },
        ],
      };
    }

    if (args.entityType === "club") {
      const slug = key.toLowerCase();
      const club =
        (await ctx.db
          .query("clubs")
          .withIndex("by_workspace_slug", (q) =>
            q.eq("workspaceKey", viewer.workspaceKey).eq("slug", slug)
          )
          .unique()) ??
        (await ctx.db
          .query("clubs")
          .withIndex("by_workspace_slug", (q) =>
            q.eq("workspaceKey", "ksu").eq("slug", slug)
          )
          .unique());
      if (!club || club.visibilityStatus !== "visible") {
        return { found: false, citations: [] };
      }
      return {
        found: true,
        detail: {
          name: fenceUntrustedCampusText(club.name, 100),
          campus: club.campus,
          summary: fenceUntrustedCampusText(club.summary, 200),
        },
        citations: [
          {
            entityType: "club",
            entityId: String(club._id),
            label: club.name,
            href: `/clubs/${club.slug}`,
            campus: club.campus,
          },
        ],
      };
    }

    const norm = normalizeSubjectCourse(key);
    const hub = await ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", norm))
      .unique();
    if (!hub) return { found: false, citations: [] };
    return {
      found: true,
      detail: {
        subjectCourse: hub.subjectCourse,
        title: hub.title,
        campuses: hub.campuses,
      },
      citations: [
        {
          entityType: "course_hub",
          entityId: String(hub._id),
          label: `${hub.subjectCourse} · ${hub.title}`,
          href: `/courses/${encodeURIComponent(hub.subjectCourse)}`,
          campus: hub.campuses[0],
        },
      ],
    };
  },
});

/**
 * Private 7th tool — physically included ONLY in ASK_SCRAPPY_TOOLS (omitted from FEED_MENTION_TOOLS!).
 */
export const getMyPersonalContext = internalQuery({
  args: {
    ...viewerAuthArgs,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const viewer = await resolveViewerFromDb(ctx, args);
    const enrollments = await ctx.db
      .query("studentEnrollments")
      .withIndex("by_student_term", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
      )
      .take(MAX_TOOL_ROWS);

    const courses = [];
    const deadlines = [];
    const citations = [];

    for (const enr of enrollments) {
      const [hub, section] = await Promise.all([
        ctx.db.get(enr.courseHubId),
        enr.sectionId ? ctx.db.get(enr.sectionId) : Promise.resolve(null),
      ]);
      if (hub) {
        courses.push({
          subjectCourse: hub.subjectCourse,
          title: hub.title,
          crn: enr.crn,
          campus: section?.campus ?? hub.campuses[0],
          meeting: section?.meetings[0]
            ? `${section.meetings[0].timeLabel} in ${section.meetings[0].buildingName} ${section.meetings[0].roomNumber}`
            : "Online / TBA",
        });
        citations.push({
          entityType: "course_hub",
          entityId: String(hub._id),
          label: `${hub.subjectCourse} · ${hub.title}`,
          href: `/courses/${encodeURIComponent(hub.subjectCourse)}`,
          campus: section?.campus ?? hub.campuses[0],
        });
      }
      for (const dl of enr.personalDeadlines.slice(0, 5)) {
        deadlines.push({
          title: fenceUntrustedCampusText(dl.title, 120),
          dueAtIso: new Date(dl.dueAt).toISOString(),
        });
      }
    }

    const memberSessions = [];
    for (const hid of viewer.enrolledCourseHubIds) {
      const rows = await ctx.db
        .query("studySessions")
        .withIndex("by_course_hub_end", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("courseHubId", hid)
            .gt("endTime", now)
        )
        .take(4);
      for (const s of rows) {
        if (s.status === "scheduled" && s.visibilityStatus === "visible") {
          memberSessions.push({
            title: fenceUntrustedCampusText(s.title, 100),
            visibility: s.visibility,
            seats: `${s.attendeeIds.length}/${s.maxSeats}`,
          });
        }
      }
    }

    return {
      studentHandle: `@${viewer.actorStudent.handle}`,
      homeCampus: viewer.actorStudent.homeCampus,
      activeCampusFilter: viewer.actorStudent.activeCampusFilter,
      courses: courses.slice(0, MAX_TOOL_ROWS),
      deadlines: deadlines.slice(0, MAX_TOOL_ROWS),
      enrolledStudySessions: memberSessions.slice(0, MAX_TOOL_ROWS),
      citations: citations.slice(0, 3),
    };
  },
});
