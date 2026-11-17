"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Plus,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";

export function StudyView() {
  const searchParams = useSearchParams();
  const {
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();
  const [dateChoice, setDateChoice] = useState<"today" | "tomorrow">("today");
  const [hostOpen, setHostOpen] = useState(searchParams.get("host") === "1");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [topicNote, setTopicNote] = useState("");
  const [visibility, setVisibility] = useState<
    "campus_open" | "course_members_only"
  >("campus_open");
  const [courseHubId, setCourseHubId] = useState<string>("");
  const [durationMins, setDurationMins] = useState(90);
  const [maxSeats, setMaxSeats] = useState(6);
  const [libcalConfirmed, setLibcalConfirmed] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const data = useViewerQuery(api.study.listStudyRoomsAndSessions, {
    dateChoice,
  });
  const rings = useViewerQuery(api.feed.listFeedRingsAndTrends, {});

  const triggerSwr = useViewerMutation(api.study.triggerStudySwrRefresh);
  const submitVibe = useViewerMutation(api.study.submitWalkInVibe);
  const createSession = useViewerMutation(api.study.createStudySession);
  const toggleAttendance = useViewerMutation(
    api.study.toggleStudySessionAttendance
  );
  const toggleLibCalConfirm = useViewerMutation(
    api.study.toggleHostLibCalConfirmed
  );
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
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as {
          title?: string;
          topicNote?: string;
        };
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
    const roomIdToUse = (selectedRoomId || rooms[0]?._id) as
      | Id<"studyRooms">
      | undefined;
    if (!roomIdToUse) return;
    try {
      const startTime = Date.now() + 5 * 60_000;
      await createSession({
        studyRoomId: roomIdToUse,
        title,
        topicNote: topicNote || undefined,
        visibility,
        courseHubId:
          visibility === "course_members_only" && courseHubId
            ? (courseHubId as Id<"courseHubs">)
            : undefined,
        startTime,
        endTime: startTime + durationMins * 60_000,
        maxSeats,
        libcalHostConfirmed: libcalConfirmed,
      });
      setTitle("");
      setTopicNote("");
      setHostOpen(false);
      setBanner("Study Session published and Group Chat created!");
    } catch (err: any) {
      setBanner(err?.data?.message || err?.message || "Could not host session.");
    }
  };

  return (
    <div data-testid="study-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              Study Rooms &amp; Study Sessions
            </h1>
            <p className="text-xs text-[#5E6675]">
              47 Sturgis, Johnson &amp; Marietta AI Lab LibCal rooms (48-bit
              half-hour grid) + 10 curated walk-in spaces (45m vibes).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data?.staleness.isStale && data.staleness.label && (
              <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
                {data.staleness.label}
              </span>
            )}
            <div className="inline-flex rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] p-1">
              {(["today", "tomorrow"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDateChoice(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-extrabold capitalize ${
                    dateChoice === d
                      ? "bg-[#111317] text-[#FDBB30]"
                      : "text-[#5E6675]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHostOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-2 text-xs font-extrabold text-[#111317]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ Host Study Session</span>
            </button>
          </div>
        </div>

        {banner && (
          <p className="mt-3 rounded-xl bg-[#FFF6DC] px-3 py-2 text-xs font-bold text-[#855A00]">
            {banner}
          </p>
        )}

        {hostOpen && (
          <form
            onSubmit={handleCreateSession}
            className="mt-3 space-y-2.5 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-3.5"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session Title (e.g. CS 3305 Graph Review)"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="">Select Study Room</option>
                {rooms.map((rm) => (
                  <option key={String(rm._id)} value={String(rm._id)}>
                    [{rm.campus}] {rm.buildingName} · {rm.roomNumber} (Cap{" "}
                    {rm.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="campus_open">Campus-Open</option>
                <option value="course_members_only">
                  Course Hub Members Only
                </option>
              </select>

              {visibility === "course_members_only" && (
                <select
                  required
                  value={courseHubId}
                  onChange={(e) => setCourseHubId(e.target.value)}
                  className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
                >
                  <option value="">Select Enrolled Course Hub</option>
                  {(rings?.courseRings ?? []).map((c) => (
                    <option key={String(c._id)} value={String(c._id)}>
                      {c.subjectCourse} · {c.title}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value={60}>1 Hour</option>
                <option value={90}>1.5 Hours</option>
                <option value={120}>2 Hours</option>
                <option value={180}>3 Hours</option>
              </select>

              <input
                type="number"
                min={2}
                max={20}
                value={maxSeats}
                onChange={(e) => setMaxSeats(Number(e.target.value))}
                placeholder="Max seats"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#111317]">
                <input
                  type="checkbox"
                  checked={libcalConfirmed}
                  onChange={(e) => setLibcalConfirmed(e.target.checked)}
                />
                <span>LibCal Reserved ✓ (checked out on kennesaw.libcal.com)</span>
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-4 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Publish Study Session
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Active Study Sessions */}
      {(data?.sessions.length ?? 0) > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Live &amp; Scheduled Study Sessions
          </h2>
          {data!.sessions.map((s) => (
            <div
              key={String(s._id)}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-black text-[#111317]">{s.title}</span>
                    <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10.5px] font-extrabold text-[#855A00]">
                      {s.campus}
                    </span>
                    {s.courseHub && (
                      <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10.5px] font-extrabold text-[#3730A3]">
                        {s.courseHub.subjectCourse} · Members Only
                      </span>
                    )}
                    {s.unreservedLibCalWarning ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[10.5px] font-extrabold text-[#B45309]">
                        <AlertTriangle className="h-3 w-3" />
                        ⚠️ Unreserved on LibCal
                      </span>
                    ) : (
                      s.room?.roomKind === "libcal" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10.5px] font-extrabold text-[#15803D]">
                          <CheckCircle2 className="h-3 w-3" />
                          LibCal Reserved ✓
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#5E6675]">
                    {s.room
                      ? `${s.room.buildingName} · ${s.room.roomNumber}`
                      : "Campus Space"}{" "}
                    · Host @{s.host.handle} · {s.seatCount}/{s.maxSeats} seats
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {s.groupChatId && s.isAttending && (
                    <Link
                      href={`/chats/${s.groupChatId}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3 py-1.5 text-xs font-extrabold text-[#FDBB30]"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Session Chat</span>
                    </Link>
                  )}

                  {s.isHost ? (
                    <>
                      {s.room?.roomKind === "libcal" && (
                        <button
                          type="button"
                          onClick={() =>
                            void toggleLibCalConfirm({
                              sessionId: s._id,
                              confirmed: !s.libcalHostConfirmed,
                            })
                          }
                          className="rounded-xl border border-[#E4E7EE] px-2.5 py-1.5 text-xs font-bold text-[#111317]"
                        >
                          {s.libcalHostConfirmed
                            ? "Unmark LibCal"
                            : "Mark LibCal Reserved ✓"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void endSession({ sessionId: s._id })}
                        className="rounded-xl border border-[#B91C1C] px-2.5 py-1.5 text-xs font-bold text-[#B91C1C]"
                      >
                        End Session
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleAttendance({ sessionId: s._id })
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-1.5 text-xs font-extrabold text-[#111317]"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>{s.isAttending ? "Leave" : "Join Seats"}</span>
                      </button>
                      <ReportTrigger
                        targetType="study_session"
                        targetId={String(s._id)}
                        onSubmitReport={async (p) => {
                          await submitReport(p);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Curated Walk-In Study Spaces (45m Crowd Vibes) */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
          Walk-In Campus Study Spaces ({walkInRooms.length}) · 45m Vibes
        </h2>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {walkInRooms.map((rm) => (
            <div
              key={String(rm._id)}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-3.5 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-[#111317]">
                    {rm.buildingName} · {rm.roomNumber}
                  </div>
                  <div className="text-[11px] text-[#5E6675]">
                    {rm.campus} · Open Seating ({rm.capacity})
                  </div>
                </div>
                {rm.vibe && (
                  <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#15803D]">
                    {rm.vibe.label}
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex items-center gap-1.5">
                {(
                  [
                    ["quiet", "Quiet"],
                    ["moderate", "Moderate"],
                    ["packed", "Packed"],
                  ] as const
                ).map(([vibeKey, label]) => (
                  <button
                    key={vibeKey}
                    type="button"
                    onClick={async () => {
                      await submitVibe({ roomSlug: rm.slug, vibe: vibeKey });
                      setBanner(`Updated 45m '${label}' vibe on ${rm.roomNumber}.`);
                    }}
                    className="rounded-lg border border-[#E4E7EE] bg-[#F9FAFC] px-2.5 py-1 text-[11px] font-bold text-[#111317] hover:border-[#D99B00]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LibCal 30-Minute Availability Rooms */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
          LibCal Reservable Library &amp; AI Lab Rooms ({libcalRooms.length})
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {libcalRooms.slice(0, 20).map((rm) => (
            <div
              key={String(rm._id)}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-3.5 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#111317]">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>
                      {rm.roomNumber} · {rm.buildingName}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5E6675]">
                    {rm.campus} · Cap {rm.capacity} ·{" "}
                    <strong>{rm.openHalfHourSlotsCount ?? 0}</strong> open 30m
                    slots ({data?.targetDateET})
                  </div>
                </div>
                {rm.bookingUrl && (
                  <a
                    href={rm.bookingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#111317] px-2.5 py-1.5 text-[11px] font-extrabold text-[#FDBB30]"
                  >
                    <span>Reserve Officially on LibCal</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Compact 8 AM - 10 PM 30-min Availability Strip */}
              <div
                className="mt-2.5 grid gap-0.5"
                style={{ gridTemplateColumns: "repeat(28, minmax(0, 1fr))" }}
                title="30-minute slots from 8:00 AM to 10:00 PM ET (Green = Open, Gray = Reserved)"
              >
                {rm.daytimeSlotsOpen.map((isOpen, idx) => (
                  <span
                    key={idx}
                    className={`h-2.5 rounded-xs ${
                      isOpen ? "bg-[#16A34A]" : "bg-[#CBD5E1]"
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
