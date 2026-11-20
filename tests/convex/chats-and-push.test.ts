import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Unified Chats: DMs, Cold Message Requests, Group Chats, Unread Cursors & Push (#23)", () => {
  beforeEach(() => {
    process.env.OWLSIDE_SKIP_PUSH_SCHEDULER = "true";
    process.env.OWLSIDE_SKIP_STORAGE_SCHEDULER = "true";
  });

  it("enforces cold Message Request 1-message text-only caps, 30-day decline cooldowns, and zero-scan lastReadSeq unread badges", async () => {
    const t = createTestConvex();
    const sender = await createVerifiedTestStudent(t, {
      handle: "cold_sender",
      displayName: "Cold Sender",
    });
    const recipient = await createVerifiedTestStudent(t, {
      handle: "cold_recipient",
      displayName: "Cold Recipient",
    });

    const baseNow = Date.now();

    // Unconnected DM enters pending_request with 1 opener
    const opened = await t.mutation(api.chats.startOrOpenDirectMessage, {
      sessionToken: sender.sessionToken,
      recipientHandleOrId: "cold_recipient",
      openerBody: "Hey! Are you in SWE 3313?",
      nowOverride: baseNow,
    });
    expect(opened.requestStatus).toBe("pending_request");

    // 2nd message from initiator while pending_request is rejected
    await expect(
      t.mutation(api.chats.sendMessage, {
        sessionToken: sender.sessionToken,
        chatId: opened.chatId,
        body: "Second spam message",
        nowOverride: baseNow + 1000,
      })
    ).rejects.toThrowError(/Wait for the recipient to accept/);

    // Recipient sees numeric unread badge = 1 in shellSummary & Chats inbox
    const recSummaryBefore = await t.query(api.shell.shellSummary, {
      sessionToken: recipient.sessionToken,
    });
    expect(recSummaryBefore.unread.numericUnreadCount).toBe(1);

    // Recipient declines -> records 30-day cooldown blocking new cold requests
    await t.mutation(api.chats.respondToMessageRequest, {
      sessionToken: recipient.sessionToken,
      chatId: opened.chatId,
      decision: "decline",
      nowOverride: baseNow + 5000,
    });

    await expect(
      t.mutation(api.chats.startOrOpenDirectMessage, {
        sessionToken: sender.sessionToken,
        recipientHandleOrId: "cold_recipient",
        openerBody: "Trying again after decline",
        nowOverride: baseNow + 86_400_000, // 1 day later (< 30d)
      })
    ).rejects.toThrowError(/30-day cooldown/);

    // Once recipient follows sender, DMs open unrestricted as active!
    await t.mutation(api.students.toggleFollow, {
      sessionToken: recipient.sessionToken,
      targetStudentId: sender.studentId,
    });
    const connectedDm = await t.mutation(api.chats.startOrOpenDirectMessage, {
      sessionToken: sender.sessionToken,
      recipientHandleOrId: "cold_recipient",
      openerBody: "Connected now!",
      nowOverride: baseNow + 90_000_000,
    });
    expect(connectedDm.requestStatus).toBe("active");
  });

  it("locks Study Session Group Chats after the 24h grace window, upgrades to Closed Group Chat, collapses Blocked Student group messages, and restricts VAPID Push to <=3 prod endpoints", async () => {
    const t = createTestConvex();
    const host = await createVerifiedTestStudent(t, {
      handle: "group_host",
      displayName: "Group Host",
    });
    const peer = await createVerifiedTestStudent(t, {
      handle: "group_peer",
      displayName: "Group Peer",
    });

    const baseNow = Date.now();
    const roomId = await t.run((ctx) =>
      ctx.db.insert("studyRooms", {
        slug: "sturgis-302",
        campus: "Kennesaw",
        buildingName: "Sturgis Library",
        roomNumber: "Room 302",
        roomKind: "libcal",
        capacity: 6,
        amenities: [],
      })
    );

    const hosted = await t.mutation(api.study.createStudySession, {
      sessionToken: host.sessionToken,
      studyRoomId: roomId,
      title: "Discrete Math Study Group",
      visibility: "campus_open",
      startTime: baseNow + 10 * 60_000,
      endTime: baseNow + 70 * 60_000,
      maxSeats: 4,
    });

    await t.mutation(api.study.toggleStudySessionAttendance, {
      sessionToken: peer.sessionToken,
      sessionId: hosted.sessionId,
    });

    await t.mutation(api.chats.sendMessage, {
      sessionToken: peer.sessionToken,
      chatId: hosted.groupChatId,
      body: "Sharing proof induction notes!",
      nowOverride: baseNow + 20 * 60_000,
    });

    // If Host blocks Peer, Peer's message inside shared Group Chat returns collapsedBlocked: true
    await t.mutation(api.moderation.toggleBlockStudent, {
      sessionToken: host.sessionToken,
      targetStudentId: peer.studentId,
    });
    const threadWithBlock = await t.query(api.chats.getChatThread, {
      sessionToken: host.sessionToken,
      chatId: hosted.groupChatId,
      nowOverride: baseNow + 25 * 60_000,
    });
    expect(threadWithBlock?.messages[0]?.collapsedBlocked).toBe(true);

    // Past endTime + 24h grace window -> Study Session chat locks read-only!
    const afterGraceNow = baseNow + 70 * 60_000 + 25 * 3600_000;
    await expect(
      t.mutation(api.chats.sendMessage, {
        sessionToken: host.sessionToken,
        chatId: hosted.groupChatId,
        body: "After 24h grace",
        nowOverride: afterGraceNow,
      })
    ).rejects.toThrowError(/locked read-only/);

    // 1-tap Convert to Closed Group Chat unlocks it permanently
    const upgraded = await t.mutation(
      api.chats.convertStudyChatToClosedGroup,
      {
        sessionToken: host.sessionToken,
        chatId: hosted.groupChatId,
      }
    );
    expect(upgraded.kind).toBe("custom_group");

    await t.mutation(api.chats.sendMessage, {
      sessionToken: host.sessionToken,
      chatId: hosted.groupChatId,
      body: "Unlocked as a custom Group Chat!",
      nowOverride: afterGraceNow + 1000,
    });

    // VAPID Push: rejected in Judge Demo Mode, capped at 3 endpoints for verified prod Students
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      {}
    );
    await expect(
      t.mutation(api.push.registerPushSubscription, {
        demoShortCode: demo.shortCode,
        demoPersonaHandle: "maya_cs",
        endpoint: "https://fcm.googleapis.com/fcm/send/demo",
        p256dh: "k1",
        auth: "a1",
      })
    ).rejects.toThrowError(/verified KSU \.edu Student/);

    for (let i = 1; i <= 4; i++) {
      await t.mutation(api.push.registerPushSubscription, {
        sessionToken: host.sessionToken,
        endpoint: `https://fcm.googleapis.com/fcm/send/ep-${i}`,
        p256dh: `p-${i}`,
        auth: `a-${i}`,
      });
    }
    const pushList = await t.query(api.push.getMyPushSubscriptions, {
      sessionToken: host.sessionToken,
    });
    expect(pushList.endpoints).toHaveLength(3);
  });
});
