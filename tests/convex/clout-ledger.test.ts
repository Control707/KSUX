import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { easternDate } from "../../convex/lib/easternDate";
import { weekKeyET } from "../../convex/lib/cloutLedger";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

type T = ReturnType<typeof createTestConvex>;
const minute = 60_000;

async function setup(handles: string[]) {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
  const students = await Promise.all(handles.map((handle) => createVerifiedTestStudent(t, { handle, displayName: handle })));
  const lots = await t.query(api.parking.listParkingLots, { sessionToken: students[0]!.sessionToken, campusOverride: "Kennesaw" });
  const lotId = lots.lots.find((lot) => lot.slug === "central-parking-deck")!._id;
  const otherLotId = lots.lots.find((lot) => lot.slug === "east-parking-deck")!._id;
  return { t, students, lotId, otherLotId };
}

const ledger = (t: T, studentId: Id<"students">) => t.run(({ db }) => db.query("cloutEvents").withIndex("by_student_day", (q) =>
  q.eq("workspaceKey", "prod").eq("studentId", studentId)).collect());
const counted = async (t: T, studentId: Id<"students">) => (await t.run(({ db }) => db.query("cloutWeeklyTotals")
  .withIndex("by_student_week_campus", (q) => q.eq("workspaceKey", "prod").eq("studentId", studentId)).collect()))
  .reduce((sum, row) => sum + row.countedTotal, 0);
const lifetime = async (t: T, studentId: Id<"students">) => (await t.run(({ db }) => db.get(studentId)))?.lifetimeClout ?? 0;

function report(t: T, sessionToken: string, parkingLotId: Id<"parkingLots">, fullnessTier: 0 | 1 | 2 | 3, nowOverride: number, deckLevel?: string) {
  return t.mutation(api.parking.submitParkingReport, { sessionToken, parkingLotId, reportKind: "fullness", fullnessTier, nowOverride, deckLevel });
}

beforeEach(() => {
  process.env.KSUX_SKIP_PUSH_SCHEDULER = "true";
  process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Clout corroboration (SPEC-v2 §12)", () => {
  it("pays 5 to each Parking Report only when a different Student agrees within 20 min and one tier", async () => {
    const { t, students: [a, b, c, d], lotId, otherLotId } = await setup(["park_a", "park_b", "park_c", "park_d"]);
    const now = Date.now();

    const first = await report(t, a!.sessionToken, lotId, 2, now);
    expect(first.corroborated).toBe(false);
    expect(await t.query(api.clout.getMyClout, { sessionToken: a!.sessionToken })).toMatchObject({ pendingReports: 1, lifetime: 0 });

    // Two tiers apart, another lot, or outside the window: no payout.
    expect((await report(t, b!.sessionToken, lotId, 0, now + minute)).corroborated).toBe(false);
    expect((await report(t, c!.sessionToken, otherLotId, 2, now + minute)).corroborated).toBe(false);
    expect((await report(t, d!.sessionToken, lotId, 3, now + 21 * minute)).corroborated).toBe(false);
    expect(await lifetime(t, a!.studentId)).toBe(0);

    // Within one tier and 20 min: both sides earn once.
    expect((await report(t, c!.sessionToken, lotId, 3, now + 5 * minute)).corroborated).toBe(true);
    expect(await lifetime(t, a!.studentId)).toBe(5);
    expect(await lifetime(t, c!.studentId)).toBe(5);
    expect(await counted(t, a!.studentId)).toBe(5);
    const card = await t.query(api.clout.getMyClout, { sessionToken: a!.sessionToken });
    expect(card.pendingReports).toBe(0);
    expect(card.thisWeek.find((row) => row.campus === "Kennesaw")?.counted).toBe(5);
    expect(card.payouts[0]).toMatchObject({ kind: "earn", amount: 5, sourceType: "parking_report", place: expect.stringMatching(/^Lot /) });
  });

  it("requires the same deck floor when both reports name one", async () => {
    const { t, students: [a, b, c], lotId } = await setup(["floor_a", "floor_b", "floor_c"]);
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 2, now, "Level 3");
    expect((await report(t, b!.sessionToken, lotId, 2, now + minute, "Level 1")).corroborated).toBe(false);
    expect((await report(t, c!.sessionToken, lotId, 2, now + 2 * minute)).corroborated).toBe(true);
  });

  it("pays each report at most once and each pair once per lot per day", async () => {
    const { t, students: [a, b], lotId } = await setup(["pair_a", "pair_b"]);
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 1, now);
    await report(t, b!.sessionToken, lotId, 1, now + minute);
    // Same pair again on the same lot later today (after the 10-minute cooldown).
    await report(t, a!.sessionToken, lotId, 1, now + 11 * minute);
    await report(t, b!.sessionToken, lotId, 1, now + 12 * minute);
    expect(await lifetime(t, a!.studentId)).toBe(5);
    expect(await lifetime(t, b!.studentId)).toBe(5);
    expect((await ledger(t, a!.studentId)).filter((row) => row.kind === "earn")).toHaveLength(1);
  });

  it("caps paid reports at 2 per target per day and 50 Clout per day", async () => {
    const { t, students: [a, b, c, d], lotId, otherLotId } = await setup(["cap_a", "cap_b", "cap_c", "cap_d"]);
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 1, now);
    await report(t, b!.sessionToken, lotId, 1, now + minute);
    await report(t, a!.sessionToken, lotId, 1, now + 11 * minute);
    await report(t, c!.sessionToken, lotId, 1, now + 12 * minute);
    await report(t, a!.sessionToken, lotId, 1, now + 22 * minute);
    await report(t, d!.sessionToken, lotId, 1, now + 23 * minute);
    expect(await lifetime(t, a!.studentId)).toBe(10); // third paid report on this lot today is refused
    expect(await lifetime(t, d!.studentId)).toBe(5); // the partner's own payout is independent

    // Fill b's day to 50, then a further corroboration pays b nothing.
    const dayKeyET = easternDate(now);
    await t.run(async ({ db }) => {
      for (let i = 0; i < 9; i++) {
        await db.insert("cloutEvents", { workspaceKey: "prod", studentId: b!.studentId, kind: "earn", amount: 5,
          sourceType: "line_check", sourceKey: "seed-" + i, targetKey: "dining_venue:seed-" + i, campus: "Kennesaw",
          weekKey: weekKeyET(now), dayKeyET, createdAt: now, purgeAt: now + 30 * 86_400_000 });
      }
    });
    await report(t, b!.sessionToken, otherLotId, 2, now + 30 * minute);
    await report(t, c!.sessionToken, otherLotId, 2, now + 31 * minute);
    const bEarns = (await ledger(t, b!.studentId)).filter((row) => row.kind === "earn");
    expect(bEarns.reduce((sum, row) => sum + row.amount, 0)).toBe(50); // 5 earlier + 45 seeded; the next 5 would pass 50
    expect(await lifetime(t, c!.studentId)).toBe(10);
  });

  it("pays the leaver 5 for a taken Spot Opening and the taker nothing, once", async () => {
    const { t, students: [leaver, taker, other], lotId } = await setup(["spot_leaver", "spot_taker", "spot_other"]);
    const now = Date.now();
    const opening = await t.mutation(api.parking.submitParkingReport, { sessionToken: leaver!.sessionToken,
      parkingLotId: lotId, reportKind: "spot_opening", nowOverride: now });
    expect((await t.query(api.clout.getMyClout, { sessionToken: leaver!.sessionToken })).pendingReports).toBe(1);
    await t.mutation(api.parking.takeSpotOpening, { sessionToken: taker!.sessionToken, reportId: opening.reportId, nowOverride: now + minute });
    await t.mutation(api.parking.takeSpotOpening, { sessionToken: other!.sessionToken, reportId: opening.reportId, nowOverride: now + 2 * minute });
    expect(await lifetime(t, leaver!.studentId)).toBe(5);
    expect(await lifetime(t, taker!.studentId)).toBe(0);
    expect((await ledger(t, leaver!.studentId)).filter((row) => row.sourceType === "spot_opening")).toHaveLength(1);
  });

  it("pays Line Checks within 15 min and the same or adjacent level", async () => {
    const { t, students: [a, b, c] } = await setup(["line_a", "line_b", "line_c"]);
    const now = Date.now();
    const check = (s: { sessionToken: string }, lineTier: "no_wait" | "short_wait" | "packed", at: number) =>
      t.mutation(api.transitDining.submitDiningLineCheck, { sessionToken: s.sessionToken, venueSlug: "stingers", lineTier, nowOverride: at });
    await check(a!, "no_wait", now);
    expect((await check(b!, "packed", now + minute)).corroborated).toBe(false);
    expect((await check(c!, "short_wait", now + 16 * minute)).corroborated).toBe(true); // matches b, not a (expired window)
    expect(await lifetime(t, a!.studentId)).toBe(0);
    expect(await lifetime(t, b!.studentId)).toBe(5);
    const row = (await ledger(t, b!.studentId))[0]!;
    expect(row).toMatchObject({ sourceType: "line_check", campus: "Marietta" });
  });

  it("gives Study Room vibes a 20-minute cooldown and pays a matching vibe within 20 min", async () => {
    const { t, students: [a, b] } = await setup(["vibe_a", "vibe_b"]);
    const now = Date.now();
    const vibe = (s: { sessionToken: string }, v: "quiet" | "moderate" | "packed", at: number) =>
      t.mutation(api.study.submitWalkInVibe, { sessionToken: s.sessionToken, roomSlug: "alc-2nd-floor-atrium", vibe: v, nowOverride: at });
    await vibe(a!, "quiet", now);
    await expect(vibe(a!, "moderate", now + 10 * minute)).rejects.toThrow(/1 per 20 minutes/);
    expect((await vibe(b!, "moderate", now + 15 * minute)).corroborated).toBe(true);
    expect(await lifetime(t, a!.studentId)).toBe(5);
    expect(await lifetime(t, b!.studentId)).toBe(5);
    await expect(vibe(a!, "quiet", now + 21 * minute)).resolves.toMatchObject({ ok: true });
  });

  it("never pays stop reports or safety content", async () => {
    const { t, students: [a, b] } = await setup(["stop_a", "stop_b"]);
    const now = Date.now();
    for (const s of [a!, b!]) {
      await t.mutation(api.transitDining.submitShuttleStopPulse, { sessionToken: s.sessionToken, stopId: "stop-1", pulseKind: "long_line", nowOverride: now });
    }
    expect(await t.run(({ db }) => db.query("cloutEvents").collect())).toHaveLength(0);
    // The ledger has no source type for stops, Incidents, Moderation Reports or the Emergency Panel.
    const schema = (await import("../../convex/schema")).default;
    const sourceTypes = JSON.stringify((schema as any).tables.cloutEvents.validator.json.value.sourceType);
    for (const banned of ["incident", "moderation", "emergency", "shuttle_stop", "stop"]) {
      expect(sourceTypes).not.toContain(`"${banned}`);
    }
  });

  it("ignores unverified Students", async () => {
    const { t, students: [a, b], lotId } = await setup(["unv_a", "unv_b"]);
    await t.run(({ db }) => db.patch(b!.studentId, { canonicalEmail: undefined }));
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 1, now);
    await report(t, b!.sessionToken, lotId, 1, now + minute);
    expect(await lifetime(t, a!.studentId)).toBe(5);
    expect(await lifetime(t, b!.studentId)).toBe(0);
  });
});

async function completeDeal(t: T, seller: { sessionToken: string }, buyer: { sessionToken: string }, confirmSpot: boolean, now: number,
  beforePickup?: (listingId: Id<"listings">) => Promise<unknown>) {
  const listing = await t.mutation(api.marketplace.createListing, { sessionToken: seller.sessionToken, title: "Desk lamp",
    description: "Works fine", campus: "Kennesaw", category: "electronics", pricingMode: "free_pickup", nowOverride: now });
  const deal = await t.mutation(api.marketplace.openOrResumeDealChat, { sessionToken: buyer.sessionToken, listingId: listing.listingId });
  const spots = await t.query(api.marketplace.listMeetupSpots, { sessionToken: seller.sessionToken, campus: "Marietta" });
  await t.mutation(api.marketplace.proposeOrUpdateHandoffCard, { sessionToken: seller.sessionToken, chatId: deal.chatId,
    meetupSpotId: spots[0]!._id, proposedWindow: "Today 3 PM", agreedTerms: "Free" });
  if (confirmSpot) await t.mutation(api.marketplace.confirmHandoffMeetup, { sessionToken: buyer.sessionToken, chatId: deal.chatId });
  await t.mutation(api.marketplace.transitionListingStatus, { sessionToken: seller.sessionToken, listingId: listing.listingId,
    nextStatus: "sold", dealChatId: deal.chatId });
  await beforePickup?.(listing.listingId);
  const pickup = await t.mutation(api.marketplace.confirmBuyerPickup, { sessionToken: buyer.sessionToken, chatId: deal.chatId, nowOverride: now + minute });
  return { listingId: listing.listingId, chatId: deal.chatId, pickup };
}

describe("Handoff Clout, holds and reversals", () => {
  it("earns 10 each only with a confirmed Meetup Spot, counted at the Spot's Campus", async () => {
    const { t, students: [seller, buyer, buyer2] } = await setup(["hand_seller", "hand_buyer", "hand_buyer2"]);
    const now = Date.now();
    const noSpot = await completeDeal(t, seller!, buyer2!, false, now);
    expect(noSpot.pickup).toMatchObject({ trustIncremented: true, cloutPaid: false });
    expect((await t.run(({ db }) => db.get(buyer2!.studentId)))?.completedDealCount).toBe(1);

    const withSpot = await completeDeal(t, seller!, buyer!, true, now);
    expect(withSpot.pickup).toMatchObject({ trustIncremented: true, cloutPaid: true });
    expect(await lifetime(t, seller!.studentId)).toBe(10);
    expect(await lifetime(t, buyer!.studentId)).toBe(10);
    expect((await ledger(t, seller!.studentId))[0]).toMatchObject({ sourceType: "handoff", campus: "Marietta" });
  });

  it("holds on review, releases on restore, and reverses on removal while the buyer keeps theirs", async () => {
    const { t, students: [seller, buyer, buyer2, r1, r2, r3, maintainer] } =
      await setup(["hold_seller", "hold_buyer", "hold_buyer2", "hold_r1", "hold_r2", "hold_r3", "hold_maint"]);
    vi.stubEnv("KSUX_MAINTAINER_EMAILS", maintainer!.canonicalEmail);
    const now = Date.now();
    const deal = await completeDeal(t, seller!, buyer!, true, now);
    const reportListing = async () => {
      for (const r of [r1!, r2!, r3!]) {
        await t.mutation(api.moderation.submitReport, { sessionToken: r.sessionToken, targetType: "listing",
          targetId: deal.listingId, reason: "scam_spam" });
      }
    };

    // A Moderation Report alone never takes Clout; quarantine (3 reporters) holds it.
    await reportListing();
    expect(await counted(t, seller!.studentId)).toBe(0);
    expect(await lifetime(t, seller!.studentId)).toBe(0);
    expect((await t.query(api.clout.getMyClout, { sessionToken: seller!.sessionToken })).thisWeek
      .find((row) => row.campus === "Marietta")?.held).toBe(10);
    expect(await lifetime(t, buyer!.studentId)).toBe(10);

    await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer!.sessionToken,
      targetType: "listing", targetId: deal.listingId, decision: "restore" });
    expect(await counted(t, seller!.studentId)).toBe(10);
    expect(await lifetime(t, seller!.studentId)).toBe(10);

    // Repeated restore is idempotent; removal reverses once.
    await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer!.sessionToken,
      targetType: "listing", targetId: deal.listingId, decision: "restore" });
    await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer!.sessionToken,
      targetType: "listing", targetId: deal.listingId, decision: "remove", reasonId: "harassment" });
    await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer!.sessionToken,
      targetType: "listing", targetId: deal.listingId, decision: "remove", reasonId: "harassment" });
    expect(await counted(t, seller!.studentId)).toBe(0);
    expect(await lifetime(t, seller!.studentId)).toBe(0);
    expect(await lifetime(t, buyer!.studentId)).toBe(10);
    const kinds = (await ledger(t, seller!.studentId)).map((row) => row.kind).sort();
    expect(kinds).toEqual(["earn", "hold", "release", "reverse"]);

    // A Listing already under review at pickup pays straight into a hold.
    const second = await completeDeal(t, seller!, buyer2!, true, now + 10 * minute,
      (listingId) => t.run(({ db }) => db.patch(listingId, { visibilityStatus: "under_review" })));
    expect(second.pickup.cloutPaid).toBe(true);
    expect(await lifetime(t, seller!.studentId)).toBe(0);
    expect(await lifetime(t, buyer2!.studentId)).toBe(10);
  });

  it("suspension reverses all of the account's Clout and the partner keeps their payout", async () => {
    const { t, students: [a, b, maintainer], lotId } = await setup(["susp_a", "susp_b", "susp_maint"]);
    vi.stubEnv("KSUX_MAINTAINER_EMAILS", maintainer!.canonicalEmail);
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 1, now);
    await report(t, b!.sessionToken, lotId, 1, now + minute);
    await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer!.sessionToken,
      targetType: "student", targetId: a!.studentId, decision: "suspend_student" });
    expect(await lifetime(t, a!.studentId)).toBe(0);
    expect((await ledger(t, a!.studentId)).filter((row) => row.kind === "reverse")).toHaveLength(1);
    expect(await lifetime(t, b!.studentId)).toBe(5);
    expect(await counted(t, b!.studentId)).toBe(5);
  });
});

describe("Ledger read models and concurrency", () => {
  it("keeps weekly totals, board counts and opt-out consistent with the ledger", async () => {
    const { t, students: [a, b], lotId } = await setup(["board_a", "board_b"]);
    const now = Date.now();
    await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: a!.sessionToken, hidden: true });
    await report(t, a!.sessionToken, lotId, 1, now);
    await report(t, b!.sessionToken, lotId, 1, now + minute);
    const totals = await t.run(({ db }) => db.query("cloutWeeklyTotals").collect());
    expect(totals.map((row) => ({ hidden: row.hidden, total: row.countedTotal })).sort((x, y) => Number(x.hidden) - Number(y.hidden)))
      .toEqual([{ hidden: false, total: 5 }, { hidden: true, total: 5 }]);
    const board = await t.run(({ db }) => db.query("cloutBoardCounts").collect());
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ campus: "Kennesaw", weekKey: weekKeyET(now), visibleCount: 1 });

    // Every counted total equals earn + release − hold − reverse(counted) in the ledger.
    for (const s of [a!, b!]) {
      const rows = await ledger(t, s.studentId);
      const sum = rows.reduce((acc, row) => acc + ({ earn: 1, release: 1, hold: -1, reverse: -1 }[row.kind]) * row.amount, 0);
      expect(await counted(t, s.studentId)).toBe(sum);
    }
  });

  it("pays a duplicate or concurrent corroboration only once", async () => {
    const { t, students: [a, b, c], lotId } = await setup(["dup_a", "dup_b", "dup_c"]);
    const now = Date.now();
    await report(t, a!.sessionToken, lotId, 1, now);
    await Promise.all([
      report(t, b!.sessionToken, lotId, 1, now + minute),
      report(t, c!.sessionToken, lotId, 1, now + minute),
    ]);
    expect((await ledger(t, a!.studentId)).filter((row) => row.kind === "earn")).toHaveLength(1);
    expect(await lifetime(t, a!.studentId)).toBe(5);
    // b and c both earn: c pairs with whichever report was still unpaid.
    expect((await lifetime(t, b!.studentId)) + (await lifetime(t, c!.studentId))).toBe(10);
  });
});

describe("Judge Demo Mode", () => {
  it("@jordan_me corroborates the judge's report 4 s later through the normal path, without touching prod", async () => {
    vi.useFakeTimers();
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const auth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
    const lots = await t.query(api.parking.listParkingLots, { ...auth, campusOverride: "Kennesaw" });
    const lot = lots.lots.find((l) => l.slug === "north-parking-deck")!; // no seeded demo reports here
    const before = await t.query(api.clout.getMyClout, auth);

    await t.mutation(api.parking.submitParkingReport, { ...auth, parkingLotId: lot._id, reportKind: "fullness", fullnessTier: 2 });
    expect((await t.query(api.clout.getMyClout, auth)).lifetime).toBe(before.lifetime);
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(4_000));

    const after = await t.query(api.clout.getMyClout, auth);
    expect(after.isDemo).toBe(true);
    expect(after.lifetime).toBe(before.lifetime + 5);
    expect(after.payouts[0]).toMatchObject({ kind: "earn", amount: 5, sourceType: "parking_report" });
    const prod = await t.run(({ db }) => db.query("cloutEvents").withIndex("by_purge", (q) => q.eq("workspaceKey", "prod")).collect());
    expect(prod).toHaveLength(0);
  });
});
