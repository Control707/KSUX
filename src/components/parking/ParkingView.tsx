"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Car, Pin, Zap } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { CampusGeoMap } from "@/components/map/CampusGeoMap";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import {
  FULLNESS,
  FillBar,
  SegmentedControl,
  StatusChip,
  fullnessFromTier,
} from "@/components/a11y/controls";

const PERMIT_TIERS = [
  "All",
  "Central",
  "East",
  "West",
  "North",
  "Marietta West",
  "Economy",
  "Shuttle",
  "Residential",
  "Commuter",
  "Faculty/Staff",
  "Visitor",
] as const;

type Tier = 0 | 1 | 2 | 3;
const TIERS: readonly Tier[] = [0, 1, 2, 3];
type Snap = "peek" | "half" | "full";
const SNAP_OPTIONS = [
  { value: "peek", label: "Peek" },
  { value: "half", label: "Half" },
  { value: "full", label: "Full" },
] as const;
const SNAP_WORDS: Record<Snap, string> = {
  peek: "collapsed to peek",
  half: "opened to half height",
  full: "opened to full height",
};

function tierWord(tier: Tier) {
  return FULLNESS[fullnessFromTier(tier)].word;
}

function errorText(err: any, fallback: string) {
  return err?.data?.message || err?.message || fallback;
}

/** One fullness tier button: glyph + word + the status colours, never colour alone. */
function TierButton({
  tier,
  onClick,
  testId,
  accessibleName,
  pressed,
}: {
  tier: Tier;
  onClick: () => void;
  testId?: string;
  accessibleName: string;
  pressed?: boolean;
}) {
  const s = FULLNESS[fullnessFromTier(tier)];
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={accessibleName}
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-sm)] border-2 px-[var(--sp-2)] text-sm font-bold"
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: pressed ? "var(--focus)" : s.mark }}
    >
      <span aria-hidden="true" className="text-lg leading-none">{s.glyph}</span>
      <span aria-hidden="true">{s.word}</span>
    </button>
  );
}

const buttonBase =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-pill)] px-[var(--sp-4)] text-sm font-bold";
const primaryButton = `${buttonBase} bg-[var(--accent)] text-[var(--on-accent)]`;
const secondaryButton = `${buttonBase} border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]`;
const cardClass =
  "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)] text-[var(--ink)]";

/**
 * Parking (SPEC-v2 §4, Layout A in Direction C): a map with a bottom sheet
 * that snaps to peek / half / full on phones (buttons, not drag) and a 26rem
 * side list at ≥1024 px. Fullness comes only from Student Parking Reports.
 */
export function ParkingView() {
  const searchParams = useSearchParams();
  const {
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();
  const { toast, announce } = useAnnouncer();
  const permitSelectId = useId();
  const sheetHeadingId = useId();

  const [permitOverride, setPermitFilter] = useState<string>();
  const [selectedLotSlug, setSelectedLotSlug] = useState<string | null>(null);
  const [selectedLevelByLot, setSelectedLevelByLot] = useState<Record<string, string>>({});
  const [statusBanner, setStatusBanner] = useState<string>("");
  const [snap, setSnap] = useState<Snap>("peek");
  const [arrivalSlug, setArrivalSlug] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<{
    reportId: Id<"parkingReports">;
    lotName: string;
    lotCode: string;
    tier: Tier;
  } | null>(null);
  const [lotPickerOpen, setLotPickerOpen] = useState(false);
  const [reportDialog, setReportDialog] = useState<null | "report" | "leaving">(null);
  const [dialogLotSlug, setDialogLotSlug] = useState<string>("");
  const [leavingTier, setLeavingTier] = useState<Tier | null>(null);
  const [wantsReportDialog, setWantsReportDialog] = useState(searchParams.get("report") === "1");

  const data = useViewerQuery(api.parking.listParkingLots, {
    permitTierFilter: permitOverride,
  });
  const clout = useViewerQuery(api.clout.getMyClout, {});
  const permitFilter = permitOverride ?? data?.savedPermitTier ?? "All";

  const savePrefs = useViewerMutation(api.parking.saveParkingPreferences);
  const submitReport = useViewerMutation(api.parking.submitParkingReport);
  const undoReport = useViewerMutation(api.parking.undoParkingReport);
  const resolveOpening = useViewerMutation(api.parking.resolveSpotOpening);
  const takeOpening = useViewerMutation(api.parking.takeSpotOpening);

  const lots = useMemo(() => data?.lots ?? [], [data?.lots]);
  const arrivalLot = lots.find((l) => l.slug === arrivalSlug) ?? lots[0];
  const displayedLots = selectedLotSlug
    ? [...lots.filter((l) => l.slug === selectedLotSlug), ...lots.filter((l) => l.slug !== selectedLotSlug)]
    : lots;

  useEffect(() => {
    if (quickComposerKind === "parking_report") {
      setWantsReportDialog(true);
      setQuickComposerKind(null);
    }
  }, [quickComposerKind, setQuickComposerKind]);

  useEffect(() => {
    if (pendingDraftCard && pendingDraftCard.draftKind === "parking_report") {
      try {
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as { lotSlug?: string };
        if (parsed.lotSlug) {
          setSelectedLotSlug(parsed.lotSlug);
          setArrivalSlug(parsed.lotSlug);
          setDialogLotSlug(parsed.lotSlug);
        }
      } catch {
        // ignore malformed drafts
      }
      setStatusBanner(`Draft ready: ${pendingDraftCard.title}. Choose a fullness tier to publish it.`);
      setPendingDraftCard(null);
      setWantsReportDialog(true);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  // Open the Parking Report dialog from the Quick Sheet once lots have loaded.
  useEffect(() => {
    if (wantsReportDialog && lots.length > 0) {
      setWantsReportDialog(false);
      setDialogLotSlug((current) => current || (arrivalLot?.slug ?? lots[0]!.slug));
      setReportDialog("report");
    }
  }, [wantsReportDialog, lots, arrivalLot?.slug]);

  const changeSnap = useCallback(
    (next: Snap) => {
      setSnap(next);
      announce(`Parking sheet ${SNAP_WORDS[next]}`);
    },
    [announce]
  );

  const publishFullness = async (lot: (typeof lots)[number], tier: Tier) => {
    try {
      const level = selectedLevelByLot[String(lot._id)] || undefined;
      const result = await submitReport({
        parkingLotId: lot._id,
        reportKind: "fullness",
        fullnessTier: tier,
        deckLevel: level,
      });
      setLastReport({ reportId: result.reportId, lotName: lot.name, lotCode: lot.lotCode, tier });
      setStatusBanner(
        `Parking Report published: ${lot.name}${level ? ` (${level})` : ""} is ${tierWord(tier)}. It fades after 45 min.`
      );
      return true;
    } catch (err: any) {
      toast({ message: errorText(err, "Couldn't publish the Parking Report."), tone: "error" });
      return false;
    }
  };

  const publishLeaving = async (lot: (typeof lots)[number]) => {
    try {
      const level = selectedLevelByLot[String(lot._id)] || undefined;
      await submitReport({ parkingLotId: lot._id, reportKind: "spot_opening", deckLevel: level });
      setStatusBanner(
        `Posted "Leaving in ~5 min" on ${lot.name}${level ? ` (${level})` : ""}. It stays up for 10 min.`
      );
      return true;
    } catch (err: any) {
      toast({ message: errorText(err, "Couldn't post the Spot Opening."), tone: "error" });
      return false;
    }
  };

  const undoLast = async () => {
    if (!lastReport) return;
    try {
      await undoReport({ reportId: lastReport.reportId });
      setStatusBanner(`Parking Report on ${lastReport.lotName} undone.`);
      setLastReport(null);
    } catch (err: any) {
      toast({ message: errorText(err, "Couldn't undo the Parking Report."), tone: "error" });
    }
  };

  const openDialog = (kind: "report" | "leaving") => {
    setDialogLotSlug(arrivalLot?.slug ?? lots[0]?.slug ?? "");
    setLeavingTier(null);
    setReportDialog(kind);
  };
  const dialogLot = lots.find((l) => l.slug === dialogLotSlug) ?? arrivalLot;

  const campusFilter = (data?.campusFilter as "Kennesaw" | "Marietta" | "All KSU" | undefined) ?? "Kennesaw";
  const cloutWeek = clout?.thisWeek ?? [];
  const cloutEarned = cloutWeek.reduce((sum, row) => sum + row.counted, 0);
  const cloutPending = cloutWeek.reduce((sum, row) => sum + row.held, 0);

  const snapHeight =
    snap === "peek" ? "max-h-[42dvh]" : snap === "half" ? "max-h-[62dvh]" : "max-h-[78dvh]";

  return (
    <div data-testid="parking-view" className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem]">
      {/* Map column: full-bleed on phones, the left pane on desktop. */}
      <div className="min-w-0 space-y-[var(--sp-2)] p-[var(--sp-2)] pb-[46dvh] lg:pb-[var(--sp-2)] [html[data-large-text]_&]:pb-[var(--sp-2)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--sp-2)] px-[var(--sp-1)]">
          <h1 data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold text-[var(--ink)]">
            Parking
          </h1>
          <div className="flex min-w-0 flex-col gap-[var(--sp-1)]">
            <label htmlFor={permitSelectId} className="text-sm font-bold text-[var(--muted)]">
              Your permit
            </label>
            <select
              id={permitSelectId}
              data-testid="permit-tier-select"
              value={permitFilter}
              onChange={(e) => {
                const v = e.target.value;
                setPermitFilter(v);
                void savePrefs({ permitTier: v });
                announce(v === "All" ? "Showing every Parking Lot" : `Showing lots for the ${v} permit`);
              }}
              className="min-h-[var(--target)] min-w-0 max-w-full rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body font-bold text-[var(--ink)]"
            >
              {PERMIT_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t === "All" ? "All permits" : t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <h2 className="sr-only">Parking map</h2>
        <CampusGeoMap
          campusFilter={campusFilter}
          showParkingLots
          showPlaceSearch={false}
          title={`${campusFilter} Parking Lots map`}
          lotStatuses={lots.map((l) => ({
            slug: l.slug,
            name: l.name,
            campus: l.campus,
            latitude: l.latitude,
            longitude: l.longitude,
            effectiveTier: l.effectiveTier,
            hasSpotOpening: l.spotOpenings.length > 0,
          }))}
          onSelectLotSlug={(slug) => {
            setSelectedLotSlug(slug);
            if (!lastReport) setArrivalSlug(slug);
          }}
        />
      </div>

      {/* Bottom sheet on phones (snap buttons), side list on desktop. */}
      <section
        aria-labelledby={sheetHeadingId}
        data-testid="parking-sheet"
        data-snap={snap}
        className={`fixed inset-x-[var(--sp-2)] bottom-[var(--chrome-bottom)] z-20 flex flex-col overflow-hidden rounded-t-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--bg)] shadow-2xl ${snapHeight} lg:static lg:max-h-none lg:rounded-none lg:border-0 lg:border-l lg:border-[var(--line)] lg:shadow-none [html[data-large-text]_&]:static [html[data-large-text]_&]:max-h-none [html[data-large-text]_&]:rounded-none [html[data-large-text]_&]:shadow-none`}
      >
        <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] border-b border-[var(--line)] px-[var(--sp-3)] py-[var(--sp-1)] lg:hidden [html[data-large-text]_&]:hidden">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
          <div data-testid="parking-sheet-snap" className="min-w-0">
            <SegmentedControl
              label="Parking sheet size"
              options={SNAP_OPTIONS}
              value={snap}
              onChange={changeSnap}
              testIdPrefix="parking-sheet-snap"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-[var(--sp-3)] overflow-y-auto p-[var(--sp-3)]">
          <h2 id={sheetHeadingId} className="font-display text-xl font-bold text-[var(--ink)]">
            Parking for your permit
          </h2>

          <p
            role="status"
            data-testid="parking-status-banner"
            className={
              statusBanner
                ? "rounded-[var(--r-md)] border border-[var(--ok-fg)] bg-[var(--ok-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--ok-fg)] [overflow-wrap:anywhere]"
                : "sr-only"
            }
          >
            {statusBanner}
          </p>

          {/* Arrival strip: one tap publishes for the pinned or first lot. */}
          {arrivalLot && (
            <div data-testid="arrival-strip" className={`${cardClass} [overflow-wrap:anywhere]`}>
              {lastReport ? (
                <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
                  <p data-testid="arrival-strip-reported" className="min-w-0 text-sm font-bold">
                    <span aria-hidden="true">{FULLNESS[fullnessFromTier(lastReport.tier)].glyph} </span>
                    Reported {tierWord(lastReport.tier)} at {lastReport.lotCode}
                  </p>
                  <button type="button" data-testid="arrival-undo-btn" onClick={() => void undoLast()} className={secondaryButton}>
                    Undo<span className="sr-only"> Parking Report on {lastReport.lotName}</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
                  <p className="flex min-w-0 flex-wrap items-center gap-[var(--sp-1)] text-sm font-bold">
                    Just parked at
                    <button
                      type="button"
                      data-testid="arrival-lot-btn"
                      onClick={() => setLotPickerOpen(true)}
                      className="inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--sp-2)] font-bold underline underline-offset-2"
                    >
                      {arrivalLot.lotCode}
                      <span className="sr-only">, {arrivalLot.name}. Change lot</span>
                    </button>
                    ?
                  </p>
                  <div role="group" aria-label={`How full is ${arrivalLot.name}?`} className="flex flex-wrap gap-[var(--sp-1)]">
                    {TIERS.map((tier) => (
                      <TierButton
                        key={tier}
                        tier={tier}
                        testId={`arrival-tier-${tier}`}
                        accessibleName={`${tierWord(tier)}: report ${arrivalLot.name} as ${tierWord(tier)}`}
                        onClick={() => void publishFullness(arrivalLot, tier)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Best bet: ranks only lots with live Student reports. */}
          {data && (
            <div data-testid="parking-best-bet" data-kind={data.bestBet.kind} className={`${cardClass} space-y-[var(--sp-2)] [overflow-wrap:anywhere]`}>
              <h3 className="text-body font-bold">Best bet for your permit</h3>
              {data.bestBet.kind === "live" ? (
                <>
                  <p className="flex flex-wrap items-center gap-[var(--sp-2)] text-body font-bold">
                    {data.bestBet.lot.name} ({data.bestBet.lot.lotCode})
                    <StatusChip status={fullnessFromTier(data.bestBet.lot.effectiveTier)} />
                  </p>
                  <p className="text-sm text-[var(--muted)]">{data.bestBet.lot.provenanceLabel}</p>
                </>
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-[var(--sp-2)] text-sm">
                    <StatusChip status="none" />
                  </p>
                  <p className="text-sm">
                    {data.bestBet.shuttleLots.length > 0 ? (
                      <>
                        Lots with shuttle service:{" "}
                        {data.bestBet.shuttleLots.slice(0, 4).map((l) => `${l.name} (${l.lotCode})`).join(", ")}
                        {data.bestBet.shuttleLots.length > 4 ? `, and ${data.bestBet.shuttleLots.length - 4} more` : ""}.
                      </>
                    ) : (
                      "No lots for this permit have shuttle service."
                    )}{" "}
                    Be the first to report.
                  </p>
                </>
              )}
            </div>
          )}

          {data?.campusLine && (
            <p data-testid="parking-campus-line" data-state={data.campusLine.state} className="text-sm text-[var(--ink)] [overflow-wrap:anywhere]">
              <span className="font-bold">{data.campusLine.label}</span>
              {" · per "}
              <a href={data.campusLine.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                KSU class-enrollment chart<span className="sr-only"> (opens in a new tab)</span>
              </a>
              {`, ${data.campusLine.checkedOnLabel}`}
            </p>
          )}

          <div className="flex flex-wrap gap-[var(--sp-2)]">
            <button type="button" data-testid="parking-report-btn" disabled={!lots.length} onClick={() => openDialog("report")} className={primaryButton}>
              Parking Report
            </button>
            <button type="button" data-testid="parking-leaving-btn" disabled={!lots.length} onClick={() => openDialog("leaving")} className={secondaryButton}>
              <Zap aria-hidden="true" className="h-4 w-4" />
              I&apos;m leaving ~5 min
            </button>
          </div>

          <p data-testid="parking-clout" className="text-sm text-[var(--muted)]">
            {cloutEarned > 0 || cloutPending > 0
              ? `Clout this week: ${cloutEarned} earned · ${cloutPending} pending`
              : "Clout arrives with corroboration."}
          </p>

          {/* Lot list (the half/full sheet and the desktop side list). */}
          <h3 className="pt-[var(--sp-2)] text-body font-bold">
            {lots.length} Parking Lots{permitFilter !== "All" ? ` for ${permitFilter}` : ""}
          </h3>
          {!data && <p className="text-sm text-[var(--muted)]">Loading Parking Lots…</p>}
          <ul className="space-y-[var(--sp-2)]">
            {displayedLots.map((lot) => {
              const status = fullnessFromTier(lot.effectiveTier);
              const none = status === "none";
              return (
                <li
                  key={String(lot._id)}
                  data-testid={`parking-lot-card-${lot.slug}`}
                  data-status={status}
                  className={`${cardClass} space-y-[var(--sp-2)] [overflow-wrap:anywhere] ${none ? "border-dashed border-[var(--line-strong)]" : "border-solid"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-[var(--sp-2)]">
                    <div className="min-w-0 space-y-[var(--sp-1)]">
                      <h4 className="flex flex-wrap items-center gap-[var(--sp-1)] text-body font-bold">
                        <Car aria-hidden="true" className="h-4 w-4" />
                        {lot.name}
                        <span className="font-normal text-[var(--muted)]">({lot.lotCode})</span>
                      </h4>
                      <StatusChip status={status} testId={`parking-lot-status-${lot.slug}`} />
                    </div>
                    <button
                      type="button"
                      aria-pressed={lot.isPinned}
                      onClick={async () => {
                        try {
                          await savePrefs({ togglePinLotId: lot._id });
                          announce(lot.isPinned ? `${lot.name} unpinned` : `${lot.name} pinned`);
                        } catch (err: any) {
                          toast({ message: errorText(err, "Couldn't change the pin."), tone: "error" });
                        }
                      }}
                      className={`${secondaryButton} px-[var(--sp-3)]`}
                    >
                      <Pin aria-hidden="true" className="h-4 w-4" />
                      {lot.isPinned ? "Pinned" : "Pin"}
                      <span className="sr-only"> {lot.name}</span>
                    </button>
                  </div>
                  <FillBar status={status} />
                  <p data-testid={`parking-lot-provenance-${lot.slug}`} className="text-sm text-[var(--muted)]">
                    {lot.provenanceLabel} · Permits: {lot.permitTiers.join(", ") || "none listed"}
                  </p>

                  {lot.spotOpenings.map((op) => (
                    <div
                      key={String(op._id)}
                      data-testid="active-spot-opening"
                      className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--ok-fg)] bg-[var(--ok-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--ok-fg)]"
                    >
                      <span className="flex min-w-0 items-center gap-[var(--sp-1)]">
                        <Zap aria-hidden="true" className="h-4 w-4 shrink-0" />
                        Spot opening in ~5 min{op.deckLevel ? ` on ${op.deckLevel}` : ""} · anonymous
                      </span>
                      <span className="flex flex-wrap gap-[var(--sp-1)]">
                        {!op.isAuthor && (
                          <button
                            type="button"
                            data-testid="spot-opening-took-btn"
                            onClick={async () => {
                              try {
                                await takeOpening({ reportId: op._id });
                                setStatusBanner(`Thanks. The Spot Opening on ${lot.name} is marked taken.`);
                              } catch (err: any) {
                                toast({ message: errorText(err, "Couldn't mark the spot taken."), tone: "error" });
                              }
                            }}
                            className={secondaryButton}
                          >
                            I took this spot
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="spot-opening-gone-btn"
                          disabled={op.hasVotedGone}
                          onClick={async () => {
                            try {
                              const res = await resolveOpening({ reportId: op._id });
                              setStatusBanner(
                                op.isAuthor
                                  ? `Your Spot Opening on ${lot.name} is cancelled.`
                                  : res.cleared
                                    ? `Spot Opening on ${lot.name} removed after 2 Gone votes.`
                                    : `Gone vote counted (${res.goneVotes} of 2).`
                              );
                            } catch (err: any) {
                              toast({ message: errorText(err, "Couldn't update the Spot Opening."), tone: "error" });
                            }
                          }}
                          className={secondaryButton}
                        >
                          {op.isAuthor ? "Cancel my Spot Opening" : `Gone (${op.goneVotes} of 2)`}
                        </button>
                      </span>
                    </div>
                  ))}

                  {lot.overflowReroute && (
                    <p
                      data-testid="overflow-reroute-banner"
                      className="rounded-[var(--r-md)] border border-[var(--warn-fg)] bg-[var(--warn-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm text-[var(--warn-fg)]"
                    >
                      <strong>Try instead:</strong> {lot.overflowReroute.name} is{" "}
                      <strong>{tierWord(lot.overflowReroute.effectiveTier)}</strong> (Live Student reports)
                      {lot.overflowReroute.shuttleRouteName
                        ? ` · ${lot.overflowReroute.shuttleRouteName}${lot.overflowReroute.shuttleEtaMinutes === undefined ? " · ETA unavailable" : ` in ${lot.overflowReroute.shuttleEtaMinutes} min`}`
                        : ""}
                    </p>
                  )}

                  <div className="space-y-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-2)]">
                    {lot.isDeck && lot.levels.length > 1 && (
                      <div role="group" aria-label={`${lot.name} deck level (optional)`} className="flex flex-wrap items-center gap-[var(--sp-1)]">
                        <span aria-hidden="true" className="text-sm font-bold text-[var(--muted)]">Level:</span>
                        {lot.levels.map((lvl) => {
                          const active = selectedLevelByLot[String(lot._id)] === lvl;
                          return (
                            <button
                              key={lvl}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setSelectedLevelByLot((prev) => ({ ...prev, [String(lot._id)]: active ? "" : lvl }))
                              }
                              className={`min-h-[var(--target)] min-w-[var(--target)] rounded-[var(--r-sm)] px-[var(--sp-2)] text-sm font-bold ${
                                active
                                  ? "bg-[var(--ink)] text-[var(--bg)]"
                                  : "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]"
                              }`}
                            >
                              {lvl}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div role="group" aria-label={`Report ${lot.name} fullness`} className="flex flex-wrap items-center gap-[var(--sp-1)]">
                      {TIERS.map((tier) => (
                        <TierButton
                          key={tier}
                          tier={tier}
                          testId={`report-tier-${lot.slug}-${tier}`}
                          accessibleName={`${tierWord(tier)}: report ${lot.name} as ${tierWord(tier)}`}
                          onClick={() => void publishFullness(lot, tier)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid={`leaving-5min-${lot.slug}`}
                      onClick={() => void publishLeaving(lot)}
                      className={secondaryButton}
                    >
                      <Zap aria-hidden="true" className="h-4 w-4" />
                      I&apos;m leaving ~5 min<span className="sr-only"> from {lot.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <Dialog
        open={lotPickerOpen}
        onClose={() => setLotPickerOpen(false)}
        title="Where did you park?"
        description="The arrival strip reports for this lot."
        variant="sheet"
        testId="arrival-lot-dialog"
      >
        <ul className="space-y-[var(--sp-1)]">
          {lots.map((lot) => (
            <li key={lot.slug}>
              <button
                type="button"
                aria-pressed={lot.slug === arrivalLot?.slug}
                onClick={() => {
                  setArrivalSlug(lot.slug);
                  setLotPickerOpen(false);
                  announce(`Arrival strip set to ${lot.name}`);
                }}
                className="flex min-h-[var(--target)] w-full flex-wrap items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-2)] text-left text-body hover:bg-[var(--surface-2)]"
              >
                <span className="font-bold">{lot.lotCode}</span>
                <span>{lot.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={reportDialog !== null}
        onClose={() => setReportDialog(null)}
        title={reportDialog === "leaving" ? "I'm leaving ~5 min" : "Parking Report"}
        description={
          reportDialog === "leaving"
            ? "Other Students see an anonymous Spot Opening for 10 min. Adding how full it is posts a normal Parking Report too."
            : "Choose the lot and how full it is. Your report fades after 45 min."
        }
        variant="sheet"
        testId="parking-report-dialog"
      >
        {dialogLot && (
          <div className="space-y-[var(--sp-3)]">
            <div className="flex flex-col gap-[var(--sp-1)]">
              <label htmlFor={`${permitSelectId}-dialog-lot`} className="text-sm font-bold">
                Parking Lot
              </label>
              <select
                id={`${permitSelectId}-dialog-lot`}
                data-testid="parking-report-dialog-lot"
                value={dialogLot.slug}
                onChange={(e) => setDialogLotSlug(e.target.value)}
                className="min-h-[var(--target)] w-full rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]"
              >
                {lots.map((lot) => (
                  <option key={lot.slug} value={lot.slug}>
                    {lot.name} ({lot.lotCode})
                  </option>
                ))}
              </select>
            </div>
            {reportDialog === "report" ? (
              <div role="group" aria-label={`How full is ${dialogLot.name}?`} className="flex flex-wrap gap-[var(--sp-1)]">
                {TIERS.map((tier) => (
                  <TierButton
                    key={tier}
                    tier={tier}
                    testId={`parking-report-dialog-tier-${tier}`}
                    accessibleName={`${tierWord(tier)}: report ${dialogLot.name} as ${tierWord(tier)}`}
                    onClick={async () => {
                      if (await publishFullness(dialogLot, tier)) setReportDialog(null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                <div role="group" aria-label="How full is it? (optional)" className="space-y-[var(--sp-1)]">
                  <p aria-hidden="true" className="text-sm font-bold">How full is it? (optional)</p>
                  <div className="flex flex-wrap gap-[var(--sp-1)]">
                    {TIERS.map((tier) => (
                      <TierButton
                        key={tier}
                        tier={tier}
                        pressed={leavingTier === tier}
                        accessibleName={tierWord(tier)}
                        onClick={() => setLeavingTier(leavingTier === tier ? null : tier)}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="parking-leaving-dialog-submit"
                  onClick={async () => {
                    const ok = await publishLeaving(dialogLot);
                    if (ok && leavingTier !== null) await publishFullness(dialogLot, leavingTier);
                    if (ok) setReportDialog(null);
                  }}
                  className={primaryButton}
                >
                  Post Spot Opening
                </button>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
