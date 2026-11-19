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
import verifiedSections from "../data/ksu-seed/banner-verified.json";
import { Id } from "./_generated/dataModel";
import { easternDate } from "./lib/easternDate";

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
    includeFixtures: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const includeFixtures = args.includeFixtures === true;
    const daysET = [easternDate(now), easternDate(now, 1)];
    const syncState = async (key: string) => ctx.db.query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", key)).unique();
    const [legacyStudy, legacyShuttle] = await Promise.all([
      syncState("libcal_study_rooms"),
      syncState("passio_shuttle"),
    ]);

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
      } else if (existing.hourlyBaselinePrior !== undefined) {
        // Retired per-lot hourly prior (#74): unset it on legacy deploys.
        await ctx.db.patch(existing._id, { hourlyBaselinePrior: undefined });
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
      else if (existing.geoFeatureId !== rm.geoFeatureId) {
        // Building footprints were replaced with real OSM ids; repoint rooms
        // seeded earlier at the old synthetic ids.
        await ctx.db.patch(existing._id, { geoFeatureId: rm.geoFeatureId });
      }

      if (rm.roomKind === "libcal") {
        for (const [dIdx, dateET] of daysET.entries()) {
          const snap = await ctx.db
            .query("studyRoomSnapshots")
            .withIndex("by_room_date", (q) =>
              q.eq("studyRoomId", roomId).eq("dateET", dateET)
            )
            .unique();
          const fixtureMask = buildSeedSlotMask48(idx + dIdx * 3);
          if (!snap && includeFixtures) {
            await ctx.db.insert("studyRoomSnapshots", {
              studyRoomId: roomId,
              dateET,
              slotMask48: fixtureMask,
              updatedAt: now,
              isFixture: true,
            });
          } else if (snap && !includeFixtures && (snap.isFixture ||
            (legacyStudy?.lastSuccessAt === snap.updatedAt && !legacyStudy.lastPayloadHash &&
              snap.slotMask48 === fixtureMask))) {
            await ctx.db.delete(snap._id);
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
      } else {
        // The network is a read-only institutional catalog: refresh stops,
        // hours and scope so databases seeded earlier pick up corrections.
        await ctx.db.replace(existing._id, route);
      }
    }
    const existingShuttleSnap = await ctx.db
      .query("shuttleSnapshots")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "latest"))
      .unique();
    const legacyNoticeSnapshot = existingShuttleSnap?.serviceAlerts !== undefined;
    if (legacyNoticeSnapshot && existingShuttleSnap) {
      await ctx.db.delete(existingShuttleSnap._id);
    }
    if ((!existingShuttleSnap || legacyNoticeSnapshot) && includeFixtures) {
      const initSnap = (shuttleRoutesSeed as any).initialSnapshot;
      await ctx.db.insert("shuttleSnapshots", {
        singletonKey: "latest",
        vehicles: initSnap.vehicles,
        stopEtas: initSnap.stopEtas,
        shuttleNotices: initSnap.shuttleNotices,
        fetchedAt: now,
        isFixture: true,
      });
    } else if (existingShuttleSnap && !legacyNoticeSnapshot && !includeFixtures &&
      (existingShuttleSnap.isFixture ||
        (legacyShuttle?.lastSuccessAt === existingShuttleSnap.fetchedAt && !legacyShuttle.lastPayloadHash))) {
      await ctx.db.delete(existingShuttleSnap._id);
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
          doorRatesJson: includeFixtures ? venue.doorRatesJson : undefined,
          hoursScheduleJson: includeFixtures ? venue.hoursScheduleJson : "{}",
          todayMenuJson: includeFixtures ? venue.todayMenuJson : "[]",
          tomorrowMenuJson: includeFixtures ? venue.tomorrowMenuJson : "[]",
          isFixtureMenu: includeFixtures || undefined,
          isFixtureHours: includeFixtures || undefined,
          lastHoursSyncAt: 0,
          lastMenuSyncAt: 0,
        });
        diningInserted++;
      } else if (!includeFixtures) {
        const fixtureHours = existing.isFixtureHours || existing.hoursScheduleJson === venue.hoursScheduleJson;
        const fixtureMenus = existing.isFixtureMenu || (existing.todayMenuJson === venue.todayMenuJson &&
          existing.tomorrowMenuJson === venue.tomorrowMenuJson &&
          !existing.todayMenuDateET && !existing.tomorrowMenuDateET);
        const fixtureRates = existing.doorRatesJson !== undefined && existing.doorRatesJson === venue.doorRatesJson;
        if (fixtureHours || fixtureMenus || fixtureRates) {
          await ctx.db.patch(existing._id, {
            ...(fixtureHours ? { hoursScheduleJson: "{}", isFixtureHours: undefined, lastHoursSyncAt: 0 } : {}),
            ...(fixtureMenus ? { todayMenuJson: "[]", tomorrowMenuJson: "[]", isFixtureMenu: undefined, lastMenuSyncAt: 0 } : {}),
            ...(fixtureRates ? { doorRatesJson: undefined } : {}),
          });
        }
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
        if (!includeFixtures && existing.externalEngageId === club.externalEngageId &&
          existing.searchText === club.searchText && existing.visibilityStatus !== "removed") {
          await ctx.db.patch(existing._id, { visibilityStatus: "removed" });
        }
      } else if (includeFixtures) {
        const cid = await ctx.db.insert("clubs", {
          workspaceKey: "ksu",
          ...club,
          isFixture: true,
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
      if (!existing && includeFixtures) {
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
          description: "Sample campus Event for Judge Demo Mode.",
          searchText: ev.searchText,
          locationName: ev.locationName,
          isFixture: true,
          startTime,
          endTime,
          status: "scheduled",
          visibilityStatus: "visible",
          prodGoingCount: ev.prodGoingCount,
          prodInterestedCount: ev.prodInterestedCount,
        });
        eventsInserted++;
      } else if (existing && !includeFixtures && existing.visibilityStatus !== "removed") {
        await ctx.db.patch(existing._id, { visibilityStatus: "removed", isFixture: true });
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
      } else if (
        existing.latitude !== spot.latitude ||
        existing.longitude !== spot.longitude
      ) {
        // Spots now sit on their real building footprints.
        await ctx.db.patch(existing._id, {
          latitude: spot.latitude,
          longitude: spot.longitude,
        });
      }
    }

    // 8. Dual-Term Course Hubs (120) & 2-Index Sections (480) + Sample Syllabi
    let hubsInserted = 0;
    const hubIdBySubjectCourse = new Map<string, Id<"courseHubs">>();
    const verifiedByCourse = new Map<string, typeof verifiedSections>();
    for (const section of verifiedSections) {
      const sections = verifiedByCourse.get(section.subjectCourse) ?? [];
      sections.push(section);
      verifiedByCourse.set(section.subjectCourse, sections);
    }
    for (const hub of (coursesSeed as any).courseHubs) {
      const existing = await ctx.db
        .query("courseHubs")
        .withIndex("by_subject_course", (q) =>
          q.eq("subjectCourse", hub.subjectCourse)
        )
        .unique();
      const verified = verifiedByCourse.get(hub.subjectCourse);
      const liveFields = verified ? {
        title: verified[0].title,
        searchText: `${hub.subjectCourse} ${hub.subjectCode}${hub.courseNumber} ${verified[0].title}`,
        campuses: Array.from(new Set(verified.map((section) => section.campus))) as ("Kennesaw" | "Marietta")[],
        activeTerms: Array.from(new Set(verified.map((section) => section.termCode))),
      } : null;
      if (existing) {
        hubIdBySubjectCourse.set(hub.subjectCourse, existing._id);
        if (!includeFixtures && liveFields && existing.catalogSource !== "banner_live") {
          const legacyFixtureCount = existing.catalogSource !== "banner_verified" &&
            existing.searchText === hub.searchText ? hub.prodEnrollmentCount as number : 0;
          await ctx.db.patch(existing._id, {
            ...liveFields, isRetiredFixture: undefined, catalogSource: "banner_verified",
            prodEnrollmentCount: Math.max(0, existing.prodEnrollmentCount - legacyFixtureCount),
          });
        } else if (!includeFixtures && existing.catalogSource !== "banner_live" && existing.searchText === hub.searchText && !existing.isRetiredFixture) {
          await ctx.db.patch(existing._id, { isRetiredFixture: true });
        }
      } else if (includeFixtures || liveFields) {
        const hid = await ctx.db.insert("courseHubs", includeFixtures
          ? { ...hub, catalogSource: "fixture" }
          : { ...hub, ...liveFields, catalogSource: "banner_verified", prodEnrollmentCount: 0 });
        hubIdBySubjectCourse.set(hub.subjectCourse, hid);
        hubsInserted++;
      }
    }

    let sectionsInserted = 0;
    const verifiedKeys = new Set(verifiedSections.map((section) => `${section.termCode}:${section.crn}`));
    if (!includeFixtures) {
      for (const fixture of coursesSeed.courseSections) {
        if (verifiedKeys.has(`${fixture.termCode}:${fixture.crn}`)) continue;
        const existing = await ctx.db.query("courseSections")
          .withIndex("by_term_crn", (q) => q.eq("termCode", fixture.termCode).eq("crn", fixture.crn))
          .unique();
        if (existing && !existing.bannerRefreshed && existing.instructorName === fixture.instructorName && !existing.isRetiredFixture) {
          await ctx.db.patch(existing._id, { isRetiredFixture: true });
        }
      }
    }
    for (const sec of includeFixtures ? coursesSeed.courseSections : verifiedSections) {
      const courseHubId = hubIdBySubjectCourse.get(sec.subjectCourse);
      if (!courseHubId) continue;
      const existing = await ctx.db
        .query("courseSections")
        .withIndex("by_term_crn", (q) =>
          q.eq("termCode", sec.termCode).eq("crn", sec.crn)
        )
        .unique();
      const fields = {
          termCode: sec.termCode,
          crn: sec.crn,
          courseHubId,
          sectionNumber: sec.sectionNumber,
          campus: sec.campus as "Kennesaw" | "Marietta",
          deliveryMode: sec.deliveryMode as "in_person" | "hybrid" | "online",
          instructorName: sec.instructorName,
          meetings: sec.meetings,
      };
      if (!existing) {
        await ctx.db.insert("courseSections", { ...fields, isFixture: includeFixtures || undefined });
        sectionsInserted++;
      } else if (!includeFixtures && !existing.bannerRefreshed) {
        await ctx.db.patch(existing._id, { ...fields, isRetiredFixture: undefined, isFixture: undefined });
      }
    }

    for (const syl of (coursesSeed as any).sampleSyllabi) {
      const cacheKey = `${syl.termCode}:${syl.subjectCourse}:${syl.crn ?? "any"}`;
      const existing = await ctx.db
        .query("courseSyllabiCache")
        .withIndex("by_cache_key", (q) => q.eq("cacheKey", cacheKey))
        .unique();
      if (!existing && includeFixtures) {
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
      } else if (existing && !includeFixtures && existing.summaryJson === JSON.stringify(syl.summary)) {
        await ctx.db.delete(existing._id);
      }
    }

    // The P0 institutional sources start in links-only mode.
    for (const sourceKey of ["ksu_timely_warnings", "ksu_emergency_advisories"]) {
      const source = await ctx.db.query("alertSources").withIndex("by_source", (q) =>
        q.eq("workspaceKey", "ksu").eq("sourceKey", sourceKey)).unique();
      if (!source) await ctx.db.insert("alertSources", {
        workspaceKey: "ksu", sourceKey, adapterKind: "links_only", lastResult: "unavailable", killSwitch: "off",
      });
    }

    // 9. Initialize feedSyncState rows
    const syncSources = ["passio_shuttle", "localist_engage_events", "nutrislice_dining", "libcal_study_rooms"];
    for (const sourceKey of syncSources) {
      const existing = await syncState(sourceKey);
      if (!existing) {
        await ctx.db.insert("feedSyncState", {
          sourceKey,
          consecutiveFailures: 0,
          activeRecordCount: 0,
        });
      } else if (!includeFixtures && existing.lastSuccessAt !== undefined &&
        existing.lastSuccessAt === existing.lastAttemptAt && !existing.lastPayloadHash) {
        await ctx.db.patch(existing._id, { lastSuccessAt: undefined, lastAttemptAt: undefined, activeRecordCount: 0 });
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
