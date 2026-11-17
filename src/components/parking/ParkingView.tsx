"use client";

import React, { useEffect, useState } from "react";
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

const FULLNESS_BUTTONS: Array<{
  tier: 0 | 1 | 2 | 3;
  label: string;
  cls: string;
}> = [
  {
    tier: 0,
    label: "Open (<60%)",
    cls: "border-[#15803D] bg-[#DCFCE7] text-[#15803D]",
  },
  {
    tier: 1,
    label: "Filling (60–85%)",
    cls: "border-[#B45309] bg-[#FEF3C7] text-[#B45309]",
  },
  {
    tier: 2,
    label: "Nearly Full (85–98%)",
    cls: "border-[#DC2626] bg-[#FEE2E2] text-[#DC2626]",
  },
  {
    tier: 3,
    label: "Full (Circling)",
    cls: "border-[#991B1B] bg-[#991B1B] text-white",
  },
];

export function ParkingView() {
  const searchParams = useSearchParams();
  const {
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();
  const [permitOverride, setPermitFilter] = useState<string>();
  const [selectedLotSlug, setSelectedLotSlug] = useState<string | null>(null);
  const [selectedLevelByLot, setSelectedLevelByLot] = useState<
    Record<string, string>
  >({});
  const [statusBanner, setStatusBanner] = useState<string | null>(
    searchParams.get("report") === "1"
      ? "Tap a fullness tier or 'Leaving in ~5 min' on any Parking Lot below."
      : null
  );

  const data = useViewerQuery(api.parking.listParkingLots, {
    permitTierFilter: permitOverride,
  });
  const permitFilter = permitOverride ?? data?.savedPermitTier ?? "All";

  const savePrefs = useViewerMutation(api.parking.saveParkingPreferences);
  const submitReport = useViewerMutation(api.parking.submitParkingReport);
  const resolveOpening = useViewerMutation(api.parking.resolveSpotOpening);

  useEffect(() => {
    if (quickComposerKind === "parking_report") {
      setStatusBanner("Tap a fullness tier or 'Leaving in ~5 min' on any Parking Lot below.");
      setQuickComposerKind(null);
    }
  }, [quickComposerKind, setQuickComposerKind]);

  useEffect(() => {
    if (pendingDraftCard && pendingDraftCard.draftKind === "parking_report") {
      try {
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as {
          lotSlug?: string;
        };
        if (parsed.lotSlug) setSelectedLotSlug(parsed.lotSlug);
      } catch {
        // ignore
      }
      setStatusBanner(
        `Draft ready: ${pendingDraftCard.title} — tap a fullness button below to publish!`
      );
      setPendingDraftCard(null);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  const lots = data?.lots ?? [];
  const displayedLots = selectedLotSlug
    ? [
        ...lots.filter((l) => l.slug === selectedLotSlug),
        ...lots.filter((l) => l.slug !== selectedLotSlug),
      ]
    : lots;

  const handleReportFullness = async (
    lotId: Id<"parkingLots">,
    lotName: string,
    tier: 0 | 1 | 2 | 3
  ) => {
    try {
      const level = selectedLevelByLot[String(lotId)] || undefined;
      await submitReport({
        parkingLotId: lotId,
        reportKind: "fullness",
        fullnessTier: tier,
        deckLevel: level,
      });
      setStatusBanner(
        `Published live Parking Report on ${lotName}${level ? ` (${level})` : ""} — decays over 45m.`
      );
    } catch (err: any) {
      setStatusBanner(
        err?.data?.message || err?.message || "Could not submit Parking Report."
      );
    }
  };

  const handleSpotOpening = async (
    lotId: Id<"parkingLots">,
    lotName: string
  ) => {
    try {
      const level = selectedLevelByLot[String(lotId)] || undefined;
      await submitReport({
        parkingLotId: lotId,
        reportKind: "spot_opening",
        deckLevel: level,
      });
      setStatusBanner(
        `Broadcast 10-minute anonymous 'Leaving in ~5 min' pulse on ${lotName}${level ? ` (${level})` : ""}!`
      );
    } catch (err: any) {
      setStatusBanner(
        err?.data?.message || err?.message || "Could not broadcast Spot Opening."
      );
    }
  };

  return (
    <div data-testid="parking-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              KSU Parking Lots &amp; Live Deck Fullness
            </h1>
            <p className="text-xs text-[#5E6675]">
              Kennesaw &amp; Marietta · Recent Student reports and modeled
              fullness estimates · Pin up to 2 Parking Lots.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              data-testid="permit-tier-select"
              value={permitFilter}
              onChange={(e) => {
                const v = e.target.value;
                setPermitFilter(v);
                void savePrefs({ permitTier: v });
              }}
              className="rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-3 py-2 text-xs font-bold text-[#111317]"
            >
              {PERMIT_TIERS.map((t) => (
                <option key={t} value={t}>
                  Permit: {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {statusBanner && (
          <div
            data-testid="parking-status-banner"
            className="mt-3 rounded-xl bg-[#FFF6DC] px-3 py-2 text-xs font-bold text-[#855A00]"
          >
            {statusBanner}
          </div>
        )}
      </div>

      {/* Interactive MapLibre GL JS + OpenFreeMap Polygon Map */}
      <CampusGeoMap
        campusFilter={(data?.campusFilter as any) ?? "Kennesaw"}
        showParkingLots
        lotStatuses={lots.map((l) => ({
          slug: l.slug,
          name: l.name,
          campus: l.campus,
          latitude: l.latitude,
          longitude: l.longitude,
          effectiveTier: l.effectiveTier,
          hasSpotOpening: l.spotOpenings.length > 0,
        }))}
        onSelectLotSlug={(slug) => setSelectedLotSlug(slug)}
      />

      {/* Parking Lot Cards */}
      <div className="space-y-3">
        {displayedLots.map((lot) => {
          const badgeCls =
            lot.effectiveTier === 0
              ? "bg-[#DCFCE7] text-[#15803D]"
              : lot.effectiveTier === 1
                ? "bg-[#FEF3C7] text-[#B45309]"
                : "bg-[#FEE2E2] text-[#B91C1C]";

          return (
            <div
              key={String(lot._id)}
              data-testid={`parking-lot-card-${lot.slug}`}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm font-black text-[#111317]">
                      <Car className="h-4 w-4" />
                      {lot.name}
                    </span>
                    <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[10.5px] font-bold text-[#5E6675]">
                      {lot.campus} · {lot.lotCode}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${badgeCls}`}
                    >
                      {lot.tierLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#5E6675]">
                    {lot.provenanceLabel} · Permits:{" "}
                    {lot.permitTiers.join(", ")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await savePrefs({ togglePinLotId: lot._id });
                    } catch (err: any) {
                      setStatusBanner(err?.data?.message || err?.message);
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-extrabold ${
                    lot.isPinned
                      ? "border-[#111317] bg-[#111317] text-[#FDBB30]"
                      : "border-[#E4E7EE] bg-[#F9FAFC] text-[#5E6675]"
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span>{lot.isPinned ? "Pinned" : "Pin"}</span>
                </button>
              </div>

              {/* Active 10-minute Spot Opening Broadcasts */}
              {lot.spotOpenings.map((op) => (
                <div
                  key={String(op._id)}
                  data-testid="active-spot-opening"
                  className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#DCFCE7] px-3 py-2 text-xs font-extrabold text-[#15803D]"
                >
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" />
                    <span>
                      Spot opening in ~5 min{" "}
                      {op.deckLevel ? `on ${op.deckLevel}` : ""} (anonymous
                      broadcast)
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="spot-opening-gone-btn"
                    onClick={() => void resolveOpening({ reportId: op._id })}
                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#111317]"
                  >
                    {op.isAuthor
                      ? "Cancel My Ping"
                      : `Mark Gone (${op.goneVotes}/2)`}
                  </button>
                </div>
              ))}

              {/* Automatic Overflow Lot + Big Owl Bus Shuttle Reroute */}
              {lot.overflowReroute && (
                <div
                  data-testid="overflow-reroute-banner"
                  className="mt-2.5 rounded-xl border border-[#FDBB30] bg-[#FFF6DC] px-3 py-2 text-xs text-[#111317]"
                >
                  <strong>Overflow Shuttle Reroute:</strong>{" "}
                  <span className="font-extrabold">
                    {lot.overflowReroute.name}
                  </span>{" "}
                  is <strong>{lot.overflowReroute.tierLabel}</strong>
                  {lot.overflowReroute.shuttleRouteName
                    ? ` · ${lot.overflowReroute.shuttleRouteName}${lot.overflowReroute.shuttleEtaMinutes === undefined ? " · ETA unavailable" : ` in ${lot.overflowReroute.shuttleEtaMinutes} min`}`
                    : ""}
                </div>
              )}

              {/* Optional Deck Level Chip + 1-Tap 4-Tier Report + Leaving in ~5 min */}
              <div className="mt-3 space-y-2 border-t border-[#E4E7EE] pt-2.5">
                {lot.isDeck && lot.levels.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-bold text-[#5E6675]">
                      Deck Level:
                    </span>
                    {lot.levels.map((lvl) => {
                      const active =
                        selectedLevelByLot[String(lot._id)] === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() =>
                            setSelectedLevelByLot((prev) => ({
                              ...prev,
                              [String(lot._id)]: active ? "" : lvl,
                            }))
                          }
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            active
                              ? "bg-[#111317] text-[#FDBB30]"
                              : "border border-[#E4E7EE] bg-[#F4F6FA] text-[#5E6675]"
                          }`}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {FULLNESS_BUTTONS.map((fb) => (
                    <button
                      key={fb.tier}
                      type="button"
                      data-testid={`report-tier-${lot.slug}-${fb.tier}`}
                      onClick={() =>
                        void handleReportFullness(lot._id, lot.name, fb.tier)
                      }
                      className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-extrabold transition hover:brightness-95 ${fb.cls}`}
                    >
                      {fb.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    data-testid={`leaving-5min-${lot.slug}`}
                    onClick={() => void handleSpotOpening(lot._id, lot.name)}
                    className="ml-auto inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3 py-1.5 text-[11px] font-extrabold text-[#FDBB30]"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Leaving in ~5 min</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
