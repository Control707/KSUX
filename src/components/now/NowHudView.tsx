"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bus,
  Calendar,
  Car,
  Clock,
  GraduationCap,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  getCommuterScope,
  useViewerClient,
  useViewerQuery,
} from "@/lib/viewerClient";
import { saveCommuterSnapshot } from "@/lib/commuterCache";
import { InstallHomeScreenCard } from "@/components/pwa/PwaSupport";

export function NowHudView() {
  const { auth } = useViewerClient();
  const hud = useViewerQuery(api.shell.getNowHud, {});

  useEffect(() => {
    const scope = getCommuterScope(auth);
    if (scope && hud) saveCommuterSnapshot(scope, hud);
  }, [auth, hud]);

  const activeData = hud;

  if (!activeData) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-sm font-semibold text-[#5E6675]">
          Loading your KSU Now Commuter HUD...
        </div>
      </div>
    );
  }

  const campusFilter: string = activeData.campusFilter ?? "Kennesaw";
  const enrolledCourses = activeData.schedule?.enrolledCourses ?? [];
  const personalDeadlines = activeData.schedule?.personalDeadlines ?? [];
  const parkingCards = activeData.parkingCards ?? [];
  const shuttleCards = activeData.shuttleCards ?? [];
  const studySummary = activeData.studySummary;
  const diningCards = activeData.diningCards ?? [];
  const eventCards = activeData.eventCards ?? [];

  return (
    <div data-testid="now-bento-hud" className="space-y-3.5 p-3.5 sm:p-4">
      <InstallHomeScreenCard />
      {/* Scope Context Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E4E7EE] bg-white px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-black text-[#111317]">
              Now on {campusFilter}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                campusFilter === "Marietta"
                  ? "bg-[#DBEAFE] text-[#1E3A8A]"
                  : campusFilter === "All KSU"
                    ? "bg-[#F3E8FF] text-[#6B21A8]"
                    : "bg-[#FFF6DC] text-[#855A00]"
              }`}
            >
              0-Tap Commuter HUD
            </span>
          </div>
          <p className="text-xs text-[#5E6675]">
            Live Student crowdsourcing + public KSU feeds · Chats, Course Hubs
            &amp; KM Shuttle stay synced across Campus switches.
          </p>
        </div>
        <Link
          href="/scrappy"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-2 text-xs font-extrabold text-[#FDBB30] hover:opacity-95"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Ask Scrappy</span>
        </Link>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Tile 1: Next Class & Private Schedule (Wide) */}
        <section
          data-testid="bento-schedule-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs md:col-span-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <GraduationCap className="h-4 w-4 text-[#111317]" />
              <span>My Course Hubs &amp; Private Schedule</span>
            </div>
            <Link
              href={
                enrolledCourses[0]
                  ? `/courses/${encodeURIComponent(enrolledCourses[0].subjectCourse)}`
                  : "/courses/CS%203305"
              }
              className="inline-flex items-center gap-1 text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              <span>Manage Schedule / .ics</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {enrolledCourses.length === 0 ? (
            <p className="mt-2 text-xs text-[#5E6675]">
              No Course Hubs joined yet. Search by 5-digit CRN or upload your
              Owl Express / D2L <code>.ics</code> file.
            </p>
          ) : (
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {enrolledCourses.map((c: any) => (
                <Link
                  key={String(c.enrollmentId)}
                  href={`/courses/${encodeURIComponent(c.subjectCourse)}`}
                  className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] p-3 transition hover:border-[#D99B00]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#111317]">
                      {c.subjectCourse} · {c.title}
                    </span>
                    <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10px] font-bold text-[#855A00]">
                      {c.campus}
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-[#5E6675]">
                    {c.meetings?.[0]
                      ? `${c.meetings[0].timeLabel} · ${c.meetings[0].buildingName} ${c.meetings[0].roomNumber}`
                      : `CRN ${c.crn ?? "Enrolled"} · ${c.instructorName ?? "KSU Faculty"}`}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {personalDeadlines.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-[#E4E7EE] pt-2.5">
              {personalDeadlines.map((dl: any) => (
                <span
                  key={dl.uid}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]"
                >
                  <Clock className="h-3 w-3" />
                  <span>{dl.title}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Tile 2: Pinned Parking Lots, Spot Opening, & Overflow Shuttle Reroute */}
        <section
          data-testid="bento-parking-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <Car className="h-4 w-4 text-[#111317]" />
              <span>Parking Lots · {campusFilter}</span>
            </div>
            <Link
              href="/parking"
              className="text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              Map &amp; Report →
            </Link>
          </div>

          <div className="mt-2.5 space-y-2.5">
            {parkingCards.slice(0, 2).map((lot: any) => {
              const badgeCls =
                lot.effectiveTier === null ? "bg-[#E4E7EE] text-[#5E6675]" : lot.effectiveTier === 0
                  ? "bg-[#DCFCE7] text-[#15803D]"
                  : lot.effectiveTier === 1
                    ? "bg-[#FEF3C7] text-[#B45309]"
                    : "bg-[#FEE2E2] text-[#B91C1C]";
              return (
                <div
                  key={String(lot._id)}
                  className="rounded-xl border border-[#E4E7EE] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-[#111317]">
                      {lot.name}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${badgeCls}`}
                    >
                      {lot.tierLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-[#5E6675]">
                    {lot.provenanceLabel}
                  </p>

                  {lot.spotOpening && (
                    <div
                      data-testid="now-spot-opening-badge"
                      className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#DCFCE7] px-2.5 py-1.5 text-[11.5px] font-extrabold text-[#15803D]"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>
                        Spot opening in ~5 min{" "}
                        {lot.spotOpening.deckLevel
                          ? `on ${lot.spotOpening.deckLevel}`
                          : ""}
                      </span>
                    </div>
                  )}

                  {lot.overflowSuggestion && (
                    <div
                      data-testid="now-overflow-reroute"
                      className="mt-2 rounded-lg border border-[#FDBB30] bg-[#FFF6DC] px-2.5 py-1.5 text-[11.5px] text-[#111317]"
                    >
                      <span className="font-extrabold">Overflow Reroute:</span>{" "}
                      <strong>{lot.overflowSuggestion.name}</strong> is{" "}
                      {lot.overflowSuggestion.tierLabel}
                      {lot.overflowSuggestion.shuttleName
                        ? ` · ${lot.overflowSuggestion.shuttleName}${lot.overflowSuggestion.shuttleEtaMinutes == null ? "" : ` in ${lot.overflowSuggestion.shuttleEtaMinutes}m`}`
                        : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Tile 3: Big Owl Bus Shuttle Routes */}
        <section
          data-testid="bento-shuttle-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <Bus className="h-4 w-4 text-[#111317]" />
              <span>Big Owl Bus ETAs</span>
            </div>
            <Link
              href="/transit"
              className="text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              Shuttle tracker →
            </Link>
          </div>

          <div className="mt-2.5 space-y-2">
            {shuttleCards.map((route: any) => (
              <div
                key={String(route._id)}
                className="flex items-center justify-between rounded-xl border border-[#E4E7EE] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-[#111317]">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: route.colorHex }}
                    />
                    <span className="truncate">{route.name}</span>
                  </div>
                  <div className="text-[11px] text-[#5E6675]">
                    {[route.nextStopName, route.loadLabel].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="rounded-xl bg-[#111317] px-2.5 py-1 text-xs font-black text-[#FDBB30]">
                  {route.etaMinutes == null ? "No ETA" : `${route.etaMinutes} min`}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Tile 4: Study Rooms & Study Sessions */}
        <section
          data-testid="bento-study-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <BookOpen className="h-4 w-4 text-[#111317]" />
              <span>Study Rooms &amp; Sessions</span>
            </div>
            <Link
              href="/study"
              className="text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              LibCal Grid →
            </Link>
          </div>

          {studySummary ? (
            <div className="mt-2.5 space-y-2">
              {studySummary.featuredRooms.length === 0 && (
                <p className="text-xs text-[#5E6675]">No current availability shown. Check LibCal.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {studySummary.featuredRooms.slice(0, 2).map((rm: any) => (
                  <div
                    key={String(rm._id)}
                    className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] p-2.5 text-xs"
                  >
                    <div className="font-extrabold text-[#111317]">
                      {rm.roomNumber}
                    </div>
                    <div className="truncate text-[11px] text-[#5E6675]">
                      {rm.buildingName} · Cap {rm.capacity}{rm.isFixture ? " · Demo" : ""}
                    </div>
                  </div>
                ))}
              </div>
              {studySummary.activeSessions.map((sess: any) => (
                <Link
                  key={String(sess._id)}
                  href="/study"
                  className="block rounded-xl border border-[#E4E7EE] p-2.5 text-xs hover:border-[#D99B00]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[#111317]">
                      {sess.title}
                    </span>
                    <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
                      {sess.seatCount}/{sess.maxSeats} seats
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#5E6675]">
              Offline — open campus map for Sturgis &amp; Johnson Library
              locations.
            </p>
          )}
        </section>

        {/* Tile 5: Dining Venues & Line Checks */}
        <section
          data-testid="bento-dining-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <Utensils className="h-4 w-4 text-[#111317]" />
              <span>Dining Venues</span>
            </div>
            <Link
              href="/dining"
              className="text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              Menus &amp; Lines →
            </Link>
          </div>

          <div className="mt-2.5 space-y-2">
            {diningCards.slice(0, 3).map((v: any) => (
              <div
                key={String(v._id)}
                className="flex items-center justify-between rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-extrabold text-[#111317]">{v.name}</div>
                  <div className="text-[11px] text-[#5E6675]">
                    {v.lineLabel}
                    {v.stationChip ? ` · ${v.stationChip}` : ""}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
                    v.openStatus.state === "open"
                      ? "bg-[#DCFCE7] text-[#15803D]"
                      : v.openStatus.state === "closing_soon"
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#E4E7EE] text-[#5E6675]"
                  }`}
                >
                  {v.hoursAreFixture ? "Demo hours · " : ""}{v.openStatus.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Tile 6: Upcoming Campus Events (Wide) */}
        <section
          data-testid="bento-events-tile"
          className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs md:col-span-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
              <Calendar className="h-4 w-4 text-[#111317]" />
              <span>Upcoming Campus Events</span>
            </div>
            <Link
              href="/events"
              className="text-xs font-bold text-[#1E3A8A] hover:underline"
            >
              Full Calendar →
            </Link>
          </div>

          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {eventCards.slice(0, 3).map((ev: any) => (
              <Link
                key={String(ev._id)}
                href={`/events/${ev._id}`}
                className="rounded-xl border border-[#E4E7EE] p-3 text-xs hover:border-[#D99B00]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10px] font-extrabold text-[#855A00]">
                    {ev.isVirtual ? "Virtual · Both Campuses" : ev.campus}
                  </span>
                  {ev.myRsvpStatus && (
                    <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
                      ✓ {ev.myRsvpStatus}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 line-clamp-2 font-extrabold text-[#111317]">
                  {ev.title}{ev.isFixture ? " · Demo" : ""}
                </div>
                <div className="mt-1 truncate text-[11px] text-[#5E6675]">
                  {ev.locationName}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
