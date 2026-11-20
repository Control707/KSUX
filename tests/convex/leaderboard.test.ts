import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { easternDate } from "../../convex/lib/easternDate";
import { weekKeyET } from "../../convex/lib/cloutLedger";
import { leaderboardGateFromSample, v2IoShapes } from "../../convex/lib/v2Launch";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

type T = ReturnType<typeof createTestConvex>;
const minute = 60_000;
const day = 86_400_000;

function ioSample(days: number, leaderboardBytes: number, measuredAt = new Date()) {
  const bytes = Object.fromEntries(v2IoShapes.map(({ key }) => [key, key === "leaderboard" ? leaderboardBytes : 0]));
  return JSON.stringify({ days, measuredAt: measuredAt.toISOString(), bytes });
}
const openGate = () => vi.stubEnv("OWLSIDE_V2_DB_IO_SAMPLE", ioSample(14, 1_000_000));

/** Writes a Student's weekly total the way the ledger does (row + board counter). */
async function seedTotal(t: T, studentId: Id<"students">, campus: "Kennesaw" | "Marietta", countedTotal: number, opts: { weekKey?: string; hidden?: boolean } = {}) {
  const weekKey = opts.weekKey ?? weekKeyET(Date.now());
  const hidden = opts.hidden ?? false;
  await t.run(async ({ db }) => {
    const now = Date.now();
    await db.insert("cloutWeeklyTotals", { workspaceKey: "prod", studentId, campus, weekKey, countedTotal, heldTotal: 0, hidden, purgeAt: now + 84 * day });
    if (hidden || countedTotal <= 0) return;
    const board = await db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
      q.eq("workspaceKey", "prod").eq("campus", campus).eq("weekKey", weekKey)).unique();
    if (board) await db.patch(board._id, { visibleCount: board.visibleCount + 1 });
    else await db.insert("cloutBoardCounts", { workspaceKey: "prod", campus, weekKey, visibleCount: 1, purgeAt: now + 84 * day });
  });
}

beforeEach(() => {
  process.env.OWLSIDE_SKIP_PUSH_SCHEDULER = "true";
  process.env.OWLSIDE_SKIP_STORAGE_SCHEDULER = "true";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Leaderboard I/O gate (SPEC-v2 §13 gate 2(a))", () => {
  it("opens only with ≥14 fresh measured days projecting under 50 % of 1 GB", () => {
    const now = Date.now();
    const at = new Date(now);
    expect(leaderboardGateFromSample(undefined, now)).toEqual({ open: false, reason: "no_measurement" });
    expect(leaderboardGateFromSample(ioSample(13, 1_000, at), now)).toEqual({ open: false, reason: "too_few_days" });
    // 14 days × (30/14) projection: 233,333,334 bytes → 500,000,001 ≥ 50 %.
    expect(leaderboardGateFromSample(ioSample(14, 233_333_334, at), now)).toEqual({ open: false, reason: "over_budget" });
    expect(leaderboardGateFromSample(ioSample(14, 233_333_333, at), now)).toEqual({ open: true });
    expect(leaderboardGateFromSample(ioSample(14, 1, new Date(now - 8 * day)), now)).toEqual({ open: false, reason: "stale_measurement" });
  });

  it("is open in prod without any I/O measurement, and earning works", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const [a, b] = await Promise.all(["gate_a", "gate_b"].map((handle) => createVerifiedTestStudent(t, { handle, displayName: handle })));
    const lots = await t.query(api.parking.listParkingLots, { sessionToken: a!.sessionToken, campusOverride: "Kennesaw" });
    const lotId = lots.lots[0]!._id;
    const now = Date.now();
    await t.mutation(api.parking.submitParkingReport, { sessionToken: a!.sessionToken, parkingLotId: lotId, reportKind: "fullness", fullnessTier: 2, nowOverride: now });
    await t.mutation(api.parking.submitParkingReport, { sessionToken: b!.sessionToken, parkingLotId: lotId, reportKind: "fullness", fullnessTier: 2, nowOverride: now + minute });
    expect((await t.query(api.clout.getMyClout, { sessionToken: a!.sessionToken })).lifetime).toBe(5);

    const open = await t.query(api.leaderboard.getLeaderboard, { sessionToken: a!.sessionToken });
    expect(open).toMatchObject({ status: "open", me: { state: "ranked", rank: 1, of: 2, total: 5 } });
  });
});

describe("Leaderboard board (SPEC-v2 §12)", () => {
  it("attributes Clout to the Campus where it was earned and defaults to the viewer's top Campus, else home", async () => {
    openGate();
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const [a, b] = await Promise.all([
      createVerifiedTestStudent(t, { handle: "attr_a", displayName: "A", homeCampus: "Kennesaw" }),
      createVerifiedTestStudent(t, { handle: "attr_b", displayName: "B", homeCampus: "Kennesaw" }),
    ]);
    // Nothing earned: home Campus.
    expect(await t.query(api.leaderboard.getLeaderboard, { sessionToken: a.sessionToken }))
      .toMatchObject({ campus: "Kennesaw", defaultCampus: "Kennesaw", me: { state: "nothing_earned" } });

    // Corroborate on a Marietta lot: the Kennesaw-home Student earns on the Marietta board.
    const lots = await t.query(api.parking.listParkingLots, { sessionToken: a.sessionToken, campusOverride: "Marietta" });
    const marietta = lots.lots.find((lot) => lot.campus === "Marietta");
    expect(marietta, "seed has a Marietta lot").toBeTruthy();
    const now = Date.now();
    await t.mutation(api.parking.submitParkingReport, { sessionToken: a.sessionToken, parkingLotId: marietta!._id, reportKind: "fullness", fullnessTier: 1, nowOverride: now });
    await t.mutation(api.parking.submitParkingReport, { sessionToken: b.sessionToken, parkingLotId: marietta!._id, reportKind: "fullness", fullnessTier: 1, nowOverride: now + minute });

    const board = await t.query(api.leaderboard.getLeaderboard, { sessionToken: a.sessionToken });
    expect(board).toMatchObject({ status: "open", campus: "Marietta", defaultCampus: "Marietta", me: { state: "ranked", rank: 1, total: 5 } });
    expect(board.status === "open" && board.top.map((row) => row.handle).sort()).toEqual(["attr_a", "attr_b"]);
    const kennesaw = await t.query(api.leaderboard.getLeaderboard, { sessionToken: a.sessionToken, campus: "Kennesaw" });
    expect(kennesaw).toMatchObject({ campus: "Kennesaw", boardEmpty: true, me: { state: "nothing_earned" } });
  });

  it("returns the Top 25 by handle and the viewer's exact rank from either side, with ties sharing a rank", async () => {
    openGate();
    const t = createTestConvex();
    const students = [];
    for (let i = 0; i < 40; i++) students.push(await createVerifiedTestStudent(t, { handle: `rank_${String(i).padStart(2, "0")}`, displayName: `R${i}` }));
    // Totals 200, 195, …, 5; rank_10 and rank_11 tie at 150.
    for (const [i, s] of students.entries()) await seedTotal(t, s.studentId, "Kennesaw", i === 11 ? 150 : 200 - i * 5);

    const top = await t.query(api.leaderboard.getLeaderboard, { sessionToken: students[0]!.sessionToken });
    if (top.status !== "open") throw new Error("gate should be open");
    expect(top.top).toHaveLength(25);
    expect(top.top[0]).toEqual({ rank: 1, handle: "rank_00", total: 200, isViewer: true });
    expect(top.top.filter((row) => row.total === 150).map((row) => row.rank)).toEqual([11, 11]);
    expect(top.top[12]).toMatchObject({ rank: 13, total: 140 });
    expect(top.me).toEqual({ state: "ranked", rank: 1, of: 40, total: 200 });
    // No other fields leak (display names, ids).
    expect(Object.keys(top.top[0]!).sort()).toEqual(["handle", "isViewer", "rank", "total"]);

    // Outside the Top 25: near the bottom (short side below) and higher up (short side above).
    for (const [index, expected] of [[38, 39], [26, 27], [33, 34]] as const) {
      const board = await t.query(api.leaderboard.getLeaderboard, { sessionToken: students[index]!.sessionToken });
      expect(board.status === "open" && board.me).toEqual({ state: "ranked", rank: expected, of: 40, total: 200 - index * 5 });
    }
  });

  it("drops opted-out Students from the board and shows them the Show me line", async () => {
    openGate();
    const t = createTestConvex();
    const me = await createVerifiedTestStudent(t, { handle: "opt_me", displayName: "Me" });
    const other = await createVerifiedTestStudent(t, { handle: "opt_other", displayName: "Other" });
    await seedTotal(t, me.studentId, "Kennesaw", 20);
    await seedTotal(t, other.studentId, "Kennesaw", 10);

    await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: me.sessionToken, hidden: true });
    const mine = await t.query(api.leaderboard.getLeaderboard, { sessionToken: me.sessionToken });
    expect(mine).toMatchObject({ status: "open", me: { state: "hidden" }, visibleCount: 1 });
    expect(mine.status === "open" && mine.top.map((row) => row.handle)).toEqual(["opt_other"]);
    const theirs = await t.query(api.leaderboard.getLeaderboard, { sessionToken: other.sessionToken });
    expect(theirs).toMatchObject({ me: { state: "ranked", rank: 1, of: 1 } });

    await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: me.sessionToken, hidden: false });
    expect(await t.query(api.leaderboard.getLeaderboard, { sessionToken: other.sessionToken }))
      .toMatchObject({ me: { state: "ranked", rank: 2, of: 2 } });
  });

  it("removes suspended accounts from every board", async () => {
    openGate();
    const t = createTestConvex();
    const me = await createVerifiedTestStudent(t, { handle: "susp_me", displayName: "Me" });
    const bad = await createVerifiedTestStudent(t, { handle: "susp_bad", displayName: "Bad" });
    await seedTotal(t, me.studentId, "Kennesaw", 10);
    await seedTotal(t, bad.studentId, "Kennesaw", 50);
    await t.run(({ db }) => db.patch(bad.studentId, { accountStatus: "suspended" }));
    const board = await t.query(api.leaderboard.getLeaderboard, { sessionToken: me.sessionToken });
    expect(board.status === "open" && board.top.map((row) => row.handle)).toEqual(["susp_me"]);
    expect(board).toMatchObject({ me: { state: "ranked", rank: 1 } });
  });

  it("rolls over at Monday 00:00 ET and shows the new-week state on an empty board", async () => {
    openGate();
    const t = createTestConvex();
    const me = await createVerifiedTestStudent(t, { handle: "roll_me", displayName: "Me" });
    // Sunday 23:30 ET, then Monday 00:30 ET (Nov 2026: EST, UTC−5).
    const sunday = Date.UTC(2026, 10, 23, 4, 30);
    const monday = Date.UTC(2026, 10, 23, 5, 30);
    expect(weekKeyET(sunday)).toBe("2026-11-16");
    expect(weekKeyET(monday)).toBe("2026-11-23");
    expect(easternDate(monday)).toBe("2026-11-23");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(sunday);
    vi.stubEnv("OWLSIDE_V2_DB_IO_SAMPLE", ioSample(14, 1_000, new Date(sunday)));
    await seedTotal(t, me.studentId, "Kennesaw", 15, { weekKey: "2026-11-16" });
    expect(await t.query(api.leaderboard.getLeaderboard, { sessionToken: me.sessionToken }))
      .toMatchObject({ weekKey: "2026-11-16", me: { state: "ranked", rank: 1, total: 15 } });

    vi.setSystemTime(monday);
    const fresh = await t.query(api.leaderboard.getLeaderboard, { sessionToken: me.sessionToken });
    expect(fresh).toMatchObject({ weekKey: "2026-11-23", boardEmpty: true, afterReset: true, me: { state: "nothing_earned" } });
  });

  it("labels Demo boards and seeds both Campuses", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const auth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
    const kennesaw = await t.query(api.leaderboard.getLeaderboard, auth);
    expect(kennesaw).toMatchObject({ status: "open", isDemo: true, campus: "Kennesaw", me: { state: "ranked", rank: 3, of: 3, total: 5 } });
    const marietta = await t.query(api.leaderboard.getLeaderboard, { ...auth, campus: "Marietta" });
    expect(marietta.status === "open" && marietta.top.map((row) => row.handle)).toEqual(["sam_cpe", "jordan_me"]);
    const anomalies = await t.query(api.leaderboard.getCloutAnomalies, auth);
    expect(anomalies?.gainers[0]).toMatchObject({ campus: "Kennesaw", handle: "alex_owl", counted: 15 });
  });
});

describe("Clout anomaly view", () => {
  it("is maintainer-only and lists top gainers and most-reversed accounts", async () => {
    const t = createTestConvex();
    const maintainer = await createVerifiedTestStudent(t, { handle: "anom_lead", displayName: "Lead" });
    const student = await createVerifiedTestStudent(t, { handle: "anom_s", displayName: "S" });
    const gamer = await createVerifiedTestStudent(t, { handle: "anom_gamer", displayName: "G" });
    vi.stubEnv("OWLSIDE_MAINTAINER_EMAILS", maintainer.canonicalEmail);
    await seedTotal(t, student.studentId, "Kennesaw", 10);
    await seedTotal(t, gamer.studentId, "Marietta", 40, { hidden: true });
    await t.run(async ({ db }) => {
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        await db.insert("cloutEvents", { workspaceKey: "prod", studentId: gamer.studentId, kind: "reverse", amount: 5,
          sourceType: "parking_report", sourceKey: "r" + i, targetKey: "lot", campus: "Marietta", weekKey: weekKeyET(now),
          dayKeyET: easternDate(now), createdAt: now, purgeAt: now + 30 * day });
      }
    });

    expect(await t.query(api.leaderboard.getCloutAnomalies, { sessionToken: student.sessionToken })).toBeNull();
    const view = await t.query(api.leaderboard.getCloutAnomalies, { sessionToken: maintainer.sessionToken });
    expect(view?.gainers).toEqual([
      { campus: "Kennesaw", handle: "anom_s", counted: 10, held: 0, hidden: false },
      { campus: "Marietta", handle: "anom_gamer", counted: 40, held: 0, hidden: true },
    ]);
    expect(view?.mostReversed).toEqual([{ handle: "anom_gamer", reversals: 3, reversedAmount: 15, holds: 0 }]);
  });
});
