"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { formatPrivateClassMeeting } from "@/lib/privateSchedule";
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
import { NextClassCard } from "./NextClassCard";
import {
  FillBar,
  StatusChip,
  fullnessFromTier,
  type FullnessStatus,
} from "@/components/a11y/controls";

const card =
  "min-w-0 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]";
const tileHead = "flex flex-wrap items-center justify-between gap-[var(--sp-2)]";
const tileTitle =
  "flex min-w-0 items-center gap-[var(--sp-2)] font-display text-[length:var(--fs-lg)] font-bold text-[var(--ink)]";
const tileLink =
  "inline-flex min-h-[var(--target)] items-center gap-[var(--sp-1)] rounded-[var(--r-sm)] text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2";
const muted = "text-sm text-[var(--muted)] [overflow-wrap:anywhere]";
const inner =
  "min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-3)]";

type ParkingCard = {
  _id: unknown;
  name: string;
  effectiveTier: 0 | 1 | 2 | 3 | null;
  tierLabel: string;
  provenanceKind?: "verified_multi" | "single_report" | "no_recent_reports";
  provenanceLabel: string;
  activeReportCount?: number;
  latestReportMinutesAgo?: number;
  noRecentReports?: boolean;
  spotOpening?: { deckLevel?: string } | null;
  overflowSuggestion?: {
    name: string;
    tierLabel: string;
    shuttleName?: string;
    shuttleEtaMinutes?: number;
  } | null;
};

/** Neutral parking state (SPEC-v2 §4): only Student Parking Reports, no estimate. */
export function parkingDisplay(lot: ParkingCard): {
  status: FullnessStatus;
  line: string;
} {
  const count = lot.activeReportCount ?? (lot.effectiveTier === null ? 0 : 1);
  const none =
    lot.noRecentReports === true ||
    lot.provenanceKind === "no_recent_reports" ||
    count === 0 ||
    lot.effectiveTier === null;
  if (none) {
    return { status: "none", line: "No Student Parking Reports in the last 45 minutes. No estimate shown." };
  }
  const status = fullnessFromTier(lot.effectiveTier);
  // The server owns the wording ("· unconfirmed" for 1 report, "Student-verified" for ≥2).
  if (/unconfirmed|Student-verified/.test(lot.provenanceLabel)) {
    return { status, line: lot.provenanceLabel };
  }
  const ago = lot.latestReportMinutesAgo != null ? ` (${lot.latestReportMinutesAgo} min ago)` : "";
  if (lot.provenanceKind === "single_report" || count === 1) {
    return { status, line: `Live · 1 Student report${ago} · unconfirmed` };
  }
  return { status, line: `Live · Student-verified${ago}` };
}

/** Strip a percentage range ("Open (<60%)") down to its word. */
function tierWord(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

/** Scrappy's logistics-only brief (SPEC-v2 §3): parking and buses, never Incidents, Alerts or Clout. */
function buildBrief(parking: ParkingCard[], shuttles: Array<{ name: string; nextStopName?: string | null; etaMinutes?: number | null }>): string {
  const parts: string[] = [];
  const live = parking.filter((lot) => parkingDisplay(lot).status !== "none");
  const busy = live.filter((lot) => (lot.effectiveTier ?? 0) >= 2);
  const room = live.filter((lot) => (lot.effectiveTier ?? 3) <= 1);
  if (live.length === 0) {
    parts.push(
      parking.length
        ? "No recent Parking Reports for your lots yet."
        : "No Parking Lots to show here."
    );
  } else {
    if (busy.length) {
      parts.push(`${busy.map((l) => l.name).join(" and ")} ${busy.length > 1 ? "are" : "is"} ${tierWord(busy[0]!.tierLabel).toLowerCase()}, per Student reports.`);
    }
    if (room.length) {
      parts.push(`${room[0]!.name} has room (${tierWord(room[0]!.tierLabel)}).`);
    }
  }
  const bus = shuttles.find((s) => s.etaMinutes != null);
  if (bus) {
    parts.push(
      `The ${bus.name} reaches ${bus.nextStopName ?? "its next stop"} in ${bus.etaMinutes} min.`
    );
  } else if (shuttles.length) {
    parts.push("No live Big Owl Bus times right now.");
  }
  return parts.join(" ");
}

function scopeName(campus: string): string {
  return campus === "All KSU" ? "Kennesaw and Marietta" : campus;
}

export function NowHudView() {
  const { auth } = useViewerClient();
  const hud = useViewerQuery(api.shell.getNowHud, {});

  useEffect(() => {
    const scope = getCommuterScope(auth);
    if (scope && hud) saveCommuterSnapshot(scope, hud);
  }, [auth, hud]);

  if (!hud) {
    return (
      <div className="space-y-[var(--sp-3)] p-[var(--sp-4)]">
        <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold">
          Now
        </h1>
        <p role="status" className={`${card} ${muted}`}>
          Loading parking, buses and your classes…
        </p>
      </div>
    );
  }

  const campusFilter: string = hud.campusFilter ?? "Kennesaw";
  const scope = scopeName(campusFilter);
  const enrolledCourses = hud.schedule?.enrolledCourses ?? [];
  const privateClasses = hud.schedule?.privateClasses ?? [];
  const standaloneClasses = privateClasses.filter((entry) =>
    !entry.sectionId || !enrolledCourses.some((course) => course.sectionId === entry.sectionId));
  const personalDeadlines = hud.schedule?.personalDeadlines ?? [];
  const parkingCards = (hud.parkingCards ?? []) as unknown as ParkingCard[];
  const shuttleCards = hud.shuttleCards ?? [];
  const studySummary = hud.studySummary;
  const diningCards = hud.diningCards ?? [];
  const eventCards = hud.eventCards ?? [];
  const brief = buildBrief(parkingCards.slice(0, 2), shuttleCards);
  const briefTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div data-testid="now-bento-hud" className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <InstallHomeScreenCard />

      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--muted)]">{scope}{campusFilter === "All KSU" ? " · pick one with the Campus switcher" : " Campus"}</p>
        <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold leading-tight text-[var(--ink)] [overflow-wrap:anywhere]">
          {campusFilter === "All KSU" ? "Now at Kennesaw and Marietta" : `Now on ${campusFilter}`}
        </h1>
      </div>

      <section aria-labelledby="now-brief-h" data-testid="now-scrappy-brief" className={`${card} space-y-[var(--sp-2)] border-l-4 border-l-[var(--accent)]`}>
        <h2 id="now-brief-h" className="sr-only">Scrappy&apos;s brief</h2>
        <p className="font-display text-[length:var(--fs-xl)] font-bold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]">
          {brief}
        </p>
        <p className={muted}>
          <Sparkles aria-hidden="true" className="mr-[var(--sp-1)] inline h-4 w-4 align-[-0.15em] text-[var(--accent-ink)]" />
          Scrappy · from Student Parking Reports and Big Owl Bus via Passio GO · {briefTime} · may be out of date
        </p>
        <Link
          href="/scrappy"
          className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border border-[var(--line-strong)] px-[var(--sp-4)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          Ask a follow-up
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>

      <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] md:grid-cols-2">
        <div className="md:col-span-2"><NextClassCard schedule={hud.schedule} wayfinding={hud.wayfinding} campus={campusFilter} /></div>
        <section data-testid="bento-schedule-tile" aria-labelledby="now-classes-h" className={`${card} md:col-span-2`}>
          <div className={tileHead}>
            <h2 id="now-classes-h" className={tileTitle}>
              <GraduationCap aria-hidden="true" className="h-5 w-5 shrink-0" />
              Your classes
            </h2>
            <Link
              href={
                enrolledCourses[0]
                  ? `/courses/${encodeURIComponent(enrolledCourses[0].subjectCourse)}`
                  : "/courses/CS%203305"
              }
              className={tileLink}
            >
              Manage schedule / import .ics
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          {enrolledCourses.length === 0 ? (
            <p className={`mt-[var(--sp-2)] ${muted}`}>
              No Course Hubs joined yet. Search by 5-digit CRN or upload your Owl Express / D2L .ics file.
            </p>
          ) : (
            <ul aria-label="Course Hubs" className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
              {enrolledCourses.map((c) => {
                const imported = c.sectionId ? privateClasses.filter((entry) => entry.sectionId === c.sectionId) : [];
                return (
                  <li key={String(c.enrollmentId)} className="min-w-0">
                    <Link
                      href={`/courses/${encodeURIComponent(c.subjectCourse)}`}
                      className={`${inner} block min-h-[var(--target)] hover:border-[var(--line-strong)]`}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
                        <span className="min-w-0 text-sm font-bold text-[var(--ink)] [overflow-wrap:anywhere]">
                          {c.subjectCourse} · {c.title}
                        </span>
                        <span className="text-sm font-bold text-[var(--muted)]">{c.campus}</span>
                      </span>
                      <span className={`mt-[var(--sp-1)] block ${muted}`}>
                        {imported.length
                          ? imported.map((entry) => (
                              <span key={entry.key} className="block">{formatPrivateClassMeeting(entry)}</span>
                            ))
                          : c.meetings?.[0]
                            ? `${c.meetings[0].timeLabel} · ${c.meetings[0].buildingName} ${c.meetings[0].roomNumber}`
                            : `CRN ${c.crn ?? "Enrolled"} · ${c.instructorName ?? "KSU Faculty"}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {standaloneClasses.length > 0 && (
            <ul aria-label="Private classes" className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
              {standaloneClasses.map((entry) => (
                <li key={entry.termCode + ":" + entry.key} className={`${inner} text-sm`}>
                  <strong className="[overflow-wrap:anywhere]">{entry.title}</strong>
                  <div className={muted}>{formatPrivateClassMeeting(entry)}</div>
                </li>
              ))}
            </ul>
          )}

          {personalDeadlines.length > 0 && (
            <ul aria-label="Upcoming deadlines" className="mt-[var(--sp-3)] flex flex-wrap gap-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]">
              {personalDeadlines.map((dl: any) => (
                <li
                  key={dl.uid}
                  className="inline-flex max-w-full items-center gap-[var(--sp-1)] rounded-[var(--r-pill)] bg-[var(--warn-bg)] px-[var(--sp-3)] py-[var(--sp-1)] text-sm font-bold text-[var(--warn-fg)]"
                >
                  <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{dl.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="bento-parking-tile" aria-labelledby="now-parking-h" className={card}>
          <div className={tileHead}>
            <h2 id="now-parking-h" className={tileTitle}>
              <Car aria-hidden="true" className="h-5 w-5 shrink-0" />
              Parking
            </h2>
            <Link href="/parking" className={tileLink}>
              Map &amp; Parking Report
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          <ul aria-label={`Parking Lots on ${scope}`} className="mt-[var(--sp-2)] space-y-[var(--sp-2)]">
            {parkingCards.slice(0, 2).map((lot) => {
              const display = parkingDisplay(lot);
              return (
                <li
                  key={String(lot._id)}
                  data-testid="now-parking-card"
                  data-status={display.status}
                  className={`${inner} space-y-[var(--sp-2)] ${display.status === "none" ? "border-dashed border-[var(--line-strong)]" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
                    <span className="min-w-0 text-body font-bold text-[var(--ink)] [overflow-wrap:anywhere]">{lot.name}</span>
                    <StatusChip status={display.status} />
                  </div>
                  <FillBar status={display.status} />
                  <p className={muted}>{display.line}</p>

                  {lot.spotOpening && (
                    <p
                      data-testid="now-spot-opening-badge"
                      className="flex items-center gap-[var(--sp-1)] rounded-[var(--r-sm)] bg-[var(--ok-bg)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm font-bold text-[var(--ok-fg)]"
                    >
                      <Zap aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        Spot opening in ~5 min{lot.spotOpening.deckLevel ? ` on ${lot.spotOpening.deckLevel}` : ""} · 1 Student
                      </span>
                    </p>
                  )}

                  {lot.overflowSuggestion && (
                    <p
                      data-testid="now-overflow-reroute"
                      className="rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm text-[var(--ink)] [overflow-wrap:anywhere]"
                    >
                      <span className="font-bold">Overflow reroute:</span>{" "}
                      <strong>{lot.overflowSuggestion.name}</strong> is {tierWord(lot.overflowSuggestion.tierLabel)}
                      {lot.overflowSuggestion.shuttleName
                        ? ` · ${lot.overflowSuggestion.shuttleName}${lot.overflowSuggestion.shuttleEtaMinutes == null ? "" : ` in ${lot.overflowSuggestion.shuttleEtaMinutes} min`}`
                        : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {hud.campusLine && (
            <p data-testid="now-campus-line" className={`mt-[var(--sp-2)] ${muted}`}>
              <strong className="text-[var(--ink)]">{hud.campusLine.label}</strong> ·{" "}
              <a href={hud.campusLine.sourceUrl} className="underline underline-offset-2">
                {hud.campusLine.sourceText}
              </a>
            </p>
          )}
        </section>

        <section data-testid="bento-shuttle-tile" aria-labelledby="now-bus-h" className={card}>
          <div className={tileHead}>
            <h2 id="now-bus-h" className={tileTitle}>
              <Bus aria-hidden="true" className="h-5 w-5 shrink-0" />
              Big Owl Bus
            </h2>
            <Link href="/transit" className={tileLink}>
              Live map
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          <ul aria-label="Shuttle Routes" className="mt-[var(--sp-2)] space-y-[var(--sp-2)]">
            {shuttleCards.map((route: any) => (
              <li key={String(route._id)} className={`${inner} flex flex-wrap items-center justify-between gap-[var(--sp-2)]`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[var(--ink)] [overflow-wrap:anywhere]">
                    {route.shortName ? <span className="mr-[var(--sp-1)] font-display">{route.shortName}</span> : null}
                    {route.name}
                  </div>
                  {(route.nextStopName || route.loadLabel) && (
                    <div className={muted}>{[route.nextStopName, route.loadLabel].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <span className="min-w-0 max-w-full rounded-[var(--r-sm)] text-center [overflow-wrap:anywhere] bg-[var(--ink)] px-[var(--sp-2)] py-[var(--sp-1)] font-display text-body font-bold text-[var(--bg)]">
                  {route.etaMinutes == null ? "No live ETA" : `${route.etaMinutes} min`}
                </span>
              </li>
            ))}
          </ul>
          <p className={`mt-[var(--sp-2)] ${muted}`}>Times from Big Owl Bus via Passio GO.</p>
        </section>

        <section data-testid="bento-study-tile" aria-labelledby="now-study-h" className={card}>
          <div className={tileHead}>
            <h2 id="now-study-h" className={tileTitle}>
              <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
              Study
            </h2>
            <Link href="/study" className={tileLink}>
              Rooms &amp; sessions
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          {studySummary ? (
            <div className="mt-[var(--sp-2)] space-y-[var(--sp-2)]">
              {studySummary.featuredRooms.length === 0 && (
                <p className={muted}>No current availability shown. Check LibCal.</p>
              )}
              {studySummary.featuredRooms.length > 0 && (
                <ul aria-label="Study Rooms" className="lt-grid-1 grid grid-cols-2 gap-[var(--sp-2)]">
                  {studySummary.featuredRooms.slice(0, 2).map((rm: any) => (
                    <li key={String(rm._id)} className={`${inner} text-sm`}>
                      <div className="font-bold text-[var(--ink)]">{rm.roomNumber}</div>
                      <div className={muted}>
                        {rm.buildingName} · Seats {rm.capacity}{rm.isFixture ? " · Demo" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {studySummary.activeSessions.length > 0 && (
                <ul aria-label="Study Sessions" className="space-y-[var(--sp-2)]">
                  {studySummary.activeSessions.map((sess: any) => (
                    <li key={String(sess._id)}>
                      <Link
                        href="/study"
                        className={`${inner} flex min-h-[var(--target)] flex-wrap items-center justify-between gap-[var(--sp-2)] text-sm hover:border-[var(--line-strong)]`}
                      >
                        <span className="min-w-0 font-bold text-[var(--ink)] [overflow-wrap:anywhere]">{sess.title}</span>
                        <span className="text-sm font-bold text-[var(--muted)]">
                          {sess.seatCount}/{sess.maxSeats} seats
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className={`mt-[var(--sp-2)] ${muted}`}>
              Offline. Open the campus map for Sturgis and Johnson Library locations.
            </p>
          )}
        </section>

        <section data-testid="bento-dining-tile" aria-labelledby="now-dining-h" className={card}>
          <div className={tileHead}>
            <h2 id="now-dining-h" className={tileTitle}>
              <Utensils aria-hidden="true" className="h-5 w-5 shrink-0" />
              Dining
            </h2>
            <Link href="/dining" className={tileLink}>
              Menus &amp; lines
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          <ul aria-label="Dining Venues" className="mt-[var(--sp-2)] space-y-[var(--sp-2)]">
            {diningCards.slice(0, 3).map((v: any) => {
              const state = v.openStatus.state as string;
              const tone =
                state === "open"
                  ? { cls: "bg-[var(--ok-bg)] text-[var(--ok-fg)]", glyph: "✓" }
                  : state === "closing_soon"
                    ? { cls: "bg-[var(--warn-bg)] text-[var(--warn-fg)]", glyph: "◔" }
                    : { cls: "bg-[var(--surface)] text-[var(--muted)] border border-[var(--line-strong)]", glyph: "✕" };
              return (
                <li key={String(v._id)} className={`${inner} flex flex-wrap items-center justify-between gap-[var(--sp-2)] text-sm`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[var(--ink)] [overflow-wrap:anywhere]">{v.name}</div>
                    <div className={muted}>
                      {v.lineLabel}
                      {v.stationChip ? ` · ${v.stationChip}` : ""}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-[var(--sp-1)] rounded-[var(--r-pill)] px-[var(--sp-2)] text-sm font-bold ${tone.cls}`}>
                    <span aria-hidden="true">{tone.glyph}</span>
                    {v.hoursAreFixture ? "Demo hours · " : ""}{v.openStatus.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section data-testid="bento-events-tile" aria-labelledby="now-events-h" className={`${card} md:col-span-2`}>
          <div className={tileHead}>
            <h2 id="now-events-h" className={tileTitle}>
              <Calendar aria-hidden="true" className="h-5 w-5 shrink-0" />
              Coming up
            </h2>
            <Link href="/events" className={tileLink}>
              Full calendar
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          <ul aria-label="Events" className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-3">
            {eventCards.slice(0, 3).map((ev: any) => (
              <li key={String(ev._id)} className="min-w-0">
                <Link
                  href={`/events/${ev._id}`}
                  className={`${inner} block h-full min-h-[var(--target)] text-sm hover:border-[var(--line-strong)]`}
                >
                  <span className="flex flex-wrap items-center gap-[var(--sp-1)] text-sm font-bold text-[var(--muted)]">
                    <span>{ev.isVirtual ? "Virtual · Both Campuses" : ev.campus}</span>
                    {ev.myRsvpStatus && (
                      <span className="text-[var(--ok-fg)]">
                        <span aria-hidden="true">✓ </span>
                        {ev.myRsvpStatus}
                      </span>
                    )}
                  </span>
                  <span className="mt-[var(--sp-1)] block font-bold text-[var(--ink)] [overflow-wrap:anywhere]">
                    {ev.title}{ev.isFixture ? " · Demo" : ""}
                  </span>
                  <span className={`mt-[var(--sp-1)] block ${muted}`}>{ev.locationName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
