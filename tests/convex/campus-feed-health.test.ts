import { expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

it("reports successful empty, partial, stale, and recovered streams only to maintainers", async () => {
  const t = createTestConvex();
  const maintainer = await createVerifiedTestStudent(t, { handle: "feed_admin", displayName: "Feed Admin" });
  const student = await createVerifiedTestStudent(t, { handle: "feed_reader", displayName: "Feed Reader" });
  vi.stubEnv("OWLSIDE_MAINTAINER_EMAILS", maintainer.canonicalEmail);
  try {
    const health = async () => Object.fromEntries((await t.query(api.moderation.getCampusFeedHealth, {
      sessionToken: maintainer.sessionToken,
    })).map((feed) => [feed.key, feed]));
    const now = Date.now();
    const earlier = now - 20 * 60_000;
    const shuttle = internal.sync.transitDiningSync.applyShuttleSyncInternal;

    await t.mutation(shuttle, { now: earlier, status: "ready_to_upsert", vehicles: [], stopEtas: [], shuttleNotices: [] });
    expect((await health()).passio_shuttle).toMatchObject({
      result: "empty", freshness: "stale", acceptedCount: 0, lastSuccessAt: earlier,
    });
    await t.mutation(shuttle, { now: now - 200, status: "ready_to_upsert", stopEtas: [] });
    expect((await health()).passio_shuttle).toMatchObject({
      result: "partial", freshness: "stale", acceptedCount: 0, lastSuccessAt: earlier, lastAttemptAt: now - 200,
    });
    await t.mutation(shuttle, { now: now - 100, status: "failed", failureReason: "invalid stream" });
    expect((await health()).passio_shuttle).toMatchObject({ result: "failed", lastSuccessAt: earlier });
    await t.mutation(shuttle, { now, status: "ready_to_upsert", vehicles: [], stopEtas: [], shuttleNotices: [] });
    expect((await health()).passio_shuttle).toMatchObject({ result: "empty", freshness: "within_window", lastSuccessAt: now });
    await t.mutation(internal.sync.eventsSync.applySyncedEventsInternal, {
      now, status: "failed_or_aborted", sourceObservations: [
        { sourceKey: "localist_events", outcome: "accepted", count: 0 },
        { sourceKey: "engage_events", outcome: "failed" },
      ],
    });
    expect((await health()).localist_events).toMatchObject({ result: "empty", acceptedCount: 0 });
    expect((await health()).engage_events).toMatchObject({ result: "failed", freshness: "unavailable", acceptedCount: null });

    const events = internal.sync.eventsSync.applySyncedEventsInternal;
    await t.mutation(events, { now: now + 1, status: "failed_or_aborted", sourceObservations: [
      { sourceKey: "engage_events", outcome: "accepted", count: 40 },
    ] });
    await t.mutation(events, { now: now + 2, status: "failed_or_aborted", sourceObservations: [
      { sourceKey: "engage_events", outcome: "accepted", count: 3 },
    ] });
    expect((await health()).engage_events).toMatchObject({
      result: "partial", acceptedCount: 40, lastSuccessAt: now + 1, lastAttemptAt: now + 2,
    });

    await expect(t.query(api.moderation.getCampusFeedHealth, { sessionToken: student.sessionToken }))
      .rejects.toThrow(/maintainer access/);
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, { preferredPersona: "maya_cs" });
    await expect(t.query(api.moderation.getCampusFeedHealth, { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" }))
      .rejects.toThrow(/maintainer access/);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("keeps per-Campus Dining freshness and excludes synthetic Clubs from institutional coverage", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
  const { sessionToken } = await createVerifiedTestStudent(t, { handle: "campus_reader", displayName: "Campus Reader" });
  expect(await t.query(api.communities.getClubDirectoryCoverage, { sessionToken })).toBe("unavailable");
  expect(await t.query(api.communities.listClubs, { sessionToken })).toEqual([]);

  const venues = await t.run((ctx) => ctx.db.query("diningVenues").collect());
  const kennesaw = venues.find((venue) => venue.campus === "Kennesaw")!;
  const marietta = venues.find((venue) => venue.campus === "Marietta")!;
  const now = Date.now();
  await t.mutation(internal.sync.transitDiningSync.applyDiningSyncInternal, {
    now: now - 28 * 60 * 60_000, stream: "hours",
    hours: [{ slug: marietta.nutrisliceSlug, hoursScheduleJson: marietta.hoursScheduleJson }],
  });
  await t.mutation(internal.sync.transitDiningSync.applyDiningSyncInternal, {
    now, stream: "hours", hours: [{ slug: kennesaw.nutrisliceSlug, hoursScheduleJson: kennesaw.hoursScheduleJson }],
  });
  const dining = (campusOverride: "Kennesaw" | "Marietta") => t.query(api.transitDining.listDiningVenues, { sessionToken, campusOverride });
  expect((await dining("Kennesaw")).venues.find((venue) => venue._id === kennesaw._id)?.hoursFreshness?.isStale).toBe(false);
  expect((await dining("Marietta")).venues.find((venue) => venue._id === marietta._id)?.hoursFreshness?.isStale).toBe(true);
});
