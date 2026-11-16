"use client";

import React, { useState } from "react";
import { Utensils } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";

const STATION_CHIP_PRESETS = [
  "Fresh batch out",
  "Ice cream / beverage station down",
  "Seating tight",
] as const;

export function DiningView() {
  const [dietaryFilter, setDietaryFilter] = useState<string>("");
  const [excludeAllergen, setExcludeAllergen] = useState<string>("");
  const [menuDay, setMenuDay] = useState<"today" | "tomorrow">("today");
  const [selectedChipsBySlug, setSelectedChipsBySlug] = useState<
    Record<string, string[]>
  >({});
  const [banner, setBanner] = useState<string | null>(null);

  const data = useViewerQuery(api.transitDining.listDiningVenues, {
    dietaryFilter: dietaryFilter || undefined,
    excludeAllergen: excludeAllergen || undefined,
  });

  const submitLineCheck = useViewerMutation(
    api.transitDining.submitDiningLineCheck
  );

  const toggleStationChip = (slug: string, chip: string) => {
    setSelectedChipsBySlug((prev) => {
      const current = prev[slug] ?? [];
      const exists = current.includes(chip);
      return {
        ...prev,
        [slug]: exists ? current.filter((c) => c !== chip) : [...current, chip],
      };
    });
  };

  return (
    <div data-testid="dining-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              KSU Dining Venues &amp; Live Line Checks
            </h1>
            <p className="text-xs text-[#5E6675]">
              The Commons, Stingers &amp; 15 retail eateries · Synced Nutrislice
              Today + Tomorrow menus &amp; 30m Student Line Checks.
            </p>
          </div>
          {data?.staleness.isStale && data.staleness.label && (
            <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
              {data.staleness.label}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] p-1">
            {(["today", "tomorrow"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMenuDay(d)}
                className={`rounded-lg px-3 py-1 text-xs font-extrabold capitalize ${
                  menuDay === d
                    ? "bg-[#111317] text-[#FDBB30]"
                    : "text-[#5E6675]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <select
            value={dietaryFilter}
            onChange={(e) => setDietaryFilter(e.target.value)}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-1.5 text-xs font-bold text-[#111317]"
          >
            <option value="">All Dietary Preferences</option>
            <option value="vegan">Vegan</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="halal_friendly">Halal-friendly</option>
            <option value="gluten_free">Gluten-Free</option>
          </select>

          <select
            value={excludeAllergen}
            onChange={(e) => setExcludeAllergen(e.target.value)}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-1.5 text-xs font-bold text-[#111317]"
          >
            <option value="">No Allergen Exclusion</option>
            <option value="milk">Exclude Milk / Dairy</option>
            <option value="wheat">Exclude Wheat</option>
            <option value="egg">Exclude Egg</option>
            <option value="soy">Exclude Soy</option>
            <option value="sesame">Exclude Sesame</option>
          </select>
        </div>

        {banner && (
          <p className="mt-3 rounded-xl bg-[#DCFCE7] px-3 py-2 text-xs font-bold text-[#15803D]">
            {banner}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {(data?.venues ?? []).map((venue) => {
          const stations =
            menuDay === "today" ? venue.todayStations : venue.tomorrowStations;
          const activeChips = selectedChipsBySlug[venue.slug] ?? [];

          return (
            <div
              key={String(venue._id)}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-black text-[#111317]">
                      <Utensils className="h-4 w-4" />
                      {venue.name}
                    </span>
                    <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10.5px] font-extrabold text-[#855A00]">
                      {venue.campus} · {venue.buildingName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#5E6675]">
                    {venue.lineStatus.label}
                    {venue.lineStatus.stationChips.length > 0
                      ? ` · ${venue.lineStatus.stationChips.join(" · ")}`
                      : ""}
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                    venue.openStatus.state === "open"
                      ? "bg-[#DCFCE7] text-[#15803D]"
                      : venue.openStatus.state === "closing_soon"
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#E4E7EE] text-[#5E6675]"
                  }`}
                >
                  {venue.openStatus.label}
                </span>
              </div>

              {/* Synced Nutrislice Stations */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {stations.map((st: any) => (
                  <div
                    key={st.name}
                    className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] p-2.5 text-xs"
                  >
                    <div className="font-extrabold text-[#111317]">
                      {st.name}
                    </div>
                    <ul className="mt-1 space-y-1 text-[11.5px] text-[#374151]">
                      {st.items.map((it: any) => (
                        <li key={it.name}>
                          <span className="font-semibold">{it.name}</span>{" "}
                          <span className="text-[#5E6675]">
                            ({it.calories} cal)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* 30m Line Check + Station Chips */}
              <div className="mt-3 space-y-2 border-t border-[#E4E7EE] pt-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {STATION_CHIP_PRESETS.map((chip) => {
                    const active = activeChips.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleStationChip(venue.slug, chip)}
                        className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                          active
                            ? "bg-[#111317] text-[#FDBB30]"
                            : "border border-[#E4E7EE] bg-[#F4F6FA] text-[#5E6675]"
                        }`}
                      >
                        + {chip}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#5E6675]">
                    Line Check (30m):
                  </span>
                  {(
                    [
                      ["no_wait", "No Wait"],
                      ["short_wait", "5–10m Line"],
                      ["packed", "Packed 15m+"],
                    ] as const
                  ).map(([tier, label]) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={async () => {
                        try {
                          await submitLineCheck({
                            venueSlug: venue.slug,
                            lineTier: tier,
                            stationChips: activeChips,
                          });
                          setBanner(
                            `Submitted '${label}' Line Check for ${venue.name}.`
                          );
                        } catch (err: any) {
                          setBanner(err?.data?.message || err?.message);
                        }
                      }}
                      className="rounded-xl border border-[#E4E7EE] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#111317] hover:border-[#D99B00] hover:bg-[#FFF6DC]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
