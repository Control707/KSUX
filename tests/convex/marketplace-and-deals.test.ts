import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

describe("Seam 1 — Peer-to-Peer Marketplace Listings, Isolated Deal Chats & Meetup Handoffs (#24)", () => {
  beforeEach(() => {
    process.env.KSUX_SKIP_PUSH_SCHEDULER = "true";
    process.env.KSUX_SKIP_STORAGE_SCHEDULER = "true";
  });

  it("isolates Deal Chats per (Listing, primaryBuyer), rejects blocked co-party invites, flags Zelle/Venmo scam keywords, enforces seller-only Pending/Sold, and caps buyer-confirmed trust increments at 1/7d per pair", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.bootstrapKsu, {});

    const seller = await createVerifiedTestStudent(t, {
      handle: "seller_alex",
      displayName: "Alex Seller",
      homeCampus: "Kennesaw",
    });
    const buyerA = await createVerifiedTestStudent(t, {
      handle: "buyer_maya",
      displayName: "Maya Buyer",
      homeCampus: "Kennesaw",
    });
    const buyerB = await createVerifiedTestStudent(t, {
      handle: "buyer_rival",
      displayName: "Rival Buyer",
      homeCampus: "Kennesaw",
    });
    const _roommate = await createVerifiedTestStudent(t, {
      handle: "roommate_helper",
      displayName: "Roommate Helper",
    });
    const blockedHelper = await createVerifiedTestStudent(t, {
      handle: "blocked_helper",
      displayName: "Blocked Helper",
    });

    const baseNow = Date.now();

    // Seller creates a Listing
    const created = await t.mutation(api.marketplace.createListing, {
      sessionToken: seller.sessionToken,
      title: "iPad Air M2 + Apple Pencil",
      description: "Clean screen, includes case. Meet on Kennesaw Campus.",
      campus: "Kennesaw",
      category: "electronics",
      pricingMode: "fixed_obo",
      priceCents: 38000,
      nowOverride: baseNow,
    });

    // Self-dealing on own Listing is rejected
    await expect(
      t.mutation(api.marketplace.openOrResumeDealChat, {
        sessionToken: seller.sessionToken,
        listingId: created.listingId,
      })
    ).rejects.toThrowError(/own Listing/);

    // Buyer A and Buyer B open strictly isolated Deal Chats
    const dealA = await t.mutation(api.marketplace.openOrResumeDealChat, {
      sessionToken: buyerA.sessionToken,
      listingId: created.listingId,
      openerMessage: "Hi Alex! Would you take $350 cash today?",
    });
    const dealB = await t.mutation(api.marketplace.openOrResumeDealChat, {
      sessionToken: buyerB.sessionToken,
      listingId: created.listingId,
      openerMessage: "Offering $360 tomorrow afternoon.",
    });
    expect(dealA.chatId).not.toBe(dealB.chatId);

    // Rival Buyer B CANNOT read Buyer A's Deal Chat!
    await expect(
      t.query(api.chats.getChatThread, {
        sessionToken: buyerB.sessionToken,
        chatId: dealA.chatId,
      })
    ).rejects.toThrowError(/not a participant/);

    // Scam keyword detection inside Deal Chat ("Zelle deposit")
    const scamMsg = await t.mutation(api.chats.sendMessage, {
      sessionToken: buyerB.sessionToken,
      chatId: dealB.chatId,
      body: "Can I send a Zelle deposit right now to hold it?",
    });
    expect(scamMsg.scamWarningTriggered).toBe(true);

    // Co-party invite: Seller blocks blockedHelper -> Buyer A inviting blockedHelper is rejected!
    await t.mutation(api.moderation.toggleBlockStudent, {
      sessionToken: seller.sessionToken,
      targetStudentId: blockedHelper.studentId,
    });
    await expect(
      t.mutation(api.marketplace.inviteDealCoParty, {
        sessionToken: buyerA.sessionToken,
        chatId: dealA.chatId,
        inviteHandle: "blocked_helper",
      })
    ).rejects.toThrowError(/mutual Block/);

    // Unblocked roommate invite succeeds (3/6 participants)
    const invited = await t.mutation(api.marketplace.inviteDealCoParty, {
      sessionToken: buyerA.sessionToken,
      chatId: dealA.chatId,
      inviteHandle: "roommate_helper",
    });
    expect(invited.memberCount).toBe(3);

    // Propose & Confirm Meetup Spot Handoff Card
    const spots = await t.query(api.marketplace.listMeetupSpots, {
      sessionToken: seller.sessionToken,
      campus: "Kennesaw",
    });
    expect(spots).toHaveLength(7);

    await t.mutation(api.marketplace.proposeOrUpdateHandoffCard, {
      sessionToken: seller.sessionToken,
      chatId: dealA.chatId,
      meetupSpotId: spots[0]!._id,
      proposedWindow: "Today 3:00 PM",
      agreedTerms: "$350 cash after testing Pencil",
    });

    const confirmedMeetup = await t.mutation(
      api.marketplace.confirmHandoffMeetup,
      {
        sessionToken: buyerA.sessionToken,
        chatId: dealA.chatId,
      }
    );
    expect(confirmedMeetup.status).toBe("confirmed");

    // Buyer CANNOT transition Listing to Pending or Sold (strictly seller-only!)
    await expect(
      t.mutation(api.marketplace.transitionListingStatus, {
        sessionToken: buyerA.sessionToken,
        listingId: created.listingId,
        nextStatus: "sold",
        dealChatId: dealA.chatId,
      })
    ).rejects.toThrowError(/Only the primary Listing seller/);

    // Seller marks Pending on dealA -> rival dealB receives privacy-safe system notice WITHOUT leaking @buyer_maya!
    await t.mutation(api.marketplace.transitionListingStatus, {
      sessionToken: seller.sessionToken,
      listingId: created.listingId,
      nextStatus: "pending",
      dealChatId: dealA.chatId,
    });

    const threadB = await t.query(api.chats.getChatThread, {
      sessionToken: buyerB.sessionToken,
      chatId: dealB.chatId,
    });
    const lastB = threadB!.messages[threadB!.messages.length - 1]!;
    expect(lastB.body).toContain("Pending");
    expect(lastB.body).not.toContain("buyer_maya");

    // Seller marks Sold to dealA -> completedDealCount is STILL 0 until primaryBuyer confirms pickup!
    await t.mutation(api.marketplace.transitionListingStatus, {
      sessionToken: seller.sessionToken,
      listingId: created.listingId,
      nextStatus: "sold",
      dealChatId: dealA.chatId,
    });

    const sellerBeforeConfirm = await t.query(api.students.getProfile, {
      sessionToken: seller.sessionToken,
    });
    expect(sellerBeforeConfirm?.student.completedDealCount).toBe(0);

    // Primary Buyer taps Confirm Pickup -> increments BOTH seller & buyer completedDealCount to 1!
    const pickup1 = await t.mutation(api.marketplace.confirmBuyerPickup, {
      sessionToken: buyerA.sessionToken,
      chatId: dealA.chatId,
      nowOverride: baseNow + 600_000,
    });
    expect(pickup1.trustIncremented).toBe(true);

    const sellerAfter1 = await t.query(api.students.getProfile, {
      sessionToken: seller.sessionToken,
    });
    const buyerAfter1 = await t.query(api.students.getProfile, {
      sessionToken: buyerA.sessionToken,
    });
    expect(sellerAfter1?.student.completedDealCount).toBe(1);
    expect(buyerAfter1?.student.completedDealCount).toBe(1);

    // 2nd deal between the SAME (seller, buyerA) pair within 7 days completes cleanly WITHOUT inflating trust count!
    const secondListing = await t.mutation(api.marketplace.createListing, {
      sessionToken: seller.sessionToken,
      title: "USB-C Dongle",
      description: "Extra adapter",
      campus: "Kennesaw",
      category: "electronics",
      pricingMode: "free_pickup",
      nowOverride: baseNow + 700_000,
    });
    const secondDeal = await t.mutation(api.marketplace.openOrResumeDealChat, {
      sessionToken: buyerA.sessionToken,
      listingId: secondListing.listingId,
    });
    await t.mutation(api.marketplace.transitionListingStatus, {
      sessionToken: seller.sessionToken,
      listingId: secondListing.listingId,
      nextStatus: "sold",
      dealChatId: secondDeal.chatId,
    });
    const pickup2 = await t.mutation(api.marketplace.confirmBuyerPickup, {
      sessionToken: buyerA.sessionToken,
      chatId: secondDeal.chatId,
      nowOverride: baseNow + 86_400_000, // 1 day later (< 7 days!)
    });
    expect(pickup2.trustIncremented).toBe(false);

    const sellerAfter2 = await t.query(api.students.getProfile, {
      sessionToken: seller.sessionToken,
    });
    expect(sellerAfter2?.student.completedDealCount).toBe(1);
  });
});
