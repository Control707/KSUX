import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

const DAY_MS = 86_400_000;

describe("Marketplace workflow regressions", () => {
  beforeEach(() => {
    vi.stubEnv("KSUX_SKIP_PUSH_SCHEDULER", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function setupMarketplace() {
    const t = createTestConvex();
    const seller = await createVerifiedTestStudent(t, {
      handle: "regression_seller",
      displayName: "Regression Seller",
    });
    const buyer = await createVerifiedTestStudent(t, {
      handle: "regression_buyer",
      displayName: "Regression Buyer",
    });
    const sellerAuth = { sessionToken: seller.sessionToken };
    const buyerAuth = { sessionToken: buyer.sessionToken };
    const listingDetails = {
      ...sellerAuth,
      campus: "Kennesaw",
      category: "textbooks_gear",
      pricingMode: "free_pickup",
      title: "Intro to Biology study guide",
      description: "Good condition, kept in a folder.",
    } as const;
    return { t, sellerAuth, buyerAuth, listingDetails };
  }

  it("returns matching All KSU Listings when newer rows belong to other categories", async () => {
    const { t, buyerAuth, listingDetails } = await setupMarketplace();
    const now = Date.now();
    const matching = await t.mutation(api.marketplace.createListing, {
      ...listingDetails,
      nowOverride: now - 3000,
    });
    for (const [i, title] of ["USB cable", "Spare keyboard"].entries()) {
      await t.mutation(api.marketplace.createListing, {
        ...listingDetails,
        category: "electronics",
        title,
        nowOverride: now - 2000 + i * 1000,
      });
    }

    const results = await t.query(api.marketplace.listListings, {
      ...buyerAuth,
      campusOverride: "All KSU",
      category: "textbooks_gear",
      limit: 2,
    });
    expect(results.map((listing) => listing._id)).toEqual([matching.listingId]);
  });

  it("prevents renewing an expired Listing when the seller already has fifteen active Listings", async () => {
    const { t, sellerAuth, listingDetails } = await setupMarketplace();
    const now = Date.now();
    const expired = await t.mutation(api.marketplace.createListing, {
      ...listingDetails,
      nowOverride: now - 31 * DAY_MS,
    });
    for (let i = 0; i < 15; i++) {
      await t.mutation(api.marketplace.createListing, {
        ...listingDetails,
        title: `Study guide copy ${i + 1}`,
        nowOverride: now,
      });
    }
    const active = await t.query(api.marketplace.listListings, sellerAuth);
    expect(active).toHaveLength(15);

    await expect(t.mutation(api.marketplace.renewListing, {
      ...sellerAuth,
      listingId: expired.listingId,
    })).rejects.toThrow(/capped at 15/);
  });

  it("stops new Deal Chats once a Listing expires even before hourly cleanup", async () => {
    const { t, buyerAuth, listingDetails } = await setupMarketplace();
    const { listingId } = await t.mutation(api.marketplace.createListing, {
      ...listingDetails,
      nowOverride: Date.now() - 31 * DAY_MS,
    });

    expect(await t.query(api.marketplace.listListings, buyerAuth)).toEqual([]);
    await expect(t.mutation(api.marketplace.openOrResumeDealChat, {
      ...buyerAuth,
      listingId,
    })).rejects.toThrow(/no longer accepting new Deal Chats/);
  });

  it("keeps repeat Meetup confirmation from adding another message or unread notification", async () => {
    const { t, sellerAuth, buyerAuth, listingDetails } = await setupMarketplace();
    await t.mutation(internal.seed.bootstrapKsu, {});
    const { listingId } = await t.mutation(api.marketplace.createListing, listingDetails);
    const { chatId } = await t.mutation(api.marketplace.openOrResumeDealChat, {
      ...buyerAuth,
      listingId,
    });
    const spots = await t.query(api.marketplace.listMeetupSpots, {
      ...sellerAuth,
      campus: "Kennesaw",
    });
    expect(spots.length).toBeGreaterThan(0);
    await t.mutation(api.marketplace.proposeOrUpdateHandoffCard, {
      ...sellerAuth,
      chatId,
      meetupSpotId: spots[0]!._id,
      proposedWindow: "Tomorrow at noon",
      agreedTerms: "Free pickup at the library",
    });
    const confirmation = { ...buyerAuth, chatId };
    expect(await t.mutation(api.marketplace.confirmHandoffMeetup, confirmation)).toEqual({
      status: "confirmed",
    });
    const beforeRetry = await t.query(api.chats.getChatThread, { ...sellerAuth, chatId });
    await t.mutation(api.chats.markChatRead, { ...sellerAuth, chatId });

    expect(await t.mutation(api.marketplace.confirmHandoffMeetup, confirmation)).toEqual({
      status: "confirmed",
    });
    const afterRetry = await t.query(api.chats.getChatThread, { ...sellerAuth, chatId });
    const inbox = await t.query(api.chats.listInbox, { ...sellerAuth, tabFilter: "deal" });
    expect({ messageSeq: afterRetry?.chat.messageSeq, unread: inbox[0]?.unreadCount }).toEqual({
      messageSeq: beforeRetry?.chat.messageSeq,
      unread: 0,
    });
  });

  it("keeps pickup confirmation and trust credit idempotent for one Listing", async () => {
    const { t, sellerAuth, buyerAuth, listingDetails } = await setupMarketplace();
    const { listingId } = await t.mutation(api.marketplace.createListing, listingDetails);
    const { chatId } = await t.mutation(api.marketplace.openOrResumeDealChat, {
      ...buyerAuth,
      listingId,
    });
    await t.mutation(api.marketplace.transitionListingStatus, {
      ...sellerAuth,
      listingId,
      nextStatus: "sold",
      dealChatId: chatId,
    });
    await expect(t.mutation(api.marketplace.confirmBuyerPickup, { ...buyerAuth, chatId })).resolves.toEqual({
      ok: true,
      trustIncremented: true,
    });
    await expect(t.mutation(api.marketplace.confirmBuyerPickup, { ...buyerAuth, chatId })).resolves.toEqual({
      ok: true,
      trustIncremented: false,
    });

    for (const auth of [sellerAuth, buyerAuth]) {
      const profile = await t.query(api.students.getProfile, auth);
      expect(profile?.student.completedDealCount).toBe(1);
    }
    const thread = await t.query(api.chats.getChatThread, { ...sellerAuth, chatId });
    expect(thread?.messages.filter((message) => message.body.includes("Pickup confirmed"))).toHaveLength(1);
  });
});
