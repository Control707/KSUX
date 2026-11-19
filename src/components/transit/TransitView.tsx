"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bus, ChevronDown, ChevronUp, ExternalLink, MapPin, Star, Undo2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { SegmentedControl, usePrefersReducedMotion } from "@/components/a11y/controls";
import {
  CampusGeoMap,
  RouteBadge,
  type CampusMapVehicleMarker,
} from "@/components/map/CampusGeoMap";
import { PATTERN_LABEL, routeStyle } from "@/components/map/mapFeatures";
import {
  BROWSER_POLL_MS,
  BUS_STALE_MS,
  STOP_REPORTS,
  arrivalFor,
  formatClock,
  minutesAgo,
  placeBusBetweenStops,
  type Arrival,
  type StopReportKind,
} from "./transitModel";

type Overview = NonNullable<ReturnType<typeof useOverview>>;
type RouteRow = Overview["routes"][number];
type StopRow = RouteRow["stops"][number];
type Notice = Overview["shuttleNotices"][number];
type Snap = "peek" | "half" | "full";
type FeedState = "live" | "stale" | "offline";

function useOverview() {
  return useViewerQuery(api.transitDining.listShuttleOverview, {});
}

interface BrowserBus {
  busId: string;
  busName: string;
  latitude: number;
  longitude: number;
  heading?: number;
  passioRouteId?: string;
}

const card = "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)] text-[var(--ink)]";
const btn =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]";
const linkBtn =
  "inline-flex min-h-[var(--target)] items-center gap-[var(--sp-1)] text-left text-sm font-bold text-[var(--ink)] underline underline-offset-2";

export function TransitView() {
  const overview = useOverview();
  const submitStopReport = useViewerMutation(api.transitDining.submitShuttleStopPulse);
  const undoStopReport = useViewerMutation(api.transitDining.undoShuttleStopPulse);
  const saveYourStop = useViewerMutation(api.transitDining.setYourStop);
  const { announce, toast } = useAnnouncer();
  const reducedMotion = usePrefersReducedMotion();

  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const [browserBuses, setBrowserBuses] = useState<{ buses: BrowserBus[]; at: number } | null>(null);
  // The direct feed is "down" after a failed poll until the next good one.
  const [directDown, setDirectDown] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [onlyCode, setOnlyCode] = useState<string | null>(null);
  const [mapSelection, setMapSelection] = useState<string | null>(null);
  const yourStopId = overview?.yourStopId ?? null;
  const stopHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  const [sheetPad, setSheetPad] = useState(0);
  // On phones the sheet floats over the map: pad camera fits and map controls above it.
  useEffect(() => {
    if (!sheetEl) return;
    const measure = () => {
      const fixed = getComputedStyle(sheetEl).position === "fixed";
      if (!fixed) return setSheetPad(0);
      const rect = sheetEl.getBoundingClientRect();
      // Keep the zoom controls on the visible map even when the sheet is tall.
      const canvas = document.querySelector<HTMLElement>("[data-testid=transit-view] [data-testid=campus-map-canvas]");
      const room = (canvas?.clientHeight ?? window.innerHeight) - 13 * 16; // keep ~13rem for controls
      setSheetPad(Math.round(Math.max(0, Math.min(rect.height, room))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheetEl);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sheetEl]);
  const fitPadding = useMemo(() => ({ bottom: sheetPad }), [sheetPad]);
  const focusStopHeading = useRef(false);

  // Clock for stale checks and "N min ago" copy.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Browser-direct Passio GO GPS polling every 12 s (CORS *; no Convex write storm).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!navigator.onLine) return;
      try {
        const resp = await fetch("https://passio3.com/kennesaw/passioTransit/gtfs/realtime/vehiclePositions.json", {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) throw new Error(`Passio returned ${resp.status}`);
        const json = await resp.json();
        const entities: any[] = Array.isArray(json?.entity) ? json.entity : [];
        if (cancelled) return;
        const parsed: BrowserBus[] = [];
        entities.forEach((e, i) => {
          const pos = e?.vehicle?.position;
          if (!pos || !Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude)) return;
          parsed.push({
            busId: String(e?.vehicle?.vehicle?.id ?? `live-${i}`),
            busName: String(e?.vehicle?.vehicle?.label ?? `Big Owl #${i + 1}`),
            latitude: Number(pos.latitude),
            longitude: Number(pos.longitude),
            heading: Number.isFinite(pos.bearing) ? Number(pos.bearing) : undefined,
            passioRouteId: e?.vehicle?.trip?.route_id ? String(e.vehicle.trip.route_id) : undefined,
          });
        });
        if (parsed.length > 0) setBrowserBuses({ buses: parsed, at: Date.now() });
        setDirectDown(parsed.length === 0);
      } catch {
        // Keep the last positions, shown stale while the feed is down.
        if (!cancelled) setDirectDown(true);
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), BROWSER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const directLive = Boolean(browserBuses && !directDown && Date.now() - browserBuses.at <= BUS_STALE_MS && online);
  // Synced Convex positions: live when the server snapshot is fresh (or Demo fixtures).
  const syncedLive = Boolean(overview && (overview.isFixture || !overview.staleness.isStale) && overview.vehicles.length > 0);
  const feed: FeedState = !online ? "offline" : directLive || syncedLive ? "live" : "stale";
  const busesStale = feed !== "live";
  const lastGpsAt = browserBuses?.at ?? overview?.fetchedAt ?? null;

  // Announce feed state changes (never bus movement).
  const prevFeed = useRef<FeedState | null>(null);
  useEffect(() => {
    if (!overview) return;
    if (prevFeed.current && prevFeed.current !== feed) {
      announce(
        feed === "live"
          ? "Bus GPS is live again."
          : feed === "offline"
            ? "Offline. Showing routes and stops only."
            : "Bus GPS not updating. Times are schedule estimates."
      );
    }
    prevFeed.current = feed;
  }, [feed, overview, announce]);

  const routes = useMemo(() => overview?.routes ?? [], [overview]);
  const routeById = useMemo(() => new Map(routes.map((r) => [r.passioRouteId, r])), [routes]);
  const notices = useMemo(() => overview?.shuttleNotices ?? [], [overview]);
  const noticesFor = useCallback(
    (passioRouteId: string) => notices.filter((n) => n.passioRouteIds.includes(passioRouteId)),
    [notices]
  );
  const shownNotices = useMemo(
    () => notices.filter((n) => n.passioRouteIds.some((id) => routeById.has(id))),
    [notices, routeById]
  );

  // Every stop shown on this Campus, merged across routes.
  const stopsById = useMemo(() => {
    const map = new Map<string, { stop: StopRow; routes: { route: RouteRow; stop: StopRow }[] }>();
    for (const route of routes) {
      for (const stop of route.stops) {
        const entry = map.get(stop.stopId) ?? { stop, routes: [] };
        entry.routes.push({ route, stop });
        map.set(stop.stopId, entry);
      }
    }
    return map;
  }, [routes]);

  // Vehicles: browser-direct when live, else the synced snapshot. Stale keeps the last position.
  const vehicles: (CampusMapVehicleMarker & { passioRouteId?: string })[] = useMemo(() => {
    if (feed === "offline") return [];
    if (browserBuses && (directLive || !syncedLive)) {
      return browserBuses.buses.map((b) => {
        const route = b.passioRouteId ? routeById.get(b.passioRouteId) : undefined;
        return {
          busId: b.busId,
          busName: b.busName,
          latitude: b.latitude,
          longitude: b.longitude,
          routeCode: route?.shortName,
          passioRouteId: b.passioRouteId,
          heading: b.heading,
          stale: busesStale,
          loadLabel: "Live GPS",
        };
      });
    }
    return (overview?.vehicles ?? []).map((v) => ({
      busId: v.busId,
      busName: v.busName,
      latitude: v.latitude,
      longitude: v.longitude,
      routeCode: routeById.get(v.passioRouteId)?.shortName,
      passioRouteId: v.passioRouteId,
      heading: v.heading,
      stale: busesStale,
      loadLabel: v.totalCap > 0 ? `${v.paxLoad}/${v.totalCap}` : undefined,
    }));
  }, [feed, browserBuses, directLive, syncedLive, overview, routeById, busesStale]);

  const arrival = useCallback(
    (route: RouteRow, stop: StopRow): Arrival =>
      arrivalFor({
        code: route.shortName,
        routeName: route.name.replace(new RegExp(`^${route.shortName}\\s+`), ""),
        liveMinutes: stop.etaMinutes[0] ?? null,
        stale: busesStale,
        runsToday: route.runsToday,
        runDaysLabel: route.runDaysLabel,
      }),
    [busesStale]
  );

  const yourStop = yourStopId ? stopsById.get(yourStopId) : undefined;

  // Your stop's next bus at ≤2 min: one polite message, at most once a minute.
  const lastSoonAnnounce = useRef(0);
  useEffect(() => {
    if (!yourStop || busesStale) return;
    const soonest = yourStop.routes
      .map(({ route, stop }) => ({ route, minutes: stop.etaMinutes[0] }))
      .filter((x): x is { route: RouteRow; minutes: number } => typeof x.minutes === "number" && x.route.runsToday)
      .sort((a, b) => a.minutes - b.minutes)[0];
    if (!soonest || soonest.minutes > 2) return;
    if (Date.now() - lastSoonAnnounce.current < 60_000) return;
    lastSoonAnnounce.current = Date.now();
    announce(`${soonest.route.shortName} bus ${soonest.minutes <= 1 ? "arriving now" : `in ${soonest.minutes} minutes`} at your stop, ${yourStop.stop.name}.`);
  }, [yourStop, busesStale, announce, now]);

  const openStop = useCallback(
    (stopId: string, from: "map" | "list" | "peek") => {
      const entry = stopsById.get(stopId);
      if (!entry) return;
      setOpenStopId(stopId);
      setMapSelection(`stop:${stopId}`);
      if (from !== "peek" && snap === "peek") setSnap("half");
      focusStopHeading.current = true;
      if (from === "map") {
        const first = entry.routes[0];
        announce(
          `${entry.stop.name} selected. ${entry.routes.length} route${entry.routes.length === 1 ? "" : "s"}. ${
            first ? arrival(first.route, first.stop).sr : ""
          }`
        );
      }
    },
    [stopsById, snap, announce, arrival]
  );

  useEffect(() => {
    if (openStopId && focusStopHeading.current) {
      focusStopHeading.current = false;
      requestAnimationFrame(() => {
        stopHeadingRef.current?.focus();
        stopHeadingRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
      });
    }
  }, [openStopId, reducedMotion]);

  const selectRoute = (passioRouteId: string, from: "map" | "list") => {
    const route = routeById.get(passioRouteId);
    if (!route) return;
    setMapSelection(`route:${passioRouteId}`);
    setExpandedRoute(passioRouteId);
    if (snap === "peek") setSnap("half");
    if (from === "map") {
      const n = noticesFor(passioRouteId).length;
      announce(
        `${route.shortName} ${route.name} selected. ${PATTERN_LABEL[routeStyle(route.shortName, false).pattern]}.${
          n ? ` ${n} Shuttle Notice${n === 1 ? "" : "s"}.` : ""
        }`
      );
    }
    // From the list, keep focus on the pressed row; from the map, move to the route row.
    if (from === "map") requestAnimationFrame(() => document.getElementById(`route-toggle-${passioRouteId}`)?.focus());
  };

  const selectBus = (busId: string, from: "map" | "list") => {
    const bus = vehicles.find((v) => v.busId === busId);
    const route = bus?.passioRouteId ? routeById.get(bus.passioRouteId) : undefined;
    setMapSelection(`bus:${busId}`);
    if (route) {
      setExpandedRoute(route.passioRouteId);
      if (snap === "peek") setSnap("half");
    }
    if (from === "map" && bus) {
      announce(
        `${route ? `${route.shortName} bus` : "Bus"} ${bus.busName}. ${
          bus.stale ? "Position not updating." : "Live GPS."
        }`
      );
    }
  };

  const makeYourStop = async (stopId: string) => {
    try {
      await saveYourStop({ stopId });
      const name = stopsById.get(stopId)?.stop.name ?? "This stop";
      toast({ message: `${name} is your stop`, tone: "success", testId: "your-stop-toast" });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : "Could not save your stop", tone: "error" });
    }
  };

  const showOnMap = (stopId: string) => {
    setMapSelection(`stop:${stopId}`);
    if (snap === "full") setSnap("half");
    announce(`${stopsById.get(stopId)?.stop.name ?? "Stop"} shown on the map`);
  };

  const [pendingReport, setPendingReport] = useState<string | null>(null);
  const report = async (stopId: string, kind: StopReportKind, label: string) => {
    setPendingReport(stopId);
    try {
      const result = await submitStopReport({ stopId, pulseKind: kind });
      toast({
        message: `Stop report sent: ${label}`,
        detail: "Lasts 15 min · anonymous to Students · not sent to Big Owl Bus or KSU",
        tone: "success",
        testId: "stop-report-toast",
      });
      return result;
    } catch (error) {
      toast({ message: "Couldn’t send your stop report", detail: (error as Error).message, tone: "error" });
    } finally {
      setPendingReport(null);
    }
  };
  const undo = async (pulseId: string, stopName: string) => {
    try {
      await undoStopReport({ pulseId: pulseId as Id<"campusPulses"> });
      announce(`Your stop report at ${stopName} was removed.`);
    } catch (error) {
      toast({ message: "Couldn’t undo your stop report", detail: (error as Error).message, tone: "error" });
    }
  };

  const campusLabel = overview?.campusFilter === "All KSU" ? "KSU" : (overview?.campusFilter ?? "Kennesaw");

  const feedPill = (
    <p
      data-testid="transit-feed-pill"
      data-feed={feed}
      className={`inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border px-[var(--sp-3)] text-sm font-bold ${
        feed === "live"
          ? "border-[var(--ok-fg)] bg-[var(--ok-bg)] text-[var(--ok-fg)]"
          : "border-dashed border-[var(--warn-fg)] bg-[var(--warn-bg)] text-[var(--warn-fg)]"
      }`}
    >
      <span aria-hidden="true">{feed === "live" ? "●" : "◌"}</span>
      {feed === "offline"
        ? "Offline · routes & stops only"
        : feed === "stale"
          ? `Bus GPS not updating · last ${lastGpsAt ? minutesAgo(lastGpsAt, now) : "?"} min ago`
          : directLive
            ? "Direct Passio GPS · live"
            : overview?.isFixture
              ? "Demo GPS · live"
              : "Synced Passio GPS · live"}
    </p>
  );

  const noticeLink = shownNotices.length > 0 && (
    <button
      type="button"
      data-testid="peek-notice-link"
      onClick={() => {
        setSnap("half");
        const first = shownNotices[0]!.passioRouteIds.find((id) => routeById.has(id));
        if (first) setExpandedRoute(first);
        requestAnimationFrame(() => document.getElementById(`route-toggle-${first}`)?.focus());
      }}
      className={linkBtn}
    >
      <NoticeIcon />
      {shownNotices.length} Shuttle Notice{shownNotices.length === 1 ? "" : "s"} on {campusLabel} routes
    </button>
  );

  const yourStopCard = (
    <section aria-labelledby="your-stop-heading" data-testid="your-stop-card" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
        <h2 id="your-stop-heading" className="font-display text-[length:var(--fs-lg)] font-bold">
          {yourStop ? `Your stop · ${yourStop.stop.name}` : "Your stop"}
        </h2>
        {yourStop && (
          <button type="button" onClick={() => openStop(yourStop.stop.stopId, "peek")} className={btn}>
            Open stop
          </button>
        )}
      </div>
      {yourStop ? (
        <ul aria-label={`Next arrivals at ${yourStop.stop.name}`} className="mt-[var(--sp-2)] space-y-[var(--sp-1)]">
          {nextArrivals(yourStop.routes, arrival).slice(0, 3).map(({ route, a }) => (
            <li key={route.passioRouteId} className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)] text-sm">
              <RouteBadge code={route.shortName} colorHex={route.colorHex} />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{route.name}</span>
              <ArrivalText a={a} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-[var(--sp-1)] text-sm text-[var(--muted)]">
          Open any stop and choose “Make this your stop” to see its next buses here.
        </p>
      )}
    </section>
  );

  const openEntry = openStopId ? stopsById.get(openStopId) : undefined;
  const stopCard = openEntry && (
    <StopCard
      entry={openEntry}
      headingRef={stopHeadingRef}
      arrival={arrival}
      noticesFor={noticesFor}
      noticesRetrievedAt={overview?.noticesRetrievedAt ?? null}
      isYourStop={yourStopId === openEntry.stop.stopId}
      pending={pendingReport === openEntry.stop.stopId}
      onReport={(kind, label) => report(openEntry.stop.stopId, kind, label)}
      onUndo={(pulseId) => undo(pulseId, openEntry.stop.name)}
      onMakeYourStop={() => makeYourStop(openEntry.stop.stopId)}
      onShowOnMap={() => showOnMap(openEntry.stop.stopId)}
      onClose={() => {
        setOpenStopId(null);
        setMapSelection(null);
      }}
    />
  );

  const routeList = (
    <section aria-labelledby="transit-routes-heading" className="space-y-[var(--sp-2)]">
      <h2 id="transit-routes-heading" className="font-display text-[length:var(--fs-xl)] font-bold">
        {routes.length} routes
      </h2>
      <div role="group" aria-label="Show on map" className="flex flex-wrap gap-[var(--sp-1)]">
        <button type="button" aria-pressed={onlyCode === null} onClick={() => setOnlyCode(null)} className={btn}>
          All routes
        </button>
        {routes.map((r) => (
          <button
            key={r.passioRouteId}
            type="button"
            aria-pressed={onlyCode === r.shortName}
            onClick={() => {
              const next = onlyCode === r.shortName ? null : r.shortName;
              setOnlyCode(next);
              announce(next ? `Map shows only ${r.shortName} ${r.name}` : "Map shows all routes");
            }}
            className={`${btn} ${onlyCode === r.shortName ? "outline outline-[3px] outline-[var(--focus)]" : ""}`}
          >
            <span className="sr-only">Show only </span>
            <RouteBadge code={r.shortName} colorHex={r.colorHex} size="sm" />
            <span className="sr-only">{r.name}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-[var(--sp-2)]" data-testid="transit-route-list">
        {routes.map((route) => (
          <RouteRowView
            key={route.passioRouteId}
            route={route}
            expanded={expandedRoute === route.passioRouteId}
            onToggle={() => setExpandedRoute((cur) => (cur === route.passioRouteId ? null : route.passioRouteId))}
            buses={vehicles.filter((v) => v.passioRouteId === route.passioRouteId)}
            notices={noticesFor(route.passioRouteId)}
            noticesRetrievedAt={overview?.noticesRetrievedAt ?? null}
            busesStale={busesStale}
            arrival={arrival}
            onOpenStop={(stopId) => openStop(stopId, "list")}
          />
        ))}
      </ul>
    </section>
  );

  const sheetHeight =
    snap === "peek" ? "max-h-[40dvh]" : snap === "half" ? "max-h-[62dvh]" : "max-h-[calc(100dvh-var(--chrome-top)-var(--chrome-bottom)-var(--sp-4))]";

  return (
    <div
      data-testid="transit-view"
      className="relative flex min-h-[calc(100dvh-var(--chrome-top)-var(--chrome-bottom))] flex-col lg:min-h-[calc(100dvh-var(--chrome-top))]"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] px-[var(--sp-3)] py-[var(--sp-2)]">
        <h1 tabIndex={-1} data-route-heading="" className="font-display text-[length:var(--fs-2xl)] font-bold">
          Transit
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)]">
          {feedPill}
          {(feed !== "live" || !directLive) && (
            <a
              href="https://kennesawstate.passiogo.com"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="passio-live-tracker-link"
              className={btn}
            >
              Official live tracker
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">(opens Passio GO in a new tab)</span>
            </a>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <CampusGeoMap
          campusFilter={(overview?.campusFilter as "Kennesaw" | "Marietta" | "All KSU") ?? "Kennesaw"}
          showParkingLots={false}
          showShuttleRoutes
          showPlaceSearch={false}
          liveVehicles={vehicles}
          title={`${overview?.campusFilter ?? "Kennesaw"} shuttle map: routes, stops and buses`}
          fill
          className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_27rem]"
          selectedItemId={mapSelection}
          routeCodeFilter={onlyCode ? [onlyCode] : null}
          onSelectStopId={(id, source) => openStop(id, source)}
          onSelectRouteId={(id, source) => selectRoute(id, source)}
          onSelectBusId={(id, source) => selectBus(id, source)}
          fitPadding={fitPadding}
          renderPanel={({ list, legend }) => (
            <section
              ref={setSheetEl}
              aria-label="Transit panel"
              data-testid="transit-sheet"
              data-snap={snap}
              className={`fixed inset-x-[var(--sp-2)] bottom-[var(--chrome-bottom)] z-20 flex flex-col overflow-hidden rounded-t-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--bg)] shadow-2xl ${sheetHeight} lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100dvh-var(--chrome-top)-4.5rem)] lg:rounded-none lg:border-0 lg:border-l lg:border-[var(--line)] lg:shadow-none [html[data-large-text]_&]:static [html[data-large-text]_&]:max-h-none [html[data-large-text]_&]:rounded-none [html[data-large-text]_&]:shadow-none`}
            >
              <div className="border-b border-[var(--line)] p-[var(--sp-2)] lg:hidden [html[data-large-text]_&]:hidden">
                <SegmentedControl
                  label="Panel size"
                  options={[
                    { value: "peek", label: "Peek" },
                    { value: "half", label: "Half" },
                    { value: "full", label: "Full" },
                  ] as const}
                  value={snap}
                  testIdPrefix="transit-sheet-snap"
                  onChange={(next) => {
                    setSnap(next);
                    announce(next === "peek" ? "Panel at peek: your stop" : next === "half" ? "Panel at half: route list" : "Panel full: route list");
                  }}
                />
              </div>
              <div className="min-h-0 flex-1 space-y-[var(--sp-3)] overflow-y-auto p-[var(--sp-3)]">
                {stopCard}
                {(!openEntry || snap === "peek") && yourStopCard}
                {noticeLink}
                {snap === "peek" && (
                  <button type="button" onClick={() => setSnap("half")} className={`${btn} lg:hidden [html[data-large-text]_&]:hidden`}>
                    <ChevronUp aria-hidden="true" className="h-4 w-4" />
                    Show routes
                  </button>
                )}
                <div className={snap === "peek" ? "hidden lg:block [html[data-large-text]_&]:block" : ""}>{routeList}</div>
                {/* The synced map list stays in the panel at every snap point (list parity, SPEC-v2 §4). */}
                <div className="space-y-[var(--sp-2)]">
                  {legend}
                  {list}
                </div>
              </div>
            </section>
          )}
        />
      </div>
    </div>
  );
}

function nextArrivals(rows: { route: RouteRow; stop: StopRow }[], arrival: (r: RouteRow, s: StopRow) => Arrival) {
  const order = (a: Arrival) => (a.kind === "live" || a.kind === "schedule" ? a.minutes : a.kind === "not-today" ? 1e6 : 1e7);
  return rows
    .map(({ route, stop }) => ({ route, a: arrival(route, stop) }))
    .sort((x, y) => order(x.a) - order(y.a));
}

function ArrivalText({ a }: { a: Arrival }) {
  return (
    <span data-testid="arrival" data-arrival-kind={a.kind} className="inline-flex items-center gap-[var(--sp-1)] font-bold">
      <span
        aria-hidden="true"
        className={`inline-block h-[0.75rem] w-[0.75rem] rounded-full border-2 ${
          a.kind === "live" ? "border-[var(--ok-fg)] bg-[var(--ok-fg)]" : "border-dashed border-[var(--muted)]"
        }`}
      />
      <span aria-hidden="true">{a.text}</span>
      <span className="sr-only">{a.sr}</span>
    </span>
  );
}

function NoticeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H5.2L4 17.2z" />
      <path d="M8 8h8M8 12h5" />
    </svg>
  );
}

/** Shuttle Notice: neutral surface, grey double rule, never red, never a banner. */
export function ShuttleNoticeCard({ notice, retrievedAt }: { notice: Notice; retrievedAt: number | null }) {
  return (
    <div
      data-testid="shuttle-notice"
      className="rounded-[var(--r-md)] border border-[var(--line)] border-l-[6px] border-l-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] [border-left-style:double]"
    >
      <details>
        <summary className="flex min-h-[var(--target)] cursor-pointer items-center gap-[var(--sp-2)] px-[var(--sp-3)] text-sm font-bold">
          <NoticeIcon />
          <span className="min-w-0 [overflow-wrap:anywhere]">{notice.title}</span>
        </summary>
        <div className="space-y-[var(--sp-1)] px-[var(--sp-3)] pb-[var(--sp-2)] text-sm">
          {notice.body && <p className="[overflow-wrap:anywhere]">{notice.body}</p>}
        </div>
      </details>
      {/* The source line is always visible: a notice is never read without its source (SPEC-v2 §4). */}
      <p data-testid="shuttle-notice-source" className="px-[var(--sp-3)] pb-[var(--sp-2)] text-[length:var(--fs-xs)] text-[var(--muted)] [overflow-wrap:anywhere]">
        Shuttle Notice · from Big Owl Bus via Passio GO · posted {retrievedAt ? `by ${formatClock(retrievedAt)} (retrieved)` : "time unknown"} · not a KSU safety Alert
      </p>
    </div>
  );
}

function RouteRowView({
  route,
  expanded,
  onToggle,
  buses,
  notices,
  noticesRetrievedAt,
  busesStale,
  arrival,
  onOpenStop,
}: {
  route: RouteRow;
  expanded: boolean;
  onToggle: () => void;
  buses: (CampusMapVehicleMarker & { passioRouteId?: string })[];
  notices: Notice[];
  noticesRetrievedAt: number | null;
  busesStale: boolean;
  arrival: (r: RouteRow, s: StopRow) => Arrival;
  onOpenStop: (stopId: string) => void;
}) {
  const panelId = `route-stops-${route.passioRouteId}`;
  const pattern = routeStyle(route.shortName, false).pattern;
  const status = !route.runsToday && route.runDaysLabel
    ? `Not today · runs ${route.runDaysLabel}`
    : buses.length
      ? `${buses.length} bus${buses.length === 1 ? "" : "es"}${busesStale ? " · not updating" : " · live"}`
      : "No buses on the map";

  // Place each bus between its two stops (by stop sequence).
  const busesBefore = new Map<number, typeof buses>();
  for (const bus of buses) {
    const idx = placeBusBetweenStops(route.stops, bus);
    if (idx === null) continue;
    busesBefore.set(idx, [...(busesBefore.get(idx) ?? []), bus]);
  }

  return (
    <li data-testid="transit-route-row" data-route-code={route.shortName} className={card}>
      <button
        id={`route-toggle-${route.passioRouteId}`}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-[var(--target)] w-full min-w-0 items-center gap-[var(--sp-2)] text-left"
      >
        <RouteBadge code={route.shortName} colorHex={route.colorHex} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold [overflow-wrap:anywhere]">{route.name}</span>
          <span className="block text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
            {status} · {route.operatingHoursSummary} · {PATTERN_LABEL[pattern]}
          </span>
        </span>
        {expanded ? <ChevronUp aria-hidden="true" className="h-5 w-5 shrink-0" /> : <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0" />}
      </button>
      {notices.length > 0 && (
        <div className="mt-[var(--sp-2)] space-y-[var(--sp-1)]">
          {notices.map((n) => (
            <ShuttleNoticeCard key={n.noticeId} notice={n} retrievedAt={noticesRetrievedAt} />
          ))}
        </div>
      )}
      {expanded && (
        <ol id={panelId} aria-label={`${route.shortName} stops in order`} className="mt-[var(--sp-2)] border-l-4 border-[var(--line-strong)] pl-[var(--sp-3)]">
          {route.stops.map((stop, i) => (
            <React.Fragment key={stop.stopId}>
              {(busesBefore.get(i) ?? []).map((bus) => (
                <li key={bus.busId} data-testid="route-bus-between" className="flex min-h-[var(--target)] items-center gap-[var(--sp-2)] text-sm text-[var(--muted)]">
                  <Bus aria-hidden="true" className="h-4 w-4" />
                  <span>
                    {route.shortName} bus {bus.busName} heading to {stop.name}
                    {bus.stale ? " · position not updating" : ""}
                  </span>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => onOpenStop(stop.stopId)}
                  data-testid="route-stop-button"
                  className="flex min-h-[var(--target)] w-full min-w-0 flex-wrap items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-1)] text-left text-sm hover:bg-[var(--surface-2)]"
                >
                  <span aria-hidden="true" className="inline-block h-[0.85rem] w-[0.85rem] rounded-full border-[3px] border-[var(--ink)] bg-[var(--surface)]" />
                  <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{stop.name}</span>
                  {stop.activePulse && (
                    <span className="text-[var(--muted)]">{stop.activePulse.label}</span>
                  )}
                  <ArrivalText a={arrival(route, stop)} />
                </button>
              </li>
            </React.Fragment>
          ))}
        </ol>
      )}
    </li>
  );
}

function StopCard({
  entry,
  headingRef,
  arrival,
  noticesFor,
  noticesRetrievedAt,
  isYourStop,
  pending,
  onReport,
  onUndo,
  onMakeYourStop,
  onShowOnMap,
  onClose,
}: {
  entry: { stop: StopRow; routes: { route: RouteRow; stop: StopRow }[] };
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  arrival: (r: RouteRow, s: StopRow) => Arrival;
  noticesFor: (passioRouteId: string) => Notice[];
  noticesRetrievedAt: number | null;
  isYourStop: boolean;
  pending: boolean;
  onReport: (kind: StopReportKind, label: string) => void;
  onUndo: (pulseId: string) => void;
  onMakeYourStop: () => void;
  onShowOnMap: () => void;
  onClose: () => void;
}) {
  const { stop } = entry;
  const headingId = `stop-card-heading-${stop.stopId}`;
  const notices = Array.from(
    new Map(entry.routes.flatMap(({ route }) => noticesFor(route.passioRouteId)).map((n) => [n.noticeId, n])).values()
  );
  const reports = entry.routes[0]?.stop.reports ?? [];
  const mine = entry.routes[0]?.stop.myReport ?? null;

  return (
    <section aria-labelledby={headingId} data-testid="stop-card" data-stop-id={stop.stopId} className={`${card} outline outline-[3px] outline-[var(--focus)]`}>
      <div className="flex flex-wrap items-start justify-between gap-[var(--sp-2)]">
        <div className="min-w-0">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold [overflow-wrap:anywhere]">
            {stop.name}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {stop.campus} · stop {stop.stopId} · {entry.routes.length} route{entry.routes.length === 1 ? "" : "s"}
            {isYourStop ? " · your stop" : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className={btn}>
          Close stop
        </button>
      </div>

      <h3 className="mt-[var(--sp-3)] text-sm font-bold">Arrivals</h3>
      <ul data-testid="stop-arrivals" className="mt-[var(--sp-1)] space-y-[var(--sp-1)]">
        {nextArrivals(entry.routes, arrival).map(({ route, a }) => (
          <li key={route.passioRouteId} className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)] text-sm">
            <RouteBadge code={route.shortName} colorHex={route.colorHex} />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{route.name}</span>
            <ArrivalText a={a} />
          </li>
        ))}
      </ul>

      {notices.length > 0 && (
        <div className="mt-[var(--sp-3)] space-y-[var(--sp-1)]">
          <h3 className="text-sm font-bold">Shuttle Notices for these routes</h3>
          {notices.map((n) => (
            <ShuttleNoticeCard key={n.noticeId} notice={n} retrievedAt={noticesRetrievedAt} />
          ))}
        </div>
      )}

      <h3 className="mt-[var(--sp-3)] text-sm font-bold" id={`stop-report-heading-${stop.stopId}`}>
        Stop report
      </h3>
      <p className="text-sm text-[var(--muted)]">One tap · lasts 15 min · anonymous to Students · not sent to Big Owl Bus or KSU</p>
      <div role="group" aria-labelledby={`stop-report-heading-${stop.stopId}`} className="mt-[var(--sp-1)] flex flex-wrap gap-[var(--sp-1)]">
        {STOP_REPORTS.map((r) => (
          <button
            key={r.kind}
            type="button"
            disabled={pending}
            aria-pressed={mine?.kind === r.kind}
            onClick={() => onReport(r.kind, r.label)}
            data-testid={`stop-report-${r.kind}`}
            className={`${btn} ${mine?.kind === r.kind ? "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink)]" : ""}`}
          >
            <span aria-hidden="true">{r.glyph}</span>
            {r.label}
          </button>
        ))}
      </div>
      {mine && (
        <p role="status" className="mt-[var(--sp-1)] flex flex-wrap items-center gap-[var(--sp-2)] text-sm">
          <span>You reported “{mine.label}”.</span>
          <button type="button" data-testid="stop-report-undo" onClick={() => onUndo(mine.pulseId)} className={btn}>
            <Undo2 aria-hidden="true" className="h-4 w-4" />
            Undo
          </button>
        </p>
      )}

      <h3 className="mt-[var(--sp-3)] text-sm font-bold">Reports in the last 15 min</h3>
      {reports.length === 0 ? (
        <p data-testid="stop-reports-empty" className="text-sm text-[var(--muted)]">No stop reports in the last 15 min.</p>
      ) : (
        <ul data-testid="stop-reports" className="space-y-[var(--sp-1)] text-sm">
          {reports.map((r) => (
            <li key={r.kind}>
              <span className="font-bold">{r.label}</span>
              <span className="text-[var(--muted)]">
                {" "}· {r.count} Student{r.count === 1 ? "" : "s"} · {r.minutesAgo === 0 ? "just now" : `${r.minutesAgo} min ago`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-[var(--sp-3)] flex flex-wrap gap-[var(--sp-1)]">
        <button type="button" onClick={onMakeYourStop} disabled={isYourStop} aria-pressed={isYourStop} data-testid="make-your-stop" className={btn}>
          <Star aria-hidden="true" className="h-4 w-4" />
          {isYourStop ? "This is your stop" : "Make this your stop"}
        </button>
        <button type="button" onClick={onShowOnMap} data-testid="stop-show-on-map" className={btn}>
          <MapPin aria-hidden="true" className="h-4 w-4" />
          Show on map
        </button>
      </div>
    </section>
  );
}
