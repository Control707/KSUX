import { expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

it("keeps KSU-wide reads stable when a Student switches location and defaults new Posts to home Campus", async () => {
  const t = createTestConvex();
  const student = await createVerifiedTestStudent(t, { handle: "home_kennesaw", displayName: "Home Kennesaw", homeCampus: "Kennesaw" });
  const reader = { sessionToken: student.sessionToken };
  for (const campus of ["Kennesaw", "Marietta"] as const) {
    await t.mutation(api.feed.createPost, { ...reader, campus, body: campus + " study plans #" + campus.toLowerCase() });
    await t.mutation(api.marketplace.createListing, {
      ...reader, campus, title: campus + " calculator", description: "Used engineering calculator",
      pricingMode: "fixed_obo", category: "electronics", priceCents: 1000,
    });
    await t.mutation(api.communities.createCommunityClub, {
      ...reader, campus, name: campus + " Running", summary: "Weekly runs", description: "Meet on campus for weekly runs",
    });
  }

  const read = async () => ({
    feed: await t.query(api.feed.listCampusOrTrendingFeed, { ...reader, stream: "campus", paginationOpts: { numItems: 10, cursor: null } }),
    trending: (await t.query(api.feed.listFeedRingsAndTrends, reader)).topTrendingTags,
    marketplace: await t.query(api.marketplace.listListings, reader),
    clubs: await t.query(api.communities.listClubs, reader),
  });
  const before = await read();
  expect(before.feed.page.map(({ campus }) => campus).sort()).toEqual(["Kennesaw", "Marietta"]);
  expect(before.trending.map(({ tag }) => tag).sort()).toEqual(["kennesaw", "marietta"]);
  expect(before.marketplace.map(({ campus }) => campus)).toEqual(["Kennesaw", "Marietta"]);
  expect(before.clubs.map(({ campus }) => campus).sort()).toEqual(["Kennesaw", "Marietta"]);

  await t.mutation(api.shell.setCampusFilter, { ...reader, campusFilter: "Marietta" });
  expect(await read()).toEqual(before);
  expect((await t.query(api.shell.getNowHud, reader)).campusFilter).toBe("Marietta");

  const explicitlyLocal = { ...reader, campusOverride: "Marietta" as const };
  expect((await t.query(api.marketplace.listListings, explicitlyLocal)).map(({ campus }) => campus)).toEqual(["Marietta"]);
  expect((await t.query(api.communities.listClubs, explicitlyLocal)).map(({ campus }) => campus)).toEqual(["Marietta"]);
  const created = await t.mutation(api.feed.createPost, { ...reader, body: "Default to my home Campus." });
  expect(await t.run((ctx) => ctx.db.get(created.postId))).toMatchObject({ campus: "Kennesaw" });
});