import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Campus Feed, Posts, Threads, #Topic Trends & Entity Embeds (#17)", () => {
  beforeEach(() => {
    process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
  });

  it("scopes Campus stream by Kennesaw/Marietta/All KSU, enforces Course Hub (false) vs Club (true) cross-post defaults, and preserves Following across switches", async () => {
    const t = createTestConvex();
    const maya = await createVerifiedTestStudent(t, {
      handle: "maya_feed",
      displayName: "Maya Feed",
      homeCampus: "Kennesaw",
    });
    const jordan = await createVerifiedTestStudent(t, {
      handle: "jordan_feed",
      displayName: "Jordan Feed",
      homeCampus: "Marietta",
    });

    const { hubId, clubId } = await t.run(async (ctx) => {
      const hid = await ctx.db.insert("courseHubs", {
        subjectCourse: "CS 3305",
        subjectCode: "CS",
        courseNumber: "3305",
        title: "Data Structures",
        searchText: "CS 3305 Data Structures",
        campuses: ["Kennesaw", "Marietta"],
        activeTerms: ["202608"],
        prodEnrollmentCount: 2,
      });
      await ctx.db.insert("studentEnrollments", {
        workspaceKey: "prod",
        studentId: maya.studentId,
        termCode: "202608",
        courseHubId: hid,
        personalDeadlines: [],
        createdAt: Date.now(),
      });
      const cid = await ctx.db.insert("clubs", {
        workspaceKey: "ksu",
        slug: "acm-ksu",
        clubKind: "registered_ksu",
        campus: "Kennesaw",
        name: "ACM at KSU",
        summary: "ACM",
        description: "ACM",
        searchText: "ACM KSU",
        prodMemberCount: 10,
        visibilityStatus: "visible",
      });
      await ctx.db.insert("clubMembers", {
        workspaceKey: "prod",
        clubId: cid,
        studentId: maya.studentId,
        role: "member",
        joinedAt: Date.now(),
      });
      return { hubId: hid, clubId: cid };
    });

    // Maya follows Jordan (who posts on Marietta)
    await t.mutation(api.students.toggleFollow, {
      sessionToken: maya.sessionToken,
      targetStudentId: jordan.studentId,
    });

    // 1. Course Hub post WITHOUT crossPostToCampusFeed defaults to false (stays out of main Campus Feed)
    await t.mutation(api.feed.createPost, {
      sessionToken: maya.sessionToken,
      courseHubId: hubId,
      body: "Homework 4 recursion hint? #cs3305",
    });

    // 2. Club post WITHOUT crossPostToCampusFeed defaults to true (appears in main Campus Feed)
    await t.mutation(api.feed.createPost, {
      sessionToken: maya.sessionToken,
      clubId,
      body: "ACM Hackathon workshop tonight! #acm",
    });

    // 3. Jordan posts on Marietta
    await t.mutation(api.feed.createPost, {
      sessionToken: jordan.sessionToken,
      campus: "Marietta",
      body: "Marietta West Deck is wide open! #marietta",
    });

    const kennesawFeed = await t.query(api.feed.listCampusOrTrendingFeed, {
      sessionToken: maya.sessionToken,
      stream: "campus",
      campusOverride: "Kennesaw",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(kennesawFeed.page.map((p) => p.body)).toEqual([
      "ACM Hackathon workshop tonight! #acm",
    ]);

    const allKsuFeed = await t.query(api.feed.listCampusOrTrendingFeed, {
      sessionToken: maya.sessionToken,
      stream: "campus",
      campusOverride: "All KSU",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(allKsuFeed.page).toHaveLength(2);

    // Following stream includes Course Hub post + Club post + followed Marietta classmate regardless of Campus switch!
    const following = await t.query(api.feed.listFollowingFeed, {
      sessionToken: maya.sessionToken,
    });
    expect(following).toHaveLength(3);
  });

  it("ranks Trending (24h) by write-time hotScore + top #topic chips, enforces 5m typo edit window, and distinguishes leaf hard-delete vs [Deleted Post] tombstone", async () => {
    const t = createTestConvex();
    const alice = await createVerifiedTestStudent(t, {
      handle: "alice_post",
      displayName: "Alice",
      homeCampus: "Kennesaw",
    });
    const bob = await createVerifiedTestStudent(t, {
      handle: "bob_post",
      displayName: "Bob",
      homeCampus: "Kennesaw",
    });

    const baseNow = Date.now();
    const lowPost = await t.mutation(api.feed.createPost, {
      sessionToken: alice.sessionToken,
      body: "Quiet morning on the Green #campuslife",
      nowOverride: baseNow - 60_000,
    });
    const viralPost = await t.mutation(api.feed.createPost, {
      sessionToken: bob.sessionToken,
      body: "Free iced coffee outside Sturgis Library! #freefood #ksu",
      nowOverride: baseNow - 120_000,
    });

    // Engage viralPost with Like + Quote Post + Reply
    await t.mutation(api.feed.togglePostInteraction, {
      sessionToken: alice.sessionToken,
      postId: viralPost.postId,
      kind: "post_like",
    });
    const reply = await t.mutation(api.feed.createPost, {
      sessionToken: alice.sessionToken,
      replyToPostId: viralPost.postId,
      body: "Grabbing one right now!",
      nowOverride: baseNow - 30_000,
    });

    const trending = await t.query(api.feed.listCampusOrTrendingFeed, {
      sessionToken: alice.sessionToken,
      stream: "trending",
      paginationOpts: { numItems: 25, cursor: null },
    });
    // Reply does NOT clutter top-level Feed, and viralPost outranks lowPost by hotScore
    expect(trending.page[0]?._id).toBe(viralPost.postId);
    expect(
      trending.page.some((p) => p._id === reply.postId)
    ).toBe(false);

    const meta = await t.query(api.feed.listFeedRingsAndTrends, {
      sessionToken: alice.sessionToken,
    });
    expect(meta.topTrendingTags.map((x) => x.tag)).toContain("freefood");

    // Edit within 5 minutes succeeds; edit past 5 minutes is rejected
    await t.mutation(api.feed.editPost, {
      sessionToken: alice.sessionToken,
      postId: lowPost.postId,
      body: "Quiet sunny morning on the Green #campuslife",
      nowOverride: baseNow + 60_000,
    });
    await expect(
      t.mutation(api.feed.editPost, {
        sessionToken: alice.sessionToken,
        postId: lowPost.postId,
        body: "Too late edit",
        nowOverride: baseNow + 6 * 60_000,
      })
    ).rejects.toThrowError(/within 5 minutes/);

    // Deleting a leaf Post (0 replies) hard-deletes it
    const leafDel = await t.mutation(api.feed.deletePost, {
      sessionToken: alice.sessionToken,
      postId: lowPost.postId,
    });
    expect(leafDel.deletedMode).toBe("hard_deleted");
    expect(await t.run((ctx) => ctx.db.get(lowPost.postId))).toBeNull();

    // Deleting a Post WITH child replies preserves a [Deleted Post] tombstone so the thread remains intact
    const rootDel = await t.mutation(api.feed.deletePost, {
      sessionToken: bob.sessionToken,
      postId: viralPost.postId,
    });
    expect(rootDel.deletedMode).toBe("tombstone");

    const threadAfter = await t.query(api.feed.getPostThread, {
      sessionToken: alice.sessionToken,
      postId: viralPost.postId,
    });
    expect(threadAfter?.rootPost.body).toBe("[Deleted Post]");
    expect(threadAfter?.replies).toHaveLength(1);
    expect(threadAfter?.replies[0]?.body).toBe("Grabbing one right now!");
  });
});
