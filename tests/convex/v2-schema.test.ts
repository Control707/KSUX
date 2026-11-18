import { expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const demoTables = [
  "incidents", "incidentUpdates", "moderatorActions", "appeals", "alertSources",
  "alertItems", "cloutEvents", "cloutWeeklyTotals", "cloutBoardCounts",
] as const;

it("seeds isolated v2 states, and purges each fixture table with the Demo session", async () => {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const first = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const second = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const readFixtureRows = (workspaceKey: string) => t.run(async ({ db }) => Promise.all(
    demoTables.map((table) => db.query(table).withIndex("by_purge", (q) => q.eq("workspaceKey", workspaceKey)).collect())
  ));
  const rows = await readFixtureRows("demo:" + first.demoSessionId);
  for (const group of rows) expect(group.length).toBeGreaterThan(0);
  expect((await readFixtureRows("prod")).flat()).toEqual([]);
  const institutional = await t.run(({ db }) => db.query("alertSources")
    .withIndex("by_purge", (q) => q.eq("workspaceKey", "ksu")).collect());
  expect(institutional).toHaveLength(2);
  expect(institutional.map(({ adapterKind }) => adapterKind)).toEqual(["links_only", "links_only"]);

  const expired = Date.now();
  await t.run(({ db }) => db.patch(first.demoSessionId, { expiresAt: expired }));
  for (let i = 0; i < 5; i++) {
    await t.mutation(internal.housekeeping.executePurgeBatch, { now: expired, deletedFileKeys: [] });
  }
  expect((await readFixtureRows("demo:" + first.demoSessionId)).flat()).toEqual([]);
  for (const group of await readFixtureRows("demo:" + second.demoSessionId)) expect(group.length).toBeGreaterThan(0);
  expect(await t.run(({ db }) => db.get(second.demoSessionId))).not.toBeNull();
});

it("resolves active CSA appointments and expires the roster row and action snapshot independently", async () => {
  const t = createTestConvex();
  const moderator = await createVerifiedTestStudent(t, { handle: "schema_mod", displayName: "Schema Moderator" });
  const now = Date.now();
  const { appointment, action } = await t.run(async ({ db }) => ({
    appointment: await db.insert("moderators", {
      workspaceKey: "prod", studentId: moderator.studentId, appointedById: moderator.studentId,
      isCsa: true, csaStatement: "I am a campus security authority.", appointedAt: now - 1_000,
    }),
    action: await db.insert("moderatorActions", {
      workspaceKey: "prod", actorId: moderator.studentId, action: "redact", targetType: "incident", targetKey: "test",
      contentSnapshot: "old material", snapshotPurgeAt: now, createdAt: now - 1_000, purgeAt: now + 100_000,
    }),
  }));
  const summary = () => t.query(api.shell.shellSummary, { sessionToken: moderator.sessionToken });
  expect((await summary()).viewer).toMatchObject({ isModerator: true, isCsa: true, isMaintainer: false });
  await t.run(({ db }) => db.patch(appointment, { revokedAt: now, purgeAt: now }));
  await t.mutation(internal.housekeeping.executePurgeBatch, { now, deletedFileKeys: [] });
  expect(await t.run(({ db }) => db.get(appointment))).toBeNull();
  const retained = await t.run(({ db }) => db.get(action));
  expect(retained?.action).toBe("redact");
  expect(retained?.contentSnapshot).toBeUndefined();
  expect((await summary()).viewer).toMatchObject({ isModerator: false, isCsa: false });
});