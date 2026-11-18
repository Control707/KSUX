import { v } from "convex/values";
import { campusFilterValidator } from "./schema";
import {
  filterVisibleContent,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import {
  evaluateDiningOpenStatus,
  evaluateParkingLotFullness,
} from "./lib/parkingMath";
import { Doc, Id } from "./_generated/dataModel";
import { easternDate, zonedDateParts } from "./lib/easternDate";
import { freshShuttleEta } from "./lib/shuttleRead";
import type { QueryCtx } from "./_generated/server";
import { isCurrentCampusChatMember } from "./lib/campusChat";
import { makeStudentPairKey } from "./lib/crypto";
import { getChatPreview } from "./lib/chatPreview";

const INTERCAMPUS_ROUTE = "74760";
const LIVE_STUDY_AGE_MS = 15 * 60_000;

async function listCampusShuttleRoutes(ctx: QueryCtx, campus: "Kennesaw" | "Marietta" | "All KSU", limit: number) {
  const candidates = campus === "All KSU" ? ctx.db.query("shuttleRoutes").take(limit)
    : Promise.all(([campus, "Both"] as const).map((scope) => ctx.db.query("shuttleRoutes")
      .withIndex("by_campus_scope", (q) => q.eq("campusScope", scope)).take(limit)))
      .then((groups) => groups.flat().sort((a, b) => a._creationTime - b._creationTime));
  const [routes, intercampus] = await Promise.all([
    candidates,
    ctx.db.query("shuttleRoutes")
      .withIndex("by_passio_id", (q) => q.eq("passioRouteId", INTERCAMPUS_ROUTE))
      .unique(),
  ]);
  const visible = routes.slice(0, limit);
  return intercampus && !visible.some((route) => route._id === intercampus._id)
    ? [...visible.slice(0, limit - 1), intercampus]
    : visible;
}

export const setCampusFilter = viewerMutation({
  args: {
    campusFilter: campusFilterValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.viewer.actorStudent._id, {
      activeCampusFilter: args.campusFilter,
    });
    return {
      activeCampusFilter: args.campusFilter,
    };
  },
});

export const shellSummary = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;

    // 1. Zero-scan unread calculation via chatMembers.by_student_unread + chats.messageSeq
    const unreadMemberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_student_unread", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("hasUnread", true)
      )
      .take(50);

    let numericUnreadCount = 0;
    let hasDotUnread = false;
    let latestUnreadEvent: {
      chatId: Id<"chats">;
      chatKind: string;
      title: string;
      senderHandle?: string;
      preview?: string;
      lastMessageAt: number;
    } | null = null;
    const blockedPairs = new Set(Array.from(viewer.blockedStudentIds, (id) =>
      makeStudentPairKey(viewer.actorStudent._id, id)));

    for (const m of unreadMemberships) {
      if (m.isArchived) continue;
      const chat = await ctx.db.get(m.chatId);
      if (!chat || chat.requestStatus === "declined" ||
          (chat.dmPairKey && blockedPairs.has(chat.dmPairKey)) ||
          !await isCurrentCampusChatMember(ctx, chat, viewer.actorStudent._id)) continue;
      const diff = Math.max(0, chat.messageSeq - m.lastReadSeq);
      if (diff <= 0) continue;

      if (!m.isMuted) {
        if (m.badgeMode === "count") {
          numericUnreadCount += diff;
        } else {
          hasDotUnread = true;
        }

        if (
          !latestUnreadEvent ||
          chat.lastMessageAt > latestUnreadEvent.lastMessageAt
        ) {
          latestUnreadEvent = {
            chatId: chat._id,
            chatKind: chat.kind,
            title:
              chat.title ||
              (chat.kind === "dm"
                ? `@${chat.lastSenderHandle ?? "student"}`
                : "Campus Chat"),
            senderHandle: chat.lastSenderHandle,
            preview: await getChatPreview(ctx, chat, viewer),
            lastMessageAt: chat.lastMessageAt,
          };
        }
      }
    }

    // 2. Desktop right Campus Pulse rail: live Shuttle Routes + top Parking Lots
    const [routes, latestShuttleSnap, kennesawLots, mariettaLots] =
      await Promise.all([
        listCampusShuttleRoutes(ctx, campusFilter, 5),
        ctx.db
          .query("shuttleSnapshots")
          .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
          .unique(),
        campusFilter === "Marietta"
          ? Promise.resolve([] as Doc<"parkingLots">[])
          : ctx.db
              .query("parkingLots")
              .withIndex("by_campus", (q) => q.eq("campus", "Kennesaw"))
              .take(50),
        campusFilter === "Kennesaw"
          ? Promise.resolve([] as Doc<"parkingLots">[])
          : ctx.db
              .query("parkingLots")
              .withIndex("by_campus", (q) => q.eq("campus", "Marietta"))
              .take(35),
      ]);

    const scopedRoutes = routes.map((r) => {
        const etaMatch = freshShuttleEta(latestShuttleSnap, r.passioRouteId, now, viewer.mode === "demo");
        return {
          _id: r._id,
          passioRouteId: r.passioRouteId,
          shortName: r.shortName,
          name: r.name,
          campusScope: r.campusScope,
          colorHex: r.colorHex,
          nextEtaMinutes: etaMatch?.etaMinutes ?? null,
          loadLabel: etaMatch?.loadLabel ?? null,
          isFixture: Boolean(etaMatch && latestShuttleSnap?.isFixture),
        };
      });

    const candidateLots = [...kennesawLots, ...mariettaLots]
      .sort((a, b) => Number(b.isDeck) - Number(a.isDeck))
      .slice(0, 5);

    const pulseLots = await Promise.all(
      candidateLots.map(async (lot) => {
        const [fullnessReports, spotOpenings] = await Promise.all([
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "fullness")
                .gt("expiresAt", now)
            )
            .take(25),
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "spot_opening")
                .gt("expiresAt", now)
            )
            .take(5),
        ]);

        const evaluated = evaluateParkingLotFullness(lot, fullnessReports, now);
        const activeOpenings = spotOpenings.filter(
          (s) => s.status === "active" && s.goneVoterIds.length < 2
        );

        return {
          _id: lot._id,
          slug: lot.slug,
          name: lot.name,
          campus: lot.campus,
          isDeck: lot.isDeck,
          ...evaluated,
          spotOpeningCount: activeOpenings.length,
          spotOpeningLevel: activeOpenings[0]?.deckLevel,
        };
      })
    );

    return {
      viewer: {
        mode: viewer.mode,
        workspaceKey: viewer.workspaceKey,
        demoShortCode: viewer.demoShortCode,
        isModerator: viewer.isModerator,
        student: toPublicStudent(viewer.actorStudent),
        activeCampusFilter: viewer.actorStudent.activeCampusFilter,
        permitTier: viewer.actorStudent.permitTier,
        pinnedParkingLotIds: viewer.actorStudent.pinnedParkingLotIds,
      },
      unread: {
        numericUnreadCount,
        hasDotUnread,
        latestUnreadEvent,
      },
      campusPulse: {
        shuttleRoutes: scopedRoutes,
        parkingLots: pulseLots,
        shuttleFetchedAt: latestShuttleSnap?.fetchedAt ?? null,
      },
    };
  },
});

export const getNowHud = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;

    // 1. Personal enrollments & private schedule (strictly actorStudent._id)
    const enrollments = await ctx.db
      .query("studentEnrollments")
      .withIndex("by_student_term", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
      )
      .take(15);

    const importedTerms = await ctx.db.query("privateScheduleTerms").withIndex("by_student_term", (q) =>
      q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id)
    ).order("desc").take(20);
    const privateClasses = importedTerms.flatMap(({ termCode, entries }) =>
      entries.map((entry) => ({ ...entry, termCode })));
    const enrolledCourses = [];
    const personalDeadlines: Array<{
      uid: string;
      title: string;
      dueAt: number;
      courseCode?: string;
      location?: string;
    }> = [];

    for (const enr of enrollments) {
      const [hub, section] = await Promise.all([
        ctx.db.get(enr.courseHubId),
        enr.sectionId ? ctx.db.get(enr.sectionId) : Promise.resolve(null),
      ]);
      if (hub && !hub.isRetiredFixture) {
        const activeSection = section?.isRetiredFixture ? null : section;
        enrolledCourses.push({
          enrollmentId: enr._id,
          courseHubId: hub._id,
          sectionId: activeSection?._id,
          subjectCourse: hub.subjectCourse,
          title: hub.title,
          termCode: enr.termCode,
          crn: activeSection ? enr.crn : undefined,
          campus: activeSection?.campus ?? hub.campuses[0] ?? "Kennesaw",
          instructorName: activeSection?.instructorName,
          meetings: activeSection?.meetings ?? [],
        });
      }
      for (const dl of enr.personalDeadlines) {
        if (dl.dueAt > now - 3600_000) {
          personalDeadlines.push(dl);
        }
      }
    }
    const deadlineIds = new Set(personalDeadlines.map(({ uid }) => uid));
    for (const { personalDeadlines: imported } of importedTerms) {
      for (const deadline of imported) {
        if (deadline.dueAt > now - 3600_000 && !deadlineIds.has(deadline.uid)) {
          personalDeadlines.push(deadline);
          deadlineIds.add(deadline.uid);
        }
      }
    }
    personalDeadlines.sort((a, b) => a.dueAt - b.dueAt);

    // 2. Joined Clubs (preserved across Campus filter for rings/personal identity)
    const myClubMemberships = await ctx.db
      .query("clubMembers")
      .withIndex("by_student", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
      )
      .take(25);

    const joinedClubs = [];
    for (const cm of myClubMemberships) {
      const club = await ctx.db.get(cm.clubId);
      if (club && club.visibilityStatus === "visible") {
        joinedClubs.push({
          _id: club._id,
          slug: club.slug,
          name: club.name,
          shortName: club.shortName,
          campus: club.campus,
          role: cm.role,
        });
      }
    }

    // 3. Pinned / Primary Parking Lots + Overflow Reroute
    const kLots =
      campusFilter === "Marietta"
        ? []
        : await ctx.db
            .query("parkingLots")
            .withIndex("by_campus", (q) => q.eq("campus", "Kennesaw"))
            .take(50);
    const mLots =
      campusFilter === "Kennesaw"
        ? []
        : await ctx.db
            .query("parkingLots")
            .withIndex("by_campus", (q) => q.eq("campus", "Marietta"))
            .take(35);
    const scopedLots = [...kLots, ...mLots];

    const pinnedSet = new Set(
      viewer.actorStudent.pinnedParkingLotIds.map(String)
    );
    const primaryLots = [
      ...scopedLots.filter((l) => pinnedSet.has(String(l._id))),
      ...scopedLots.filter(
        (l) => !pinnedSet.has(String(l._id)) && l.isDeck
      ),
      ...scopedLots.filter(
        (l) => !pinnedSet.has(String(l._id)) && !l.isDeck
      ),
    ].slice(0, 3);

    const [scopedRoutes, latestShuttleSnap] = await Promise.all([
      listCampusShuttleRoutes(ctx, campusFilter, 4),
      ctx.db
        .query("shuttleSnapshots")
        .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
        .unique(),
    ]);

    const parkingCards = await Promise.all(
      primaryLots.map(async (lot) => {
        const [fullnessReports, spotOpenings] = await Promise.all([
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "fullness")
                .gt("expiresAt", now)
            )
            .take(25),
          ctx.db
            .query("parkingReports")
            .withIndex("by_lot_active", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("parkingLotId", lot._id)
                .eq("reportKind", "spot_opening")
                .gt("expiresAt", now)
            )
            .take(5),
        ]);

        const evaluated = evaluateParkingLotFullness(lot, fullnessReports, now);
        const activeOpenings = spotOpenings.filter(
          (s) => s.status === "active" && s.goneVoterIds.length < 2
        );

        let overflowSuggestion: {
          lotId: Id<"parkingLots">;
          slug: string;
          name: string;
          tierLabel: string;
          shuttleName?: string;
          shuttleEtaMinutes?: number;
        } | null = null;

        if (evaluated.effectiveTier >= 2 && lot.overflowTargetLotSlugs.length > 0) {
          for (const targetSlug of lot.overflowTargetLotSlugs) {
            const overflowLot = await ctx.db
              .query("parkingLots")
              .withIndex("by_slug", (q) => q.eq("slug", targetSlug))
              .unique();
            if (!overflowLot) continue;
            const overflowReports = await ctx.db
              .query("parkingReports")
              .withIndex("by_lot_active", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("parkingLotId", overflowLot._id)
                  .eq("reportKind", "fullness")
                  .gt("expiresAt", now)
              )
              .take(15);
            const overflowEval = evaluateParkingLotFullness(
              overflowLot,
              overflowReports,
              now
            );
            if (overflowEval.effectiveTier <= 1) {
              const routeId = overflowLot.servedByShuttleRouteIds[0];
              const route = routeId ? await ctx.db
                .query("shuttleRoutes")
                .withIndex("by_passio_id", (q) => q.eq("passioRouteId", routeId))
                .unique() : null;
              const eta = routeId && freshShuttleEta(latestShuttleSnap, routeId, now, viewer.mode === "demo");
              overflowSuggestion = {
                lotId: overflowLot._id,
                slug: overflowLot.slug,
                name: overflowLot.name,
                tierLabel: overflowEval.tierLabel,
                shuttleName: route?.name,
                shuttleEtaMinutes: eta ? eta.etaMinutes : undefined,
              };
              break;
            }
          }
        }

        return {
          _id: lot._id,
          slug: lot.slug,
          name: lot.name,
          campus: lot.campus,
          isDeck: lot.isDeck,
          isPinned: pinnedSet.has(String(lot._id)),
          ...evaluated,
          spotOpening: activeOpenings[0]
            ? {
                reportId: activeOpenings[0]._id,
                deckLevel: activeOpenings[0].deckLevel,
                expiresAt: activeOpenings[0].expiresAt,
              }
            : null,
          overflowSuggestion,
        };
      })
    );

    // 4. Next Big Owl Bus Shuttle Routes (always keeping intercampus 74760)
    const shuttleCards = scopedRoutes.map((r) => {
        const eta = freshShuttleEta(latestShuttleSnap, r.passioRouteId, now, viewer.mode === "demo");
        const nextStop = eta && r.stops.find((stop) => stop.stopId === eta.stopId);
        return {
          _id: r._id,
          passioRouteId: r.passioRouteId,
          shortName: r.shortName,
          name: r.name,
          campusScope: r.campusScope,
          colorHex: r.colorHex,
          nextStopName: nextStop ? nextStop.name : null,
          etaMinutes: eta?.etaMinutes ?? null,
          loadLabel: eta?.loadLabel ?? null,
          isFixture: Boolean(eta && latestShuttleSnap?.isFixture),
        };
      });

    // 5. Study Rooms & Active Study Sessions
    const studyRoomsSample =
      campusFilter === "All KSU"
        ? [
            ...(await ctx.db
              .query("studyRooms")
              .withIndex("by_campus_kind", (q) =>
                q.eq("campus", "Kennesaw").eq("roomKind", "libcal")
              )
              .take(50)),
            ...(await ctx.db
              .query("studyRooms")
              .withIndex("by_campus_kind", (q) =>
                q.eq("campus", "Marietta").eq("roomKind", "libcal")
              )
              .take(50)),
          ]
        : await ctx.db
            .query("studyRooms")
            .withIndex("by_campus_kind", (q) =>
              q.eq("campus", campusFilter).eq("roomKind", "libcal")
            )
            .take(50);

    const roomSnapshots = await ctx.db.query("studyRoomSnapshots")
      .withIndex("by_date", (q) => q.eq("dateET", easternDate(now)))
      .take(100);
    const roomSnapshotById = new Map(roomSnapshots.map((snapshot) => [snapshot.studyRoomId, snapshot]));
    const { hour, minute } = zonedDateParts(now);
    const slot = BigInt(hour * 2 + Math.floor(minute / 30));
    const openRooms = studyRoomsSample.flatMap((room) => {
      const snapshot = roomSnapshotById.get(room._id);
      if (!snapshot || (snapshot.isFixture && viewer.mode !== "demo")) return [];
      if (!snapshot.isFixture && (now - snapshot.updatedAt > LIVE_STUDY_AGE_MS)) return [];
      return (snapshot.slotMask48 & (1n << slot)) === 0n
        ? []
        : [{ ...room, isFixture: snapshot.isFixture ?? false }];
    });

    const openSessionsCampus =
      campusFilter === "All KSU"
        ? [
            ...(await ctx.db
              .query("studySessions")
              .withIndex("by_campus_end", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("visibility", "campus_open")
                  .eq("campus", "Kennesaw")
                  .gt("endTime", now)
              )
              .take(5)),
            ...(await ctx.db
              .query("studySessions")
              .withIndex("by_campus_end", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("visibility", "campus_open")
                  .eq("campus", "Marietta")
                  .gt("endTime", now)
              )
              .take(5)),
          ]
        : await ctx.db
            .query("studySessions")
            .withIndex("by_campus_end", (q) =>
              q
                .eq("workspaceKey", viewer.workspaceKey)
                .eq("visibility", "campus_open")
                .eq("campus", campusFilter)
                .gt("endTime", now)
            )
            .take(6);

    const courseSessions = [];
    for (const hubId of viewer.enrolledCourseHubIds) {
      const rows = await ctx.db
        .query("studySessions")
        .withIndex("by_course_hub_end", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("courseHubId", hubId)
            .gt("endTime", now)
        )
        .take(4);
      for (const r of rows) {
        if (campusFilter === "All KSU" || r.campus === campusFilter) {
          courseSessions.push(r);
        }
      }
    }

    const dedupSessionsMap = new Map<string, Doc<"studySessions">>();
    for (const s of [...openSessionsCampus, ...courseSessions]) {
      if (s.status === "scheduled") {
        dedupSessionsMap.set(String(s._id), s);
      }
    }
    const visibleStudySessions = filterVisibleContent(
      Array.from(dedupSessionsMap.values()),
      viewer,
      {
        targetType: "study_session",
        getAuthorId: (s) => s.hostId,
      }
    ).slice(0, 4);

    // 6. Dining Venues (The Commons / Stingers + top retail)
    const diningSample =
      campusFilter === "All KSU"
        ? [
            ...(await ctx.db
              .query("diningVenues")
              .withIndex("by_campus", (q) => q.eq("campus", "Kennesaw"))
              .take(3)),
            ...(await ctx.db
              .query("diningVenues")
              .withIndex("by_campus", (q) => q.eq("campus", "Marietta"))
              .take(3)),
          ]
        : await ctx.db
            .query("diningVenues")
            .withIndex("by_campus", (q) => q.eq("campus", campusFilter))
            .take(4);

    const diningCards = await Promise.all(
      diningSample.map(async (venue) => {
        const pulses = await ctx.db
          .query("campusPulses")
          .withIndex("by_target_active", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("targetType", "dining_venue")
              .eq("targetKey", venue.nutrisliceSlug)
              .gt("expiresAt", now)
          )
          .take(5);

        const openStatus = evaluateDiningOpenStatus(
          venue.hoursScheduleJson,
          now
        );
        const latestLine = pulses.sort(
          (a, b) => b.publishedAt - a.publishedAt
        )[0];
        const lineLabel = latestLine
          ? latestLine.tierValue === "no_wait"
            ? "No Wait (Live)"
            : latestLine.tierValue === "short_wait"
              ? "5–10m Line (Live)"
              : "Packed 15m+ (Live)"
          : "Typical meal-hour flow";

        return {
          _id: venue._id,
          slug: venue.nutrisliceSlug,
          name: venue.name,
          campus: venue.campus,
          venueKind: venue.venueKind,
          openStatus,
          hoursAreFixture: venue.isFixtureHours ?? false,
          lineLabel,
          stationChip: latestLine?.stationChips?.[0],
          lastMenuSyncAt: venue.lastMenuSyncAt,
        };
      })
    );

    // 7. Upcoming / Today's Events (merging "ksu" + viewer.workspaceKey, respecting campusScope: "Both")
    const fetchScopedEvents = async (wsKey: string) => {
      if (campusFilter === "All KSU") {
        return ctx.db
          .query("events")
          .withIndex("by_all_end", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .eq("status", "scheduled")
              .gt("endTime", now)
          )
          .take(25);
      }
      const [localRows, bothRows] = await Promise.all([
        ctx.db
          .query("events")
          .withIndex("by_scope_end", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .eq("status", "scheduled")
              .eq("campusScope", campusFilter)
              .gt("endTime", now)
          )
          .take(20),
        ctx.db
          .query("events")
          .withIndex("by_scope_end", (q) =>
            q
              .eq("workspaceKey", wsKey)
              .eq("visibilityStatus", "visible")
              .eq("status", "scheduled")
              .eq("campusScope", "Both")
              .gt("endTime", now)
          )
          .take(15),
      ]);
      return [...localRows, ...bothRows];
    };

    const [ksuEvents, wsEvents] = await Promise.all([
      fetchScopedEvents("ksu"),
      fetchScopedEvents(viewer.workspaceKey),
    ]);

    const mergedEvents = [...ksuEvents, ...wsEvents]
      .filter((event) => !event.organizerStudentId || !viewer.blockedStudentIds.has(event.organizerStudentId))
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 5);

    const eventCards = await Promise.all(
      mergedEvents.map(async (ev) => {
        const myRsvp = await ctx.db
          .query("eventRsvps")
          .withIndex("by_event_student", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("eventId", ev._id)
              .eq("studentId", viewer.actorStudent._id)
          )
          .unique();
        return {
          _id: ev._id,
          title: ev.title,
          isFixture: ev.isFixture ?? false,
          campus: ev.campus,
          campusScope: ev.campusScope,
          isVirtual: ev.isVirtual,
          locationName: ev.locationName,
          startTime: ev.startTime,
          endTime: ev.endTime,
          status: ev.status,
          myRsvpStatus: myRsvp?.rsvpStatus ?? null,
        };
      })
    );

    return {
      campusFilter,
      schedule: {
        enrolledCourses,
        privateClasses,
        personalDeadlines: personalDeadlines.slice(0, 5),
      },
      joinedClubs,
      parkingCards,
      shuttleCards,
      studySummary: {
        openRoomSampleCount: openRooms.length,
        featuredRooms: openRooms.slice(0, 4).map((r) => ({
          _id: r._id,
          slug: r.slug,
          buildingName: r.buildingName,
          roomNumber: r.roomNumber,
          campus: r.campus,
          capacity: r.capacity,
          bookingUrl: r.bookingUrl,
          isFixture: r.isFixture,
        })),
        activeSessions: visibleStudySessions.map((s) => ({
          _id: s._id,
          title: s.title,
          campus: s.campus,
          visibility: s.visibility,
          startTime: s.startTime,
          endTime: s.endTime,
          seatCount: s.attendeeIds.length,
          maxSeats: s.maxSeats,
        })),
      },
      diningCards,
      eventCards,
    };
  },
});
