"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";
import { loadCampusPlaces, type CampusPlace } from "@/lib/campusPlaces";
import { classDestination, classTrip, nextClass, wayfindingRoutes, type Schedule } from "@/lib/classWayfinding";
import { CampusGeoMap } from "@/components/map/CampusGeoMap";

type Wayfinding = FunctionReturnType<typeof api.shell.getNowHud>["wayfinding"];
const action = "inline-flex min-h-[var(--target)] items-center rounded-[var(--r-sm)] px-[var(--sp-2)] text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2";

function TripArrival({ routeId, stopId, now }: { routeId: string; stopId: string; now: number }) {
  const arrival = useViewerQuery(api.transitDining.classArrival, { routeId, stopId });
  if (!arrival) return <p className="text-sm">Arrival information unavailable.</p>;
  const stale = !arrival.fixture && arrival.observedAt !== null && now - arrival.observedAt > 36_000;
  const minutes = arrival.arrivalAt === null ? null : Math.ceil((arrival.arrivalAt - now) / 60_000);
  return <div className="space-y-[var(--sp-1)] text-sm" data-testid="class-arrival">
    <p>{arrival.state === "not-today" ? "Not running today." : stale || arrival.state === "stale"
      ? "Stale · live arrival unavailable." : minutes !== null && minutes >= 0
        ? `${minutes} min · ${arrival.fixture ? "Demo estimate" : "live · Passio"}` : "Live arrival unavailable."}</p>
    <p>Scheduled hours · {arrival.hours}</p>
  </div>;
}

export function NextClassCard({ schedule, wayfinding, campus, offline = false }: {
  schedule: Schedule; wayfinding?: Wayfinding; campus: string; offline?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [originChoice, setOriginChoice] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    let cancelled = false;
    void loadCampusPlaces().then((places) => { if (!cancelled) setPlaces(places); }).catch(() => {});
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  const meeting = nextClass(schedule, now);
  const destination = meeting && classDestination(meeting, places);
  const savedStop = wayfindingRoutes.flatMap((route) => route.stops).find((stop) => stop.stopId === wayfinding?.yourStopId);
  const origins = [
    ...(savedStop ? [{ ...savedStop, key: "stop:" + savedStop.stopId, name: "Your stop · " + savedStop.name }] : []),
    ...(wayfinding?.pinnedLots ?? []).map((lot) => ({ ...lot, key: "lot:" + lot.slug, stopId: undefined, name: "Pinned lot · " + lot.name })),
    { key: "campus", campus, name: campus === "All KSU" ? "Near the class building" : campus + " Campus (location setting)", stopId: undefined },
  ];
  const origin = origins.find((item) => item.key === originChoice) ?? origins[0]!;
  const trip = destination && classTrip(destination, origin);
  return <section aria-labelledby="next-class-heading" data-testid="next-class-card" className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
    <h2 id="next-class-heading" className="font-display text-[length:var(--fs-lg)] font-bold">Next class</h2>
    {!meeting ? <p className="text-sm">No upcoming timed class in your current semester. Your saved schedule is below.</p> : <>
      <h3 className="font-bold">{meeting.title}</h3>
      <p className="text-sm">{new Date(meeting.startsAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET
        {meeting.endMinutes !== undefined && ` · ends ${String(Math.floor(meeting.endMinutes / 60)).padStart(2, "0")}:${String(meeting.endMinutes % 60).padStart(2, "0")} ET`}
      </p>
      <p className="text-sm">{destination?.campus ?? meeting.campus ?? "Campus not supplied"} · {meeting.online ? "Online class" : meeting.location || "Location not supplied"}{meeting.room ? ` · Room ${meeting.room}` : ""}</p>
      {!destination && !meeting.online && <p className="text-sm text-[var(--muted)]">Building not matched. Check your class location before travelling.</p>}
      {destination && <>
        <label className="block text-sm font-bold">Start from
          <select value={origin.key} onChange={(event) => setOriginChoice(event.target.value)} className="mt-[var(--sp-1)] block min-h-[var(--target)] w-full rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-2)] text-[var(--ink)]">
            {origins.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
        </label>
        {trip && <div className="space-y-[var(--sp-1)] rounded-[var(--r-md)] bg-[var(--surface-2)] p-[var(--sp-3)]" data-testid="class-trip">
          <p className="text-sm font-bold">{trip.crossCampus ? "Intercampus trip · " : "Shuttle option · "}{trip.route.shortName} · {trip.route.name}</p>
          <p className="text-sm">{trip.boarding ? `Board at ${trip.boarding.name} · ${trip.boarding.campus}. ` : ""}Destination stop: {trip.stop.name} · {Math.round(trip.distance)} m from {destination.name} (straight-line distance).</p>
          {offline ? <p className="text-sm">Offline · live estimates unavailable. Scheduled hours · {trip.route.operatingHoursSummary}</p>
            : trip.boarding && <TripArrival key={trip.route.passioRouteId + trip.boarding.stopId} routeId={trip.route.passioRouteId} stopId={trip.boarding.stopId} now={now} />}
          <p className="text-sm text-[var(--muted)]">Check route direction and pedestrian access on the map. This is a stop suggestion, not a timed connection.</p>
        </div>}
        <button type="button" aria-expanded={showMap} aria-controls="next-class-map" onClick={() => setShowMap(!showMap)} className={action}>Show {destination.name} on campus map</button>
        {showMap && <div id="next-class-map" className="space-y-[var(--sp-2)]">
          <p className="text-sm font-bold">Destination · {destination.name} · {destination.campus}</p>
          <CampusGeoMap campusFilter={trip?.crossCampus ? "All KSU" : destination.campus} destinationPlaceId={destination.id}
            selectedItemId={origin.key.startsWith("lot:") ? origin.key : trip?.boarding ? "stop:" + trip.boarding.stopId : undefined}
            showShuttleRoutes showParkingLots mode={offline ? "static" : "live"} title={`Directions to ${destination.name}`} />
        </div>}
      </>}
    </>}
    {offline ? <p className="text-sm text-[var(--muted)]">Saved preferences · read-only offline.</p> : <nav aria-label="Class travel preferences" className="flex flex-wrap gap-[var(--sp-2)]">
      <Link href="/transit" className={action}>Choose your stop</Link>
      <Link href="/parking" className={action}>Choose pinned Parking Lots</Link>
    </nav>}
  </section>;
}
