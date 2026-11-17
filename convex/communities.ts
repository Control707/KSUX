import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { removeCommunityChatMember } from "./lib/campusChat";
import { campusFilterValidator, campusValidator } from "./schema";
import { assertPublishSafety } from "./lib/safety";
import { formatStalenessBadge } from "./lib/syncGuard";
import {
  filterVisibleContent,
  isItemVisibleToViewer,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { ensureLazyCommunityGroupChat } from "./courses";
import { hydratePostCards } from "./feed";
import { Doc } from "./_generated/dataModel";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function slugifyClubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function getClubMemberCount(ctx: QueryCtx, club: Doc<"clubs">, workspaceKey: string) {
  if (workspaceKey === "prod") return club.prodMemberCount;
  const roster = await ctx.db.query("clubMembers")
    .withIndex("by_club_student", (q) => q.eq("workspaceKey", workspaceKey).eq("clubId", club._id))
    .take(10);
  return (club.workspaceKey === "ksu" ? club.prodMemberCount : 0) + roster.length;
}

async function getEventCounts(ctx: QueryCtx, event: Doc<"events">, workspaceKey: string) {
  if (workspaceKey === "prod") {
    return { goingCount: event.prodGoingCount, interestedCount: event.prodInterestedCount };
  }
  const base = event.workspaceKey === "ksu";
  const rsvps = await ctx.db.query("eventRsvps")
    .withIndex("by_event_student", (q) => q.eq("workspaceKey", workspaceKey).eq("eventId", event._id))
    .take(10);
  return {
    goingCount: (base ? event.prodGoingCount : 0) + rsvps.filter((row) => row.rsvpStatus === "going").length,
    interestedCount: (base ? event.prodInterestedCount : 0) + rsvps.filter((row) => row.rsvpStatus === "interested").length,
  };
}

export async function setClubMembershipRole(
  ctx: MutationCtx,
  club: Doc<"clubs">,
  workspaceKey: string,
  studentId: Doc<"students">["_id"],
  role: Doc<"clubMembers">["role"],
  now: number
) {
  const membership = await ctx.db.query("clubMembers")
    .withIndex("by_club_student", (q) => q.eq("workspaceKey", workspaceKey)
      .eq("clubId", club._id).eq("studentId", studentId))
    .unique();
  if (!membership) {
    await ctx.db.insert("clubMembers", { workspaceKey, clubId: club._id, studentId, role, joinedAt: now });
    if (workspaceKey === "prod") await ctx.db.patch(club._id, { prodMemberCount: club.prodMemberCount + 1 });
  } else if (membership.role !== role) {
    await ctx.db.patch(membership._id, { role });
  }
  return ensureLazyCommunityGroupChat(ctx, {
    workspaceKey, studentId, parentType: "club", parentId: String(club._id),
    title: club.name, role: role === "officer" ? "admin" : "member", now,
  });
}

export const listClubs = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    clubKindFilter: v.optional(
      v.union(
        v.literal("registered_ksu"),
        v.literal("campus_department"),
        v.literal("community")
      )
    ),
    queryText: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;
    const limit = Math.min(args.limit ?? 25, 25);
    const qText = args.queryText?.trim();

    const fetchScope = async (wsKey: string): Promise<Doc<"clubs">[]> => {
      if (qText) {
        return ctx.db
          .query("clubs")
          .withSearchIndex("search_clubs", (q) => {
            let sq = q
              .search("searchText", qText)
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible");
            if (campusFilter !== "All KSU") {
              sq = sq.eq("campus", campusFilter);
            }
            if (args.clubKindFilter) {
              sq = sq.eq("clubKind", args.clubKindFilter);
            }
            return sq;
          })
          .take(limit);
      }

      if (campusFilter === "All KSU") {
        const [k, m] = await Promise.all([
          ctx.db
            .query("clubs")
            .withIndex("by_workspace_campus", (q) =>
              q
                .eq("workspaceKey", wsKey)
                .eq("visibilityStatus", "visible")
                .eq("campus", "Kennesaw")
            )
            .take(limit),
          ctx.db
            .query("clubs")
            .withIndex("by_workspace_campus", (q) =>
              q
                .eq("workspaceKey", wsKey)
                .eq("visibilityStatus", "visible")
                .eq("campus", "Marietta")
            )
            .take(limit),
        ]);
        return [...k, ...m];
      }

      return ctx.db
        .query("clubs")
        .withIndex("by_workspace_campus", (q) =>
          q
            .eq("workspaceKey", wsKey)
            .eq("visibilityStatus", "visible")
            .eq("campus", campusFilter)
        )
        .take(limit);
    };

    // Dual-scope read: shared read-only "ksu" catalog + viewer.workspaceKey Community Clubs
    const [ksuRows, wsRows, myMemberships] = await Promise.all([
      args.clubKindFilter === "community" ? Promise.resolve([]) : fetchScope("ksu"),
      fetchScope(viewer.workspaceKey),
      ctx.db
        .query("clubMembers")
        .withIndex("by_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("studentId", viewer.actorStudent._id)
        )
        .take(50),
    ]);

    const roleByClubId = new Map<string, string>();
    for (const m of myMemberships) {
      roleByClubId.set(String(m.clubId), m.role);
    }

    const combined = [...wsRows, ...ksuRows]
      .filter((c) => !args.clubKindFilter || c.clubKind === args.clubKindFilter)
      .slice(0, limit);

    return Promise.all(combined.map(async (c) => ({
      _id: c._id,
      slug: c.slug,
      clubKind: c.clubKind,
      campus: c.campus,
      name: c.name,
      isFixture: c.isFixture ?? false,
      shortName: c.shortName,
      summary: c.summary,
      memberCount: await getClubMemberCount(ctx, c, viewer.workspaceKey),
      myRole: roleByClubId.get(String(c._id)) ?? null,
    })));
  },
});

export const getClubBySlug = viewerQuery({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const cleanSlug = args.slug.trim().toLowerCase();

    // Check workspace Community Club first, then shared "ksu" catalog
    let club = await ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("slug", cleanSlug)
      )
      .unique();

    if (!club) {
      club = await ctx.db
        .query("clubs")
        .withIndex("by_workspace_slug", (q) =>
          q.eq("workspaceKey", "ksu").eq("slug", cleanSlug)
        )
        .unique();
    }

    if (!club || club.visibilityStatus !== "visible") {
      return null;
    }

    const [myMembership, groupChat, ksuClubEvents, wsClubEvents, rawPosts] =
      await Promise.all([
        ctx.db
          .query("clubMembers")
          .withIndex("by_club_student", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("clubId", club!._id)
              .eq("studentId", viewer.actorStudent._id)
          )
          .unique(),
        ctx.db
          .query("chats")
          .withIndex("by_workspace_parent", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("parentType", "club")
              .eq("parentId", String(club!._id))
          )
          .unique(),
        ctx.db
          .query("events")
          .withIndex("by_club_start", (q) =>
            q
              .eq("workspaceKey", "ksu")
              .eq("clubId", club!._id)
              .gt("startTime", now - 3600_000)
          )
          .take(10),
        ctx.db
          .query("events")
          .withIndex("by_club_start", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("clubId", club!._id)
              .gt("startTime", now - 3600_000)
          )
          .take(10),
        ctx.db
          .query("posts")
          .withIndex("by_club", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("clubId", club!._id)
              .eq("visibilityStatus", "visible")
          )
          .order("desc")
          .take(15),
      ]);

    const visiblePosts = filterVisibleContent(rawPosts, viewer, {
      targetType: "post",
      getAuthorId: (p) => p.authorId,
    }).filter((p) => !p.rootPostId);
    const posts = await hydratePostCards(ctx, visiblePosts, viewer);

    const events = [...wsClubEvents, ...ksuClubEvents]
      .filter((e) => e.visibilityStatus === "visible" && e.status !== "cancelled")
      .sort((a, b) => a.startTime - b.startTime);

    return {
      club: {
        _id: club._id,
        slug: club.slug,
        clubKind: club.clubKind,
        campus: club.campus,
        name: club.name,
        isFixture: club.isFixture ?? false,
        shortName: club.shortName,
        summary: club.summary,
        description: club.description,
        prodMemberCount: await getClubMemberCount(ctx, club, viewer.workspaceKey),
      },
      myRole: myMembership?.role ?? null,
      groupChatId: groupChat?._id ?? null,
      events,
      posts,
    };
  },
});

export const toggleJoinClub = viewerMutation({
  args: {
    clubId: v.id("clubs"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const club = await ctx.db.get(args.clubId);
    if (
      !club ||
      (club.workspaceKey !== "ksu" && club.workspaceKey !== viewer.workspaceKey) ||
      club.visibilityStatus !== "visible"
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Club not found." });
    }

    const existing = await ctx.db
      .query("clubMembers")
      .withIndex("by_club_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("clubId", club._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      if (viewer.workspaceKey === "prod") {
        await ctx.db.patch(club._id, {
          prodMemberCount: Math.max(0, club.prodMemberCount - 1),
        });
      }
      await removeCommunityChatMember(ctx, viewer.workspaceKey, "club", club._id, viewer.actorStudent._id);
      return { joined: false, groupChatId: null };
    }

    const groupChatId = await setClubMembershipRole(ctx, club, viewer.workspaceKey,
      viewer.actorStudent._id, "member", now);

    return { joined: true, groupChatId };
  },
});

export const createCommunityClub = viewerMutation({
  args: {
    name: v.string(),
    shortName: v.optional(v.string()),
    campus: campusValidator,
    summary: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const name = args.name.trim();
    const summary = args.summary.trim();
    const description = args.description.trim();

    if (name.length < 3 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Club name must be 3–80 characters.",
      });
    }
    assertPublishSafety(`${name} ${summary} ${description}`);

    let slug = slugifyClubName(name);
    if (!slug) slug = `community-club-${now}`;
    const collisionInWs = await ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", viewer.workspaceKey).eq("slug", slug)
      )
      .unique();
    const collisionInKsu = await ctx.db
      .query("clubs")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceKey", "ksu").eq("slug", slug)
      )
      .unique();
    if (collisionInWs || collisionInKsu) {
      slug = `${slug}-${String(now).slice(-4)}`;
    }

    const clubId = await ctx.db.insert("clubs", {
      workspaceKey: viewer.workspaceKey,
      slug,
      clubKind: "community",
      campus: args.campus,
      name,
      shortName: args.shortName?.trim().slice(0, 8) || name.slice(0, 4).toUpperCase(),
      summary: summary.slice(0, 180),
      description: description.slice(0, 1200),
      searchText: `${name} ${summary} ${args.campus} community`,
      prodMemberCount: 1,
      visibilityStatus: "visible",
    });

    await ctx.db.insert("clubMembers", {
      workspaceKey: viewer.workspaceKey,
      clubId,
      studentId: viewer.actorStudent._id,
      role: "officer",
      joinedAt: now,
    });

    const groupChatId = await ensureLazyCommunityGroupChat(ctx, {
      workspaceKey: viewer.workspaceKey,
      studentId: viewer.actorStudent._id,
      parentType: "club",
      parentId: String(clubId),
      title: name,
      role: "admin",
      now,
    });

    return { clubId, slug, groupChatId };
  },
});

export const claimClubOfficerRole = viewerMutation({
  args: {
    clubId: v.id("clubs"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const club = await ctx.db.get(args.clubId);
    if (
      !club ||
      (club.workspaceKey !== "ksu" && club.workspaceKey !== viewer.workspaceKey) ||
      club.visibilityStatus !== "visible"
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Club not found." });
    }

    const autoApproved = Boolean(
      viewer.mode === "student" &&
        viewer.actorStudent.canonicalEmail &&
        club.contactEmailCanonical &&
        viewer.actorStudent.canonicalEmail.toLowerCase() ===
          club.contactEmailCanonical.toLowerCase()
    );

    const assignedRole = autoApproved
      ? ("officer" as const)
      : ("pending_officer_claim" as const);

    const existing = await ctx.db
      .query("clubMembers")
      .withIndex("by_club_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("clubId", club._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();

    const role = existing?.role === "officer" ? "officer" : assignedRole;
    await setClubMembershipRole(ctx, club, viewer.workspaceKey, viewer.actorStudent._id, role, now);

    return {
      status: role === "officer"
        ? ("auto_approved" as const)
        : ("routed_to_moderation" as const),
      role,
    };
  },
});

export const listEvents = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    queryText: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;
    const limit = Math.min(args.limit ?? 25, 25);
    const qText = args.queryText?.trim();

    const syncState = await ctx.db
      .query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", "localist_engage_events"))
      .unique();

    const fetchWorkspaceEvents = async (wsKey: string): Promise<Doc<"events">[]> => {
      if (qText) {
        if (campusFilter === "All KSU") {
          return ctx.db
            .query("events")
            .withSearchIndex("search_events", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", wsKey)
                .eq("visibilityStatus", "visible")
            )
            .take(limit);
        }
        const [localMatches, bothMatches] = await Promise.all([
          ctx.db
            .query("events")
            .withSearchIndex("search_events", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", wsKey)
                .eq("visibilityStatus", "visible")
                .eq("campusScope", campusFilter)
            )
            .take(limit),
          ctx.db
            .query("events")
            .withSearchIndex("search_events", (q) =>
              q
                .search("searchText", qText)
                .eq("workspaceKey", wsKey)
                .eq("visibilityStatus", "visible")
                .eq("campusScope", "Both")
            )
            .take(limit),
        ]);
        return [...localMatches, ...bothMatches];
      }

      if (campusFilter === "All KSU") {
        return ctx.db
          .query("events")
          .withIndex("by_all_start", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .gt("startTime", now - 4 * 3600_000)
          )
          .take(limit);
      }

      const [localEvents, bothEvents] = await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_scope_start", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .eq("campusScope", campusFilter)
              .gt("startTime", now - 4 * 3600_000)
          )
          .take(limit),
        ctx.db
          .query("events")
          .withIndex("by_scope_start", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .eq("campusScope", "Both")
              .gt("startTime", now - 4 * 3600_000)
          )
          .take(limit),
      ]);
      return [...localEvents, ...bothEvents];
    };

    const [ksuEvents, wsEvents, myRsvps] = await Promise.all([
      fetchWorkspaceEvents("ksu"),
      fetchWorkspaceEvents(viewer.workspaceKey),
      ctx.db
        .query("eventRsvps")
        .withIndex("by_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("studentId", viewer.actorStudent._id)
        )
        .take(100),
    ]);

    const myRsvpMap = new Map<string, "going" | "interested">();
    for (const r of myRsvps) {
      myRsvpMap.set(String(r.eventId), r.rsvpStatus);
    }

    const merged = [...wsEvents, ...ksuEvents]
      .filter((ev) => {
        if (ev.status === "cancelled") return false;
        if (
          !isItemVisibleToViewer(viewer, {
            targetType: "post",
            targetId: String(ev._id),
            authorId: ev.organizerStudentId,
            visibilityStatus: ev.visibilityStatus,
          })
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, limit);

    const staleness = formatStalenessBadge(
      syncState?.lastSuccessAt,
      now,
      TWO_HOURS_MS
    );

    const items = await Promise.all(
      merged.map(async (ev) => {
        return {
          _id: ev._id,
          source: ev.source,
          isFixture: ev.isFixture ?? false,
          campus: ev.campus,
          campusScope: ev.campusScope,
          isVirtual: ev.isVirtual,
          clubId: ev.clubId,
          title: ev.title,
          description: ev.description,
          locationName: ev.locationName,
          roomNumber: ev.roomNumber,
          externalUrl: ev.externalUrl,
          startTime: ev.startTime,
          endTime: ev.endTime,
          status: ev.status,
          ...await getEventCounts(ctx, ev, viewer.workspaceKey),
          myRsvpStatus: myRsvpMap.get(String(ev._id)) ?? null,
        };
      })
    );

    return {
      staleness,
      events: items,
    };
  },
});

export const getEventDetail = viewerQuery({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const ev = await ctx.db.get(args.eventId);
    if (
      !ev ||
      (ev.workspaceKey !== "ksu" && ev.workspaceKey !== viewer.workspaceKey) ||
      ev.visibilityStatus !== "visible"
    ) {
      return null;
    }

    const [myRsvp, club] = await Promise.all([
      ctx.db
        .query("eventRsvps")
        .withIndex("by_event_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("eventId", ev._id)
            .eq("studentId", viewer.actorStudent._id)
        )
        .unique(),
      ev.clubId ? ctx.db.get(ev.clubId) : Promise.resolve(null),
    ]);

    return {
      event: ev,
      club: club
        ? { _id: club._id, slug: club.slug, name: club.name }
        : null,
      myRsvpStatus: myRsvp?.rsvpStatus ?? null,
      ...await getEventCounts(ctx, ev, viewer.workspaceKey),
    };
  },
});

export const createNativeEvent = viewerMutation({
  args: {
    title: v.string(),
    description: v.string(),
    campus: campusValidator,
    isVirtual: v.boolean(),
    locationName: v.string(),
    roomNumber: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    clubId: v.optional(v.id("clubs")),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const title = args.title.trim();
    const description = args.description.trim();
    const locationName = args.locationName.trim();

    if (title.length < 3 || title.length > 120) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Event title must be 3–120 characters.",
      });
    }
    if (args.endTime <= args.startTime) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Event end time must be after start time.",
      });
    }
    assertPublishSafety(`${title} ${description} ${locationName}`);

    let source: "club" | "student" = "student";
    if (args.clubId) {
      const membership = await ctx.db
        .query("clubMembers")
        .withIndex("by_club_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("clubId", args.clubId!)
            .eq("studentId", viewer.actorStudent._id)
        )
        .unique();
      if (!membership || membership.role !== "officer") {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Only Club Officers can publish official Club Events.",
        });
      }
      source = "club";
    }

    const eventId = await ctx.db.insert("events", {
      workspaceKey: viewer.workspaceKey,
      source,
      campus: args.campus,
      campusScope: args.isVirtual ? "Both" : args.campus,
      isVirtual: args.isVirtual,
      clubId: args.clubId,
      organizerStudentId: viewer.actorStudent._id,
      title,
      description: description.slice(0, 1200),
      searchText: `${title} ${description} ${locationName} ${args.campus}`,
      locationName,
      roomNumber: args.roomNumber?.trim(),
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled",
      visibilityStatus: "visible",
      prodGoingCount: 1,
      prodInterestedCount: 0,
    });

    await ctx.db.insert("eventRsvps", {
      workspaceKey: viewer.workspaceKey,
      eventId,
      studentId: viewer.actorStudent._id,
      rsvpStatus: "going",
      updatedAt: Date.now(),
    });

    return { eventId };
  },
});

export const setEventRsvp = viewerMutation({
  args: {
    eventId: v.id("events"),
    rsvpStatus: v.union(
      v.literal("going"),
      v.literal("interested"),
      v.literal("none")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const ev = await ctx.db.get(args.eventId);
    if (
      !ev ||
      (ev.workspaceKey !== "ksu" && ev.workspaceKey !== viewer.workspaceKey)
    ) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Event not found." });
    }

    const existing = await ctx.db
      .query("eventRsvps")
      .withIndex("by_event_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("eventId", ev._id)
          .eq("studentId", viewer.actorStudent._id)
      )
      .unique();

    const prevStatus = existing?.rsvpStatus ?? null;
    if (args.rsvpStatus === "none") {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, {
        rsvpStatus: args.rsvpStatus,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("eventRsvps", {
        workspaceKey: viewer.workspaceKey,
        eventId: ev._id,
        studentId: viewer.actorStudent._id,
        rsvpStatus: args.rsvpStatus,
        updatedAt: now,
      });
    }

    // Immutable "ksu" guardrail: ONLY prod mutations adjust prodGoingCount / prodInterestedCount on "ksu" rows!
    if (viewer.workspaceKey === "prod" || ev.workspaceKey === viewer.workspaceKey) {
      let goingDelta = 0;
      let interestedDelta = 0;
      if (prevStatus === "going") goingDelta -= 1;
      if (prevStatus === "interested") interestedDelta -= 1;
      if (args.rsvpStatus === "going") goingDelta += 1;
      if (args.rsvpStatus === "interested") interestedDelta += 1;

      if (goingDelta !== 0 || interestedDelta !== 0) {
        await ctx.db.patch(ev._id, {
          prodGoingCount: Math.max(0, ev.prodGoingCount + goingDelta),
          prodInterestedCount: Math.max(
            0,
            ev.prodInterestedCount + interestedDelta
          ),
        });
      }
    }

    return { rsvpStatus: args.rsvpStatus === "none" ? null : args.rsvpStatus };
  },
});
