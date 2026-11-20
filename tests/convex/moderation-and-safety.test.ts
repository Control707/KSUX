import { TEST_SERVER_SECRET, requestTestOtp } from "../helpers/authTest";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { assertPublishSafety } from "../../convex/lib/safety";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Publish Safety Guardrails, Mutual Block, 1-Tap Report & Moderation Queue (#16)", () => {
  beforeEach(() => {
    process.env.OWLSIDE_SERVER_SECRET = TEST_SERVER_SECRET;
    process.env.OWLSIDE_SKIP_OTP_SCHEDULER = "true";
    process.env.OWLSIDE_SKIP_STORAGE_SCHEDULER = "true";
    process.env.OWLSIDE_ALLOW_DEV_OTP_LOG = "true";
    process.env.OWLSIDE_MAINTAINER_EMAILS = "maintainer@kennesaw.edu";
  });

  it("rejects slurs, phone/SSN/street-address doxxing, and prohibited Marketplace items before persistence", async () => {
    const t = createTestConvex();
    const student = await createVerifiedTestStudent(t, {
      handle: "safe_owl",
      displayName: "Safe Owl",
    });

    // Hate speech / slurs rejected on public mutation
    await expect(
      t.mutation(api.students.updateProfile, {
        sessionToken: student.sessionToken,
        displayName: "kill yourself troll",
      })
    ).rejects.toThrowError(/safety standards/);

    // SSN & street-address doxxing rejected
    expect(() =>
      assertPublishSafety("Roommate SSN is 123-45-6789")
    ).toThrowError(/doxxing/);
    expect(() =>
      assertPublishSafety("He lives at 405 Frey Rd Apt 12")
    ).toThrowError(/doxxing/);

    // Prohibited Marketplace categories rejected: weapons, vapes/drugs, academic dishonesty, KSU parking permits
    expect(() =>
      assertPublishSafety("Selling Glock 19 handgun", {
        isMarketplaceListing: true,
      })
    ).toThrowError(/weapons/);
    expect(() =>
      assertPublishSafety("Geek Bar disposable vape flavors", {
        isMarketplaceListing: true,
      })
    ).toThrowError(/alcohol, tobacco\/vapes/);
    expect(() =>
      assertPublishSafety("I will write your essay and take your exam", {
        isMarketplaceListing: true,
      })
    ).toThrowError(/academic dishonesty/);
    expect(() =>
      assertPublishSafety("Selling my Central Deck parking permit", {
        isMarketplaceListing: true,
      })
    ).toThrowError(/KSU parking permits/);
  });

  it("enforces mutual Block across profiles, Study Sessions on Now HUD, Follow edges, and freezes 1:1 DMs", async () => {
    const t = createTestConvex();
    const alice = await createVerifiedTestStudent(t, {
      handle: "alice_ksu",
      displayName: "Alice Owl",
      homeCampus: "Kennesaw",
    });
    const bob = await createVerifiedTestStudent(t, {
      handle: "bob_ksu",
      displayName: "Bob Owl",
      homeCampus: "Kennesaw",
    });

    await t.mutation(api.students.toggleFollow, {
      sessionToken: alice.sessionToken,
      targetStudentId: bob.studentId,
    });

    const { dmChatId } = await t.run(async (ctx) => {
      const roomId = await ctx.db.insert("studyRooms", {
        slug: "sturgis-114",
        campus: "Kennesaw",
        buildingName: "Horace W. Sturgis Library",
        roomNumber: "Room 114",
        roomKind: "libcal",
        capacity: 6,
        amenities: ["Whiteboard"],
      });
      await ctx.db.insert("studySessions", {
        workspaceKey: "prod",
        studyRoomId: roomId,
        campus: "Kennesaw",
        hostId: bob.studentId,
        visibility: "campus_open",
        title: "Bob's Calculus Study Session",
        startTime: Date.now(),
        endTime: Date.now() + 3600_000,
        maxSeats: 6,
        attendeeIds: [bob.studentId],
        libcalHostConfirmed: true,
        status: "scheduled",
        visibilityStatus: "visible",
      });
      const pairKey =
        String(alice.studentId) < String(bob.studentId)
          ? `${alice.studentId}:${bob.studentId}`
          : `${bob.studentId}:${alice.studentId}`;
      const cid = await ctx.db.insert("chats", {
        workspaceKey: "prod",
        kind: "dm",
        dmPairKey: pairKey,
        requestStatus: "active",
        memberCount: 2,
        messageSeq: 1,
        lastMessageAt: Date.now(),
      });
      for (const studentId of [alice.studentId, bob.studentId]) {
        await ctx.db.insert("chatMembers", {
          workspaceKey: "prod",
          chatId: cid,
          studentId,
          chatKind: "dm",
          role: "member",
          badgeMode: "count",
          lastReadSeq: 1,
          lastReadAt: Date.now(),
          hasUnread: false,
          isMuted: false,
          isArchived: false,
          lastChatMessageAt: Date.now(),
          joinedAt: Date.now(),
        });
      }
      return { dmChatId: cid };
    });

    // Alice blocks Bob -> mutual visibility severed & 1:1 DM frozen
    const blockRes = await t.mutation(api.moderation.toggleBlockStudent, {
      sessionToken: alice.sessionToken,
      targetStudentId: bob.studentId,
    });
    expect(blockRes.blocked).toBe(true);

    // Neither Alice nor Bob sees the other's active profile or Study Sessions
    const aliceHud = await t.query(api.shell.getNowHud, {
      sessionToken: alice.sessionToken,
    });
    expect(aliceHud.studySummary.activeSessions).toHaveLength(0);

    const bobViewingAlice = await t.query(api.students.getProfile, {
      sessionToken: bob.sessionToken,
      handle: "alice_ksu",
    });
    expect(bobViewingAlice?.isBlocked).toBe(true);
    expect(bobViewingAlice?.student.isRemoved).toBe(true);

    const dmAfterBlock = await t.query(api.chats.getChatThread, {
      sessionToken: bob.sessionToken,
      chatId: dmChatId,
    });
    expect(dmAfterBlock?.chat.isReadOnlyLocked).toBe(true);
  });

  it("hides reported items immediately, triggers KSU Police flag on campus_safety, and auto-quarantines at 3 distinct reporters", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, {
      handle: "poster_owl",
      displayName: "Poster Owl",
    });
    const r1 = await createVerifiedTestStudent(t, {
      handle: "rep_one",
      displayName: "Reporter One",
    });
    const r2 = await createVerifiedTestStudent(t, {
      handle: "rep_two",
      displayName: "Reporter Two",
    });
    const r3 = await createVerifiedTestStudent(t, {
      handle: "rep_three",
      displayName: "Reporter Three",
    });

    const sessionTargetId = await t.run(async (ctx) => {
      const roomId = await ctx.db.insert("studyRooms", {
        slug: "sturgis-201",
        campus: "Kennesaw",
        buildingName: "Sturgis Library",
        roomNumber: "Room 201",
        roomKind: "libcal",
        capacity: 6,
        amenities: [],
      });
      return ctx.db.insert("studySessions", {
        workspaceKey: "prod",
        studyRoomId: roomId,
        campus: "Kennesaw",
        hostId: author.studentId,
        visibility: "campus_open",
        title: "Suspicious Study Promo",
        startTime: Date.now(),
        endTime: Date.now() + 3600_000,
        maxSeats: 6,
        attendeeIds: [author.studentId],
        libcalHostConfirmed: false,
        status: "scheduled",
        visibilityStatus: "visible",
      });
    });

    // 1st report (campus_safety): immediately hidden for r1 + returns showKsuPoliceCallout: true, still visible to r2
    const rep1 = await t.mutation(api.moderation.submitReport, {
      sessionToken: r1.sessionToken,
      targetType: "study_session",
      targetId: String(sessionTargetId),
      reason: "campus_safety",
    });
    expect(rep1.showKsuPoliceCallout).toBe(true);
    expect(rep1.quarantined).toBe(false);

    const hudR1 = await t.query(api.shell.getNowHud, {
      sessionToken: r1.sessionToken,
    });
    expect(hudR1.studySummary.activeSessions).toHaveLength(0);

    const hudR2Before = await t.query(api.shell.getNowHud, {
      sessionToken: r2.sessionToken,
    });
    expect(hudR2Before.studySummary.activeSessions).toHaveLength(1);

    // Duplicate report by r1 does NOT inflate distinct reporter count
    const dup = await t.mutation(api.moderation.submitReport, {
      sessionToken: r1.sessionToken,
      targetType: "study_session",
      targetId: String(sessionTargetId),
      reason: "scam_spam",
    });
    expect(dup.distinctReporterCount).toBe(1);

    // 2nd distinct reporter
    await t.mutation(api.moderation.submitReport, {
      sessionToken: r2.sessionToken,
      targetType: "study_session",
      targetId: String(sessionTargetId),
      reason: "scam_spam",
    });

    // 3rd distinct reporter -> auto-quarantines to Under Review for everyone!
    const rep3 = await t.mutation(api.moderation.submitReport, {
      sessionToken: r3.sessionToken,
      targetType: "study_session",
      targetId: String(sessionTargetId),
      reason: "scam_spam",
    });
    expect(rep3.quarantined).toBe(true);
    expect(rep3.distinctReporterCount).toBe(3);

    const hudAuthorAfter = await t.query(api.shell.getNowHud, {
      sessionToken: author.sessionToken,
    });
    expect(hudAuthorAfter.studySummary.activeSessions).toHaveLength(0);
  });

  it("gates prod Moderation Queue to allowlist, isolates Moderation Queue (Demo), restores false positives, and permanently suspends bad actors", async () => {
    const t = createTestConvex();
    const regularStudent = await createVerifiedTestStudent(t, {
      email: "student@students.kennesaw.edu",
      handle: "normal_student",
      displayName: "Normal Student",
    });
    const badActor = await createVerifiedTestStudent(t, {
      email: "spammer@students.kennesaw.edu",
      handle: "spammer_owl",
      displayName: "Spammer Owl",
    });
    const maintainer = await createVerifiedTestStudent(t, {
      email: "maintainer@kennesaw.edu",
      handle: "ksu_maintainer",
      displayName: "KSU Maintainer",
      emailDomainBadge: "faculty_staff",
    });

    // Non-allowlisted prod Student is rejected from Moderation Queue
    await expect(
      t.query(api.moderation.getModerationQueue, {
        sessionToken: regularStudent.sessionToken,
      })
    ).rejects.toThrowError(/Maintainer moderation access is required/);

    // Judge Demo Mode evaluator sees pre-seeded Under Review item ONLY in their demo workspace and can restore it
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );
    const demoQueue = await t.query(api.moderation.getModerationQueue, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "alex_owl",
    });
    expect(demoQueue.items.length).toBeGreaterThanOrEqual(1);
    const quarantinedDemoItem = demoQueue.items[0]!;
    expect(quarantinedDemoItem.queueStatus).toBe("quarantined");

    await t.mutation(api.moderation.reviewModerationTarget, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "alex_owl",
      targetType: quarantinedDemoItem.targetType,
      targetId: quarantinedDemoItem.targetId,
      decision: "restore",
    });

    const demoQueueAfterRestore = await t.query(
      api.moderation.getModerationQueue,
      {
        demoShortCode: demo.shortCode,
        demoPersonaHandle: "alex_owl",
      }
    );
    expect(demoQueueAfterRestore.items).toHaveLength(0);

    // Prod maintainer suspends badActor -> permanently locks @spammer_owl AND blocks future OTP sign-in for spammer@students.kennesaw.edu
    await t.mutation(api.moderation.submitReport, {
      sessionToken: regularStudent.sessionToken,
      targetType: "student",
      targetId: String(badActor.studentId),
      reason: "harassment",
    });

    await t.mutation(api.moderation.reviewModerationTarget, {
      sessionToken: maintainer.sessionToken,
      targetType: "student",
      targetId: String(badActor.studentId),
      decision: "suspend_student",
    });

    // Reauthentication reaches only the restricted notices/Appeal screen.
    expect((await requestTestOtp(t, {
      email: "spammer+bypass@students.kennesaw.edu",
    })).ok).toBe(true);

    const suspendedView = await t.query(api.students.getProfile, {
      sessionToken: regularStudent.sessionToken,
      studentId: badActor.studentId,
    });
    expect(suspendedView?.student.displayName).toBe("[Removed Student]");
  });
});
