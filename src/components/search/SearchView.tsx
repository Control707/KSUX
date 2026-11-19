"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";
import { CampusGeoMap } from "@/components/map/CampusGeoMap";
import { loadCampusPlaces, searchPlaces, type Campus, type CampusPlace } from "@/lib/campusPlaces";

type CampusChoice = "All KSU" | Campus;
const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

const link = "inline-flex min-h-[var(--target)] w-full min-w-0 flex-col justify-center rounded-[var(--r-md)] px-[var(--sp-3)] py-[var(--sp-2)] hover:bg-[var(--surface-2)] [overflow-wrap:anywhere]";
const action = "inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border border-[var(--line-strong)] px-[var(--sp-3)] text-sm font-bold hover:border-[var(--ink)]";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function priceLabel(item: { pricingMode: string; priceCents?: number }) {
  if (item.pricingMode === "free_pickup") return "Free";
  if (item.pricingMode === "open_to_trade") return "Trade";
  return `$${((item.priceCents ?? 0) / 100).toFixed(0)} OBO`;
}

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) + " ET";
}

function ResultGroup({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-labelledby={id} data-testid={`search-group-${id}`} className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)]">
      <h2 id={id} className="px-[var(--sp-3)] font-display text-[length:var(--fs-lg)] font-bold">
        {title} <span className="text-sm font-normal text-[var(--muted)]">({count})</span>
      </h2>
      <ul className="mt-[var(--sp-1)]">{children}</ul>
    </section>
  );
}

/**
 * KSU-wide search (#77, ADR-0008). Ignores the location setting; the visible
 * Campus filter is local to this screen. Never shows Incidents or Alerts.
 */
export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inputId = useId();
  const [text, setText] = useState(() => params.get("q")?.slice(0, 100) ?? "");
  const [campus, setCampus] = useState<CampusChoice>("All KSU");
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [mapPlace, setMapPlace] = useState<CampusPlace | null>(null);
  const query = useDebounced(text.trim(), DEBOUNCE_MS);
  const searching = query.length >= MIN_QUERY;

  useEffect(() => {
    let cancelled = false;
    void loadCampusPlaces().then((loaded) => { if (!cancelled) setPlaces(loaded); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Keep the query in the URL so Back returns to the same results.
  const urlQuery = params.get("q") ?? "";
  useEffect(() => {
    if (query === urlQuery) return;
    router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false });
  }, [query, urlQuery, pathname, router]);

  const results = useViewerQuery(api.search.searchCampus, searching
    ? { queryText: query, campus: campus === "All KSU" ? undefined : campus }
    : "skip");

  const buildings = useMemo(() => searching
    ? searchPlaces(places, query, { limit: 8 }).filter((p) => campus === "All KSU" || p.campus === campus)
    : [], [places, query, searching, campus]);

  const total = results
    ? buildings.length + results.events.length + results.clubs.length + results.courseHubs.length + results.listings.length
    : 0;
  const status = !searching
    ? "Type at least 2 characters to search."
    : results === undefined ? "Searching…"
      : total === 0 ? `No results for “${query}”${campus === "All KSU" ? "" : ` on the ${campus} Campus`}.`
        : `${total} result${total === 1 ? "" : "s"} for “${query}”.`;

  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold">Search KSU</h1>
      <form role="search" aria-label="Search KSU" onSubmit={(e) => e.preventDefault()} className="space-y-[var(--sp-2)]">
        <label htmlFor={inputId} className="block text-sm font-bold">
          Buildings, Events, Clubs, Course Hubs and Listings
        </label>
        <input
          id={inputId}
          type="search"
          data-testid="search-input"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          placeholder="Try “library”, “CS 3305” or “calculator”"
          autoComplete="off"
          className="min-h-[var(--target)] w-full rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-4)] text-[length:var(--fs-body)] text-[var(--ink)]"
        />
        <SegmentedControl<CampusChoice>
          label="Campus"
          hideLabel={false}
          testIdPrefix="search-campus"
          options={[{ value: "All KSU", label: "All KSU" }, { value: "Kennesaw", label: "Kennesaw" }, { value: "Marietta", label: "Marietta" }]}
          value={campus}
          onChange={setCampus}
        />
      </form>
      <p role="status" data-testid="search-status" className="text-sm text-[var(--muted)]">{status}</p>
      <p className="text-sm text-[var(--muted)]">
        Safety Incidents and Official Alerts aren’t searched. <Link href="/safety" className="font-bold underline">Open Safety</Link>
      </p>

      {searching && results && (
        <div className="space-y-[var(--sp-3)]">
          <ResultGroup id="buildings" title="Buildings" count={buildings.length}>
            {buildings.map((place) => (
              <li key={place.id} className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] px-[var(--sp-3)] py-[var(--sp-1)]">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-bold">{place.name}</span>{place.code ? ` · ${place.code}` : ""} <CampusBadge campus={place.campus} />
                </span>
                <button type="button" className={action} aria-expanded={mapPlace?.id === place.id} aria-controls="search-map"
                  onClick={() => setMapPlace(mapPlace?.id === place.id ? null : place)}>
                  {mapPlace?.id === place.id ? "Hide map" : "Show on map"}<span className="sr-only">: {place.name}</span>
                </button>
              </li>
            ))}
          </ResultGroup>
          {mapPlace && (
            <div id="search-map">
              <CampusGeoMap key={mapPlace.id} campusFilter={mapPlace.campus} destinationPlaceId={mapPlace.id}
                showParkingLots showShuttleRoutes title={`${mapPlace.name} on the ${mapPlace.campus} campus map`} />
            </div>
          )}
          <ResultGroup id="events" title="Events" count={results.events.length}>
            {results.events.map((ev) => (
              <li key={ev._id}>
                <Link href={`/events/${ev._id}`} className={link}>
                  <span className="font-bold">{ev.title}</span>
                  <span className="text-sm">
                    {formatWhen(ev.startTime)} · {ev.isVirtual ? "Online" : ev.locationName} · {ev.campusScope === "Both" ? "Both Campuses" : ev.campus}
                  </span>
                </Link>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup id="clubs" title="Clubs" count={results.clubs.length}>
            {results.clubs.map((club) => (
              <li key={club._id}>
                <Link href={`/clubs/${encodeURIComponent(club.slug)}`} className={link}>
                  <span className="font-bold">{club.name}</span>
                  <span className="text-sm">{club.campus} · {club.summary}</span>
                </Link>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup id="course-hubs" title="Course Hubs" count={results.courseHubs.length}>
            {results.courseHubs.map((hub) => (
              <li key={hub._id}>
                <Link href={`/courses/${encodeURIComponent(hub.subjectCourse)}`} className={link}>
                  <span className="font-bold">{hub.subjectCourse} · {hub.title}</span>
                  <span className="text-sm">{hub.campuses.join(" and ")}</span>
                </Link>
              </li>
            ))}
          </ResultGroup>
          <ResultGroup id="listings" title="Marketplace Listings" count={results.listings.length}>
            {results.listings.map((item) => (
              <li key={item._id}>
                <Link href={`/marketplace?q=${encodeURIComponent(item.title)}`} className={link}>
                  <span className="font-bold">{item.title}</span>
                  <span className="text-sm">{priceLabel(item)} · {item.campus}</span>
                </Link>
              </li>
            ))}
          </ResultGroup>
        </div>
      )}
    </div>
  );
}
