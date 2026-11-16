"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";

export function EventsCalendarView() {
  const [queryText, setQueryText] = useState("");
  const [hostOpen, setHostOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [locationName, setLocationName] = useState("");
  const [campus, setCampus] = useState<"Kennesaw" | "Marietta">("Kennesaw");
  const [isVirtual, setIsVirtual] = useState(false);
  const [description, setDescription] = useState("");

  const result = useViewerQuery(api.communities.listEvents, {
    queryText: queryText || undefined,
  });
  const setRsvp = useViewerMutation(api.communities.setEventRsvp);
  const createEvent = useViewerMutation(api.communities.createNativeEvent);

  const handleHostMeetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = Date.now() + 2 * 3600_000;
    await createEvent({
      title,
      description: description || title,
      campus,
      isVirtual,
      locationName: locationName || `${campus} Campus Green`,
      startTime,
      endTime: startTime + 90 * 60_000,
    });
    setTitle("");
    setLocationName("");
    setDescription("");
    setHostOpen(false);
  };

  return (
    <div data-testid="events-calendar-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              KSU Campus Events Calendar
            </h1>
            <p className="text-xs text-[#5E6675]">
              Deduplicated Localist + Anthology Engage + Club &amp; Student
              Events
            </p>
          </div>
          <div className="flex items-center gap-2">
            {result?.staleness.isStale && result.staleness.label && (
              <span
                data-testid="events-staleness-badge"
                className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]"
              >
                {result.staleness.label}
              </span>
            )}
            <button
              type="button"
              onClick={() => setHostOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-2 text-xs font-extrabold text-[#111317]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ Campus Hangout</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2">
          <Search className="h-4 w-4 text-[#5E6675]" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search Kennesaw, Marietta, or Virtual Events..."
            className="w-full bg-transparent text-xs font-semibold text-[#111317] focus:outline-none"
          />
        </div>

        {hostOpen && (
          <form
            onSubmit={handleHostMeetup}
            className="mt-3 space-y-2.5 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-3.5"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Hangout / Meetup Title"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Location or Teams Link"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value as any)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="Kennesaw">Kennesaw Campus</option>
                <option value="Marietta">Marietta Campus</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={isVirtual}
                  onChange={(e) => setIsVirtual(e.target.checked)}
                />
                <span>Virtual Event (Dual-Campus Both scope)</span>
              </label>
              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-4 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Publish Event
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="space-y-3">
        {(result?.events ?? []).map((ev) => (
          <div
            key={String(ev._id)}
            className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-[10.5px] font-extrabold text-[#855A00]">
                  {ev.isVirtual ? "Virtual · Both Campuses" : ev.campus}
                </span>
                <span className="text-[11px] font-bold uppercase text-[#5E6675]">
                  {ev.source}
                </span>
                {ev.status === "cancelled_upstream" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[10.5px] font-extrabold text-[#B91C1C]">
                    <AlertTriangle className="h-3 w-3" />
                    Cancelled Upstream
                  </span>
                )}
              </div>
              <span className="text-[11px] font-semibold text-[#5E6675]">
                {new Date(ev.startTime).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <Link
              href={`/events/${ev._id}`}
              className="mt-1.5 block text-sm font-black text-[#111317] hover:underline"
            >
              {ev.title}
            </Link>
            <p className="mt-1 flex items-center gap-1 text-xs text-[#5E6675]">
              <MapPin className="h-3.5 w-3.5" />
              {ev.locationName}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E7EE] pt-2.5 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void setRsvp({
                      eventId: ev._id,
                      rsvpStatus:
                        ev.myRsvpStatus === "going" ? "none" : "going",
                    })
                  }
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 font-extrabold ${
                    ev.myRsvpStatus === "going"
                      ? "bg-[#15803D] text-white"
                      : "border border-[#E4E7EE] bg-[#F9FAFC] text-[#111317]"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Going ({ev.goingCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void setRsvp({
                      eventId: ev._id,
                      rsvpStatus:
                        ev.myRsvpStatus === "interested"
                          ? "none"
                          : "interested",
                    })
                  }
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 font-bold ${
                    ev.myRsvpStatus === "interested"
                      ? "bg-[#111317] text-[#FDBB30]"
                      : "border border-[#E4E7EE] bg-[#F9FAFC] text-[#5E6675]"
                  }`}
                >
                  <Star className="h-3.5 w-3.5" />
                  <span>Interested ({ev.interestedCount})</span>
                </button>
              </div>

              {ev.externalUrl && (
                <a
                  href={ev.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#1E3A8A]"
                >
                  <span>Source</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventDetailView({ eventId }: { eventId: string }) {
  const detail = useViewerQuery(api.communities.getEventDetail, {
    eventId: eventId as Id<"events">,
  });
  const setRsvp = useViewerMutation(api.communities.setEventRsvp);

  if (detail === undefined) {
    return (
      <div className="p-4 text-xs font-semibold text-[#5E6675]">
        Loading Event...
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-sm font-bold">
          Event not found.
        </div>
      </div>
    );
  }

  const { event } = detail;

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 font-extrabold text-[#855A00]">
            {event.isVirtual ? "Virtual · Both Campuses" : event.campus}
          </span>
          {event.status === "cancelled_upstream" && (
            <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 font-extrabold text-[#B91C1C]">
              Cancelled Upstream
            </span>
          )}
        </div>

        <h1 className="mt-2 text-xl font-black text-[#111317]">
          {event.title}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#5E6675]">
          <Calendar className="h-3.5 w-3.5" />
          <span>{new Date(event.startTime).toLocaleString()}</span>
          <span>· {event.locationName}</span>
        </p>

        {detail.club && (
          <Link
            href={`/clubs/${detail.club.slug}`}
            className="mt-2 inline-block text-xs font-bold text-[#1E3A8A] underline"
          >
            Hosted by {detail.club.name} →
          </Link>
        )}

        <p className="mt-3 text-sm leading-relaxed text-[#374151]">
          {event.description}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() =>
              void setRsvp({
                eventId: event._id,
                rsvpStatus: detail.myRsvpStatus === "going" ? "none" : "going",
              })
            }
            className="rounded-xl bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30]"
          >
            {detail.myRsvpStatus === "going"
              ? `✓ Going (${detail.goingCount})`
              : `RSVP Going (${detail.goingCount})`}
          </button>
          <Link
            href="/events"
            className="rounded-xl border border-[#E4E7EE] px-4 py-2 text-xs font-bold text-[#5E6675]"
          >
            ← All Events
          </Link>
        </div>
      </div>
    </div>
  );
}
