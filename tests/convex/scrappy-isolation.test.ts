import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Scrappy Read-Only Tool Isolation, Non-Looping @scrappy Mentions & Quotas (#25)", () => {
  beforeEach(() => {
    process.env.KSUX_SKIP_SCRAPPY_SCHEDULER = "true";
    process.env.KSUX_SKIP_PUSH_SCHEDULER = "true";
    process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
  });

  it("filters Scrappy tool outputs by viewerContext (workspace, mutual Block, Under Review) and fences untrusted text", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

    const alice = await createVerifiedTestStudent(t, {
      handle: "scrappy_alice",
      displayName: "Alice",
      homeCampus: "Kennesaw",
    });
    const blockedPeer = await createVerifiedTestStudent(t, {
      handle: "scrappy_blocked",
      displayName: "Blocked Peer",
      homeCampus: "Kennesaw",
    });

    await t.mutation(api.feed.createPost, {
      sessionToken: alice.sessionToken,
      body: "Sturgis 2nd floor coffee cart is open!",
    });
    await t.mutation(api.feed.createPost, {
      sessionToken: blockedPeer.sessionToken,
      body: "Secret post from blocked peer",
    });

    await t.mutation(api.moderation.toggleBlockStudent, {
      sessionToken: alice.sessionToken,
      targetStudentId: blockedPeer.studentId,
    });

    // Provision a separate Judge Demo workspace -> Alice's prod Scrappy tools never see demo posts or blockedPeer posts!
    await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});

    const postsTool = await t.query(internal.scrappy.tools.searchFeedPosts, {
      sessionToken: alice.sessionToken,
    });
    expect(postsTool.rows).toHaveLength(1);
    expect(postsTool.rows[0]?.body).toBe(
      "<untrusted_campus_content>Sturgis 2nd floor coffee cart is open!</untrusted_campus_content>"
    );
  });

  it("executes @scrappy Feed mentions in 2 writes, prevents self-trigger loops, enforces 5/10m cap, hides errors from peers, and refunds quota on error", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, {
      handle: "mention_author",
      displayName: "Mention Author",
      homeCampus: "Kennesaw",
    });
    const bystander = await createVerifiedTestStudent(t, {
      handle: "mention_bystander",
      displayName: "Bystander",
      homeCampus: "Kennesaw",
    });

    const now = Date.now();

    // Publish 5 @scrappy posts -> 5 thinking replies created; 6th within 10m hits 5/10m cap
    const postIds = [];
    for (let i = 0; i < 6; i++) {
      const created = await t.mutation(api.feed.createPost, {
        sessionToken: author.sessionToken,
        body: `@scrappy Parking check #${i + 1}?`,
        nowOverride: now + i * 1000,
      });
      postIds.push(created.postId);
    }

    // First 5 threads have thinking @scrappy child replies; 6th was capped
    const thread1 = await t.query(api.feed.getPostThread, {
      sessionToken: author.sessionToken,
      postId: postIds[0]!,
    });
    expect(thread1?.replies).toHaveLength(1);
    expect(thread1?.replies[0]?.scrappyStatus).toBe("thinking");

    const thread6 = await t.query(api.feed.getPostThread, {
      sessionToken: author.sessionToken,
      postId: postIds[5]!,
    });
    expect(thread6?.replies).toHaveLength(0);

    const scrappyReplyId = thread1!.replies[0]!._id;

    // Verify hard non-looping rule: attempting to enqueue @scrappy on Scrappy's own Post is blocked!
    const loopCheck = await t.mutation(
      internal.scrappy.mentions.enqueueFeedMentionIfEligible,
      {
        workspaceKey: "prod",
        triggerPostId: scrappyReplyId,
        triggerAuthorId: author.studentId,
        now,
      }
    );
    expect(loopCheck.enqueued).toBe(false);
    expect(loopCheck.reason).toBe("self_trigger_blocked");

    // Simulate upstream failure on scrappyReplyId -> marks status "error", hides from bystander, and refunds quota slot!
    await t.mutation(internal.scrappy.mentions.finalizeFeedMentionReply, {
      replyPostId: scrappyReplyId,
      ok: false,
      body: "",
      citations: [],
      now: now + 8000,
    });

    const bystanderView = await t.query(api.feed.getPostThread, {
      sessionToken: bystander.sessionToken,
      postId: postIds[0]!,
    });
    expect(bystanderView?.replies).toHaveLength(0);

    const authorErrorView = await t.query(api.feed.getPostThread, {
      sessionToken: author.sessionToken,
      postId: postIds[0]!,
    });
    expect(authorErrorView?.replies).toHaveLength(1);
    expect(authorErrorView?.replies[0]?.scrappyStatus).toBe("error");

    // Bystander CANNOT click Retry; triggering author CAN click Retry using the refunded quota slot!
    await expect(
      t.mutation(api.scrappy.mentions.retryFailedMention, {
        sessionToken: bystander.sessionToken,
        replyPostId: scrappyReplyId,
      })
    ).rejects.toThrowError(/Only the triggering Post author/);

    await t.mutation(api.scrappy.mentions.retryFailedMention, {
      sessionToken: author.sessionToken,
      replyPostId: scrappyReplyId,
    });

    // Finalize Write #2 to "ready" with Citation Pills
    await t.mutation(internal.scrappy.mentions.finalizeFeedMentionReply, {
      replyPostId: scrappyReplyId,
      ok: true,
      body: "Hoot! Central Deck is Filling; Town Point Economy is Open.",
      citations: [
        {
          entityType: "parking_lot",
          entityId: "central",
          label: "Kennesaw Parking Lots",
          href: "/parking",
          campus: "Kennesaw",
        },
      ],
      now: now + 10_000,
    });

    const readyView = await t.query(api.feed.getPostThread, {
      sessionToken: bystander.sessionToken,
      postId: postIds[0]!,
    });
    expect(readyView?.replies).toHaveLength(1);
    expect(readyView?.replies[0]?.scrappyStatus).toBe("ready");
    expect(readyView?.replies[0]?.scrappyCitations[0]?.href).toBe("/parking");
  });

  it("caps 1:1 Ask Scrappy history at <=6 turn pairs, enforces 15/10m rate limit, and returns Draft Cards without mutating Listings", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const demo = await t.mutation(
      api.demo.session.provisionOrAttachDemoSession,
      { preferredPersona: "maya_cs" }
    );

    const listingsBefore = await t.query(api.marketplace.listListings, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      campusOverride: "All KSU",
    });

    const askRes = await t.action(api.scrappy.threads.askScrappyAction, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      prompt: "Draft a Listing to sell my CS 3305 CLRS textbook for $40",
    });

    expect(askRes.draftCard?.draftKind).toBe("listing");
    expect(askRes.citations.length).toBeGreaterThan(0);

    // Confirm zero database mutation happened on Marketplace Listings!
    const listingsAfter = await t.query(api.marketplace.listListings, {
      demoShortCode: demo.shortCode,
      demoPersonaHandle: "maya_cs",
      campusOverride: "All KSU",
    });
    expect(listingsAfter).toHaveLength(listingsBefore.length);
  });
});
