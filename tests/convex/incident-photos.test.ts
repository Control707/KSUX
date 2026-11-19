import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";
import { TEST_SERVER_SECRET } from "../helpers/authTest";
import { DAY, INCIDENT_PLACES } from "../../convex/lib/incidentPolicy";
import type { Id } from "../../convex/_generated/dataModel";

const NOW = Date.parse("2026-11-19T15:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  vi.stubEnv("KSUX_SERVER_SECRET", TEST_SERVER_SECRET);
  vi.stubEnv("KSUX_V2_MODERATOR_OPS_COMPLETE", "true"); vi.stubEnv("KSUX_V2_INCIDENT_POSTING", "true");
  vi.stubEnv("KSUX_V2_INCIDENT_PHOTOS", "true");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup() {
  const t = createTestConvex();
  const author = await createVerifiedTestStudent(t, { handle: "photo_author", displayName: "Author" });
  const reviewers = await Promise.all([0, 1].map((n) => createVerifiedTestStudent(t, { handle: "photo_mod" + n, displayName: "Reviewer" })));
  await t.run(async ({ db }) => { for (const student of reviewers) await db.insert("moderators", {
    workspaceKey: "prod", studentId: student.studentId, appointedById: author.studentId,
    csaStatement: "I am not a campus security authority", isCsa: false, appointedAt: NOW - 1,
  }); });
  const auth = { sessionToken: author.sessionToken };
  const mod = { sessionToken: reviewers[0]!.sessionToken };
  async function upload(blurred = false) {
    const reservationId = await t.mutation(api.uploads.reserveUpload, { ...auth, purpose: "incident", byteSize: 10,
      width: 30, height: 20, blurred, serverSecret: TEST_SERVER_SECRET });
    return t.mutation(api.uploads.registerMediaAsset, { ...auth, reservationId, fileKey: "private-photo-" + Math.random(), url: "", serverSecret: TEST_SERVER_SECRET });
  }
  const create = (photoAssetId?: Id<"mediaAssets">) => t.mutation(api.incidents.create, { ...auth, category: "hazard",
    campus: "Kennesaw", buildingId: INCIDENT_PLACES.find((p) => p.campus === "Kennesaw")!.id, observedAt: Date.now(),
    text: "water near the entrance", nameLevel: "hidden", photoAssetId });
  const access = (incidentId: Id<"incidents">, review = false, sessionToken = author.sessionToken) => t.query(api.incidents.photoAccess,
    { sessionToken, incidentId, review, serverSecret: TEST_SERVER_SECRET });
  const act = (incidentId: string, action: "photo_approve" | "photo_approve_blur" | "photo_reject", requestId = "decision") =>
    t.mutation(api.moderatorConsole.act, { ...mod, targetType: "incident", targetId: incidentId, action, requestId });
  return { t, author, reviewers, auth, mod, upload, create, access, act };
}

it("holds a privately registered photo for exactly 48h and never returns held bytes to Students, including its author", async () => {
  const { t, auth, mod, upload, create, access } = await setup();
  const photo = await upload(); const { incidentId } = await create(photo);
  const asset = await t.run(({ db }) => db.get(photo));
  expect(asset).toMatchObject({ status: "attached", reviewStatus: "held", url: "" });
  expect(asset!.holdExpiresAt! - asset!.createdAt).toBe(2 * DAY);
  const detail = await t.query(api.incidents.incidentDetail, { ...auth, incidentId });
  expect(detail).toMatchObject({ state: "visible", incident: { photo: null } });
  expect(JSON.stringify(detail)).not.toContain(asset!.fileKey);
  expect(await access(incidentId)).toBeNull();
  await expect(access(incidentId, true)).rejects.toThrow(/Moderator/);
  const review = await t.query(api.moderatorConsole.review, { ...mod, targetType: "incident", targetId: incidentId, showPhoto: true });
  expect(review?.photo?.url).toBeUndefined();
  expect((await access(incidentId, true, mod.sessionToken))?.fileKey).toBe(asset!.fileKey);
  await expect(t.query(api.incidents.photoAccess, { ...mod, incidentId, review: true, serverSecret: "forged" })).rejects.toThrow();
  expect((await t.query(api.moderatorConsole.queue, mod)).items[0]?.priority).toBe(1);
});

for (const action of ["photo_approve", "photo_approve_blur"] as const) it(`${action} logs once, privately notifies the author, and shows only approved photo metadata`, async () => {
  const { t, auth, upload, create, access, act, mod } = await setup();
  const photo = await upload(); const { incidentId } = await create(photo);
  const first = await act(incidentId, action); expect(await act(incidentId, action)).toEqual(first);
  expect(await t.query(api.incidents.incidentDetail, { ...auth, incidentId })).toMatchObject({ incident: { photo: { blurred: action === "photo_approve_blur" } } });
  expect(await access(incidentId)).toMatchObject({ blurred: action === "photo_approve_blur" });
  expect(await access(incidentId, true, mod.sessionToken)).toBeNull();
  expect((await t.query(api.moderatorConsole.queue, mod)).items).toEqual([]);
  expect(await t.query(api.moderatorConsole.myNotices, auth)).toMatchObject([{ canAppeal: false }]);
  const log = await t.query(api.moderatorConsole.actionLog, mod);
  expect(log.map((r) => r.action)).toEqual([action]); expect(log[0]?.snapshotUntil).toBeUndefined();
  await expect(act(incidentId, "photo_reject", "other-reviewer-attempt")).rejects.toThrow(/already been reviewed/);
});

it("preserves author-requested blur even on plain Approve, and hides approved bytes when an Incident is removed, quarantined, aged out or deleted", async () => {
  const { t, auth, upload, create, access, act } = await setup();
  const photo = await upload(true); const { incidentId } = await create(photo); await act(incidentId, "photo_approve");
  expect(await access(incidentId)).toMatchObject({ blurred: true });
  for (const visibility of ["under_review", "removed"] as const) {
    await t.run(({ db }) => db.patch(incidentId, { visibility })); expect(await access(incidentId)).toBeNull();
  }
  await t.run(({ db }) => db.patch(incidentId, { visibility: "visible" }));
  const row = (await t.run(({ db }) => db.get(incidentId)))!;
  vi.setSystemTime(row.publishedAt + 7 * DAY + 1); expect(await access(incidentId)).toBeNull(); vi.setSystemTime(NOW);
  await t.mutation(api.incidents.deleteOwn, { ...auth, incidentId });
  expect(await access(incidentId)).toBeNull(); expect((await t.run(({ db }) => db.get(photo)))?.status).toBe("deleted");
});

it("Reject detaches/deletes the photo, adds Photo not approved and preserves text and independent reports", async () => {
  const { t, auth, upload, create, act, reviewers, mod, access } = await setup();
  const photo = await upload(); const { incidentId } = await create(photo);
  await t.mutation(api.incidents.report, { sessionToken: reviewers[1]!.sessionToken, incidentId, reason: "false_misleading" });
  await act(incidentId, "photo_reject");
  expect(await access(incidentId)).toBeNull();
  expect(await t.query(api.incidents.incidentDetail, { ...auth, incidentId })).toMatchObject({ incident: { text: "water near the entrance", photo: null, updates: [{ text: "Photo not approved" }] } });
  expect(await t.run(({ db }) => db.get(photo))).toMatchObject({ status: "deleted", url: "", reviewStatus: "rejected" });
  expect((await t.query(api.moderatorConsole.queue, mod)).items[0]?.priority).toBe(2);
});

it("approval preserves identifies-me quarantine and keeps its independent Moderation Report in the highest priority band", async () => {
  const { t, auth, upload, create, act, reviewers, mod, access } = await setup();
  const { incidentId } = await create(await upload());
  await t.mutation(api.incidents.report, { sessionToken: reviewers[1]!.sessionToken, incidentId, reason: "identifies_me" });
  await act(incidentId, "photo_approve_blur");
  expect(await access(incidentId)).toBeNull();
  expect(await t.query(api.incidents.incidentDetail, { ...auth, incidentId })).toEqual({ state: "under_review" });
  expect((await t.query(api.moderatorConsole.queue, mod)).items[0]?.priority).toBe(0);
});

it("denies conflicting authors/reporters, CSA reviewers and another workspace on both image access and photo decisions", async () => {
  const { t, author, reviewers, upload, create, mod, access } = await setup();
  const { incidentId } = await create(await upload());
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", author.canonicalEmail);
  await expect(access(incidentId, true)).rejects.toThrow(/involves you/);
  await t.mutation(api.incidents.report, { ...mod, incidentId, reason: "identifies_person" });
  await expect(access(incidentId, true, mod.sessionToken)).rejects.toThrow(/involves you/);
  await t.run(async ({ db }) => { const appointment = await db.query("moderators").withIndex("by_student", (q) => q.eq("workspaceKey", "prod").eq("studentId", reviewers[1]!.studentId)).unique(); await db.patch(appointment!._id, { isCsa: true }); });
  for (const sessionToken of [author.sessionToken, mod.sessionToken, reviewers[1]!.sessionToken]) {
    await expect(t.mutation(api.moderatorConsole.act, { sessionToken, targetType: "incident", targetId: incidentId, action: "photo_approve", requestId: sessionToken })).rejects.toThrow();
  }
  await expect(access(incidentId, true, reviewers[1]!.sessionToken)).rejects.toThrow(/CSA/);
  await t.mutation(internal.seed.bootstrapKsu, {});
  const session = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  expect(await t.query(api.incidents.photoAccess, { demoShortCode: session.shortCode, demoPersonaHandle: "alex_owl", incidentId, review: true, serverSecret: TEST_SERVER_SECRET })).toBeNull();
});

it("rejects attachment reuse, foreign ownership, wrong-purpose, cleanup-claimed media and the production launch switch", async () => {
  const { t, author, upload, create, reviewers } = await setup();
  const photo = await upload(); await create(photo); await expect(create(photo)).rejects.toThrow(/unavailable/);
  const invalid = await upload();
  for (const patch of [{ ownerStudentId: reviewers[0]!.studentId }, { purpose: "post" as const }, { deleteClaimedAt: NOW }, { workspaceKey: "elsewhere" }]) {
    await t.run(({ db }) => db.patch(invalid, { ownerStudentId: author.studentId, purpose: "incident", deleteClaimedAt: undefined, workspaceKey: "prod", ...patch }));
    await expect(create(invalid)).rejects.toThrow(/unavailable/);
  }
  vi.stubEnv("KSUX_V2_INCIDENT_PHOTOS", "false"); await expect(upload()).rejects.toThrow(/unavailable/);
});

it("blocks review exactly at 48h before hourly cleanup, then discards/notifies once even when remote deletion needs a retry", async () => {
  const { t, auth, mod, upload, create, access, act } = await setup();
  const photo = await upload(); const { incidentId } = await create(photo);
  const expiry = (await t.run(({ db }) => db.get(photo)))!.holdExpiresAt!;
  vi.setSystemTime(expiry - 1); expect(await access(incidentId, true, mod.sessionToken)).toBeTruthy();
  vi.setSystemTime(expiry); expect(await access(incidentId, true, mod.sessionToken)).toBeNull();
  await expect(act(incidentId, "photo_approve")).rejects.toThrow(/expired/);
  vi.stubEnv("UPLOADTHING_TOKEN", "");
  await t.action(internal.housekeeping.runHourlyPurge, {}); await t.action(internal.housekeeping.runHourlyPurge, {});
  expect(await t.run(({ db }) => db.get(photo))).toMatchObject({ status: "deleted", reviewStatus: "rejected", url: "" });
  expect((await t.run(({ db }) => db.get(incidentId)))?.photoAssetId).toBeUndefined();
  const notices = await t.query(api.moderatorConsole.myNotices, auth);
  expect(notices).toHaveLength(1); expect(notices[0]).toMatchObject({ canAppeal: false, message: expect.stringContaining("nobody reviewed it within 48 hours") });
  expect((await t.query(api.moderatorConsole.actionLog, mod))[0]).toMatchObject({ action: "photo_discard", moderator: "Automatic discard" });
});

it("Demo creates static fixtures, refuses real uploads, and uses the same idempotent discard path without advancing production time", async () => {
  const { t, auth, create, upload } = await setup();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const session = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const demo = { demoShortCode: session.shortCode, demoPersonaHandle: "maya_cs" };
  await expect(t.mutation(api.uploads.reserveUpload, { ...demo, purpose: "incident", byteSize: 1, width: 1, height: 1, serverSecret: TEST_SERVER_SECRET })).rejects.toThrow(/static fixture/);
  const { incidentId } = await t.mutation(api.incidents.create, { ...demo, category: "hazard", campus: "Marietta", buildingId: "bldg-osm-225446898", observedAt: NOW, text: "temporary obstruction", nameLevel: "hidden", demoPhoto: true, blurPhoto: true });
  await t.mutation(api.incidents.discardDemoPhoto, { ...demo, incidentId }); await t.mutation(api.incidents.discardDemoPhoto, { ...demo, incidentId });
  expect((await t.query(api.moderatorConsole.myNotices, demo)).filter((n) => n.targetKey === incidentId)).toHaveLength(1);
  const prod = await create(await upload()); await expect(t.mutation(api.incidents.discardDemoPhoto, { ...auth, incidentId: prod.incidentId })).rejects.toThrow(/Only available/);
});

it("automatic photo discard cannot block reversal of an earlier Incident removal on Appeal", async () => {
  const { t, auth, mod, reviewers, upload, create } = await setup();
  const photo = await upload(); const { incidentId } = await create(photo);
  const { actionId } = await t.mutation(api.moderatorConsole.act, { ...mod, targetType: "incident", targetId: incidentId,
    action: "remove", reasonId: "identifies_person", requestId: "remove-incident" });
  const appealId = await t.mutation(api.moderatorConsole.submitAppeal, { ...auth, decisionActionId: actionId, text: "Please review the Incident text again." });
  const expiry = (await t.run(({ db }) => db.get(photo)))!.holdExpiresAt!;
  vi.setSystemTime(expiry); vi.stubEnv("UPLOADTHING_TOKEN", "");
  await t.action(internal.housekeeping.runHourlyPurge, {});
  await t.mutation(api.moderatorConsole.decideAppeal, { sessionToken: reviewers[1]!.sessionToken, appealId, reverse: true });
  expect(await t.query(api.incidents.incidentDetail, { ...auth, incidentId })).toMatchObject({ state: "visible", incident: { photo: null } });
});
