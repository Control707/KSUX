"use client";

import React, { useId, useState } from "react";
import { Utensils } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { SegmentedControl } from "@/components/a11y/controls";
import { NewTab, StateChip, errorMessage, toggleClass, ui, type Tone } from "@/components/communities/campusLifeUi";

const STATION_CHIP_PRESETS = ["Fresh batch out", "Ice cream / beverage station down", "Seating tight"] as const;

const LINE_TIERS = [
  ["no_wait", "No wait", "○", "ok"],
  ["short_wait", "5–10 min line", "◐", "warn"],
  ["packed", "Packed, 15 min+", "●", "bad"],
] as const satisfies readonly (readonly [string, string, string, Tone])[];

const OPEN_STATES: Record<string, { tone: Tone; glyph: string }> = {
  open: { tone: "ok", glyph: "●" },
  closing_soon: { tone: "warn", glyph: "◐" },
  closed: { tone: "neutral", glyph: "○" },
  unknown: { tone: "neutral", glyph: "?" },
};

function lineChip(tierValue: string, label: string, isLive: boolean) {
  const match = LINE_TIERS.find(([key]) => key === tierValue);
  if (!isLive || !match) {
    return <StateChip tone="neutral" glyph="◌" dashed>{label}</StateChip>;
  }
  return <StateChip tone={match[3]} glyph={match[2]}>{label}</StateChip>;
}

export function DiningView() {
  const id = useId();
  const { toast } = useAnnouncer();
  const [dietaryFilter, setDietaryFilter] = useState<string>("");
  const [excludeAllergen, setExcludeAllergen] = useState<string>("");
  const [menuDay, setMenuDay] = useState<"today" | "tomorrow">("today");
  const [selectedChipsBySlug, setSelectedChipsBySlug] = useState<Record<string, string[]>>({});

  const data = useViewerQuery(api.transitDining.listDiningVenues, {
    menuDay,
    dietaryFilter: dietaryFilter || undefined,
    excludeAllergen: excludeAllergen || undefined,
  });

  const submitLineCheck = useViewerMutation(api.transitDining.submitDiningLineCheck);

  const toggleStationChip = (slug: string, chip: string) => {
    setSelectedChipsBySlug((prev) => {
      const current = prev[slug] ?? [];
      const exists = current.includes(chip);
      return { ...prev, [slug]: exists ? current.filter((c) => c !== chip) : [...current, chip] };
    });
  };

  return (
    <div data-testid="dining-view" className={ui.page}>
      <section aria-labelledby={`${id}-h`} className={`${ui.card} space-y-[var(--sp-3)]`}>
        <h1 id={`${id}-h`} data-route-heading="" tabIndex={-1} className={ui.h1}>
          Dining &amp; Line Checks
        </h1>
        <p className={ui.muted}>
          Venues on the Campus you picked in the header. Menus come from Nutrislice; line checks are Student reports from the last 30 minutes and are not verified.
        </p>
        {data?.staleness.isStale && data.staleness.label && (
          <p role="status">
            <StateChip tone="warn" glyph="⏱">{data.staleness.label}</StateChip>
          </p>
        )}
        <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-3">
          <SegmentedControl
            label="Menu day"
            hideLabel={false}
            options={[{ value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }] as const}
            value={menuDay}
            onChange={setMenuDay}
            testIdPrefix="dining-day"
          />
          <div className="min-w-0">
            <label htmlFor={`${id}-diet`} className={ui.label}>Dietary preference</label>
            <select id={`${id}-diet`} value={dietaryFilter} onChange={(e) => setDietaryFilter(e.target.value)} className={ui.input}>
              <option value="">Any</option>
              <option value="vegan">Vegan</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="halal_friendly">Halal-friendly</option>
              <option value="gluten_free">Gluten-free</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-allergen`} className={ui.label}>Leave out allergen</label>
            <select id={`${id}-allergen`} value={excludeAllergen} onChange={(e) => setExcludeAllergen(e.target.value)} className={ui.input}>
              <option value="">None</option>
              <option value="milk">Milk / dairy</option>
              <option value="wheat">Wheat</option>
              <option value="egg">Egg</option>
              <option value="soy">Soy</option>
              <option value="sesame">Sesame</option>
            </select>
          </div>
        </div>
      </section>

      {data === undefined && <p role="status" className={ui.muted}>Loading dining venues…</p>}
      {data && data.venues.length === 0 && <p className={ui.muted}>No dining venues for this Campus.</p>}

      <ul className="space-y-[var(--sp-3)]" data-testid="dining-venue-list">
        {(data?.venues ?? []).map((venue) => {
          const stations = menuDay === "today" ? venue.todayStations : venue.tomorrowStations;
          const hasMenu = menuDay === "today" ? venue.hasTodayMenu : venue.hasTomorrowMenu;
          const activeChips = selectedChipsBySlug[venue.slug] ?? [];
          const openStyle = OPEN_STATES[venue.openStatus.state] ?? OPEN_STATES.unknown!;
          const headingId = `${id}-${venue.slug}`;

          return (
            <li key={String(venue._id)} className={`${ui.card} space-y-[var(--sp-3)]`}>
              <div className="space-y-[var(--sp-1)]">
                <h2 id={headingId} className={`${ui.h2} flex min-w-0 items-center gap-[var(--sp-2)]`}>
                  <Utensils aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">{venue.name}</span>
                </h2>
                <p className={ui.muted}>
                  {venue.campus} · {venue.buildingName}
                </p>
              </div>
              <div className={ui.row}>
                <StateChip tone={openStyle.tone} glyph={openStyle.glyph} testId="dining-open-status">
                  {venue.hoursAreFixture ? "Demo hours · " : ""}
                  {venue.openStatus.label}
                </StateChip>
                <span className="text-sm">
                  <span className="sr-only">Line: </span>
                  {lineChip(venue.lineStatus.tierValue, venue.lineStatus.label, venue.lineStatus.isLive)}
                </span>
              </div>
              {venue.lineStatus.stationChips.length > 0 && (
                <p className="text-sm">Station notes: {venue.lineStatus.stationChips.join(" · ")}</p>
              )}
              <p className={ui.muted}>
                {venue.hoursAreFixture
                  ? "Sample hours for Judge Demo Mode"
                  : venue.hoursFreshness?.label
                    ? "KSU Dining hours · " + venue.hoursFreshness.label
                    : venue.hoursFreshness
                      ? "Hours from KSU Dining"
                      : "KSU Dining hours unavailable"}
                {" · "}
                {venue.menuIsFixture
                  ? "Sample menu for Judge Demo Mode"
                  : !hasMenu
                    ? "Nutrislice menu unavailable for this date"
                    : venue.menuFreshness?.label
                      ? "Nutrislice menu · " + venue.menuFreshness.label
                      : "Menu from Nutrislice"}
              </p>
              {stations.length === 0 && (
                <p className="text-sm">
                  {hasMenu || venue.menuIsFixture ? "No matching menu items for this day." : "Check the official menu for availability."}{" "}
                  <a href="https://ksu.nutrislice.com/menu/" target="_blank" rel="noreferrer" className="font-bold underline">
                    Check Nutrislice
                    <NewTab />
                  </a>
                </p>
              )}
              {stations.length > 0 && (
                <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
                  {stations.map((st: { name: string; items: { name: string; calories?: number }[] }) => (
                    <li key={st.name} className={ui.subCard}>
                      <h3 className="text-body font-bold">{st.name}</h3>
                      <ul className="mt-[var(--sp-1)] space-y-[var(--sp-1)] text-sm">
                        {st.items.map((it) => (
                          <li key={it.name}>
                            <span className="font-bold">{it.name}</span>
                            {typeof it.calories === "number" && <span className="text-[var(--muted)]"> · {it.calories} cal</span>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]">
                <fieldset className="min-w-0">
                  <legend className="text-sm font-bold">Add station notes (optional)</legend>
                  <div className={`${ui.row} mt-[var(--sp-1)]`}>
                    {STATION_CHIP_PRESETS.map((chip) => {
                      const active = activeChips.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleStationChip(venue.slug, chip)}
                          className={toggleClass(active)}
                        >
                          <span aria-hidden="true">{active ? "✓" : "+"}</span>
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className="text-sm font-bold">Report the line</legend>
                  <div className={`${ui.row} mt-[var(--sp-1)]`}>
                    {LINE_TIERS.map(([tier, label, glyph]) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={async () => {
                          try {
                            await submitLineCheck({ venueSlug: venue.slug, lineTier: tier, stationChips: activeChips });
                            toast({ tone: "success", message: `Line check sent: ${label}`, detail: venue.name });
                          } catch (err) {
                            toast({ tone: "error", message: "Couldn’t send your line check", detail: errorMessage(err, "") });
                          }
                        }}
                        className={ui.secondary}
                      >
                        <span aria-hidden="true">{glyph}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
