import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

const DAY_MS = 86_400_000;

describe("Social workflow regressions", () => {
  beforeEach(() => {
    vi.stubEnv("OWLSIDE_SKIP_PUSH_SCHEDULER", "true");
    vi.stubEnv("OWLSIDE_SKIP_STORAGE_SCHEDULER", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function createPeers() {
    const t = createTestConvex();
    const alex = await createVerifiedTestStudent(t, {
      handle: "alex_regression",
      displayName: "Alex Regression",
    });
    const june = await createVerifiedTestStudent(t, {
      handle: "june_regression",
      displayName: "June Regression",
    });
    return { t, alex, june };
  }

  it("keeps group membership, unread cursors, reactions, and message tombstones consistent", async () => {
    const { t, alex, june } = await createPeers();
    const alexAuth = { sessionToken: alex.sessionToken };
    const juneAuth = { sessionToken: june.sessionToken };
    const { chatId } = await t.mutation(api.chats.createCustomGroupChat, {
      ...alexAuth,
      title: "Chemistry study group",
      inviteHandles: ["june_regression", "@June_Regression"],
    });
    const { messageId } = await t.mutation(api.chats.sendMessage, {
      ...alexAuth,
      chatId,
      body: "Library tomorrow?",
    });

    expect(await t.query(api.chats.listInbox, juneAuth)).toEqual([
      expect.objectContaining({ chatId, unreadCount: 1 }),
    ]);
    expect(await t.mutation(api.chats.markChatRead, { ...juneAuth, chatId })).toEqual({
      ok: true,
      lastReadSeq: 1,
    });
    expect(await t.query(api.chats.listInbox, juneAuth)).toEqual([
      expect.objectContaining({ chatId, unreadCount: 0 }),
    ]);

    await t.mutation(api.chats.toggleMessageReaction, {
      ...juneAuth,
      messageId,
      emoji: "👍",
    });
    const thread = await t.query(api.chats.getChatThread, { ...alexAuth, chatId });
    expect(thread?.participants).toHaveLength(2);
    expect(thread?.messages[0]?.reactions).toEqual([
      { emoji: "👍", count: 1, reactedByViewer: false },
    ]);

    await t.mutation(api.chats.deleteChatMessage, { ...alexAuth, messageId });
    const afterDeletion = await t.query(api.chats.getChatThread, { ...juneAuth, chatId });
    expect(afterDeletion?.messages).toEqual([
      expect.objectContaining({ _id: messageId, seq: 1, body: "[Message deleted]", isDeleted: true }),
    ]);

    await t.mutation(api.chats.removeOrLeaveGroupChat, { ...juneAuth, chatId });
    expect(await t.query(api.chats.listInbox, juneAuth)).toEqual([]);
    await expect(t.query(api.chats.getChatThread, { ...juneAuth, chatId })).rejects.toThrow(
      /not a participant/,
    );
  });

  it("reopens a declined Message Request after the thirty-day cooldown", async () => {
    const { t, alex, june } = await createPeers();
    const now = Date.now();
    const opener = {
      sessionToken: alex.sessionToken,
      recipientHandleOrId: "june_regression",
    };
    const request = await t.mutation(api.chats.startOrOpenDirectMessage, {
      ...opener,
      openerBody: "Would you like to study on campus?",
      nowOverride: now,
    });
    expect(request.requestStatus).toBe("pending_request");
    await t.mutation(api.chats.respondToMessageRequest, {
      sessionToken: june.sessionToken,
      chatId: request.chatId,
      decision: "decline",
      nowOverride: now,
    });

    const retried = await t.mutation(api.chats.startOrOpenDirectMessage, {
      ...opener,
      openerBody: "Good luck with classes this term.",
      nowOverride: now + 30 * DAY_MS,
    });
    expect(retried.requestStatus).toBe("pending_request");
    const requests = await t.query(api.chats.listInbox, { sessionToken: june.sessionToken });
    expect(requests).toContainEqual(expect.objectContaining({
      chatId: retried.chatId,
      isPendingIncomingRequest: true,
    }));
  });

  it("preserves a pending Message Request when its recipient blocks and then unblocks the sender", async () => {
    const { t, alex, june } = await createPeers();
    const { chatId, requestStatus } = await t.mutation(api.chats.startOrOpenDirectMessage, {
      sessionToken: alex.sessionToken,
      recipientHandleOrId: "june_regression",
      openerBody: "Would you like to review the assignment together?",
    });
    expect(requestStatus).toBe("pending_request");
    const block = { sessionToken: june.sessionToken, targetStudentId: alex.studentId };
    expect(await t.mutation(api.moderation.toggleBlockStudent, block)).toEqual({ blocked: true });
    const locked = await t.query(api.chats.getChatThread, { sessionToken: june.sessionToken, chatId });
    expect(locked?.chat.isReadOnlyLocked).toBe(true);
    expect(await t.mutation(api.moderation.toggleBlockStudent, block)).toEqual({ blocked: false });

    const unblocked = await t.query(api.chats.getChatThread, { sessionToken: june.sessionToken, chatId });
    expect(unblocked?.chat.requestStatus).toBe("pending_request");
  });

  it("removes the original internal link and updates the inbox preview on chat edit", async () => {
    const { t, alex, june } = await createPeers();
    const alexAuth = { sessionToken: alex.sessionToken };
    const juneAuth = { sessionToken: june.sessionToken };
    const { chatId } = await t.mutation(api.chats.createCustomGroupChat, {
      ...alexAuth,
      title: "Campus planning",
      inviteHandles: ["june_regression"],
    });
    const { messageId } = await t.mutation(api.chats.sendMessage, {
      ...alexAuth,
      chatId,
      body: "Meet at the room listed in /study",
    });
    const beforeEdit = await t.query(api.chats.getChatThread, { ...juneAuth, chatId });
    expect(beforeEdit?.messages[0]?.linkEmbed?.href).toBe("/study");

    await t.mutation(api.chats.editChatMessage, {
      ...alexAuth,
      messageId,
      body: "Meet in the library lobby instead.",
    });
    const afterEdit = await t.query(api.chats.getChatThread, { ...juneAuth, chatId });
    const inbox = await t.query(api.chats.listInbox, juneAuth);
    expect({
      message: afterEdit?.messages[0]?.body,
      link: afterEdit?.messages[0]?.linkEmbed,
      preview: inbox[0]?.lastMessagePreview,
    }).toEqual({
      message: "Meet in the library lobby instead.",
      link: undefined,
      preview: "Meet in the library lobby instead.",
    });
  });

  it("moves a corrected hashtag in both campus and All KSU trend counts", async () => {
    const { t, alex } = await createPeers();
    const auth = { sessionToken: alex.sessionToken };
    const { postId } = await t.mutation(api.feed.createPost, {
      ...auth,
      body: "Meet at the library #calcluus",
    });
    await t.mutation(api.feed.editPost, {
      ...auth,
      postId,
      body: "Meet at the library #calculus",
    });

    const rings = await Promise.all(
      (["Kennesaw", "All KSU"] as const).map((campusOverride) =>
        t.query(api.feed.listFeedRingsAndTrends, { ...auth, campusOverride }),
      ),
    );
    expect(rings.map((feed) => feed.topTrendingTags)).toEqual([
      [{ tag: "calculus", count: 1 }],
      [{ tag: "calculus", count: 1 }],
    ]);
  });

  it("restores a moderated Post without changing its Campus cross-post preference", async () => {
    const { t, alex, june } = await createPeers();
    vi.stubEnv("OWLSIDE_MAINTAINER_EMAILS", june.canonicalEmail);
    const { postId } = await t.mutation(api.feed.createPost, {
      sessionToken: alex.sessionToken,
      body: "Planning details for followers",
      crossPostToCampusFeed: false,
    });
    const moderation = { sessionToken: june.sessionToken, targetType: "post" as const, targetId: postId };
    await t.mutation(api.moderation.reviewModerationTarget, { ...moderation, decision: "remove", reasonId: "harassment" });
    await t.mutation(api.moderation.reviewModerationTarget, { ...moderation, decision: "restore" });

    expect(await t.run((ctx) => ctx.db.get(postId))).toMatchObject({
      visibilityStatus: "visible",
      crossPostToCampusFeed: false,
      showInCampusFeed: false,
    });
  });

  it("immediately hides a reported Chat message for the reporting participant", async () => {
    const { t, alex, june } = await createPeers();
    const alexAuth = { sessionToken: alex.sessionToken };
    const juneAuth = { sessionToken: june.sessionToken };
    const { chatId } = await t.mutation(api.chats.createCustomGroupChat, {
      ...alexAuth,
      title: "Group project",
      inviteHandles: ["june_regression"],
    });
    const body = "Here is a repeat promotion for my campus sale.";
    const { messageId } = await t.mutation(api.chats.sendMessage, {
      ...alexAuth,
      chatId,
      body,
    });
    await t.mutation(api.moderation.submitReport, {
      ...juneAuth,
      targetType: "chat_message",
      targetId: messageId,
      reason: "scam_spam",
    });

    const authorThread = await t.query(api.chats.getChatThread, { ...alexAuth, chatId });
    expect(authorThread?.messages[0]?.body).toBe(body);
    const reporterThread = await t.query(api.chats.getChatThread, { ...juneAuth, chatId });
    expect(reporterThread?.messages.map((message) => message.body)).not.toContain(body);
  });

  it("includes Posts from the fortieth followed Student in Following", async () => {
    const { t, alex, june } = await createPeers();
    await t.run(async (ctx) => {
      const template = await ctx.db.get(june.studentId);
      if (!template) throw new Error("Peer fixture is missing");
      const { _id, _creationTime, ...profile } = template;
      for (let index = 0; index < 39; index++) {
        const handle = `following_fixture_${index}`;
        const followeeId = await ctx.db.insert("students", {
          ...profile,
          canonicalEmail: `${handle}@students.kennesaw.edu`,
          handle,
          handleLower: handle,
          searchText: handle,
        });
        await ctx.db.insert("studentFollows", {
          workspaceKey: "prod",
          followerId: alex.studentId,
          followeeId,
          createdAt: Date.now(),
        });
      }
    });
    await t.mutation(api.students.toggleFollow, {
      sessionToken: alex.sessionToken,
      targetStudentId: june.studentId,
    });
    const { postId } = await t.mutation(api.feed.createPost, {
      sessionToken: june.sessionToken,
      body: "New event at the library.",
    });

    const following = await t.query(api.feed.listFollowingFeed, { sessionToken: alex.sessionToken });
    expect(following.map((post) => post._id)).toContain(postId);
  });
});
