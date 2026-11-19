import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";
import { DAY } from "../../convex/lib/incidentPolicy";
import { TEST_SERVER_SECRET, requestTestOtp, verifyTestOtp } from "../helpers/authTest";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function demo() {
  const t = createTestConvex();
  await t.mutation(internal.seed.bootstrapKsu, {});
  const session = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const auth = { demoShortCode: session.shortCode, demoPersonaHandle: "alex_owl" };
  const queue = await t.query(api.moderatorConsole.queue, auth);
  return { t, auth, queue, workspaceKey: `demo:${session.demoSessionId}` };
}

it("orders identifies-me, held photos, other Incidents and Posts oldest first, and explains own-item exclusions", async () => {
  const { t, auth, queue } = await demo();
  expect(queue.items.map((i) => i.priority)).toEqual([0, 1, 2, 3]);
  expect(queue.items.map((i) => i.waitingSince).every(Number.isFinite)).toBe(true);
  const maya = await t.query(api.moderatorConsole.queue, { ...auth, demoPersonaHandle: "maya_cs" });
  expect(maya.items).toEqual([]);
  expect(maya.conflicts).toBe(4);
  const item = queue.items[0]!;
  for (const handle of ["maya_cs", "jordan_me"]) {
    expect(await t.query(api.moderatorConsole.review, { ...auth, demoPersonaHandle: handle, targetType: item.targetType, targetId: item.targetId })).toBeNull();
    await expect(t.mutation(api.moderatorConsole.act, { ...auth, demoPersonaHandle: handle, targetType: item.targetType, targetId: item.targetId, action: "restore", requestId: handle })).rejects.toThrow(/involves you/);
  }
  const photoItem = queue.items[1]!;
  const photo = (await t.query(api.moderatorConsole.review, { ...auth, targetType: photoItem.targetType, targetId: photoItem.targetId }))!;
  expect(photo.photo).toBeTruthy(); expect(photo.photo?.url).toBeUndefined();
  expect((await t.query(api.moderatorConsole.review, { ...auth, targetType: photoItem.targetType, targetId: photoItem.targetId, showPhoto: true }))?.photo?.url).toBeTruthy();
});

it("preserves oldest-first priority with closed history and newly submitted reports", async () => {
  const { t, auth, queue, workspaceKey } = await demo();
  const item = queue.items[0]!;
  await t.run(async ({ db }) => {
    const old = (await db.query("moderationReports").withIndex("by_target", (q) => q.eq("workspaceKey", workspaceKey).eq("targetKey", item.key)).first())!;
    for (let i = 0; i < 210; i++) { const { _id: _id, _creationTime: _time, ...row } = old; await db.insert("moderationReports", { ...row, queueStatus: "dismissed", createdAt: Date.now() - i }); }
  });
  expect((await t.query(api.moderatorConsole.queue, auth)).items[0]?.key).toBe(item.key);
});

it("Redaction requires exact words, logs once on retries, restores and notifies claimants, and does not expose snapshots in the log", async () => {
  const { t, auth, queue } = await demo();
  const item = queue.items[0]!;
  const args = { ...auth, targetType: item.targetType, targetId: item.targetId, action: "redact", requestId: "redact-once" };
  await expect(t.mutation(api.moderatorConsole.act, { ...args, words: "absent" })).rejects.toThrow(/exact words/);
  const original = (await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId }))!;
  const first = await t.mutation(api.moderatorConsole.act, { ...args, words: "identifying detail" });
  expect(await t.mutation(api.moderatorConsole.act, { ...args, words: "identifying detail" })).toEqual(first);
  const after = (await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId }))!;
  expect(after.text).toBe(original.text.replace("identifying detail", "[removed by moderators]"));
  expect(after.status).toBe("visible"); expect(after.updates.at(-1)?.text).toBe("Identifying details removed");
  const log = await t.query(api.moderatorConsole.actionLog, auth);
  expect(log.filter((r) => r.action === "redact")).toHaveLength(1);
  expect(JSON.stringify(log)).not.toContain(original.text);
  const decision = await t.run(({ db }) => db.get(first.actionId));
  expect(decision?.contentSnapshot).toContain(original.text);
  expect(decision!.snapshotPurgeAt! - decision!.createdAt).toBe(30 * DAY);
  expect(decision!.purgeAt - decision!.createdAt).toBe(365 * DAY);
  const claimant = await t.query(api.moderatorConsole.myNotices, { ...auth, demoPersonaHandle: "maya_cs" });
  expect(claimant.some((r) => /claimed identifies you was restored/.test(r.message))).toBe(true);
  const appealId = await t.mutation(api.moderatorConsole.submitAppeal, { ...auth, demoPersonaHandle: "jordan_me", decisionActionId: first.actionId, text: "Please reconsider the Redaction." });
  await t.mutation(api.moderatorConsole.decideAppeal, { ...auth, demoPersonaHandle: "sam_cpe", appealId, reverse: true });
  const reversed = await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId });
  expect(reversed?.text).toBe(original.text);
  expect(reversed?.updates.some((u) => u.text === "Identifying details removed")).toBe(false);
});

it("template notes stay in queue and validate listed Alerts and visible duplicate Incidents within the workspace", async () => {
  const { t, auth, queue } = await demo(); const item = queue.items[2]!;
  const args = { ...auth, targetType: item.targetType, targetId: item.targetId, action: "note", requestId: "note" };
  await expect(t.mutation(api.moderatorConsole.act, { ...args, templateId: "free text" })).rejects.toThrow(/fixed note/);
  await expect(t.mutation(api.moderatorConsole.act, { ...args, templateId: "official_notice" })).rejects.toThrow(/listed Official/);
  const links = await t.query(api.moderatorConsole.noteLinks, auth);
  const second = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  const foreign = await t.query(api.moderatorConsole.noteLinks, { demoShortCode: second.shortCode, demoPersonaHandle: "alex_owl" });
  await expect(t.mutation(api.moderatorConsole.act, { ...args, templateId: "official_notice", alertId: foreign.alerts[0]!.id })).rejects.toThrow(/listed Official/);
  await expect(t.mutation(api.moderatorConsole.act, { ...args, templateId: "duplicate", duplicateIncidentId: item.targetId })).rejects.toThrow(/another visible/);
  await t.mutation(api.moderatorConsole.act, { ...args, templateId: "official_notice", alertId: links.alerts[0]!.id });
  expect((await t.query(api.moderatorConsole.queue, auth)).items.some((i) => i.key === item.key)).toBe(true);
  expect((await t.query(api.moderatorConsole.actionLog, auth)).filter((r) => r.action === "note")).toHaveLength(1);
  const sourceId = await t.run(async ({ db }) => (await db.get(links.alerts[0]!.id))!.sourceId);
  await t.run(({ db }) => db.patch(sourceId, { killSwitch: "manual" }));
  expect((await t.query(api.moderatorConsole.noteLinks, auth)).alerts.some((a) => a.id === links.alerts[0]!.id)).toBe(false);
  await expect(t.mutation(api.moderatorConsole.act, { ...args, requestId: "killed-source", templateId: "official_notice", alertId: links.alerts[0]!.id })).rejects.toThrow(/listed Official/);
});

it("restoring false/misleading reports adds the inaccurate note only with an explicit choice", async () => {
  for (const addInaccurateNote of [false, true]) {
    const { t, auth, queue } = await demo(); const item = queue.items[2]!;
    await t.run(async ({ db }) => { const id = db.normalizeId("incidents", item.targetId)!; await db.patch(id, { visibility: "under_review" }); });
    const before = (await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId }))!;
    await t.mutation(api.moderatorConsole.act, { ...auth, targetType: item.targetType, targetId: item.targetId, action: "restore", requestId: "restore", addInaccurateNote });
    const after = (await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId }))!;
    expect(after.updates.length - before.updates.length).toBe(addInaccurateNote ? 1 : 0);
    expect(after.status).toBe("visible");
  }
});

it("removal requires a fixed reason, creates a private notice and one Appeal, and only a different uninvolved Moderator can answer", async () => {
  const { t, auth, queue } = await demo(); const item = queue.items[0]!;
  const args = { ...auth, targetType: item.targetType, targetId: item.targetId, action: "remove", requestId: "remove" };
  await expect(t.mutation(api.moderatorConsole.act, args)).rejects.toThrow(/reason/);
  const { actionId } = await t.mutation(api.moderatorConsole.act, { ...args, reasonId: "identifies_person" });
  const author = { ...auth, demoPersonaHandle: "jordan_me" };
  const notices = await t.query(api.moderatorConsole.myNotices, author);
  expect(notices.find((n) => n.actionId === actionId)).toMatchObject({ canAppeal: true, message: "Removed: Identifies or targets a person" });
  await expect(t.mutation(api.moderatorConsole.submitAppeal, { ...auth, decisionActionId: actionId, text: "test" })).rejects.toThrow(/not available/);
  const appealId = await t.mutation(api.moderatorConsole.submitAppeal, { ...author, decisionActionId: actionId, text: "Please review this decision." });
  await expect(t.mutation(api.moderatorConsole.submitAppeal, { ...author, decisionActionId: actionId, text: "again" })).rejects.toThrow(/one Appeal/);
  for (const handle of ["alex_owl", "jordan_me", "maya_cs"]) {
    const who = { ...auth, demoPersonaHandle: handle };
    expect((await t.query(api.moderatorConsole.appeals, who)).items.some((a) => a.id === appealId)).toBe(false);
    await expect(t.query(api.moderatorConsole.appealSnapshot, { ...who, appealId })).rejects.toThrow(/different Moderator/);
    await expect(t.mutation(api.moderatorConsole.decideAppeal, { ...who, appealId, reverse: true })).rejects.toThrow(/different Moderator/);
  }
  const second = { ...auth, demoPersonaHandle: "sam_cpe" };
  expect(await t.query(api.moderatorConsole.appealSnapshot, { ...second, appealId })).toContain("identifying detail");
  await t.mutation(api.moderatorConsole.decideAppeal, { ...second, appealId, reverse: true });
  expect((await t.query(api.moderatorConsole.review, { ...auth, targetType: item.targetType, targetId: item.targetId }))?.status).toBe("visible");
  await expect(t.mutation(api.moderatorConsole.decideAppeal, { ...second, appealId, reverse: false })).rejects.toThrow(/already been reviewed/);
  expect((await t.query(api.moderatorConsole.actionLog, second)).filter((r) => r.action === "appeal_reversed")).toHaveLength(1);
});

it("maintainers appoint/revoke only verified Students, and CSA guards cover reads, writes and Incident Appeals", async () => {
  const { t, auth, queue } = await demo();
  const owner = await createVerifiedTestStudent(t, { handle: "console_owner", displayName: "Owner" });
  const moderator = await createVerifiedTestStudent(t, { handle: "console_mod", displayName: "Moderator" });
  const faculty = await createVerifiedTestStudent(t, { handle: "faculty", displayName: "Faculty", email: "faculty@kennesaw.edu", emailDomainBadge: "faculty_staff" });
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", owner.canonicalEmail);
  const appoint = { sessionToken: owner.sessionToken, handle: moderator.canonicalEmail.split("@")[0]!, csaStatement: "I am a campus security authority at KSU.", csaStatus: "csa" };
  await expect(t.mutation(api.moderatorConsole.appoint, { ...appoint, handle: faculty.canonicalEmail.split("@")[0] })).rejects.toThrow(/verified/);
  await expect(t.mutation(api.moderatorConsole.appoint, { ...appoint, csaStatement: "yes" })).rejects.toThrow(/plain-text/);
  await t.mutation(api.moderatorConsole.appoint, appoint);
  const targetId = await t.run(async ({ db }) => {
    const source = (await db.get(db.normalizeId("incidents", queue.items[0]!.targetId)!))!;
    const { _id: _id, _creationTime: _time, ...fields } = source;
    const id = await db.insert("incidents", { ...fields, workspaceKey: "prod", authorId: owner.studentId });
    await db.insert("moderationReports", { workspaceKey: "prod", reporterId: faculty.studentId, targetType: "incident", targetKey: `incident:${id}`, priority: 0, queueStatus: "quarantined", reason: "identifies_me", createdAt: Date.now() });
    return id;
  });
  const csa = { sessionToken: moderator.sessionToken };
  expect(await t.query(api.moderatorConsole.queue, csa)).toMatchObject({ items: [], isCsa: true });
  expect(await t.query(api.moderatorConsole.review, { ...csa, targetType: "incident", targetId })).toBeNull();
  await expect(t.mutation(api.moderatorConsole.act, { ...csa, targetType: "incident", targetId, action: "remove", reasonId: "harassment", requestId: "csa" })).rejects.toThrow(/CSA/);
  await t.mutation(api.moderatorConsole.revoke, { sessionToken: owner.sessionToken, studentId: moderator.studentId });
  await expect(t.query(api.moderatorConsole.queue, csa)).rejects.toThrow(/Moderator access/);
  await expect(t.query(api.moderation.getCampusFeedHealth, { ...auth })).rejects.toThrow(/maintainer access/);
});

it("snapshot retention removes content at 30 days, keeps metadata for a year, and expires Appeals at read time", async () => {
  const { t, auth, queue, workspaceKey } = await demo(); const item = queue.items[0]!;
  const { actionId } = await t.mutation(api.moderatorConsole.act, { ...auth, targetType: item.targetType, targetId: item.targetId, action: "remove", reasonId: "harassment", requestId: "retention" });
  const now = Date.now();
  await t.run(({ db }) => db.patch(actionId, { snapshotPurgeAt: now }));
  expect((await t.query(api.moderatorConsole.myNotices, { ...auth, demoPersonaHandle: "jordan_me" })).find((n) => n.actionId === actionId)?.canAppeal).toBe(false);
  await expect(t.mutation(api.moderatorConsole.submitAppeal, { ...auth, demoPersonaHandle: "jordan_me", decisionActionId: actionId, text: "Too late" })).rejects.toThrow(/not available/);
  await t.run(async ({ db }) => { const row = (await db.get(actionId))!; const { _id: _id, _creationTime: _time, ...fields } = row;
    await db.insert("moderatorActions", { ...fields, workspaceKey: "prod", createdAt: now - 30 * DAY, snapshotPurgeAt: now, purgeAt: now + 335 * DAY }); });
  await t.mutation(internal.housekeeping.executePurgeBatch, { now, deletedFileKeys: [] });
  const retained = await t.run(({ db }) => db.query("moderatorActions").withIndex("by_created", (q) => q.eq("workspaceKey", "prod")).first());
  expect(retained?.contentSnapshot).toBeUndefined(); expect(retained?.action).toBe("remove");
  await t.mutation(internal.housekeeping.executePurgeBatch, { now: now + 366 * DAY, deletedFileKeys: [] });
  expect(await t.run(({ db }) => db.get(retained!._id))).toBeNull();
  expect(workspaceKey).toMatch(/^demo:/);
});

it("suspend is maintainer-only, blocks ordinary actions and preserves the author’s restricted Appeal path", async () => {
  const { t, auth, queue } = await demo(); const item = queue.items[0]!;
  await expect(t.mutation(api.moderatorConsole.act, { ...auth, targetType: item.targetType, targetId: item.targetId, action: "suspend", requestId: "suspend" })).rejects.toThrow(/maintainer-only/);
  // Maya reported this Incident, so even a maintainer must not use it to suspend its author.
  await expect(t.mutation(api.moderatorConsole.act, { ...auth, demoPersonaHandle: "maya_cs", targetType: item.targetType, targetId: item.targetId, action: "suspend", requestId: "suspend" })).rejects.toThrow(/involves you/);
  const owner = await createVerifiedTestStudent(t, { handle: "suspender", displayName: "Owner" });
  const student = await createVerifiedTestStudent(t, { handle: "suspended_author", displayName: "Author" });
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", owner.canonicalEmail);
  await t.mutation(api.moderation.reviewModerationTarget, { sessionToken: owner.sessionToken, targetType: "student", targetId: student.studentId, decision: "suspend_student" });
  await expect(t.mutation(api.feed.createPost, { sessionToken: student.sessionToken, body: "not allowed" })).rejects.toThrow(/no longer active/);
  const notices = await t.query(api.moderatorConsole.myNotices, { sessionToken: student.sessionToken });
  expect(notices[0]?.canAppeal).toBe(true);
  const appealId = await t.mutation(api.moderatorConsole.submitAppeal, { sessionToken: student.sessionToken, decisionActionId: notices[0]!.actionId, text: "Please review my suspension." });
  expect(appealId).toBeTruthy();
  vi.stubEnv("KSUX_SERVER_SECRET", TEST_SERVER_SECRET);
  vi.stubEnv("KSUX_SKIP_OTP_SCHEDULER", "true");
  vi.stubEnv("KSUX_ALLOW_DEV_OTP_LOG", "true");
  const otp = await requestTestOtp(t, { email: student.canonicalEmail });
  const login = await verifyTestOtp(t, { email: student.canonicalEmail, code: otp.devCodePreview! });
  if (!login.ok) throw new Error("Expected restricted login");
  expect(login.student._id).toBe(student.studentId);
  expect((await t.query(api.shell.shellSummary, { sessionToken: login.sessionToken })).viewer.suspended).toBe(true);
  await expect(t.query(api.feed.listFeedRingsAndTrends, { sessionToken: login.sessionToken })).rejects.toThrow(/no longer active/);
  const secondOwner = await createVerifiedTestStudent(t, { handle: "second_owner", displayName: "Second Owner" });
  vi.stubEnv("KSUX_MAINTAINER_EMAILS", `${owner.canonicalEmail},${secondOwner.canonicalEmail}`);
  await t.mutation(api.moderatorConsole.decideAppeal, { sessionToken: secondOwner.sessionToken, appealId, reverse: true });
  expect((await t.query(api.shell.shellSummary, { sessionToken: login.sessionToken })).viewer.suspended).toBe(false);
});

it("dismisses reports without notices or content changes; upholding an Appeal logs once and leaves removal in force", async () => {
  const { t, auth, queue } = await demo();
  const visible = queue.items[2]!;
  const before = (await t.query(api.moderatorConsole.review, { ...auth, targetType: visible.targetType, targetId: visible.targetId }))!;
  const notices = await t.query(api.moderatorConsole.myNotices, { ...auth, demoPersonaHandle: "jordan_me" });
  const dismissed = await t.mutation(api.moderatorConsole.act, { ...auth, targetType: visible.targetType, targetId: visible.targetId, action: "dismiss", requestId: "private request text", reasonId: "unvalidated text", templateId: "unvalidated text" });
  const audit = await t.run(({ db }) => db.get(dismissed.actionId));
  expect(audit?.reasonId).toBeUndefined(); expect(audit?.templateId).toBeUndefined();
  expect(audit?.requestId).toMatch(/^[a-f0-9]{64}$/);
  expect((await t.query(api.moderatorConsole.review, { ...auth, targetType: visible.targetType, targetId: visible.targetId }))?.text).toBe(before.text);
  expect((await t.query(api.moderatorConsole.myNotices, { ...auth, demoPersonaHandle: "jordan_me" })).length).toBe(notices.length);
  expect((await t.query(api.moderatorConsole.actionLog, auth)).filter((r) => r.action === "dismiss")).toHaveLength(1);
  await expect(t.mutation(api.moderatorConsole.act, { ...auth, targetType: visible.targetType, targetId: visible.targetId, action: "remove", reasonId: "harassment", requestId: "stale" })).rejects.toThrow(/already left/);
  const appeal = (await t.query(api.moderatorConsole.appeals, { ...auth, demoPersonaHandle: "sam_cpe" })).items[0]!;
  await t.mutation(api.moderatorConsole.decideAppeal, { ...auth, demoPersonaHandle: "sam_cpe", appealId: appeal.id, reverse: false });
  expect((await t.query(api.moderatorConsole.review, { ...auth, targetType: "incident", targetId: appeal.targetKey }))?.status).toBe("removed");
  expect((await t.query(api.moderatorConsole.actionLog, auth)).filter((r) => r.action === "appeal_upheld")).toHaveLength(1);
});

it("CSA guards also exclude direct Appeal snapshots and decisions, and cross-workspace target IDs never disclose content", async () => {
  const { t, queue, workspaceKey } = await demo();
  const csa = await createVerifiedTestStudent(t, { handle: "appeal_csa", displayName: "CSA" });
  const ids = await t.run(async ({ db }) => {
    await db.insert("moderators", { workspaceKey: "prod", studentId: csa.studentId, appointedById: csa.studentId,
      appointedAt: Date.now(), csaStatement: "I am a campus security authority.", isCsa: true });
    const demoAppeal = (await db.query("appeals").withIndex("by_status", (q) => q.eq("workspaceKey", workspaceKey).eq("status", "open")).first())!;
    const decision = (await db.get(demoAppeal.decisionActionId))!;
    const { _id: _id, _creationTime: _time, ...fields } = decision;
    const actionId = await db.insert("moderatorActions", { ...fields, workspaceKey: "prod" });
    const appealId = await db.insert("appeals", { workspaceKey: "prod", decisionActionId: actionId, appellantId: demoAppeal.appellantId, status: "open", createdAt: Date.now(), purgeAt: Date.now() + DAY });
    return { appealId };
  });
  const csaAuth = { sessionToken: csa.sessionToken };
  expect(await t.query(api.moderatorConsole.appeals, csaAuth)).toMatchObject({ items: [], csaExcluded: 1 });
  await expect(t.query(api.moderatorConsole.appealSnapshot, { ...csaAuth, appealId: ids.appealId })).rejects.toThrow(/different Moderator/);
  await expect(t.mutation(api.moderatorConsole.decideAppeal, { ...csaAuth, appealId: ids.appealId, reverse: false })).rejects.toThrow(/different Moderator/);
  const other = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
  expect(await t.query(api.moderatorConsole.review, { demoShortCode: other.shortCode, demoPersonaHandle: "alex_owl", targetType: queue.items[0]!.targetType, targetId: queue.items[0]!.targetId })).toBeNull();
});
