"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { formatPrivateClassMeeting } from "@/lib/privateSchedule";
import { CampusGeoMap, RouteBadge } from "@/components/map/CampusGeoMap";
import { readCommuterSnapshot, type CommuterScope } from "@/lib/commuterCache";
import { NextClassCard } from "@/components/now/NextClassCard";
import shuttleCatalog from "../../../data/ksu-seed/shuttle-routes.json";

/** Static route hours (no buses, times or live tiers offline). */
const ROUTE_HOURS = (shuttleCatalog as {
  routes: { shortName: string; name: string; campusScope: string; operatingHoursSummary: string }[];
}).routes.map((r) => ({ code: r.shortName, name: r.name, campus: r.campusScope, hours: r.operatingHoursSummary }));

export function OfflineCommuterView({ scope }: { scope: CommuterScope | null }) {
  const [snapshot, setSnapshot] = useState(() => scope && readCommuterSnapshot(scope));

  useEffect(() => {
    const refresh = () => setSnapshot(scope && readCommuterSnapshot(scope));
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [scope]);

  const privateClasses = snapshot?.schedule.privateClasses ?? [];
  const enrolled = snapshot?.schedule.enrolledCourses ?? [];
  const standaloneClasses = privateClasses.filter((entry) =>
    !entry.sectionId || !enrolled.some((course) => course.sectionId === entry.sectionId));
  const campus = snapshot?.campusFilter ?? "All KSU";
  const routeHours = ROUTE_HOURS.filter((r) => campus === "All KSU" || r.campus === campus || r.campus === "Both");

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-[var(--sp-4)] bg-[var(--bg)] p-[var(--sp-4)] text-[var(--ink)]">
      <div
        data-testid="offline-commuter-banner"
        role="status"
        className="flex items-center gap-[var(--sp-2)] rounded-[var(--r-md)] border border-dashed border-[var(--warn-fg)] bg-[var(--warn-bg)] p-[var(--sp-3)] text-sm font-bold text-[var(--warn-fg)]"
      >
        <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>Offline · Showing saved schedule &amp; campus map</span>
      </div>
      <section data-testid="bento-schedule-tile" className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
        <h1 className="font-display text-[length:var(--fs-xl)] font-bold">Saved class schedule</h1>
        {enrolled.length ? (
          <ul className="space-y-[var(--sp-2)] text-sm">
            {enrolled.map((course) => {
              const imported = course.sectionId ? privateClasses.filter((entry) => entry.sectionId === course.sectionId) : [];
              return <li key={course.enrollmentId}>
                <strong>{course.subjectCourse} · {course.title}</strong>
                {imported.length ? imported.map((entry) => (
                  <div key={entry.key}>{formatPrivateClassMeeting(entry)}</div>
                )) : course.meetings?.[0] && (
                  <div>{course.meetings[0].timeLabel} · {course.meetings[0].buildingName} {course.meetings[0].roomNumber}</div>
                )}
              </li>;
            })}
          </ul>
        ) : standaloneClasses.length === 0 && <p className="text-sm">No class schedule is saved on this device.</p>}
        {standaloneClasses.length > 0 && (
          <ul aria-label="Private classes" className="space-y-[var(--sp-2)] text-sm">
            {standaloneClasses.map((entry) => (
              <li key={entry.termCode + ":" + entry.key}>
                <strong>{entry.title}</strong>
                <div>{formatPrivateClassMeeting(entry)}</div>
              </li>
            ))}
          </ul>
        )}
        {!!snapshot?.schedule.personalDeadlines.length && (
          <ul className="space-y-[var(--sp-1)] text-sm">
            {snapshot.schedule.personalDeadlines.map((deadline) => (
              <li key={deadline.uid}>{deadline.title}</li>
            ))}
          </ul>
        )}
      </section>
      {snapshot && <NextClassCard schedule={snapshot.schedule} wayfinding={snapshot.wayfinding} campus={campus} offline />}
      <h2 className="font-display text-[length:var(--fs-lg)] font-bold">Campus map · routes and stops</h2>
      <CampusGeoMap campusFilter={campus} showShuttleRoutes showParkingLots={false} mode="static" />
      <section aria-labelledby="offline-route-hours" className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
        <h2 id="offline-route-hours" className="font-display text-[length:var(--fs-lg)] font-bold">Shuttle hours</h2>
        <p className="text-sm text-[var(--muted)]">Scheduled hours only. Live bus times return when you’re back online.</p>
        <ul data-testid="offline-route-hours" className="mt-[var(--sp-2)] space-y-[var(--sp-1)] text-sm">
          {routeHours.map((r) => (
            <li key={r.code} className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)]">
              <RouteBadge code={r.code} />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{r.name}</span>
              <span className="text-[var(--muted)]">{r.hours}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm">
        In an emergency, the{" "}
        <a href="/emergency" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
          Emergency Panel
        </a>{" "}
        works offline.
      </p>
      <button
        className="min-h-[var(--target)] rounded-[var(--r-pill)] bg-[var(--accent)] px-[var(--sp-4)] text-sm font-bold text-[var(--on-accent)]"
        type="button"
        onClick={() => window.location.reload()}
      >
        Check connection
      </button>
    </main>
  );
}
