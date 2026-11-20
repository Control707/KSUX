import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const start = Date.UTC(2026, 8, 9, 14);
const tenMinutes = 10 * 60 * 1000;

function useLocalScrappy() {
  for (const key of ["GROQ_API_KEY", "GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) {
    vi.stubEnv(key, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Scrappy conversation and grounding workflows", () => {
  it("persists turns and supplies the six newest prior exchanges in chronological order", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "owl_history",
      displayName: "History Owl",
    });

    let threadId: Id<"scrappyThreads"> | undefined;
    for (let turn = 1; turn <= 7; turn++) {
      const initialized = await t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
        sessionToken,
        threadId,
        prompt: `Question ${turn}`,
      });
      threadId = initialized.threadId;

      await t.mutation(internal.scrappy.threads.persistAssistantScrappyTurn, {
        workspaceKey: initialized.workspaceKey,
        threadId,
        content: `Answer ${turn}`,
        citations: [],
        providerUsed: "grounded_local",
        toolCallsSummary: [],
      });
    }

    const next = await t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      sessionToken,
      threadId,
      prompt: "  Follow-up question  ",
    });
    const expectedHistory = Array.from({ length: 6 }, (_, index) => index + 2).flatMap((turn) => [
      { role: "user", content: `Question ${turn}` },
      { role: "assistant", content: `Answer ${turn}` },
    ]);
    expect(next.threadId).toBe(threadId);
    expect(next.recentHistory).toEqual(expectedHistory);

    const thread = await t.query(api.scrappy.threads.getThreadMessages, {
      sessionToken,
      threadId: next.threadId,
    });
    expect(thread?.thread.messageCount).toBe(15);
    expect(thread?.messages.at(-1)?.content).toBe("Follow-up question");
  });

  it("allows 15 questions per student and reopens the window at its expiry", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, {
      handle: "owl_quota",
      displayName: "Quota Owl",
    });
    const peer = await createVerifiedTestStudent(t, {
      handle: "owl_quota_peer",
      displayName: "Quota Peer",
    });
    const first = await t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      sessionToken: author.sessionToken,
      prompt: "Question 1",
      nowOverride: start,
    });
    const continued = { sessionToken: author.sessionToken, threadId: first.threadId };

    for (let question = 2; question <= 15; question++) {
      await t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
        ...continued,
        prompt: `Question ${question}`,
        nowOverride: start,
      });
    }

    await expect(t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      ...continued,
      prompt: "Question 16",
      nowOverride: start + tenMinutes - 1,
    })).rejects.toThrow(/15 questions per 10 minutes/i);
    await expect(t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      sessionToken: peer.sessionToken,
      prompt: "A different student's question",
      nowOverride: start + tenMinutes - 1,
    })).resolves.toMatchObject({ workspaceKey: "prod" });

    await expect(t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      ...continued,
      prompt: "Question 16 after the window resets",
      nowOverride: start + tenMinutes,
    })).resolves.toMatchObject({ threadId: first.threadId });

    const thread = await t.query(api.scrappy.threads.getThreadMessages, continued);
    expect(thread?.thread.messageCount).toBe(16);
  });

  it("keeps the latest turn visible after the thread exceeds the response limit", async () => {
    const t = createTestConvex();
    const { sessionToken, studentId } = await createVerifiedTestStudent(t, {
      handle: "owl_long_thread",
      displayName: "Continuing Owl",
    });
    const threadId = await t.run(async ({ db }) => {
      const id = await db.insert("scrappyThreads", {
        workspaceKey: "prod",
        studentId,
        title: "Long-running conversation",
        messageCount: 52,
        lastTurnAt: start + 52,
      });
      for (let message = 1; message <= 52; message++) {
        await db.insert("scrappyMessages", {
          workspaceKey: "prod",
          threadId: id,
          role: message % 2 === 0 ? "assistant" : "user",
          content: `Message ${message}`,
          citations: [],
          createdAt: start + message,
        });
      }
      return id;
    });

    const result = await t.query(api.scrappy.threads.getThreadMessages, { sessionToken, threadId });
    expect(result?.thread.messageCount).toBe(52);
    expect(result?.messages.at(-1)?.content).toBe("Message 52");
  });

  it("grounds verified-student Feed mentions in live campus data without an external provider", async () => {
    useLocalScrappy();
    vi.stubEnv("OWLSIDE_SKIP_SCRAPPY_SCHEDULER", "true");
    vi.stubEnv("OWLSIDE_SKIP_PUSH_SCHEDULER", "true");
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "owl_campus_mention",
      displayName: "Commuter Owl",
    });
    const pulse = await t.query(internal.scrappy.tools.getCampusDailyPulse, { sessionToken });
    const observedLot = pulse.parking[0]?.name;
    expect(observedLot).toBeTruthy();
    const { postId } = await t.mutation(api.feed.createPost, {
      sessionToken,
      body: "@scrappy What is the current parking outlook?",
    });
    const pending = await t.query(api.feed.getPostThread, { sessionToken, postId });
    const reply = pending?.replies[0];
    expect(reply?.scrappyStatus).toBe("thinking");

    await t.action(internal.scrappy.mentions.executeFeedMentionAction, {
      triggerPostId: postId,
      replyPostId: reply!._id,
    });
    const thread = await t.query(api.feed.getPostThread, { sessionToken, postId });

    expect(thread?.replies[0]?.scrappyStatus).toBe("ready");
    expect(thread?.replies[0]?.body).toContain(observedLot!);
  });

  it("grounds an All KSU parking question in both campus catalogs", async () => {
    useLocalScrappy();
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "both_campuses_owl",
      displayName: "Intercampus Owl",
    });
    await t.mutation(api.shell.setCampusFilter, { sessionToken, campusFilter: "All KSU" });

    const turn = await t.action(api.scrappy.threads.askScrappyAction, {
      sessionToken, prompt: "Which parking lots can I use?",
    });

    expect(turn.content).toContain("Kennesaw Campus");
    expect(turn.content).toContain("Marietta Campus");
    expect(turn.citations.map(({ campus }) => campus)).toEqual(["Kennesaw", "Marietta"]);
  });

  it("looks up a specific Course Hub and preserves the matching citation", async () => {
    useLocalScrappy();
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, { includeFixtures: true });
    const { sessionToken } = await createVerifiedTestStudent(t, {
      handle: "course_hub_owl",
      displayName: "Course Hub Owl",
    });

    const turn = await t.action(api.scrappy.threads.askScrappyAction, {
      sessionToken, prompt: "What is the CS 3305 syllabus?",
    });

    expect(turn.content).toContain("CS 3305");
    expect(turn.citations).toContainEqual(expect.objectContaining({ entityType: "course_hub", href: "/courses/CS%203305" }));
    const thread = await t.query(api.scrappy.threads.getThreadMessages, { sessionToken, threadId: turn.threadId });
    expect(thread?.messages.at(-1)?.toolCallsSummary).toEqual(["lookupCourseHubAndSyllabus"]);
  });
});
