import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import parkingLotsSeed from "../data/ksu-seed/parking-lots.json";
import studyRoomsSeed from "../data/ksu-seed/study-rooms.json";
import shuttleRoutesSeed from "../data/ksu-seed/shuttle-routes.json";
import diningVenuesSeed from "../data/ksu-seed/dining-venues.json";
import clubsSeed from "../data/ksu-seed/clubs.json";
import eventsSeed from "../data/ksu-seed/events.json";
import meetupSpotsSeed from "../data/ksu-seed/meetup-spots.json";
import coursesSeed from "../data/ksu-seed/courses.json";
import { Id } from "./_generated/dataModel";

function formatDateET(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  return parts;
}

/**
 * Default realistic 48-bit LibCal open/reserved bitmask (1n = open, 0n = closed/booked).
 * Bits 16..43 correspond to 08:00 AM - 10:00 PM ET.
 */
export function buildSeedSlotMask48(roomIndex: number): bigint {
  let mask = 0n;
  for (let slot = 16; slot <= 43; slot++) {
    // Sprinkle realistic booked 30-min slots per room
    const booked = (slot + roomIndex) % 5 === 0 || (slot + roomIndex) % 7 === 0;
    if (!booked) {
      mask |= 1n << BigInt(slot);
    }
  }
  return mask;
}

export const bootstrapKsu = internalMutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const todayET = formatDateET(now);
    const tomorrowET = formatDateET(now + 24 * 60 * 60 * 1000);

    // 1. Parking Lots (72)
    let parkingInserted = 0;
    for (const lot of parkingLotsSeed as any[]) {
      const existing = await ctx.db
        .query("parkingLots")
        .withIndex("by_slug", (q) => q.eq("slug", lot.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert("parkingLots", lot);
        parkingInserted++;
      }
    }

    // 2. Study Rooms (57: 47 LibCal + 10 Walk-In) + Today/Tomorrow 48-bit Snapshots
    let studyRoomsInserted = 0;
    const roomsList = studyRoomsSeed as any[];
    for (let idx = 0; idx < roomsList.length; idx++) {
      const rm = roomsList[idx]!;
      const existing = await ctx.db
        .query("studyRooms")
        .withIndex("by_campus_kind", (q) =>
          q
            .eq("campus", rm.campus)
            .eq("roomKind", rm.roomKind)
            .eq("slug", rm.slug)
        )
        .unique();
      const roomId = existing
        ? existing._id
        : await ctx.db.insert("studyRooms", rm);
      if (!existing) studyRoomsInserted++;

      if (rm.roomKind === "libcal") {
        for (const [dIdx, dateET] of [todayET, tomorrowET].entries()) {
          const snap = await ctx.db
            .query("studyRoomSnapshots")
            .withIndex("by_room_date", (q) =>
              q.eq("studyRoomId", roomId).eq("dateET", dateET)
            )
            .unique();
          if (!snap) {
            await ctx.db.insert("studyRoomSnapshots", {
              studyRoomId: roomId,
              dateET,
              slotMask48: buildSeedSlotMask48(idx + dIdx * 3),
              updatedAt: now,
            });
          }
        }
      }
    }

    // 3. Shuttle Routes (11) + Latest Snapshot
    let shuttleInserted = 0;
    for (const route of (shuttleRoutesSeed as any).routes) {
      const existing = await ctx.db
        .query("shuttleRoutes")
        .withIndex("by_passio_id", (q) =>
          q.eq("passioRouteId", route.passioRouteId)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("shuttleRoutes", route);
        shuttleInserted++;
      }
    }
    const existingShuttleSnap = await ctx.db
      .query("shuttleSnapshots")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
      .unique();
    if (!existingShuttleSnap) {
      const initSnap = (shuttleRoutesSeed as any).initialSnapshot;
      await ctx.db.insert("shuttleSnapshots", {
        singletonKey: "latest",
        vehicles: initSnap.vehicles,
        stopEtas: initSnap.stopEtas,
        serviceAlerts: initSnap.serviceAlerts,
        fetchedAt: now,
      });
    }

    // 4. Dining Venues (17)
    let diningInserted = 0;
    for (const venue of diningVenuesSeed as any[]) {
      const existing = await ctx.db
        .query("diningVenues")
        .withIndex("by_slug", (q) =>
          q.eq("nutrisliceSlug", venue.nutrisliceSlug)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("diningVenues", {
          ...venue,
          lastHoursSyncAt: now,
          lastMenuSyncAt: now,
        });
        diningInserted++;
      }
    }

    // 5. Clubs (544)
    let clubsInserted = 0;
    const clubIdBySlug = new Map<string, Id<"clubs">>();
    for (const club of clubsSeed as any[]) {
      const existing = await ctx.db
        .query("clubs")
        .withIndex("by_workspace_slug", (q) =>
          q.eq("workspaceKey", "ksu").eq("slug", club.slug)
        )
        .unique();
      if (existing) {
        clubIdBySlug.set(club.slug, existing._id);
      } else {
        const cid = await ctx.db.insert("clubs", {
          workspaceKey: "ksu",
          ...club,
          visibilityStatus: "visible",
        });
        clubIdBySlug.set(club.slug, cid);
        clubsInserted++;
      }
    }

    // 6. Events (30)
    let eventsInserted = 0;
    for (const ev of eventsSeed as any[]) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_external_key", (q) => q.eq("externalKey", ev.externalKey))
        .unique();
      if (!existing) {
        const startTime = now + Math.round(ev.startOffsetHours * 3600_000);
        const endTime = startTime + Math.round(ev.durationHours * 3600_000);
        const linkedClubId = ev.clubSlug
          ? clubIdBySlug.get(ev.clubSlug)
          : undefined;
        await ctx.db.insert("events", {
          workspaceKey: "ksu",
          externalKey: ev.externalKey,
          source: ev.source,
          campus: ev.campus,
          campusScope: ev.campusScope,
          isVirtual: ev.isVirtual,
          clubId: linkedClubId,
          title: ev.title,
          description: ev.description,
          searchText: ev.searchText,
          locationName: ev.locationName,
          externalUrl: ev.externalUrl,
          startTime,
          endTime,
          status: "scheduled",
          visibilityStatus: "visible",
          prodGoingCount: ev.prodGoingCount,
          prodInterestedCount: ev.prodInterestedCount,
        });
        eventsInserted++;
      }
    }

    // 7. Meetup Spots (14)
    let meetupInserted = 0;
    for (const spot of meetupSpotsSeed as any[]) {
      const existing = await ctx.db
        .query("meetupSpots")
        .withIndex("by_slug", (q) => q.eq("slug", spot.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert("meetupSpots", spot);
        meetupInserted++;
      }
    }

    // 8. Dual-Term Course Hubs (120) & 2-Index Sections (480) + Sample Syllabi
    let hubsInserted = 0;
    const hubIdBySubjectCourse = new Map<string, Id<"courseHubs">>();
    for (const hub of (coursesSeed as any).courseHubs) {
      const existing = await ctx.db
        .query("courseHubs")
        .withIndex("by_subject_course", (q) =>
          q.eq("subjectCourse", hub.subjectCourse)
        )
        .unique();
      if (existing) {
        hubIdBySubjectCourse.set(hub.subjectCourse, existing._id);
      } else {
        const hid = await ctx.db.insert("courseHubs", hub);
        hubIdBySubjectCourse.set(hub.subjectCourse, hid);
        hubsInserted++;
      }
    }

    let sectionsInserted = 0;
    for (const sec of (coursesSeed as any).courseSections) {
      const courseHubId = hubIdBySubjectCourse.get(sec.subjectCourse);
      if (!courseHubId) continue;
      const existing = await ctx.db
        .query("courseSections")
        .withIndex("by_term_crn", (q) =>
          q.eq("termCode", sec.termCode).eq("crn", sec.crn)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("courseSections", {
          termCode: sec.termCode,
          crn: sec.crn,
          courseHubId,
          sectionNumber: sec.sectionNumber,
          campus: sec.campus,
          deliveryMode: sec.deliveryMode,
          instructorName: sec.instructorName,
          meetings: sec.meetings,
        });
        sectionsInserted++;
      }
    }

    for (const syl of (coursesSeed as any).sampleSyllabi) {
      const cacheKey = `${syl.termCode}:${syl.subjectCourse}:${syl.crn ?? "any"}`;
      const existing = await ctx.db
        .query("courseSyllabiCache")
        .withIndex("by_cache_key", (q) => q.eq("cacheKey", cacheKey))
        .unique();
      if (!existing) {
        await ctx.db.insert("courseSyllabiCache", {
          cacheKey,
          subjectCourse: syl.subjectCourse,
          termCode: syl.termCode,
          crn: syl.crn,
          matchedSectionLabel: syl.matchedSectionLabel,
          status: "found",
          summaryJson: JSON.stringify(syl.summary),
          sourceUrl: syl.sourceUrl,
          fetchedAt: now,
          lastAccessedAt: now,
          expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        });
      }
    }

    // 9. Initialize feedSyncState rows
    const syncSources = [
      ["passio_shuttle", 11],
      ["localist_engage_events", 30],
      ["nutrislice_dining", 17],
      ["libcal_study_rooms", 47],
    ] as const;
    for (const [sourceKey, activeRecordCount] of syncSources) {
      const existing = await ctx.db
        .query("feedSyncState")
        .withIndex("by_source", (q) => q.eq("sourceKey", sourceKey))
        .unique();
      if (!existing) {
        await ctx.db.insert("feedSyncState", {
          sourceKey,
          lastSuccessAt: now,
          lastAttemptAt: now,
          consecutiveFailures: 0,
          activeRecordCount,
        });
      }
    }

    return {
      parkingInserted,
      studyRoomsInserted,
      shuttleInserted,
      diningInserted,
      clubsInserted,
      eventsInserted,
      meetupInserted,
      hubsInserted,
      sectionsInserted,
    };
  },
});

export const backfillEmbeddings = internalAction({
  args: {},
  handler: async () => {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!cfAccountId || !cfToken) {
      return {
        status: "skipped_missing_cloudflare_credentials",
        message:
          "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN unset — KSUX uses Convex full-text search + structured tools cleanly.",
      };
    }
    return {
      status: "ready",
      embeddedCount: 0,
    };
  },
});
