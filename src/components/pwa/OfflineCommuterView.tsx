"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { formatPrivateClassMeeting } from "@/lib/privateSchedule";
import { CampusGeoMap } from "@/components/map/CampusGeoMap";
import { readCommuterSnapshot, type CommuterScope } from "@/lib/commuterCache";

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

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-4 p-4">
      <div data-testid="offline-commuter-banner" className="flex items-center gap-2 rounded-xl bg-[#FEF3C7] p-3 text-sm font-bold text-[#92400E]">
        <WifiOff className="h-4 w-4" />
        <span>Offline · Showing saved schedule &amp; campus map</span>
      </div>
      <section data-testid="bento-schedule-tile" className="space-y-2 rounded-xl border border-[#E4E7EE] bg-white p-4">
        <h1 className="font-bold">Saved class schedule</h1>
        {enrolled.length ? (
          <ul className="space-y-2 text-sm">
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
          <ul aria-label="Private classes" className="space-y-2 text-sm">
            {standaloneClasses.map((entry) => (
              <li key={entry.termCode + ":" + entry.key}>
                <strong>{entry.title}</strong>
                <div>{formatPrivateClassMeeting(entry)}</div>
              </li>
            ))}
          </ul>
        )}
        {!!snapshot?.schedule.personalDeadlines.length && (
          <ul className="space-y-1 text-sm">
            {snapshot.schedule.personalDeadlines.map((deadline) => (
              <li key={deadline.uid}>{deadline.title}</li>
            ))}
          </ul>
        )}
      </section>
      <CampusGeoMap campusFilter={snapshot?.campusFilter ?? "All KSU"} showShuttleRoutes showParkingLots={false} mode="static" />
      <p className="text-sm">
        In an emergency, the{" "}
        <a href="/emergency" className="inline-flex min-h-[2.75rem] items-center font-bold underline">
          Emergency Panel
        </a>{" "}
        works offline.
      </p>
      <button className="rounded-xl bg-[#111317] px-4 py-2 text-sm font-bold text-[#FDBB30]" type="button" onClick={() => window.location.reload()}>
        Check connection
      </button>
    </main>
  );
}
