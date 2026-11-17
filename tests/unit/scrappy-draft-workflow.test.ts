// @vitest-environment node
import { describe, expect, it } from "vitest";
import { maybeBuildClientDraftCard } from "../../convex/scrappy/router";

describe("Scrappy's client-confirmed drafts", () => {
  it("does not create a draft for a question about existing campus data", () => {
    expect(maybeBuildClientDraftCard("Where are study rooms open today?")).toBeNull();
    expect(maybeBuildClientDraftCard("What textbooks are available on Marketplace?")).toBeNull();
  });

  it("passes the requested text to the Feed composer for review", () => {
    const draft = maybeBuildClientDraftCard("Draft a post saying Robotics Club meets on Thursday.");

    expect(draft?.draftKind).toBe("post");
    expect(JSON.parse(draft!.payloadJson)).toEqual({ body: "Robotics Club meets on Thursday." });
  });

  it("prefills a requested price other than the demo example price", () => {
    const draft = maybeBuildClientDraftCard("Draft a Listing to sell my calculator for $25");
    expect(draft?.draftKind).toBe("listing");

    expect(JSON.parse(draft!.payloadJson)).toMatchObject({ priceDollars: 25 });
  });

  it("prefills the explicitly requested Parking Lot", () => {
    const draft = maybeBuildClientDraftCard("Draft a Parking Report for East Parking Deck");
    expect(draft?.draftKind).toBe("parking_report");

    expect(JSON.parse(draft!.payloadJson)).toMatchObject({ lotSlug: "east-parking-deck" });
  });

  it("leaves unmentioned and ambiguous details for the student to select", () => {
    const listing = maybeBuildClientDraftCard("Draft a Listing to sell my calculator");
    const parking = maybeBuildClientDraftCard("Draft a Parking Report for either East Parking Deck or Central Parking Deck");

    expect(JSON.parse(listing!.payloadJson)).not.toHaveProperty("priceDollars");
    expect(JSON.parse(parking!.payloadJson)).not.toHaveProperty("lotSlug");
  });
});
