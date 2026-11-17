import { workflowTime } from "./lib/workflowTime";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { campusFilterValidator } from "./schema";
import { assertPublishSafety } from "./lib/safety";
import { formatStalenessBadge } from "./lib/syncGuard";
import { easternDate, zonedDateParts } from "./lib/easternDate";
import { removeCampusChatMember } from "./lib/campusChat";
import {
  filterVisibleContent,
  toPublicStudent,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import {
  acquireLibCalLease,
  countOpenHalfHourSlots,
  decodeSlotMask48Slots,
} from "./sync/libcalSync";
import { Doc, Id } from "./_generated/dataModel";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const FORTY_FIVE_MINUTES_MS = 45 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const listStudyRoomsAndSessions = viewerQuery({
  args: {
    campusOverride: v.optional(campusFilterValidator),
    dateChoice: v.optional(v.union(v.literal("today"), v.literal("tomorrow"))),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const { viewer } = ctx;
    const campusFilter =
      args.campusOverride ?? viewer.actorStudent.activeCampusFilter;
    const targetDateET = easternDate(now, args.dateChoice === "tomorrow" ? 1 : 0);

    const fetchCampusRooms = async (c: "Kennesaw" | "Marietta") => {
      const [libcal, walkIn] = await Promise.all([
        ctx.db
          .query("studyRooms")
          .withIndex("by_campus_kind", (q) =>
            q.eq("campus", c).eq("roomKind", "libcal")
          )
          .take(40),
        ctx.db
          .query("studyRooms")
          .withIndex("by_campus_kind", (q) =>
            q.eq("campus", c).eq("roomKind", "walk_in")
          )
          .take(15),
      ]);
      return [...libcal, ...walkIn];
    };

    const [kRooms, mRooms, syncState] = await Promise.all([
      campusFilter === "Marietta"
        ? Promise.resolve([] as Doc<"studyRooms">[])
        : fetchCampusRooms("Kennesaw"),
      campusFilter === "Kennesaw"
        ? Promise.resolve([] as Doc<"studyRooms">[])
        : fetchCampusRooms("Marietta"),
      ctx.db
        .query("feedSyncState")
        .withIndex("by_source", (q) => q.eq("sourceKey", "libcal_study_rooms"))
        .unique(),
    ]);

    const rawRooms = [...kRooms, ...mRooms];
    const roomSnapshots = new Map<string, Promise<Doc<"studyRoomSnapshots"> | null>>();
    const getSnapshot = (roomId: Id<"studyRooms">, dateET: string) => {
      const key = `${roomId}:${dateET}`;
      const pending = roomSnapshots.get(key);
      if (pending) return pending;
      const request = ctx.db.query("studyRoomSnapshots")
        .withIndex("by_room_date", (q) => q.eq("studyRoomId", roomId).eq("dateET", dateET))
        .unique()
        .then((row) => row?.isFixture && viewer.mode !== "demo" ? null : row);
      roomSnapshots.set(key, request);
      return request;
    };

    const rooms = await Promise.all(
      rawRooms.map(async (rm) => {
        if (rm.roomKind === "libcal") {
          const snap = await getSnapshot(rm._id, targetDateET);
          const mask = snap?.slotMask48 ?? 0n;
          const openSlotsCount = snap ? countOpenHalfHourSlots(mask) : null;
          // Return daytime 08:00-22:00 (bits 16..43) boolean array for compact grid UI
          const decodedAll = decodeSlotMask48Slots(mask);
          return {
            _id: rm._id,
            slug: rm.slug,
            campus: rm.campus,
            buildingName: rm.buildingName,
            roomNumber: rm.roomNumber,
            roomKind: rm.roomKind,
            libcalEid: rm.libcalEid,
            capacity: rm.capacity,
            amenities: rm.amenities,
            bookingUrl: rm.bookingUrl,
            todayHoursLabel: rm.todayHoursLabel,
            openHalfHourSlotsCount: openSlotsCount,
            daytimeSlotsOpen: snap ? decodedAll.slice(16, 44) : [], // 8:00 AM .. 10:00 PM
            isFixtureSnapshot: Boolean(snap?.isFixture),
            vibe: null,
          };
        }

        // Walk-in space: evaluate 45m crowd vibe check
        const pulses = await ctx.db
          .query("campusPulses")
          .withIndex("by_target_active", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("targetType", "study_room")
              .eq("targetKey", rm.slug)
              .gt("expiresAt", now)
          )
          .take(10);
        const latestVibe = pulses.sort(
          (a, b) => b.publishedAt - a.publishedAt
        )[0];

        return {
          _id: rm._id,
          slug: rm.slug,
          campus: rm.campus,
          buildingName: rm.buildingName,
          roomNumber: rm.roomNumber,
          roomKind: rm.roomKind,
          libcalEid: undefined,
          capacity: rm.capacity,
          amenities: rm.amenities,
          bookingUrl: undefined,
          todayHoursLabel: rm.todayHoursLabel,
          openHalfHourSlotsCount: null,
          daytimeSlotsOpen: [],
          isFixtureSnapshot: false,
          vibe: latestVibe
            ? {
                tierValue: latestVibe.tierValue,
                label:
                  latestVibe.tierValue === "quiet"
                    ? "Quiet"
                    : latestVibe.tierValue === "moderate"
                      ? "Moderate"
                      : "Packed",
              }
            : null,
        };
      })
    );

    // Load active Campus-Open + enrolled Course Hub Members Only Study Sessions
    const campusOpenRaw =
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
              .take(15)),
            ...(await ctx.db
              .query("studySessions")
              .withIndex("by_campus_end", (q) =>
                q
                  .eq("workspaceKey", viewer.workspaceKey)
                  .eq("visibility", "campus_open")
                  .eq("campus", "Marietta")
                  .gt("endTime", now)
              )
              .take(15)),
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
            .take(20);

    const enrolledHubSessions: Doc<"studySessions">[] = [];
    for (const hubId of viewer.enrolledCourseHubIds) {
      const rows = await ctx.db
        .query("studySessions")
        .withIndex("by_course_hub_end", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("courseHubId", hubId)
            .gt("endTime", now)
        )
        .take(10);
      for (const r of rows) {
        if (campusFilter === "All KSU" || r.campus === campusFilter) {
          enrolledHubSessions.push(r);
        }
      }
    }

    const sessionMap = new Map<string, Doc<"studySessions">>();
    for (const s of [...campusOpenRaw, ...enrolledHubSessions]) {
      if (s.status === "scheduled" && s.endTime > now) {
        sessionMap.set(String(s._id), s);
      }
    }

    const visibleSessions = filterVisibleContent(
      Array.from(sessionMap.values()),
      viewer,
      {
        targetType: "study_session",
        getAuthorId: (s) => s.hostId,
      }
    ).sort((a, b) => a.startTime - b.startTime);

    const hydratedSessions = await Promise.all(
      visibleSessions.map(async (s) => {
        const [room, host, hub] = await Promise.all([
          ctx.db.get(s.studyRoomId),
          ctx.db.get(s.hostId),
          s.courseHubId ? ctx.db.get(s.courseHubId) : Promise.resolve(null),
        ]);

        // Automatic ⚠️ Unreserved on LibCal warning when a LibCal room session is not confirmed or overlaps unbooked slots
        let unreservedLibCalWarning = false;
        if (room?.roomKind === "libcal") {
          if (!s.libcalHostConfirmed) {
            unreservedLibCalWarning = true;
          } else {
            const firstSlot = Math.floor(s.startTime / THIRTY_MINUTES_MS) * THIRTY_MINUTES_MS;
            for (let slot = firstSlot; slot < s.endTime; slot += THIRTY_MINUTES_MS) {
              const snapshot = await getSnapshot(room._id, easternDate(slot));
              const { hour, minute } = zonedDateParts(slot);
              const bit = BigInt(hour * 2 + Math.floor(minute / 30));
              if (snapshot && ((snapshot.slotMask48 >> bit) & 1n) === 1n) {
                unreservedLibCalWarning = true;
                break;
              }
            }
          }
        }

        return {
          _id: s._id,
          title: s.title,
          topicNote: s.topicNote,
          campus: s.campus,
          visibility: s.visibility,
          startTime: s.startTime,
          endTime: s.endTime,
          effectiveStatus: now >= s.endTime ? "ended" : s.status,
          maxSeats: s.maxSeats,
          seatCount: s.attendeeIds.length,
          isAttending: s.attendeeIds.includes(viewer.actorStudent._id),
          isHost: s.hostId === viewer.actorStudent._id,
          libcalHostConfirmed: s.libcalHostConfirmed,
          unreservedLibCalWarning,
          groupChatId: s.groupChatId,
          room: room
            ? {
                _id: room._id,
                buildingName: room.buildingName,
                roomNumber: room.roomNumber,
                roomKind: room.roomKind,
                bookingUrl: room.bookingUrl,
              }
            : null,
          host: toPublicStudent(host),
          courseHub: hub
            ? { _id: hub._id, subjectCourse: hub.subjectCourse }
            : null,
        };
      })
    );

    const staleness = formatStalenessBadge(
      syncState?.lastSuccessAt,
      now,
      FIFTEEN_MINUTES_MS
    );

    const needsSwrRefresh = Boolean(
      !syncState?.lastSuccessAt ||
        (now - syncState.lastSuccessAt > FIVE_MINUTES_MS &&
          (!syncState.refreshInFlightUntil ||
            syncState.refreshInFlightUntil <= now) &&
          (!syncState.backoffUntil || syncState.backoffUntil <= now))
    );

    return {
      campusFilter,
      targetDateET,
      staleness,
      needsSwrRefresh,
      rooms,
      sessions: hydratedSessions,
    };
  },
});

export const triggerStudySwrRefresh = viewerMutation({
  args: {
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    const result = await acquireLibCalLease(ctx, now);
    if (result.acquired && process.env.KSUX_SKIP_LIBCAL_SCHEDULER !== "true") {
      await ctx.scheduler.runAfter(
        0, internal.sync.libcalSync.runSequentialLibCalRefresh,
        { scheduledLeaseUntil: result.leaseUntil }
      );
    }
    return result;
  },
});

export const submitWalkInVibe = viewerMutation({
  args: {
    roomSlug: v.string(),
    vibe: v.union(
      v.literal("quiet"),
      v.literal("moderate"),
      v.literal("packed")
    ),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = workflowTime(args.nowOverride);
    await ctx.db.insert("campusPulses", {
      workspaceKey: ctx.viewer.workspaceKey,
      targetType: "study_room",
      targetKey: args.roomSlug.trim().toLowerCase(),
      authorId: ctx.viewer.actorStudent._id,
      tierValue: args.vibe,
      publishedAt: now,
      expiresAt: now + FORTY_FIVE_MINUTES_MS,
    });
    return { ok: true, expiresAt: now + FORTY_FIVE_MINUTES_MS };
  },
});

export const createStudySession = viewerMutation({
  args: {
    studyRoomId: v.id("studyRooms"),
    title: v.string(),
    topicNote: v.optional(v.string()),
    visibility: v.union(
      v.literal("campus_open"),
      v.literal("course_members_only")
    ),
    courseHubId: v.optional(v.id("courseHubs")),
    startTime: v.number(),
    endTime: v.number(),
    maxSeats: v.number(),
    libcalHostConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const room = await ctx.db.get(args.studyRoomId);
    if (!room) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Study Room not found.",
      });
    }

    const title = args.title.trim();
    if (title.length < 3 || title.length > 100) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Study Session title must be 3–100 characters.",
      });
    }
    assertPublishSafety(`${title} ${args.topicNote ?? ""}`);

    const durationMs = args.endTime - args.startTime;
    if (durationMs < THIRTY_MINUTES_MS || durationMs > FOUR_HOURS_MS) {
      throw new ConvexError({
        code: "INVALID_WINDOW",
        message: "Study Sessions must be between 30 minutes and 4 hours.",
      });
    }

    if (args.visibility === "course_members_only") {
      if (
        !args.courseHubId ||
        !viewer.enrolledCourseHubIds.has(args.courseHubId)
      ) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message:
            "You must be enrolled in the Course Hub to host a Course Hub Members Only Study Session.",
        });
      }
    }

    const ceiling =
      room.roomKind === "libcal"
        ? Math.min(room.capacity, 20)
        : Math.min(room.capacity, 20);
    const maxSeats = Math.max(2, Math.min(Math.round(args.maxSeats), ceiling));

    const sessionId = await ctx.db.insert("studySessions", {
      workspaceKey: viewer.workspaceKey,
      studyRoomId: room._id,
      campus: room.campus,
      hostId: viewer.actorStudent._id,
      courseHubId: args.courseHubId,
      visibility: args.visibility,
      title,
      topicNote: args.topicNote?.trim().slice(0, 240),
      startTime: args.startTime,
      endTime: args.endTime,
      maxSeats,
      attendeeIds: [viewer.actorStudent._id],
      libcalHostConfirmed: Boolean(args.libcalHostConfirmed),
      status: "scheduled",
      visibilityStatus: "visible",
    });

    // Provision workspace Study Session Group Chat with 24h post-session grace window
    const groupChatId = await ctx.db.insert("chats", {
      workspaceKey: viewer.workspaceKey,
      kind: "study_group",
      parentType: "study_session",
      parentId: String(sessionId),
      requestStatus: "active",
      title,
      memberCount: 1,
      messageSeq: 0,
      lastMessageAt: now,
      readonlyAfter: args.endTime + TWENTY_FOUR_HOURS_MS,
    });

    await ctx.db.insert("chatMembers", {
      workspaceKey: viewer.workspaceKey,
      chatId: groupChatId,
      studentId: viewer.actorStudent._id,
      chatKind: "study_group",
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

    await ctx.db.patch(sessionId, { groupChatId });

    return { sessionId, groupChatId, maxSeats };
  },
});

export const toggleStudySessionAttendance = viewerMutation({
  args: {
    sessionId: v.id("studySessions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.workspaceKey !== viewer.workspaceKey ||
      session.visibilityStatus !== "visible"
    ) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Study Session not found.",
      });
    }

    if (session.status !== "scheduled" || now >= session.endTime) {
      throw new ConvexError({
        code: "SESSION_ENDED",
        message: "This Study Session has already ended.",
      });
    }

    if (
      session.visibility === "course_members_only" &&
      (!session.courseHubId ||
        !viewer.enrolledCourseHubIds.has(session.courseHubId))
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "Only Students enrolled in this Course Hub can view or join this Study Session.",
      });
    }

    if (viewer.blockedStudentIds.has(session.hostId)) {
      throw new ConvexError({
        code: "BLOCKED",
        message: "Cannot join this Study Session.",
      });
    }

    const alreadyIn = session.attendeeIds.includes(viewer.actorStudent._id);
    if (alreadyIn) {
      if (session.hostId === viewer.actorStudent._id) {
        throw new ConvexError({
          code: "HOST_CANNOT_LEAVE",
          message: "Use End Session to close a Study Session you are hosting.",
        });
      }
      const nextAttendees = session.attendeeIds.filter(
        (id) => id !== viewer.actorStudent._id
      );
      await ctx.db.patch(session._id, { attendeeIds: nextAttendees });
      if (session.groupChatId) {
        const chat = await ctx.db.get(session.groupChatId);
        if (chat?.kind === "study_group") await removeCampusChatMember(ctx, chat, viewer.actorStudent._id);
      }
      return { attending: false, seatCount: nextAttendees.length };
    }

    // Atomic maxSeats enforcement
    if (session.attendeeIds.length >= session.maxSeats) {
      throw new ConvexError({
        code: "SESSION_FULL",
        message: `All ${session.maxSeats} seats in this Study Session are currently filled.`,
      });
    }

    const nextAttendees = [...session.attendeeIds, viewer.actorStudent._id];
    await ctx.db.patch(session._id, { attendeeIds: nextAttendees });

    if (session.groupChatId) {
      const chat = await ctx.db.get(session.groupChatId);
      const existingMember = await ctx.db
        .query("chatMembers")
        .withIndex("by_chat_student", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("chatId", session.groupChatId!)
            .eq("studentId", viewer.actorStudent._id)
        )
        .unique();
      if (chat && !existingMember) {
        await ctx.db.insert("chatMembers", {
          workspaceKey: viewer.workspaceKey,
          chatId: chat._id,
          studentId: viewer.actorStudent._id,
          chatKind: "study_group",
          role: "member",
          badgeMode: "count",
          lastReadSeq: chat.messageSeq,
          lastReadAt: now,
          hasUnread: false,
          isMuted: false,
          isArchived: false,
          lastChatMessageAt: chat.lastMessageAt,
          joinedAt: now,
        });
        await ctx.db.patch(chat._id, { memberCount: chat.memberCount + 1 });
      }
    }

    return {
      attending: true,
      seatCount: nextAttendees.length,
      groupChatId: session.groupChatId,
    };
  },
});

export const toggleHostLibCalConfirmed = viewerMutation({
  args: {
    sessionId: v.id("studySessions"),
    confirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.workspaceKey !== ctx.viewer.workspaceKey ||
      session.hostId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the Study Session host can update LibCal confirmation.",
      });
    }
    await ctx.db.patch(session._id, {
      libcalHostConfirmed: args.confirmed,
    });
    return { libcalHostConfirmed: args.confirmed };
  },
});

export const endStudySession = viewerMutation({
  args: {
    sessionId: v.id("studySessions"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.workspaceKey !== ctx.viewer.workspaceKey ||
      session.hostId !== ctx.viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the host can end this Study Session.",
      });
    }
    const endTime = Math.min(session.endTime, now);
    if (session.status !== "ended") {
      await ctx.db.patch(session._id, { status: "ended", endTime });
    }
    if (session.groupChatId) {
      const chat = await ctx.db.get(session.groupChatId);
      const readonlyAfter = endTime + TWENTY_FOUR_HOURS_MS;
      if (chat?.kind === "study_group" && chat.readonlyAfter !== readonlyAfter) {
        await ctx.db.patch(session.groupChatId, { readonlyAfter });
      }
    }
    return { ok: true };
  },
});
