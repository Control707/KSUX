import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { currentWeekKeyET } from "../../convex/clout";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const day = 86_400_000;

it("getMyClout returns only the viewer's own week, lifetime and 30-day log", async () => {
  const t = createTestConvex();
  const me = await createVerifiedTestStudent(t, { handle: "clout_me", displayName: "Me" });
  const other = await createVerifiedTestStudent(t, { handle: "clout_other", displayName: "Other" });
  const now = Date.now();
  const weekKey = currentWeekKeyET(now);
  await t.run(async ({ db }) => {
    for (const studentId of [me.studentId, other.studentId]) {
      await db.insert("cloutEvents", { workspaceKey: "prod", studentId, kind: "earn", amount: 5,
        sourceType: "parking_report", sourceKey: "r-" + studentId, targetKey: "lot", campus: "Kennesaw", weekKey,
        dayKeyET: new Date(now).toISOString().slice(0, 10), createdAt: now, purgeAt: now + 30 * day });
      await db.insert("cloutWeeklyTotals", { workspaceKey: "prod", studentId, campus: "Kennesaw", weekKey,
        countedTotal: 5, heldTotal: 0, hidden: false, purgeAt: now + 84 * day });
    }
    await db.insert("cloutBoardCounts", { workspaceKey: "prod", campus: "Kennesaw", weekKey, visibleCount: 2, purgeAt: now + 84 * day });
    await db.patch(me.studentId, { lifetimeClout: 15 });
  });

  const clout = await t.query(api.clout.getMyClout, { sessionToken: me.sessionToken });
  expect(clout.lifetime).toBe(15);
  expect(clout.hidden).toBe(false);
  expect(clout.thisWeek).toEqual([
    { campus: "Kennesaw", counted: 5, held: 0 },
    { campus: "Marietta", counted: 0, held: 0 },
  ]);
  expect(clout.payouts).toHaveLength(1);
});

it("setLeaderboardHidden flips the flag and keeps this week's board count consistent", async () => {
  const t = createTestConvex();
  const me = await createVerifiedTestStudent(t, { handle: "clout_hide", displayName: "Hide" });
  const now = Date.now();
  const weekKey = currentWeekKeyET(now);
  const ids = await t.run(async ({ db }) => ({
    total: await db.insert("cloutWeeklyTotals", { workspaceKey: "prod", studentId: me.studentId, campus: "Marietta", weekKey,
      countedTotal: 5, heldTotal: 0, hidden: false, purgeAt: now + 84 * day }),
    board: await db.insert("cloutBoardCounts", { workspaceKey: "prod", campus: "Marietta", weekKey, visibleCount: 1, purgeAt: now + 84 * day }),
  }));

  await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: me.sessionToken, hidden: true });
  expect((await t.run(({ db }) => db.get(me.studentId)))?.leaderboardHidden).toBe(true);
  expect((await t.run(({ db }) => db.get(ids.total)))?.hidden).toBe(true);
  expect((await t.run(({ db }) => db.get(ids.board)))?.visibleCount).toBe(0);

  // Repeating is a no-op; showing again restores the count.
  await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: me.sessionToken, hidden: true });
  expect((await t.run(({ db }) => db.get(ids.board)))?.visibleCount).toBe(0);
  await t.mutation(api.clout.setLeaderboardHidden, { sessionToken: me.sessionToken, hidden: false });
  expect((await t.run(({ db }) => db.get(ids.board)))?.visibleCount).toBe(1);
});
