import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "../../convex/_generated/api";
import { createTestConvex, createVerifiedTestStudent } from "../helpers/convexTestEnv";

const HOUR = 3600_000;

async function seedCampuses(t: ReturnType<typeof createTestConvex>, student: { sessionToken: string }) {
  const author = { sessionToken: student.sessionToken };
  const ids: Record<string, string> = {};
  for (const campus of ["Kennesaw", "Marietta"] as const) {
    const { listingId } = await t.mutation(api.marketplace.createListing, {
      ...author, campus, title: campus + " robotics kit", description: "Arduino robotics kit",
      pricingMode: "fixed_obo", category: "electronics", priceCents: 2500,
    });
    ids["listing" + campus] = listingId;
    const club = await t.mutation(api.communities.createCommunityClub, {
      ...author, campus, name: campus + " Robotics Society", summary: "Build robots", description: "Weekly robotics builds",
    });
    ids["club" + campus] = club.slug;
    const { eventId } = await t.mutation(api.communities.createNativeEvent, {
      ...author, campus, title: campus + " robotics night", description: "Robotics demo night", isVirtual: false,
      locationName: "Atrium", startTime: Date.now() + HOUR, endTime: Date.now() + 2 * HOUR,
    });
    ids["event" + campus] = eventId;
  }
  return ids;
}

describe("campus-wide search", () => {
  it("groups Events, Clubs and Listings KSU-wide, ignoring the location setting, and narrows only by an explicit Campus", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "robot_maker", displayName: "Robot Maker" });
    const reader = await createVerifiedTestStudent(t, { handle: "robot_reader", displayName: "Robot Reader" });
    await seedCampuses(t, author);
    const auth = { sessionToken: reader.sessionToken };

    await t.mutation(api.shell.setCampusFilter, { ...auth, campusFilter: "Marietta" });
    const all = await t.query(api.search.searchCampus, { ...auth, queryText: "robotics" });
    expect(all.events.map((e) => e.campus).sort()).toEqual(["Kennesaw", "Marietta"]);
    expect(all.clubs.map((c) => c.campus).sort()).toEqual(["Kennesaw", "Marietta"]);
    expect(all.listings.map((l) => l.campus).sort()).toEqual(["Kennesaw", "Marietta"]);
    expect(all.clubs[0]).toHaveProperty("slug");

    const kennesaw = await t.query(api.search.searchCampus, { ...auth, queryText: "robotics", campus: "Kennesaw" });
    expect(kennesaw.events.map((e) => e.campus)).toEqual(["Kennesaw"]);
    expect(kennesaw.clubs.map((c) => c.campus)).toEqual(["Kennesaw"]);
    expect(kennesaw.listings.map((l) => l.campus)).toEqual(["Kennesaw"]);

    const tooShort = await t.query(api.search.searchCampus, { ...auth, queryText: " r " });
    expect(tooShort).toEqual({ events: [], clubs: [], courseHubs: [], listings: [] });
  });

  it("applies Block, Report-hide and expiry filters like the source screens", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "seller_owl", displayName: "Seller Owl" });
    const other = await createVerifiedTestStudent(t, { handle: "other_owl", displayName: "Other Owl" });
    const reader = await createVerifiedTestStudent(t, { handle: "search_owl", displayName: "Search Owl" });
    const ids = await seedCampuses(t, author);
    const auth = { sessionToken: reader.sessionToken };

    const { listingId: expiring } = await t.mutation(api.marketplace.createListing, {
      sessionToken: other.sessionToken, campus: "Kennesaw", title: "Old robotics manual", description: "Robotics manual",
      pricingMode: "free_pickup", category: "electronics",
    });
    await t.run(async (ctx) => { await ctx.db.patch(expiring as any, { expiresAt: Date.now() - 1 }); });
    expect((await t.query(api.search.searchCampus, { ...auth, queryText: "robotics" })).listings.map((l) => l._id))
      .not.toContain(expiring);

    await t.mutation(api.moderation.submitReport, {
      ...auth, targetType: "listing", targetId: ids.listingKennesaw!, reason: "scam_spam",
    });
    const afterReport = await t.query(api.search.searchCampus, { ...auth, queryText: "robotics" });
    expect(afterReport.listings.map((l) => l._id)).toEqual([ids.listingMarietta]);

    await t.mutation(api.moderation.toggleBlockStudent, { ...auth, targetStudentId: author.studentId });
    const afterBlock = await t.query(api.search.searchCampus, { ...auth, queryText: "robotics" });
    expect(afterBlock.listings).toEqual([]);
    expect(afterBlock.events).toEqual([]);
  });

  it("keeps Judge Demo workspaces isolated from prod content", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "prod_maker", displayName: "Prod Maker" });
    await seedCampuses(t, author);
    const demo = await t.mutation(api.demo.session.provisionOrAttachDemoSession, {});
    const demoAuth = { demoShortCode: demo.shortCode, demoPersonaHandle: "maya_cs" };
    const results = await t.query(api.search.searchCampus, { ...demoAuth, queryText: "robotics" });
    expect(results.listings.filter((l) => l.title.includes("robotics kit"))).toEqual([]);
    expect(results.clubs.filter((c) => c.name.includes("Robotics Society"))).toEqual([]);
    expect(results.events.filter((e) => e.title.includes("robotics night"))).toEqual([]);
  });

  it("never reads Incidents, Incident Updates or Alerts (ADR-0009)", () => {
    const source = readFileSync(new URL("../../convex/search.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/["'](incidents|incidentUpdates|alertItems|alertSources)["']/);
  });
});

describe("saved items", () => {
  it("lists bookmarked Posts and Listings, filters by type, and removes bookmarks", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "poster_owl", displayName: "Poster Owl" });
    const saver = await createVerifiedTestStudent(t, { handle: "saver_owl", displayName: "Saver Owl" });
    const auth = { sessionToken: saver.sessionToken };
    const { postId } = await t.mutation(api.feed.createPost, { sessionToken: author.sessionToken, body: "Best study spots on campus" });
    const { listingId } = await t.mutation(api.marketplace.createListing, {
      sessionToken: author.sessionToken, campus: "Marietta", title: "Drafting table", description: "Sturdy drafting table",
      pricingMode: "fixed_obo", category: "dorm_furniture", priceCents: 4000,
    });
    await t.mutation(api.feed.togglePostInteraction, { ...auth, postId, kind: "post_bookmark" });
    await t.mutation(api.feed.togglePostInteraction, { ...auth, postId, kind: "post_like" });
    await t.mutation(api.marketplace.toggleListingBookmark, { ...auth, listingId });

    const all = await t.query(api.search.listSavedItems, auth);
    expect(all.map((item) => item.kind).sort()).toEqual(["listing", "post"]);
    const post = all.find((item) => item.kind === "post")!;
    expect(post).toMatchObject({ available: true, postId, body: "Best study spots on campus", campus: "Kennesaw" });
    expect(all.find((item) => item.kind === "listing")).toMatchObject({ available: true, listingId, title: "Drafting table", campus: "Marietta" });

    expect((await t.query(api.search.listSavedItems, { ...auth, type: "listings" })).map((i) => i.kind)).toEqual(["listing"]);
    expect((await t.query(api.search.listSavedItems, { ...auth, type: "posts" })).map((i) => i.kind)).toEqual(["post"]);

    const listingItem = all.find((item) => item.kind === "listing")!;
    await t.mutation(api.search.removeSavedItem, { ...auth, savedId: listingItem.savedId });
    expect((await t.query(api.search.listSavedItems, auth)).map((i) => i.kind)).toEqual(["post"]);
    expect(await t.run((ctx) => ctx.db.get(listingId))).toMatchObject({ bookmarkCount: 0 });
    // Another Student cannot remove someone else's bookmark.
    await expect(t.mutation(api.search.removeSavedItem, { sessionToken: author.sessionToken, savedId: post.savedId }))
      .rejects.toThrow();
  });

  it("shows deleted, hidden, blocked and ended items as unavailable without their content, and still lets them be removed", async () => {
    const t = createTestConvex();
    const author = await createVerifiedTestStudent(t, { handle: "gone_owl", displayName: "Gone Owl" });
    const saver = await createVerifiedTestStudent(t, { handle: "keeper_owl", displayName: "Keeper Owl" });
    const auth = { sessionToken: saver.sessionToken };
    const { postId } = await t.mutation(api.feed.createPost, { sessionToken: author.sessionToken, body: "Secret meetup spot" });
    const { listingId } = await t.mutation(api.marketplace.createListing, {
      sessionToken: author.sessionToken, campus: "Kennesaw", title: "Hidden calculator", description: "Calculator",
      pricingMode: "fixed_obo", category: "electronics", priceCents: 1000,
    });
    await t.mutation(api.feed.togglePostInteraction, { ...auth, postId, kind: "post_bookmark" });
    await t.mutation(api.marketplace.toggleListingBookmark, { ...auth, listingId });

    await t.run(async (ctx) => { await ctx.db.patch(listingId, { expiresAt: Date.now() - 1 }); });
    let items = await t.query(api.search.listSavedItems, auth);
    expect(items.find((i) => i.kind === "listing")).toMatchObject({ available: false, reason: "ended" });

    await t.mutation(api.moderation.toggleBlockStudent, { ...auth, targetStudentId: author.studentId });
    items = await t.query(api.search.listSavedItems, auth);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toMatchObject({ available: false, reason: "unavailable" });
      expect(JSON.stringify(item)).not.toMatch(/Secret meetup|Hidden calculator|gone_owl/);
    }
    await t.mutation(api.moderation.toggleBlockStudent, { ...auth, targetStudentId: author.studentId });

    await t.mutation(api.feed.deletePost, { sessionToken: author.sessionToken, postId });
    items = await t.query(api.search.listSavedItems, { ...auth, type: "posts" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ available: false, reason: "unavailable" });
    expect(JSON.stringify(items[0])).not.toMatch(/Secret meetup/);

    await t.mutation(api.search.removeSavedItem, { ...auth, savedId: items[0]!.savedId });
    expect(await t.query(api.search.listSavedItems, { ...auth, type: "posts" })).toEqual([]);
  });
});
