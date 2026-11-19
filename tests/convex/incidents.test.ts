import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";
import { DAY, HOUR, INCIDENT_PLACES } from "../../convex/lib/incidentPolicy";

const NOW = Date.parse("2026-11-19T15:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "true"); vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "true");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = createTestConvex();
  const author = await createVerifiedTestStudent(t, { handle: "incident_author", displayName: "Author" });
  const reporters = await Promise.all([0, 1, 2].map((n) => createVerifiedTestStudent(t, { handle: "reporter" + n, displayName: "Reporter" })));
  await t.run(async ({ db }) => {
    for (const student of reporters.slice(0, 2)) await db.insert("moderators", { workspaceKey: "prod", studentId: student.studentId,
      appointedById: author.studentId, csaStatement: "I am not a CSA", isCsa: false, appointedAt: NOW - 1 });
  });
  const auth = { sessionToken: author.sessionToken };
  const write = (extra = {}) => t.mutation(api.incidents.create, { ...auth, category: "hazard", campus: "Kennesaw",
    buildingId: INCIDENT_PLACES.find((p) => p.campus === "Kennesaw")!.id, observedAt: Date.now(),
    text: "water leaking near the entrance", nameLevel: "show_handle", ...extra });
  const detail = (incidentId: string, sessionToken = author.sessionToken) => t.query(api.incidents.incidentDetail, { sessionToken, incidentId });
  return { t, author, reporters, auth, write, detail };
}

it("publishes a building-level Incident, never a Post, Alert or Clout event, with a private author projection", async () => {
  const { t, write, detail, reporters } = await setup();
  const { incidentId } = await write({ nameLevel: "hidden" });
  const result = await detail(incidentId, reporters[0]!.sessionToken);
  expect(result).toMatchObject({ state: "visible", incident: { authorLabel: "Student · name hidden", state: "Active" } });
  if (result.state === "visible") expect(result.incident.lockedAt - result.incident.publishedAt).toBe(300_000);
  expect(JSON.stringify(result)).not.toMatch(/canonicalEmail|authorId|incident_author|photoAssetId/);
  for (const table of ["posts", "alertItems", "cloutEvents"] as const) expect(await t.run(({ db }) => db.query(table).collect())).toEqual([]);
});

it("accepts production posts without launch switches or appointed Moderators", async () => {
  const { t, write } = await setup();
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "false");
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "false");
  await t.run(async ({ db }) => { for (const row of await db.query("moderators").collect()) await db.patch(row._id, { revokedAt: NOW }); });
  await expect(write()).resolves.toMatchObject({ incidentId: expect.any(String) });
});

it("blocks identifying details, false authority, diverts, invalid times and forged locations on all author writes", async () => {
  const { t, write, auth } = await setup();
  for (const text of ["@someone was here", "John Smith was here", "phone 470-578-6666", "room 123", "123", "plate ABC1234", "all clear", "all\n clear", "police on scene", "confirmed", "it's safe now", "a person seems suspicious", "medical emergency", "sexual misconduct", "x".repeat(281)])
    await expect(write({ text })).rejects.toThrow();
  await expect(write({ buildingId: "random" })).rejects.toThrow(/listed/);
  await expect(write({ campus: "Marietta" })).rejects.toThrow(/listed/);
  await expect(write({ observedAt: NOW + HOUR })).rejects.toThrow(/observed time/);
  await expect(write({ areaDetail: "unit 22" })).rejects.toThrow();
  const { incidentId } = await write();
  await expect(t.mutation(api.incidents.edit, { ...auth, incidentId, text: "all clear" })).rejects.toThrow();
  await expect(t.mutation(api.incidents.addUpdate, { ...auth, incidentId, text: "@person" })).rejects.toThrow();
});

it("enforces the 5-minute edit lock, ownership, and 5 dated Author Updates without renewing age", async () => {
  const { t, write, auth, reporters, detail } = await setup();
  const { incidentId } = await write();
  await t.mutation(api.incidents.edit, { ...auth, incidentId, text: "water near the outside entrance" });
  await expect(t.mutation(api.incidents.edit, { sessionToken: reporters[0]!.sessionToken, incidentId, text: "different" })).rejects.toThrow(/available/);
  vi.setSystemTime(NOW + 300_010);
  await expect(t.mutation(api.incidents.edit, { ...auth, incidentId, text: "later" })).rejects.toThrow(/locked/);
  for (let n = 0; n < 5; n++) await t.mutation(api.incidents.addUpdate, { ...auth, incidentId, text: "water still visible" });
  await expect(t.mutation(api.incidents.addUpdate, { ...auth, incidentId, text: "another" })).rejects.toThrow(/5 Author Updates/);
  expect(await detail(incidentId)).toMatchObject({ incident: { updateCount: 5, updates: Array.from({ length: 5 }, () => ({ kind: "author_update" })) } });
});

it("derives sliding 3/hour and 6/day posting caps even after author deletion", async () => {
  const { t, write, auth } = await setup();
  for (let n = 0; n < 3; n++) { const { incidentId } = await write(); await t.mutation(api.incidents.deleteOwn, { ...auth, incidentId }); }
  await expect(write()).rejects.toThrow(/3 Incidents/);
  vi.setSystemTime(NOW + HOUR + 1);
  for (let n = 0; n < 3; n++) await write();
  vi.setSystemTime(NOW + 2 * HOUR + 2);
  await expect(write()).rejects.toThrow(/6 per day/);
  vi.setSystemTime(NOW + DAY + 10);
  await expect(write()).resolves.toHaveProperty("incidentId");
});

it.each([ ["identifies_me", 1], ["identifies_person", 2], ["false_misleading", 2], ["harassment", 3], ["campus_safety", 3] ] as const)("quarantines %s at %i distinct verified reporters, with no hidden text in detail", async (reason, threshold) => {
  const { t, write, reporters, detail } = await setup();
  const { incidentId } = await write();
  for (let n = 0; n < threshold; n++) {
    const args = { sessionToken: reporters[n]!.sessionToken, incidentId, reason, emergencyPanelAcknowledged: true };
    expect((await t.mutation(api.incidents.report, args)).quarantined).toBe(n + 1 === threshold);
    // Repeating a report cannot add another reporter.
    expect((await t.mutation(api.incidents.report, args)).quarantined).toBe(n + 1 === threshold);
  }
  expect(await detail(incidentId)).toEqual({ state: "under_review" });
  expect(await t.run(({ db }) => db.query("moderationReports").collect())).toHaveLength(threshold);
  expect(await t.query(api.incidents.activeIncidents, { sessionToken: reporters[0]!.sessionToken, campus: "Kennesaw" })).toEqual([]);
});

it("requires the Emergency Panel acknowledgment for Campus Safety", async () => {
  const { t, write, reporters } = await setup(); const { incidentId } = await write();
  await expect(t.mutation(api.incidents.report, { sessionToken: reporters[0]!.sessionToken, incidentId, reason: "campus_safety" })).rejects.toThrow(/Emergency Panel/);
});

it("counts new reports after a long history of closed Moderation Reports", async () => {
  const { t, write, reporters } = await setup(); const { incidentId } = await write();
  await t.run(async ({ db }) => {
    for (let n = 0; n < 205; n++) await db.insert("moderationReports", { workspaceKey: "prod", reporterId: reporters[0]!.studentId,
      targetType: "incident", targetKey: "incident:" + incidentId, reason: "false_misleading", queueStatus: "dismissed", createdAt: NOW - DAY });
  });
  expect((await t.mutation(api.incidents.report, { sessionToken: reporters[0]!.sessionToken, incidentId, reason: "false_misleading" })).quarantined).toBe(false);
  expect((await t.mutation(api.incidents.report, { sessionToken: reporters[1]!.sessionToken, incidentId, reason: "false_misleading" })).quarantined).toBe(true);
});

it("limits identifies-me claims and removes the one-tap hide after three rejected claims", async () => {
  const { t, write, reporters } = await setup();
  const reporter = reporters[0]!;
  await t.run(async ({ db }) => {
    for (let n = 0; n < 3; n++) await db.insert("moderationReports", { workspaceKey: "prod", reporterId: reporter.studentId,
      targetType: "incident", targetKey: "incident:old-" + n, reason: "identifies_me", queueStatus: "dismissed", priority: 0, createdAt: NOW - 2 * DAY });
  });
  const { incidentId } = await write();
  expect((await t.mutation(api.incidents.report, { sessionToken: reporter.sessionToken, incidentId, reason: "identifies_me" })).quarantined).toBe(false);
  expect((await t.mutation(api.incidents.report, { sessionToken: reporters[1]!.sessionToken, incidentId, reason: "identifies_person" })).quarantined).toBe(true);
  await t.run(async ({ db }) => {
    for (let n = 0; n < 2; n++) await db.insert("moderationReports", { workspaceKey: "prod", reporterId: reporter.studentId,
      targetType: "incident", targetKey: "incident:today-" + n, reason: "identifies_me", queueStatus: "open", createdAt: NOW });
  });
  const second = await write();
  await expect(t.mutation(api.incidents.report, { sessionToken: reporter.sessionToken, incidentId: second.incidentId, reason: "identifies_me" })).rejects.toThrow(/3 identifies-me/);
});

it("uses posted time for Active/Older/hidden, keeps Blocked Incidents with name hidden, and strips tombstones", async () => {
  const { t, write, auth, reporters, author, detail } = await setup();
  const { incidentId } = await write({ observedAt: NOW - 20 * HOUR });
  await t.mutation(api.moderation.toggleBlockStudent, { sessionToken: reporters[0]!.sessionToken, targetStudentId: author.studentId });
  expect(await detail(incidentId, reporters[0]!.sessionToken)).toMatchObject({ incident: { state: "Active", authorLabel: "Student · name hidden" } });
  vi.setSystemTime(NOW + DAY + 10);
  expect(await t.query(api.incidents.activeIncidents, { ...auth, campus: "Kennesaw" })).toEqual([]);
  expect((await t.query(api.incidents.olderIncidents, { ...auth, campus: "Kennesaw", paginationOpts: { cursor: null, numItems: 100 } })).page).toHaveLength(1);
  vi.setSystemTime(NOW + 7 * DAY + 10);
  expect(await detail(incidentId)).toEqual({ state: "unavailable" });
});

it("immediately deletes text, location and Updates, retains a tombstone and purges on schedule", async () => {
  const { t, write, auth, detail } = await setup(); const { incidentId } = await write();
  await t.mutation(api.incidents.addUpdate, { ...auth, incidentId, text: "still visible" });
  await t.mutation(api.incidents.deleteOwn, { ...auth, incidentId });
  expect(await detail(incidentId)).toEqual({ state: "deleted" });
  const tombstone = await t.run(({ db }) => db.get(incidentId));
  expect(tombstone).toMatchObject({ text: "", buildingId: "", observedAt: 0 });
  expect(tombstone!.purgeAt - tombstone!.publishedAt).toBe(30 * DAY);
  expect(await t.run(({ db }) => db.query("incidentUpdates").collect())).toEqual([]);
  await t.mutation(internal.housekeeping.executePurgeBatch, { now: tombstone!.purgeAt, deletedFileKeys: [] });
  expect(await t.run(({ db }) => db.get(incidentId))).toBeNull();
});

it("reconciles Redaction notes and removed tombstones without exposing action snapshots or hidden text", async () => {
  const { t, write, detail, author } = await setup(); const { incidentId } = await write();
  await t.run(async ({ db }) => {
    await db.patch(incidentId, { text: "[removed by moderators]" });
    await db.insert("incidentUpdates", { workspaceKey: "prod", incidentId, kind: "moderator_note", templateId: "redaction",
      text: "unapproved free text", authorId: author.studentId, createdAt: NOW, purgeAt: NOW + 30 * DAY });
    await db.insert("moderatorActions", { workspaceKey: "prod", actorId: author.studentId, targetType: "incident", targetKey: incidentId,
      action: "remove", reasonId: "identifies_person", contentSnapshot: "private pre-redaction text", snapshotPurgeAt: NOW + 30 * DAY, createdAt: NOW, purgeAt: NOW + 365 * DAY });
  });
  const redacted = await detail(incidentId);
  expect(redacted).toMatchObject({ incident: { text: "[removed by moderators]", updates: [{ text: "Identifying details removed" }] } });
  expect(JSON.stringify(redacted)).not.toMatch(/unapproved free text|private pre-redaction text/);
  await t.run(({ db }) => db.patch(incidentId, { visibility: "removed", purgeAt: NOW + 31 * DAY }));
  expect(await detail(incidentId)).toEqual({ state: "removed", reason: "Identifies or targets a person" });
});

it("orders the bounded Active projection and Older pages by last activity, without renewing an old Incident", async () => {
  const { t, write, auth } = await setup(); const { incidentId } = await write();
  const oldActive = await t.run(async ({ db }) => {
    const { _id: _id, _creationTime: _creationTime, ...row } = (await db.get(incidentId))!;
    const id = await db.insert("incidents", { ...row, publishedAt: NOW - 23 * HOUR, lastActivityAt: NOW + 50 });
    for (let n = 0; n < 55; n++) await db.insert("incidents", { ...row, publishedAt: NOW - n * 1000, lastActivityAt: NOW - n * 1000 });
    for (let n = 0; n < 25; n++) await db.insert("incidents", { ...row, publishedAt: NOW - 2 * DAY - n * 1000, lastActivityAt: NOW - DAY - (25 - n) * 1000 });
    return id;
  });
  const active = await t.query(api.incidents.activeIncidents, { ...auth, campus: "Kennesaw" });
  expect(active).toHaveLength(50); expect(active[0]!._id).toBe(oldActive);
  const first = await t.query(api.incidents.olderIncidents, { ...auth, campus: "Kennesaw", paginationOpts: { cursor: null, numItems: 20 } });
  const second = await t.query(api.incidents.olderIncidents, { ...auth, campus: "Kennesaw", paginationOpts: { cursor: first.continueCursor, numItems: 20 } });
  const ordered = [...first.page, ...second.page];
  expect(ordered).toHaveLength(25);
  expect(ordered.every((r) => r.state === "Older")).toBe(true);
  expect(ordered.map((r) => r.lastActivityAt)).toEqual(ordered.map((r) => r.lastActivityAt).sort((a, b) => b - a));
});

it("isolates Demo writes, reads, updates and reports across sessions and production", async () => {
  const { t, auth, detail } = await setup();
  await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
  const a = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const b = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const demoAuth = { demoShortCode: a.shortCode, demoPersonaHandle: "maya_cs" };
  vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "false");
  const { incidentId } = await t.mutation(api.incidents.create, { ...demoAuth, category: "hazard", campus: "Kennesaw",
    buildingId: INCIDENT_PLACES[0]!.id, observedAt: NOW, text: "temporary water spill", nameLevel: "hidden" });
  expect(await detail(incidentId)).toEqual({ state: "unavailable" });
  expect(await t.query(api.incidents.incidentDetail, { demoShortCode: b.shortCode, incidentId })).toEqual({ state: "unavailable" });
  await expect(t.mutation(api.incidents.addUpdate, { ...auth, incidentId, text: "new" })).rejects.toThrow();
  await expect(t.mutation(api.incidents.report, { demoShortCode: b.shortCode, incidentId, reason: "identifies_me" })).rejects.toThrow();
});
