"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { Award, CheckCircle2, MapPin, ShieldCheck, UserPlus } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { CampusPlace, filterMeetupSpots, loadCampusPlaces } from "@/lib/campusPlaces";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL } from "./styles";

const LISTING_STATUS: Record<string, { glyph: string; word: string; fg: string; bg: string }> = {
  available: { glyph: "○", word: "Available", fg: "var(--ok-fg)", bg: "var(--ok-bg)" },
  pending: { glyph: "◐", word: "Pending", fg: "var(--warn-fg)", bg: "var(--warn-bg)" },
  sold: { glyph: "●", word: "Sold", fg: "var(--bg)", bg: "var(--ink)" },
  expired: { glyph: "◌", word: "Expired", fg: "var(--muted)", bg: "var(--surface-2)" },
};

const HANDOFF_STATUS: Record<string, { glyph: string; word: string; fg: string; bg: string }> = {
  proposed: { glyph: "◐", word: "Proposed", fg: "var(--warn-fg)", bg: "var(--warn-bg)" },
  confirmed: { glyph: "✓", word: "Confirmed", fg: "var(--ok-fg)", bg: "var(--ok-bg)" },
};

function Chip({ s, testId }: { s: { glyph: string; word: string; fg: string; bg: string }; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-[var(--sp-1)] rounded-full px-[var(--sp-2)] text-sm font-bold"
      style={{ color: s.fg, backgroundColor: s.bg }}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {s.word}
    </span>
  );
}

export function DealHandoffPanel({ thread }: { thread: any }) {
  const { chat, listing, myMembership } = thread;
  const { toast } = useAnnouncer();
  const ids = { search: useId(), spot: useId(), window: useId(), terms: useId(), invite: useId() };
  const defaultCampus: "Kennesaw" | "Marietta" = listing?.campus ?? "Kennesaw";
  const [spotCampus, setSpotCampus] = useState<"Kennesaw" | "Marietta">(defaultCampus);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [selectedSpotId, setSelectedSpotId] = useState<string>("");
  const [proposedWindow, setProposedWindow] = useState("Today · 3:00 PM – 3:15 PM");
  const [agreedTerms, setAgreedTerms] = useState("Cash in person after check");
  const [coPartyHandle, setCoPartyHandle] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const spots = useViewerQuery(api.marketplace.listMeetupSpots, { campus: spotCampus });

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
  const visibleSpots = useMemo(() => filterMeetupSpots(spots ?? [], spotQuery, places), [spots, spotQuery, places]);

  const proposeCard = useViewerMutation(api.marketplace.proposeOrUpdateHandoffCard);
  const confirmMeetup = useViewerMutation(api.marketplace.confirmHandoffMeetup);
  const transitionStatus = useViewerMutation(api.marketplace.transitionListingStatus);
  const confirmPickup = useViewerMutation(api.marketplace.confirmBuyerPickup);
  const inviteCoParty = useViewerMutation(api.marketplace.inviteDealCoParty);

  const isPrimarySeller = myMembership?.role === "primary_seller";
  const isPrimaryBuyer = myMembership?.role === "primary_buyer";
  const card = chat.handoffCard;
  const done = (message: string) => toast({ message, tone: "success" });

  const listingStatus = listing ? (LISTING_STATUS[listing.status] ?? { glyph: "◌", word: listing.status, fg: "var(--muted)", bg: "var(--surface-2)" }) : null;
  const handoffStatus = card ? (HANDOFF_STATUS[card.status] ?? { glyph: "◌", word: card.status, fg: "var(--muted)", bg: "var(--surface-2)" }) : null;

  return (
    <section
      aria-labelledby="deal-handoff-heading"
      data-testid="deal-handoff-card"
      className="space-y-[var(--sp-3)] rounded-[var(--r-lg)] border-2 border-[var(--accent)] bg-[var(--surface)] p-[var(--sp-4)]"
    >
      <h2 id="deal-handoff-heading" className="sr-only">
        Deal handoff
      </h2>
      {listing && listingStatus && (
        <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] border-b border-[var(--line)] pb-[var(--sp-3)]">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)]">
            <span className="min-w-0 font-display text-lg font-bold [overflow-wrap:anywhere]">{listing.title}</span>
            <Chip s={listingStatus} testId="deal-listing-status-badge" />
            {listing.buyerConfirmedPickup && (
              <span
                data-testid="pickup-confirmed-badge"
                className="inline-flex items-center gap-[var(--sp-1)] rounded-full bg-[var(--ok-bg)] px-[var(--sp-2)] text-sm font-bold text-[var(--ok-fg)]"
              >
                <Award aria-hidden="true" className="h-4 w-4" />
                Pickup Confirmed ✓
              </span>
            )}
          </div>

          {isPrimarySeller && listing.status !== "sold" && (
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              {listing.status !== "pending" ? (
                <button
                  type="button"
                  data-testid="seller-mark-pending-btn"
                  onClick={async () => {
                    await transitionStatus({ listingId: listing._id, nextStatus: "pending", dealChatId: chat._id });
                    done("Listing marked Pending for this Deal Chat");
                  }}
                  className={BTN_SECONDARY}
                >
                  Mark Pending
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await transitionStatus({ listingId: listing._id, nextStatus: "available" });
                    done("Listing reopened as Available");
                  }}
                  className={BTN_SECONDARY}
                >
                  Reopen as Available
                </button>
              )}
              <button
                type="button"
                data-testid="seller-mark-sold-btn"
                onClick={async () => {
                  await transitionStatus({ listingId: listing._id, nextStatus: "sold", dealChatId: chat._id });
                  done("Listing marked Sold. Waiting for the buyer to confirm pickup.");
                }}
                className={BTN_PRIMARY}
              >
                Mark Sold
              </button>
            </div>
          )}

          {isPrimaryBuyer && listing.status === "sold" && listing.soldDealChatId === chat._id && !listing.buyerConfirmedPickup && (
            <button
              type="button"
              data-testid="buyer-confirm-pickup-btn"
              onClick={async () => {
                await confirmPickup({ chatId: chat._id });
                done("Pickup confirmed");
              }}
              className={BTN_PRIMARY}
            >
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              Confirm Pickup
            </button>
          )}
        </div>
      )}

      {card && handoffStatus ? (
        <div className="flex flex-wrap items-start justify-between gap-[var(--sp-2)]">
          <div className="min-w-0 space-y-[var(--sp-1)]">
            <p className="flex flex-wrap items-center gap-[var(--sp-2)] font-bold">
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">Meetup Spot: {card.meetupSpotName}</span>
              <CampusBadge campus={card.meetupCampus} />
              <Chip s={handoffStatus} testId="handoff-card-status" />
            </p>
            <p className="text-sm [overflow-wrap:anywhere]">
              <strong>Window:</strong> {card.proposedWindow} · <strong>Terms:</strong> {card.agreedTerms}
            </p>
            <p className="flex items-start gap-[var(--sp-1)] text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
              <ShieldCheck aria-hidden="true" className="mt-[var(--sp-1)] h-4 w-4 shrink-0" />
              <span>{card.safetyNotes}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {card.status === "proposed" && (
              <button
                type="button"
                data-testid="confirm-meetup-btn"
                onClick={async () => {
                  await confirmMeetup({ chatId: chat._id });
                  done("Meetup Spot confirmed");
                }}
                className={BTN_PRIMARY}
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Confirm Meetup
              </button>
            )}
            <button type="button" onClick={() => setProposeOpen(true)} className={BTN_SECONDARY}>
              Change Meetup Spot
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
          <p className="min-w-0 text-sm text-[var(--muted)]">No Meetup Spot yet. Pick a busy, well-lit public KSU place.</p>
          <button type="button" onClick={() => setProposeOpen(true)} className={BTN_PRIMARY}>
            Propose a Meetup Spot
          </button>
        </div>
      )}

      <Dialog
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        title="Propose a Meetup Spot"
        description="Choose a public KSU place. Inspect the item before you pay."
        variant="sheet"
        testId="meetup-spot-dialog"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const spotId = (visibleSpots.some((sp) => String(sp._id) === selectedSpotId)
              ? selectedSpotId
              : visibleSpots[0]?._id) as Id<"meetupSpots"> | undefined;
            if (!spotId) return;
            await proposeCard({ chatId: chat._id, meetupSpotId: spotId, proposedWindow, agreedTerms });
            setProposeOpen(false);
            done("Meetup Spot proposed");
          }}
          className="space-y-[var(--sp-3)]"
        >
          <SegmentedControl
            label="Meetup Spot Campus"
            hideLabel={false}
            options={[
              { value: "Kennesaw", label: "Kennesaw" },
              { value: "Marietta", label: "Marietta" },
            ] as const}
            value={spotCampus}
            onChange={setSpotCampus}
          />
          <div>
            <label htmlFor={ids.search} className={LABEL}>
              Search spots or buildings
            </label>
            <input
              id={ids.search}
              type="search"
              data-testid="meetup-spot-search"
              value={spotQuery}
              onChange={(e) => setSpotQuery(e.target.value)}
              placeholder="Student Center, SRAC, Library…"
              className={`${FIELD} mt-[var(--sp-1)]`}
            />
          </div>
          <div>
            <label htmlFor={ids.spot} className={LABEL}>
              Meetup Spot
            </label>
            <select
              id={ids.spot}
              value={visibleSpots.some((sp) => String(sp._id) === selectedSpotId) ? selectedSpotId : String(visibleSpots[0]?._id ?? "")}
              onChange={(e) => setSelectedSpotId(e.target.value)}
              className={`${FIELD} mt-[var(--sp-1)]`}
            >
              {visibleSpots.length === 0 && <option value="">No spots match. Try another building.</option>}
              {visibleSpots.map((sp) => (
                <option key={String(sp._id)} value={String(sp._id)}>
                  {sp.name} ({sp.campus})
                </option>
              ))}
            </select>
          </div>
          <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={ids.window} className={LABEL}>
                Time window
              </label>
              <input id={ids.window} type="text" required value={proposedWindow} onChange={(e) => setProposedWindow(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.terms} className={LABEL}>
                Agreed terms
              </label>
              <input id={ids.terms} type="text" required value={agreedTerms} onChange={(e) => setAgreedTerms(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
            <button type="button" onClick={() => setProposeOpen(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={visibleSpots.length === 0} className={BTN_PRIMARY}>
              Pin Meetup Spot
            </button>
          </div>
        </form>
      </Dialog>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!coPartyHandle.trim()) return;
          setInviteError(null);
          try {
            await inviteCoParty({ chatId: chat._id, inviteHandle: coPartyHandle });
            setCoPartyHandle("");
            done("Invited a helper to this Deal Chat");
          } catch (err: any) {
            setInviteError(err?.data?.message || err?.message || "Could not invite.");
          }
        }}
        className="space-y-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]"
      >
        <p className="text-sm text-[var(--muted)]">This buyer&apos;s own Deal Chat · {chat.memberCount} of 6 people</p>
        <div className="flex flex-wrap items-end gap-[var(--sp-2)]">
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor={ids.invite} className={LABEL}>
              Invite a roommate or helper by @handle
            </label>
            <input id={ids.invite} type="text" value={coPartyHandle} onChange={(e) => setCoPartyHandle(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
          </div>
          <button type="submit" className={BTN_SECONDARY}>
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Invite
          </button>
        </div>
        {inviteError && (
          <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">
            {inviteError}
          </p>
        )}
      </form>
    </section>
  );
}
