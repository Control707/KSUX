import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const day = 86_400_000;
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function seedPrivateArtifacts(t: ReturnType<typeof createTestConvex>, studentId: Awaited<ReturnType<typeof createVerifiedTestStudent>>["studentId"], now: number) {
  return t.run(async ({ db }) => {
    const photo = await db.insert("mediaAssets", {
      workspaceKey: "prod", ownerStudentId: studentId, fileKey: "local-inline:incident", url: "/photo.svg",
      purpose: "incident", byteSize: 1, width: 1, height: 1, status: "attached", reviewStatus: "held",
      holdExpiresAt: now, createdAt: now - 2 * day,
    });
    const incident = await db.insert("incidents", {
      workspaceKey: "prod", authorId: studentId, category: "hazard", campus: "Kennesaw", buildingId: "library",
      areaDetail: "private detail", text: "private text", observedAt: now, nameLevel: "show_handle", photoAssetId: photo,
      visibility: "visible", publishedAt: now, lockedAt: now + 300_000, lastActivityAt: now, updateCount: 1, purgeAt: now + 30 * day,
    });
    const update = await db.insert("incidentUpdates", { workspaceKey: "prod", incidentId: incident, authorId: studentId,
      kind: "author_update", text: "private update", createdAt: now, purgeAt: now + 30 * day });
    const note = await db.insert("incidentUpdates", { workspaceKey: "prod", incidentId: incident, authorId: studentId,
      kind: "moderator_note", templateId: "redaction", createdAt: now, purgeAt: now + 30 * day });
    const earn = await db.insert("cloutEvents", { workspaceKey: "prod", studentId, kind: "earn", amount: 5,
      sourceType: "parking_report", sourceKey: "report", targetKey: "lot", campus: "Kennesaw", weekKey: "2026-11-16",
      dayKeyET: "2026-11-18", createdAt: now, purgeAt: now + 30 * day });
    const total = await db.insert("cloutWeeklyTotals", { workspaceKey: "prod", studentId, campus: "Kennesaw", weekKey: "2026-11-16",
      countedTotal: 5, heldTotal: 0, hidden: false, purgeAt: now + 84 * day });
    const existingBoard = await db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
      q.eq("workspaceKey", "prod").eq("campus", "Kennesaw").eq("weekKey", "2026-11-16")).unique();
    const board = existingBoard ? existingBoard._id : await db.insert("cloutBoardCounts", { workspaceKey: "prod", campus: "Kennesaw", weekKey: "2026-11-16", visibleCount: 0, purgeAt: now + 84 * day });
    await db.patch(board, { visibleCount: (existingBoard?.visibleCount ?? 0) + 1 });
    await db.patch(studentId, { lifetimeClout: 5 });
    return { photo, incident, update, note, earn, total, board };
  });
}

it("discards expired held Incident photos without deleting approved or future-held media", async () => {
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "held_photo", displayName: "Held photo" });
  const now = Date.now();
  const ids = await seedPrivateArtifacts(t, student.studentId, now);
  await t.run(async ({ db }) => {
    const photo = (await db.get(ids.photo))!;
    const { _id: _id, _creationTime: _creationTime, ...fields } = photo;
    await db.insert("mediaAssets", { ...fields, fileKey: "local-inline:approved", reviewStatus: "approved" });
    await db.insert("mediaAssets", { ...fields, fileKey: "local-inline:future", holdExpiresAt: now + 1 });
  });
  await t.action(internal.housekeeping.runHourlyPurge, { now });
  expect(await t.run(({ db }) => db.get(ids.photo))).toBeNull();
  expect((await t.run(({ db }) => db.get(ids.incident)))?.photoAssetId).toBeUndefined();
  expect((await t.run(({ db }) => db.query("mediaAssets").collect())).map((row) => row.fileKey).sort())
    .toEqual(["local-inline:approved", "local-inline:future"]);
});

it("self-delete scrubs Incident text, Updates and Clout while retaining anonymous Moderator notes", async () => {
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "delete_v2", displayName: "Delete v2" });
  const ids = await seedPrivateArtifacts(t, student.studentId, Date.now());
  await t.mutation(api.students.deleteMyProfile, { sessionToken: student.sessionToken });
  expect(await t.run(({ db }) => db.get(ids.incident))).toMatchObject({ visibility: "deleted", text: "", nameLevel: "hidden" });
  const incident = await t.run(({ db }) => db.get(ids.incident));
  expect(incident?.photoAssetId).toBeUndefined();
  expect(incident?.areaDetail).toBeUndefined();
  expect(await t.run(({ db }) => db.get(ids.update))).toBeNull();
  expect((await t.run(({ db }) => db.get(ids.note)))?.authorId).toBeUndefined();
  expect(await t.run(({ db }) => db.get(ids.earn))).toBeNull();
  expect(await t.run(({ db }) => db.get(ids.total))).toBeNull();
  expect((await t.run(({ db }) => db.get(ids.board)))?.visibleCount).toBe(0);
  expect((await t.run(({ db }) => db.get(student.studentId)))?.lifetimeClout).toBeUndefined();
});

it("suspension removes Incidents and reverses Clout without erasing the ledger", async () => {
  const t = createTestConvex();
  const maintainer = await createVerifiedTestStudent(t, { handle: "v2_owner", displayName: "Owner" });
  vi.stubEnv("OWLSIDE_MAINTAINER_EMAILS", maintainer.canonicalEmail);
  const student = await createVerifiedTestStudent(t, { handle: "suspend_v2", displayName: "Suspend v2" });
  const ids = await seedPrivateArtifacts(t, student.studentId, Date.now());
  await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer.sessionToken,
    targetType: "student", targetId: student.studentId, decision: "suspend_student" });
  expect((await t.run(({ db }) => db.get(ids.incident)))?.visibility).toBe("removed");
  expect(await t.run(({ db }) => db.get(ids.earn))).not.toBeNull();
  const ledger = await t.run(({ db }) => db.query("cloutEvents").collect());
  expect(ledger.filter((row) => row.kind === "reverse")).toHaveLength(1);
  expect(await t.run(({ db }) => db.get(ids.total))).toBeNull();
  expect((await t.run(({ db }) => db.get(ids.board)))?.visibleCount).toBe(0);
  expect((await t.run(({ db }) => db.get(student.studentId)))?.lifetimeClout).toBe(0);
});

it("continues privacy cleanup past a batch and reverses each payout once without touching a partner", async () => {
  vi.useFakeTimers();
  const t = createTestConvex();
  const maintainer = await createVerifiedTestStudent(t, { handle: "batch_owner", displayName: "Owner" });
  const student = await createVerifiedTestStudent(t, { handle: "batch_student", displayName: "Batch" });
  const partner = await createVerifiedTestStudent(t, { handle: "batch_partner", displayName: "Partner" });
  vi.stubEnv("OWLSIDE_MAINTAINER_EMAILS", maintainer.canonicalEmail);
  const ids = await seedPrivateArtifacts(t, student.studentId, Date.now());
  const partnerIds = await seedPrivateArtifacts(t, partner.studentId, Date.now());
  await t.run(async ({ db }) => {
    const earn = (await db.get(ids.earn))!;
    const { _id: _id, _creationTime: _creationTime, ...fields } = earn;
    for (let i = 0; i < 54; i++) await db.insert("cloutEvents", { ...fields, sourceKey: "report-" + i });
  });
  await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: maintainer.sessionToken,
    targetType: "student", targetId: student.studentId, decision: "suspend_student" });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const ledger = await t.run(({ db }) => db.query("cloutEvents").withIndex("by_student_day", (q) =>
    q.eq("workspaceKey", "prod").eq("studentId", student.studentId)).collect());
  expect(ledger.filter((row) => row.kind === "earn")).toHaveLength(55);
  expect(ledger.filter((row) => row.kind === "reverse")).toHaveLength(55);
  await t.mutation(internal.students.continueV2StudentCleanup, { workspaceKey: "prod", studentId: student.studentId,
    cloutCursor: null, cloutDone: false });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await t.run(({ db }) => db.query("cloutEvents").withIndex("by_student_day", (q) =>
    q.eq("workspaceKey", "prod").eq("studentId", student.studentId)).collect())).filter((row) => row.kind === "reverse")).toHaveLength(55);
  expect((await t.run(({ db }) => db.get(partnerIds.total)))?.countedTotal).toBe(5);
  expect((await t.run(({ db }) => db.get(partner.studentId)))?.lifetimeClout).toBe(5);
});

it("finishes self-delete beyond one batch and revokes the Moderator appointment", async () => {
  vi.useFakeTimers();
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "bulk_delete", displayName: "Bulk" });
  const ids = await seedPrivateArtifacts(t, student.studentId, Date.now());
  const roster = await t.run(async ({ db }) => {
    const incident = (await db.get(ids.incident))!;
    const update = (await db.get(ids.update))!;
    const earn = (await db.get(ids.earn))!;
    const { _id: _i, _creationTime: _it, ...incidentFields } = incident;
    const { _id: _u, _creationTime: _ut, ...updateFields } = update;
    const { _id: _e, _creationTime: _et, ...earnFields } = earn;
    for (let i = 0; i < 54; i++) {
      const incidentId = await db.insert("incidents", { ...incidentFields, photoAssetId: undefined });
      await db.insert("incidentUpdates", { ...updateFields, incidentId });
      await db.insert("cloutEvents", { ...earnFields, sourceKey: "delete-" + i });
    }
    return db.insert("moderators", { workspaceKey: "prod", studentId: student.studentId,
      appointedById: student.studentId, csaStatement: "Not a CSA", isCsa: false, appointedAt: Date.now() });
  });
  await t.mutation(api.students.deleteMyProfile, { sessionToken: student.sessionToken });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const incidents = await t.run(({ db }) => db.query("incidents").collect());
  expect(incidents).toHaveLength(55);
  expect(incidents.every((row) => row.visibility === "deleted" && row.text === "")).toBe(true);
  expect(await t.run(({ db }) => db.query("cloutEvents").collect())).toEqual([]);
  const updates = await t.run(({ db }) => db.query("incidentUpdates").collect());
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({ kind: "moderator_note" });
  expect((await t.run(({ db }) => db.get(roster)))?.revokedAt).toBeDefined();
});

it("removes an expired Incident's approved media through durable storage cleanup", async () => {
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "expired_photo", displayName: "Expired" });
  const now = Date.now();
  const ids = await seedPrivateArtifacts(t, student.studentId, now);
  await t.run(async ({ db }) => {
    await db.patch(ids.incident, { purgeAt: now });
    await db.patch(ids.photo, { reviewStatus: "approved" });
  });
  await t.action(internal.housekeeping.runHourlyPurge, { now });
  expect(await t.run(({ db }) => db.get(ids.incident))).toBeNull();
  // Deletion is queued in the DB pass and acknowledged on the next media pass.
  await t.action(internal.housekeeping.runHourlyPurge, { now });
  expect(await t.run(({ db }) => db.get(ids.photo))).toBeNull();
});

it.each(["faculty", "future", "expired"] as const)("does not grant appointed Moderator access to %s appointments", async (kind) => {
  const t = createTestConvex();
  {
    const student = await createVerifiedTestStudent(t, { handle: "role_" + kind, displayName: kind,
      ...(kind === "faculty" ? { email: "faculty@kennesaw.edu", emailDomainBadge: "faculty_staff" as const } : {}) });
    const now = Date.now();
    await t.run(({ db }) => db.insert("moderators", { workspaceKey: "prod", studentId: student.studentId,
      appointedById: student.studentId, csaStatement: "Not a CSA", isCsa: false,
      appointedAt: kind === "future" ? now + day : now - day, purgeAt: kind === "expired" ? now - 1 : undefined }));
    expect((await t.query(api.shell.shellSummary, { sessionToken: student.sessionToken })).viewer.isModerator).toBe(false);
  }
});
