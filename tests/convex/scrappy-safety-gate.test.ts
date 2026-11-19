import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IDENTIFY_CARD_COPY, SAFETY_CARD_COPY } from "../../convex/scrappy/safetyGate";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

type TestConvex = ReturnType<typeof createTestConvex>;

const bucketCounts = (t: TestConvex) =>
  t.run(async (ctx) => (await ctx.db.query("rateLimitBuckets").collect()).map(({ key, count }) => ({ key, count })));

describe("Scrappy Safety Card gate runs before quota and before any LLM call (#88)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.KSUX_SKIP_SCRAPPY_SCHEDULER = "true";
    process.env.KSUX_SKIP_PUSH_SCHEDULER = "true";
    process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
    // Keys are set so a missed gate would try a provider; fetch records any LLM call.
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    fetchSpy = vi.fn(async () => { throw new Error("LLM must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Ask Scrappy returns the Safety Card with exhausted quota, zero LLM calls and zero quota use", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, { handle: "gate_asker", displayName: "Gate Asker" });

    // Exhaust the 15/10m quota without calling a model.
    let threadId: Id<"scrappyThreads"> | undefined;
    for (let i = 0; i < 15; i++) {
      const turn: { threadId: Id<"scrappyThreads"> } = await t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
        sessionToken, threadId, prompt: `Parking question ${i}`,
      });
      threadId = turn.threadId;
    }
    await expect(t.mutation(internal.scrappy.threads.beginAskScrappyTurnInternal, {
      sessionToken, threadId, prompt: "Which parking lots have room?",
    })).rejects.toThrowError(/capped at 15/);
    const before = await bucketCounts(t);

    const safety = await t.action(api.scrappy.threads.askScrappyAction, { sessionToken, threadId, prompt: "Is campus safe?" });
    expect(safety.content).toBe(SAFETY_CARD_COPY);
    expect(safety.providerUsed).toBe("safety_card");
    expect(safety.citations.map((c) => c.href)).toEqual(expect.arrayContaining(["/emergency", "/safety"]));
    expect(safety.citations.map((c) => c.label)).toEqual(expect.arrayContaining(["KSU Police", "LiveSafe · anonymous tips"]));

    const identify = await t.action(api.scrappy.threads.askScrappyAction, { sessionToken, prompt: "Can you identify this guy?" });
    expect(identify.content).toBe(IDENTIFY_CARD_COPY);
    expect(identify.citations[0]?.href).toBe("/emergency");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await bucketCounts(t)).toEqual(before);

    const thread = await t.query(api.scrappy.threads.getThreadMessages, { sessionToken, threadId: safety.threadId });
    const last = thread!.messages.at(-1)!;
    expect(last).toMatchObject({ role: "assistant", content: SAFETY_CARD_COPY, providerUsed: "safety_card", toolCallsSummary: [] });
  });

  it("@scrappy Feed mention replies with the Safety Card in a single write with exhausted quota and zero LLM calls", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "gate_poster", displayName: "Gate Poster", homeCampus: "Kennesaw" });
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.feed.createPost, { sessionToken: author.sessionToken, body: `@scrappy Parking check #${i}?`, nowOverride: now + i });
    }
    const before = await bucketCounts(t);
    expect(before.find((b) => b.key.startsWith("scrappy_feed_10m"))?.count).toBe(5);

    const { postId } = await t.mutation(api.feed.createPost, {
      sessionToken: author.sessionToken, body: "@scrappy what happened at the Student Center?", nowOverride: now + 10,
    });
    const thread = await t.query(api.feed.getPostThread, { sessionToken: author.sessionToken, postId });
    expect(thread?.replies).toHaveLength(1);
    const reply = thread!.replies[0]!;
    expect(reply).toMatchObject({ body: SAFETY_CARD_COPY, scrappyStatus: "ready" });
    expect(reply.scrappyCitations.map((c) => c.href)).toEqual(expect.arrayContaining(["/emergency", "/safety"]));

    // Single write: the reply is born ready, with no "thinking" placeholder to patch.
    const stored = await t.run((ctx) => ctx.db.get(reply._id));
    expect(stored?.scrappyToolMeta).toBe("safety_card");

    const { postId: idPost } = await t.mutation(api.feed.createPost, {
      sessionToken: author.sessionToken, body: "@scrappy who was that guy who stole my bike?", nowOverride: now + 20,
    });
    const idThread = await t.query(api.feed.getPostThread, { sessionToken: author.sessionToken, postId: idPost });
    expect(idThread?.replies[0]?.body).toBe(IDENTIFY_CARD_COPY);

    expect(await bucketCounts(t)).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cites Shuttle Notices as \"Shuttle Notice · Passio\", never as an alert", async () => {
    const t = createTestConvex();
    const { sessionToken } = await createVerifiedTestStudent(t, { handle: "gate_notice", displayName: "Gate Notice" });
    const now = Date.now();
    await t.run(async (ctx) => {
      const prior = await ctx.db.query("shuttleSnapshots").collect();
      for (const row of prior) await ctx.db.delete(row._id);
      await ctx.db.insert("shuttleSnapshots", {
        singletonKey: "latest", fetchedAt: now, noticesFetchedAt: now, vehicles: [], stopEtas: [],
        shuttleNotices: [{ noticeId: "n1", title: "Detour on Campus Loop", body: "Stop moved", passioRouteIds: [] }],
      });
    });
    const pulse = await t.query(internal.scrappy.tools.getCampusDailyPulse, { sessionToken, campus: "Kennesaw" });
    expect(pulse.shuttleNotices).toEqual([expect.objectContaining({ source: "Shuttle Notice · Passio" })]);
    expect(pulse.citations).toContainEqual(expect.objectContaining({ entityType: "shuttle_notice", label: "Shuttle Notice · Passio" }));
    expect(JSON.stringify(pulse)).not.toMatch(/alert/i);
  });

  it("a queued mention that reaches the action with a safety prompt gets the card without tools or a model", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "gate_queued", displayName: "Gate Queued" });
    const { postId } = await t.mutation(api.feed.createPost, { sessionToken: author.sessionToken, body: "@scrappy Parking check?" });
    const thread = await t.query(api.feed.getPostThread, { sessionToken: author.sessionToken, postId });
    const replyId = thread!.replies[0]!._id;
    // Simulate an edited/legacy trigger whose text is now a safety question.
    await t.run((ctx) => ctx.db.patch(postId, { body: "@scrappy is there a lockdown?" }));

    await t.action(internal.scrappy.mentions.executeFeedMentionAction, { replyPostId: replyId, triggerPostId: postId });
    const reply = await t.run((ctx) => ctx.db.get(replyId));
    expect(reply).toMatchObject({ body: SAFETY_CARD_COPY, scrappyStatus: "ready", scrappyToolMeta: "safety_card" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
