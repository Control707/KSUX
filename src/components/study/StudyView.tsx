"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, ExternalLink, MessageSquare, Plus, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { SegmentedControl } from "@/components/a11y/controls";
import { NewTab, StateChip, errorMessage, toggleClass, ui, type Tone } from "@/components/communities/campusLifeUi";

const VIBES = [
  ["quiet", "Quiet", "○", "ok"],
  ["moderate", "Moderate", "◐", "warn"],
  ["packed", "Packed", "●", "bad"],
] as const satisfies readonly (readonly [string, string, string, Tone])[];

function vibeChip(tierValue: string, label: string) {
  const match = VIBES.find(([key]) => key === tierValue);
  return (
    <StateChip tone={match?.[3] ?? "neutral"} glyph={match?.[2] ?? "◌"}>
      {label}
    </StateChip>
  );
}

export function StudyView() {
  const searchParams = useSearchParams();
  const { pendingDraftCard, setPendingDraftCard, quickComposerKind, setQuickComposerKind } = useViewerClient();
  const { toast } = useAnnouncer();
  const formId = useId();
  const [dateChoice, setDateChoice] = useState<"today" | "tomorrow">("today");
  const [hostOpen, setHostOpen] = useState(searchParams.get("host") === "1");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [topicNote, setTopicNote] = useState("");
  const [visibility, setVisibility] = useState<"campus_open" | "course_members_only">("campus_open");
  const [courseHubId, setCourseHubId] = useState<string>("");
  const [durationMins, setDurationMins] = useState(90);
  const [maxSeats, setMaxSeats] = useState(6);
  const [libcalConfirmed, setLibcalConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const data = useViewerQuery(api.study.listStudyRoomsAndSessions, { dateChoice });
  const rings = useViewerQuery(api.feed.listFeedRingsAndTrends, {});

  const triggerSwr = useViewerMutation(api.study.triggerStudySwrRefresh);
  const submitVibe = useViewerMutation(api.study.submitWalkInVibe);
  const createSession = useViewerMutation(api.study.createStudySession);
  const toggleAttendance = useViewerMutation(api.study.toggleStudySessionAttendance);
  const toggleLibCalConfirm = useViewerMutation(api.study.toggleHostLibCalConfirmed);
  const endSession = useViewerMutation(api.study.endStudySession);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const swrTriggeredRef = useRef(false);
  useEffect(() => {
    if (data?.needsSwrRefresh && !swrTriggeredRef.current) {
      swrTriggeredRef.current = true;
      void triggerSwr({}).catch(() => {});
    }
  }, [data?.needsSwrRefresh, triggerSwr]);

  useEffect(() => {
    if (quickComposerKind === "study_session") {
      setHostOpen(true);
      setQuickComposerKind(null);
    }
  }, [quickComposerKind, setQuickComposerKind]);

  useEffect(() => {
    if (pendingDraftCard && pendingDraftCard.draftKind === "study_session") {
      try {
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as { title?: string; topicNote?: string };
        if (parsed.title) setTitle(parsed.title);
        if (parsed.topicNote) setTopicNote(parsed.topicNote);
      } catch {
        setTitle(pendingDraftCard.title);
      }
      setHostOpen(true);
      setPendingDraftCard(null);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  const rooms = data?.rooms ?? [];
  const libcalRooms = rooms.filter((r) => r.roomKind === "libcal");
  const walkInRooms = rooms.filter((r) => r.roomKind === "walk_in");

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const roomIdToUse = (selectedRoomId || rooms[0]?._id) as Id<"studyRooms"> | undefined;
    if (!roomIdToUse) {
      setFormError("Choose a Study Room first.");
      return;
    }
    try {
      const startTime = Date.now() + 5 * 60_000;
      await createSession({
        studyRoomId: roomIdToUse,
        title,
        topicNote: topicNote || undefined,
        visibility,
        courseHubId: visibility === "course_members_only" && courseHubId ? (courseHubId as Id<"courseHubs">) : undefined,
        startTime,
        endTime: startTime + durationMins * 60_000,
        maxSeats,
        libcalHostConfirmed: libcalConfirmed,
      });
      setTitle("");
      setTopicNote("");
      setHostOpen(false);
      toast({ tone: "success", message: "Study Session published", detail: "Its Group Chat is ready." });
    } catch (err) {
      setFormError(errorMessage(err, "Could not host the Study Session."));
    }
  };

  const fieldId = (name: string) => `${formId}-${name}`;

  return (
    <div data-testid="study-view" className={ui.page}>
      <section aria-labelledby={fieldId("heading")} className={`${ui.card} space-y-[var(--sp-3)]`}>
        <h1 id={fieldId("heading")} data-route-heading="" tabIndex={-1} className={ui.h1}>
          Study Rooms &amp; Study Sessions
        </h1>
        <p className={ui.muted}>
          Library and AI Lab rooms you can reserve on LibCal, plus walk-in study spaces with crowd reports from the last 45 minutes.
        </p>
        {data?.staleness.isStale && data.staleness.label && (
          <p role="status">
            <StateChip tone="warn" glyph="⏱">{data.staleness.label}</StateChip>
          </p>
        )}
        <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-[minmax(0,1fr)_auto]">
          <SegmentedControl
            label="Day"
            hideLabel={false}
            options={[{ value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }] as const}
            value={dateChoice}
            onChange={setDateChoice}
            testIdPrefix="study-day"
          />
          <button type="button" onClick={() => setHostOpen(true)} className={ui.primary}>
            <Plus aria-hidden="true" className="h-5 w-5" />
            <span>Host Study Session</span>
          </button>
        </div>
      </section>

      <Dialog
        open={hostOpen}
        onClose={() => setHostOpen(false)}
        title="Host a Study Session"
        description="Your session gets a Group Chat. KSUX does not reserve LibCal rooms for you."
        testId="study-host-dialog"
      >
        <form onSubmit={handleCreateSession} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={fieldId("title")} className={ui.label}>Session title</label>
            <input
              id={fieldId("title")}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CS 3305 Graph Review"
              className={ui.input}
            />
          </div>
          <div>
            <label htmlFor={fieldId("topic")} className={ui.label}>Topic note (optional)</label>
            <input id={fieldId("topic")} type="text" value={topicNote} onChange={(e) => setTopicNote(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label htmlFor={fieldId("room")} className={ui.label}>Study Room</label>
            <select id={fieldId("room")} value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)} className={ui.input}>
              <option value="">First available room</option>
              {rooms.map((rm) => (
                <option key={String(rm._id)} value={String(rm._id)}>
                  {rm.buildingName} · {rm.roomNumber} · {rm.campus} · seats {rm.capacity}
                </option>
              ))}
            </select>
          </div>
          <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={fieldId("visibility")} className={ui.label}>Who can join</label>
              <select
                id={fieldId("visibility")}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value === "course_members_only" ? "course_members_only" : "campus_open")}
                className={ui.input}
              >
                <option value="campus_open">Anyone on Campus</option>
                <option value="course_members_only">Course Hub members only</option>
              </select>
            </div>
            {visibility === "course_members_only" && (
              <div className="min-w-0">
                <label htmlFor={fieldId("hub")} className={ui.label}>Course Hub</label>
                <select id={fieldId("hub")} required value={courseHubId} onChange={(e) => setCourseHubId(e.target.value)} className={ui.input}>
                  <option value="">Choose a Course Hub</option>
                  {(rings?.courseRings ?? []).map((c) => (
                    <option key={String(c._id)} value={String(c._id)}>
                      {c.subjectCourse} · {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="min-w-0">
              <label htmlFor={fieldId("duration")} className={ui.label}>Length</label>
              <select id={fieldId("duration")} value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))} className={ui.input}>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={fieldId("seats")} className={ui.label}>Seats (2–20)</label>
              <input
                id={fieldId("seats")}
                type="number"
                min={2}
                max={20}
                value={maxSeats}
                onChange={(e) => setMaxSeats(Number(e.target.value))}
                className={ui.input}
              />
            </div>
          </div>
          <label className={ui.checkRow}>
            <input
              type="checkbox"
              checked={libcalConfirmed}
              onChange={(e) => setLibcalConfirmed(e.target.checked)}
              className={ui.checkbox}
              data-target-exempt=""
            />
            <span className="min-w-0">I reserved this room on kennesaw.libcal.com</span>
          </label>
          {formError && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{formError}</p>}
          <div className={`${ui.row} justify-end`}>
            <button type="button" onClick={() => setHostOpen(false)} className={ui.secondary}>Cancel</button>
            <button type="submit" className={ui.strong}>Publish Study Session</button>
          </div>
        </form>
      </Dialog>

      {(data?.sessions.length ?? 0) > 0 && (
        <section aria-labelledby={fieldId("sessions")} className="space-y-[var(--sp-3)]">
          <h2 id={fieldId("sessions")} className={ui.h2}>Live &amp; Scheduled Study Sessions</h2>
          <ul className="space-y-[var(--sp-3)]">
            {data!.sessions.map((s) => (
              <li key={String(s._id)} className={`${ui.card} space-y-[var(--sp-2)]`}>
                <h3 className={ui.h3}>{s.title}</h3>
                <div className={ui.row}>
                  <span className="text-sm font-bold">{s.campus}</span>
                  {s.courseHub && <StateChip tone="info" glyph="◆">{s.courseHub.subjectCourse} · Members only</StateChip>}
                  {s.unreservedLibCalWarning ? (
                    <StateChip tone="warn" glyph="⚠">Not reserved on LibCal</StateChip>
                  ) : (
                    s.room?.roomKind === "libcal" && <StateChip tone="ok" glyph="✓">Reserved on LibCal</StateChip>
                  )}
                </div>
                <p className={ui.muted}>
                  {s.room ? `${s.room.buildingName} · ${s.room.roomNumber}` : "Campus space"} · Host @{s.host.handle} · {s.seatCount} of {s.maxSeats} seats taken
                </p>
                <div className={ui.row}>
                  {s.groupChatId && s.isAttending && (
                    <Link href={`/chats/${s.groupChatId}`} className={ui.strong}>
                      <MessageSquare aria-hidden="true" className="h-5 w-5" />
                      <span>Session Chat</span>
                    </Link>
                  )}
                  {s.isHost ? (
                    <>
                      {s.room?.roomKind === "libcal" && (
                        <button
                          type="button"
                          onClick={() => void toggleLibCalConfirm({ sessionId: s._id, confirmed: !s.libcalHostConfirmed })}
                          className={ui.secondary}
                        >
                          {s.libcalHostConfirmed ? "Unmark LibCal reservation" : "Mark as reserved on LibCal"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void endSession({ sessionId: s._id })
                            .then(() => toast({ tone: "success", message: "Study Session ended" }))
                            .catch((err: unknown) => toast({ tone: "error", message: "Couldn’t end the session", detail: errorMessage(err, "") }))
                        }
                        className={ui.danger}
                      >
                        End Session
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={s.isAttending}
                        onClick={() =>
                          void toggleAttendance({ sessionId: s._id }).catch((err: unknown) =>
                            toast({ tone: "error", message: "Couldn’t update your seat", detail: errorMessage(err, "") })
                          )
                        }
                        className={toggleClass(s.isAttending)}
                      >
                        <Users aria-hidden="true" className="h-5 w-5" />
                        <span>{s.isAttending ? "Leave session" : "Join session"}</span>
                      </button>
                      <ReportTrigger
                        targetType="study_session"
                        targetId={String(s._id)}
                        targetLabel={s.title}
                        onSubmitReport={async (p) => {
                          await submitReport(p);
                        }}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={fieldId("walkin")} className="space-y-[var(--sp-3)]">
        <h2 id={fieldId("walkin")} className={ui.h2}>Walk-in study spaces ({walkInRooms.length})</h2>
        <p className={ui.muted}>Crowd reports from Students in the last 45 minutes. Community reports are not verified.</p>
        <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] md:grid-cols-2">
          {walkInRooms.map((rm) => (
            <li key={String(rm._id)} className={`${ui.card} space-y-[var(--sp-2)]`}>
              <h3 className={ui.h3}>
                {rm.buildingName} · {rm.roomNumber}
              </h3>
              <p className={ui.muted}>{rm.campus} · Open seating for {rm.capacity}</p>
              <p className="text-sm">
                <span className="font-bold">Crowd now: </span>
                {rm.vibe ? vibeChip(rm.vibe.tierValue, rm.vibe.label) : <StateChip tone="neutral" glyph="◌" dashed>No recent reports</StateChip>}
              </p>
              <fieldset className="min-w-0">
                <legend className="text-sm font-bold">Report how busy it is</legend>
                <div className={`${ui.row} mt-[var(--sp-1)]`}>
                  {VIBES.map(([vibeKey, label, glyph]) => (
                    <button
                      key={vibeKey}
                      type="button"
                      onClick={async () => {
                        try {
                          await submitVibe({ roomSlug: rm.slug, vibe: vibeKey });
                          toast({ tone: "success", message: `Reported ${label} at ${rm.roomNumber}` });
                        } catch (err) {
                          toast({ tone: "error", message: "Couldn’t send your report", detail: errorMessage(err, "") });
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
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={fieldId("libcal")} className="space-y-[var(--sp-3)]">
        <h2 id={fieldId("libcal")} className={ui.h2}>Reservable library &amp; AI Lab rooms ({libcalRooms.length})</h2>
        <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] md:grid-cols-2">
          {libcalRooms.slice(0, 20).map((rm) => {
            const open = rm.openHalfHourSlotsCount;
            const freshness = rm.isFixtureSnapshot
              ? "Judge Demo availability"
              : rm.availabilityFreshness
                ? "LibCal · " + (rm.availabilityFreshness.label ?? "Synced")
                : null;
            return (
              <li key={String(rm._id)} className={`${ui.card} space-y-[var(--sp-2)]`}>
                <h3 className={`${ui.h3} flex min-w-0 items-center gap-[var(--sp-2)]`}>
                  <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    {rm.roomNumber} · {rm.buildingName}
                  </span>
                </h3>
                <p className={ui.muted}>
                  {rm.campus} · seats {rm.capacity}
                  {freshness ? ` · ${freshness}` : ""}
                </p>
                <p className="text-sm">
                  {open === null ? (
                    <StateChip tone="neutral" glyph="◌" dashed>Availability unavailable</StateChip>
                  ) : open > 0 ? (
                    <StateChip tone="ok" glyph="○">{open} open half-hour slots {data?.targetDateET ? `on ${data.targetDateET}` : ""}</StateChip>
                  ) : (
                    <StateChip tone="bad" glyph="●">Fully booked</StateChip>
                  )}
                </p>
                {rm.daytimeSlotsOpen.length > 0 && (
                  <div>
                    <p className="text-sm text-[var(--muted)]">8 AM to 10 PM ET · striped = open, solid = reserved</p>
                    <div
                      aria-hidden="true"
                      className="mt-[var(--sp-1)] grid gap-px"
                      style={{ gridTemplateColumns: `repeat(${rm.daytimeSlotsOpen.length}, minmax(0, 1fr))` }}
                    >
                      {rm.daytimeSlotsOpen.map((isOpen, idx) => (
                        <span
                          key={idx}
                          className={`h-3 rounded-sm border border-[var(--line-strong)] ${isOpen ? "status-pattern-filling" : "bg-[var(--line-strong)]"}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {rm.bookingUrl && (
                  <a href={rm.bookingUrl} target="_blank" rel="noreferrer" className={ui.strong}>
                    <span>Reserve on LibCal</span>
                    <ExternalLink aria-hidden="true" className="h-5 w-5" />
                    <NewTab />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
