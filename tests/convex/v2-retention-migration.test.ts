import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const tables = ["incidents", "incidentUpdates", "moderatorActions", "appeals", "alertSources", "alertItems",
  "cloutEvents", "cloutWeeklyTotals", "cloutBoardCounts"] as const;

it("purges all ten v2 tables only in their institutional or Student partitions and preserves future rows", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const student = await createVerifiedTestStudent(t, { handle: "retention", displayName: "Retention" });
  const now = Date.now();
  const copies = await t.run(async ({ db }) => {
    const expired = [];
    const future = [];
    for (const table of tables) {
      const row = (await db.query(table).withIndex("by_purge", (q) => q.eq("workspaceKey", "demo:" + demo.demoSessionId)).first())!;
      const { _id: _id, _creationTime: _creationTime, ...fields } = row;
      const workspaceKey = table === "alertSources" || table === "alertItems" ? "ksu" : "prod";
      // Preserve each table's validator while cloning a realistic record.
      expired.push(await db.insert(table, { ...fields, workspaceKey, purgeAt: now } as never));
      future.push(await db.insert(table, { ...fields, workspaceKey, purgeAt: now + 100_000 } as never));
    }
    expired.push(await db.insert("moderators", { workspaceKey: "prod", studentId: student.studentId,
      appointedById: student.studentId, csaStatement: "Not a CSA", isCsa: false, appointedAt: now - 1, revokedAt: now, purgeAt: now }));
    return { expired, future };
  });
  const result = await t.mutation(internal.housekeeping.executePurgeBatch, { now, deletedFileKeys: [] });
  expect(result.deletedCount).toBeLessThanOrEqual(200);
  for (const id of copies.expired) expect(await t.run(({ db }) => db.get(id))).toBeNull();
  for (const id of copies.future) expect(await t.run(({ db }) => db.get(id))).not.toBeNull();
  for (const table of tables) {
    expect(await t.run(({ db }) => db.query(table).withIndex("by_purge", (q) => q.eq("workspaceKey", "demo:" + demo.demoSessionId)).first())).not.toBeNull();
  }
});

it("accepts legacy parking and Shuttle snapshot documents, removes retired fields and rebuilds new stream data", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const now = Date.now();
  const legacy = await t.run(async ({ db }) => {
    const lot = (await db.query("parkingLots").first())!;
    await db.patch(lot._id, { hourlyBaselinePrior: Array(168).fill(3) });
    const snapshot = await db.insert("shuttleSnapshots", { singletonKey: "latest", vehicles: [], stopEtas: [],
      serviceAlerts: [{ alertId: "legacy", title: "Legacy notice", body: "Old", passioRouteIds: [] }],
      alertsFetchedAt: now, fetchedAt: now });
    return { lot: lot._id, snapshot };
  });
  await t.mutation(internal.seed.bootstrapKsu, {});
  expect((await t.run(({ db }) => db.get(legacy.lot)))?.hourlyBaselinePrior).toBeUndefined();
  expect(await t.run(({ db }) => db.get(legacy.snapshot))).toBeNull();
  await t.mutation(internal.sync.transitDiningSync.applyShuttleSyncInternal, { now, status: "ready_to_upsert",
    vehicles: [], stopEtas: [], shuttleNotices: [{ noticeId: "new", title: "New notice", body: "Current", passioRouteIds: [] }] });
  const student = await createVerifiedTestStudent(t, { handle: "migration", displayName: "Migration" });
  const overview = await t.query(api.transitDining.listShuttleOverview, { sessionToken: student.sessionToken });
  expect(overview.shuttleNotices).toEqual([{ noticeId: "new", title: "New notice", body: "Current", passioRouteIds: [] }]);
});
