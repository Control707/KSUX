"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import {
  CampusPlace,
  filterMeetupSpots,
  loadCampusPlaces,
} from "@/lib/campusPlaces";

export function DealHandoffPanel({ thread }: { thread: any }) {
  const { chat, listing, myMembership } = thread;
  const defaultCampus: "Kennesaw" | "Marietta" =
    listing?.campus ?? "Kennesaw";
  const [spotCampus, setSpotCampus] = useState<"Kennesaw" | "Marietta">(
    defaultCampus
  );
  const [proposeOpen, setProposeOpen] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string>("");
  const [proposedWindow, setProposedWindow] = useState(
    "Today · 3:00 PM – 3:15 PM"
  );
  const [agreedTerms, setAgreedTerms] = useState("Cash in person after check");
  const [coPartyHandle, setCoPartyHandle] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const spots = useViewerQuery(api.marketplace.listMeetupSpots, {
    campus: spotCampus,
  });

  const [spotQuery, setSpotQuery] = useState("");
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadCampusPlaces()
      .then((loaded) => {
        if (!cancelled) setPlaces(loaded);
      })
      .catch(() => {
        // Offline before the GeoJSON cache is warm: name search still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const visibleSpots = useMemo(
    () => filterMeetupSpots(spots ?? [], spotQuery, places),
    [spots, spotQuery, places]
  );

  const proposeCard = useViewerMutation(
    api.marketplace.proposeOrUpdateHandoffCard
  );
  const confirmMeetup = useViewerMutation(
    api.marketplace.confirmHandoffMeetup
  );
  const transitionStatus = useViewerMutation(
    api.marketplace.transitionListingStatus
  );
  const confirmPickup = useViewerMutation(api.marketplace.confirmBuyerPickup);
  const inviteCoParty = useViewerMutation(api.marketplace.inviteDealCoParty);

  const isPrimarySeller = myMembership?.role === "primary_seller";
  const isPrimaryBuyer = myMembership?.role === "primary_buyer";
  const card = chat.handoffCard;

  return (
    <div
      data-testid="deal-handoff-card"
      className="space-y-3 rounded-2xl border-2 border-[#FDBB30] bg-[#FFFDF7] p-4 shadow-xs"
    >
      {/* Listing Summary + Seller Lifecycle Controls */}
      {listing && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E7EE] pb-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-black text-[#111317]">{listing.title}</span>
              <span
                data-testid="deal-listing-status-badge"
                className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase ${
                  listing.status === "sold"
                    ? "bg-[#111317] text-[#FDBB30]"
                    : listing.status === "pending"
                      ? "bg-[#FEF3C7] text-[#B45309]"
                      : "bg-[#DCFCE7] text-[#15803D]"
                }`}
              >
                {listing.status}
              </span>
              {listing.buyerConfirmedPickup && (
                <span
                  data-testid="pickup-confirmed-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[10.5px] font-extrabold text-[#15803D]"
                >
                  <Award className="h-3 w-3" />
                  Pickup Confirmed ✓
                </span>
              )}
            </div>
          </div>

          {isPrimarySeller && listing.status !== "sold" && (
            <div className="flex flex-wrap gap-1.5">
              {listing.status !== "pending" ? (
                <button
                  type="button"
                  data-testid="seller-mark-pending-btn"
                  onClick={async () => {
                    await transitionStatus({
                      listingId: listing._id,
                      nextStatus: "pending",
                      dealChatId: chat._id,
                    });
                    setBanner("Marked Listing Pending for this Deal Chat.");
                  }}
                  className="rounded-xl bg-[#FEF3C7] px-3 py-1.5 text-xs font-extrabold text-[#92400E]"
                >
                  Mark Pending
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await transitionStatus({
                      listingId: listing._id,
                      nextStatus: "available",
                    });
                    setBanner("Reopened Listing as Available.");
                  }}
                  className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-1.5 text-xs font-bold text-[#5E6675]"
                >
                  Reopen Available
                </button>
              )}

              <button
                type="button"
                data-testid="seller-mark-sold-btn"
                onClick={async () => {
                  await transitionStatus({
                    listingId: listing._id,
                    nextStatus: "sold",
                    dealChatId: chat._id,
                  });
                  setBanner(
                    "Marked Listing Sold! Waiting on buyer Confirm Pickup."
                  );
                }}
                className="rounded-xl bg-[#111317] px-3 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Mark Sold
              </button>
            </div>
          )}

          {isPrimaryBuyer &&
            listing.status === "sold" &&
            listing.soldDealChatId === chat._id &&
            !listing.buyerConfirmedPickup && (
              <button
                type="button"
                data-testid="buyer-confirm-pickup-btn"
                onClick={async () => {
                  await confirmPickup({ chatId: chat._id });
                  setBanner("Pickup confirmed! Completed handoff trust updated.");
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-[#15803D] px-3.5 py-1.5 text-xs font-extrabold text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Confirm Pickup</span>
              </button>
            )}
        </div>
      )}

      {/* Pinned Meetup Spot Handoff Card */}
      {card ? (
        <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 font-extrabold text-[#111317]">
              <MapPin className="h-4 w-4 text-[#D99B00]" />
              <span>
                Meetup Spot: {card.meetupSpotName} ({card.meetupCampus})
              </span>
              <span
                data-testid="handoff-card-status"
                className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] uppercase text-[#15803D]"
              >
                {card.status}
              </span>
            </div>
            <p className="mt-0.5 text-[#374151]">
              <strong>Window:</strong> {card.proposedWindow} ·{" "}
              <strong>Terms:</strong> {card.agreedTerms}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5E6675]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#15803D]" />
              <span>{card.safetyNotes}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {card.status === "proposed" && (
              <button
                type="button"
                data-testid="confirm-meetup-btn"
                onClick={async () => {
                  await confirmMeetup({ chatId: chat._id });
                  setBanner("Meetup Spot confirmed!");
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-[#15803D] px-3 py-1.5 font-extrabold text-white"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Confirm Meetup</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setProposeOpen((v) => !v)}
              className="rounded-xl border border-[#E4E7EE] bg-white px-2.5 py-1.5 font-bold text-[#111317]"
            >
              Update Spot
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#5E6675]">
            No KSU Meetup Spot pinned yet. Pick one of 14 well-lit public
            landmarks.
          </span>
          <button
            type="button"
            onClick={() => setProposeOpen(true)}
            className="rounded-xl bg-[#111317] px-3 py-1.5 font-extrabold text-[#FDBB30]"
          >
            + Propose Meetup Spot
          </button>
        </div>
      )}

      {/* Propose / Update Meetup Spot Drawer */}
      {proposeOpen && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const spotId = (visibleSpots.some(
              (sp) => String(sp._id) === selectedSpotId
            )
              ? selectedSpotId
              : visibleSpots[0]?._id) as
              | Id<"meetupSpots">
              | undefined;
            if (!spotId) return;
            await proposeCard({
              chatId: chat._id,
              meetupSpotId: spotId,
              proposedWindow,
              agreedTerms,
            });
            setProposeOpen(false);
          }}
          className="space-y-2 rounded-xl border border-[#E4E7EE] bg-white p-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-[#111317]">
              Select Vetted Public KSU Meetup Spot
            </span>
            <button
              type="button"
              onClick={() =>
                setSpotCampus((c) =>
                  c === "Kennesaw" ? "Marietta" : "Kennesaw"
                )
              }
              className="rounded-lg bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-bold text-[#1E3A8A]"
            >
              Switch to {spotCampus === "Kennesaw" ? "Marietta" : "Kennesaw"}{" "}
              Spots
            </button>
          </div>

          <input
            type="search"
            data-testid="meetup-spot-search"
            aria-label="Search meetup spots or buildings"
            value={spotQuery}
            onChange={(e) => setSpotQuery(e.target.value)}
            placeholder="Search a building, e.g. Student Center, SRAC, Library…"
            className="w-full rounded-xl border border-[#E4E7EE] px-3 py-1.5 font-semibold"
          />
          <select
            value={
              visibleSpots.some((sp) => String(sp._id) === selectedSpotId)
                ? selectedSpotId
                : String(visibleSpots[0]?._id ?? "")
            }
            onChange={(e) => setSelectedSpotId(e.target.value)}
            className="w-full rounded-xl border border-[#E4E7EE] px-3 py-2 font-semibold"
          >
            {visibleSpots.length === 0 && (
              <option value="">No spots match — try another building</option>
            )}
            {visibleSpots.map((sp) => (
              <option key={String(sp._id)} value={String(sp._id)}>
                [{sp.campus}] {sp.name} — {sp.safetyNotes}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              required
              value={proposedWindow}
              onChange={(e) => setProposedWindow(e.target.value)}
              placeholder="Proposed Time Window"
              className="rounded-xl border border-[#E4E7EE] px-3 py-1.5"
            />
            <input
              type="text"
              required
              value={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.value)}
              placeholder="Agreed Terms (in-person)"
              className="rounded-xl border border-[#E4E7EE] px-3 py-1.5"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setProposeOpen(false)}
              className="rounded-lg border border-[#E4E7EE] px-3 py-1 font-bold text-[#5E6675]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#111317] px-3 py-1 font-extrabold text-[#FDBB30]"
            >
              Pin Handoff Card
            </button>
          </div>
        </form>
      )}

      {/* Co-Buyer / Co-Seller Invite (2-6 Total Students) */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!coPartyHandle.trim()) return;
          try {
            await inviteCoParty({
              chatId: chat._id,
              inviteHandle: coPartyHandle,
            });
            setCoPartyHandle("");
            setBanner("Invited roommate/helper co-party to this Deal Chat.");
          } catch (err: any) {
            setBanner(err?.data?.message || err?.message);
          }
        }}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E7EE] pt-2 text-xs"
      >
        <span className="text-[11px] font-semibold text-[#5E6675]">
          Isolated per-buyer Deal Chat ({chat.memberCount}/6 participants)
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={coPartyHandle}
            onChange={(e) => setCoPartyHandle(e.target.value)}
            placeholder="+ @handle roommate/helper"
            className="w-44 rounded-lg border border-[#E4E7EE] bg-white px-2.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg border border-[#111317] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#111317]"
          >
            <UserPlus className="h-3 w-3" />
            <span>Invite Co-Party</span>
          </button>
        </div>
      </form>

      {banner && (
        <p className="rounded-lg bg-[#DCFCE7] px-2.5 py-1.5 text-xs font-bold text-[#15803D]">
          {banner}
        </p>
      )}
    </div>
  );
}
