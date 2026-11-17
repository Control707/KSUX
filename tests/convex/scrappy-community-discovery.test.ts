import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

afterEach(() => vi.unstubAllEnvs());

async function seedRoboticsClub() {
  for (const key of ["GROQ_API_KEY", "GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) {
    vi.stubEnv(key, "");
  }
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "club_discovery", displayName: "Club Discovery" });
  await t.run((ctx) => ctx.db.insert("clubs", {
    workspaceKey: "ksu", slug: "robotics", clubKind: "registered_ksu", campus: "Kennesaw",
    name: "Robotics Club", summary: "Build robots together", description: "Build robots together",
    searchText: "Robotics Club Build robots together", prodMemberCount: 0, visibilityStatus: "visible",
  }));
  const start = Date.now() + 3_600_000;
  await t.run((ctx) => ctx.db.insert("events", {
    workspaceKey: "ksu", source: "localist", campus: "Kennesaw", campusScope: "Kennesaw", isVirtual: false,
    title: "Robotics Showcase", description: "Demo night", searchText: "Robotics Showcase Kennesaw",
    locationName: "Student Center", startTime: start, endTime: start + 7_200_000,
    status: "scheduled", visibilityStatus: "visible", prodGoingCount: 0, prodInterestedCount: 0,
  }));
  return { t, sessionToken: student.sessionToken };
}

describe("Scrappy Club and Event discovery questions", () => {
  it.each([
    "What clubs can I join?",
    "What events are happening today?",
  ])("grounds the generic question %j in available Clubs and Events", async (prompt) => {
    const { t, sessionToken } = await seedRoboticsClub();
    const answer = await t.action(api.scrappy.threads.askScrappyAction, { sessionToken, prompt });
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.content).not.toContain("couldn't find matching KSU data");
  });

  it("still narrows when the question names a specific Club", async () => {
    const { t, sessionToken } = await seedRoboticsClub();
    const hit = await t.action(api.scrappy.threads.askScrappyAction, {
      sessionToken, prompt: "What clubs can I join about robotics?",
    });
    expect(hit.content).toContain("Robotics Club");
    const miss = await t.action(api.scrappy.threads.askScrappyAction, {
      sessionToken, prompt: "Is there a chess club I can join?",
    });
    expect(miss.content).not.toContain("Robotics Club");
  });
});
