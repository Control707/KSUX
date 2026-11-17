"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
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

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-4 p-4">
      <div data-testid="offline-commuter-banner" className="flex items-center gap-2 rounded-xl bg-[#FEF3C7] p-3 text-sm font-bold text-[#92400E]">
        <WifiOff className="h-4 w-4" />
        <span>Offline · Showing saved schedule &amp; campus map</span>
      </div>
      <section data-testid="bento-schedule-tile" className="space-y-2 rounded-xl border border-[#E4E7EE] bg-white p-4">
        <h1 className="font-bold">Saved class schedule</h1>
        {snapshot?.schedule.enrolledCourses.length ? (
          <ul className="space-y-2 text-sm">
            {snapshot.schedule.enrolledCourses.map((course) => (
              <li key={course.enrollmentId}>
                <strong>{course.subjectCourse} · {course.title}</strong>
                {course.meetings?.[0] && (
                  <div>{course.meetings[0].timeLabel} · {course.meetings[0].buildingName} {course.meetings[0].roomNumber}</div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm">No class schedule is saved on this device.</p>}
        {!!snapshot?.schedule.personalDeadlines.length && (
          <ul className="space-y-1 text-sm">
            {snapshot.schedule.personalDeadlines.map((deadline) => (
              <li key={deadline.uid}>{deadline.title}</li>
            ))}
          </ul>
        )}
      </section>
      <CampusGeoMap campusFilter={snapshot?.campusFilter ?? "All KSU"} showShuttleRoutes />
      <button className="rounded-xl bg-[#111317] px-4 py-2 text-sm font-bold text-[#FDBB30]" type="button" onClick={() => window.location.reload()}>
        Check connection
      </button>
    </main>
  );
}
