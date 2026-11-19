"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { Calendar, CheckCircle2, ExternalLink, MapPin, Plus, Star } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { NewTab, StateChip, errorMessage, toggleClass, ui } from "./campusLifeUi";

function when(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  localist: "KSU Calendar",
  engage: "Owl Life",
  club: "Club event",
  student: "Student-hosted",
};

export function EventsCalendarView() {
  const id = useId();
  const { toast } = useAnnouncer();
  const [queryText, setQueryText] = useState("");
  const [hostOpen, setHostOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [locationName, setLocationName] = useState("");
  const [campus, setCampus] = useState<"Kennesaw" | "Marietta">("Kennesaw");
  const [isVirtual, setIsVirtual] = useState(false);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const result = useViewerQuery(api.communities.listEvents, { queryText: queryText || undefined });
  const setRsvp = useViewerMutation(api.communities.setEventRsvp);
  const createEvent = useViewerMutation(api.communities.createNativeEvent);

  const handleHostMeetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const startTime = Date.now() + 2 * 3600_000;
    try {
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
      toast({ tone: "success", message: "Hangout published" });
    } catch (err) {
      setFormError(errorMessage(err, "Could not publish the hangout."));
    }
  };

  const rsvp = (eventId: Id<"events">, rsvpStatus: "going" | "interested" | "none") =>
    void setRsvp({ eventId, rsvpStatus }).catch((err: unknown) =>
      toast({ tone: "error", message: "Couldn’t save your RSVP", detail: errorMessage(err, "") })
    );

  return (
    <div data-testid="events-calendar-view" className={ui.page}>
      <section aria-labelledby={`${id}-h`} className={`${ui.card} space-y-[var(--sp-3)]`}>
        <h1 id={`${id}-h`} data-route-heading="" tabIndex={-1} className={ui.h1}>
          Events
        </h1>
        <p className={ui.muted}>
          Events for the Campus you picked in the header, from the KSU calendar, Owl Life and Student-hosted hangouts. Virtual events show on both Campuses.
        </p>
        {result?.staleness.isStale && result.staleness.label && (
          <p role="status">
            <StateChip tone="warn" glyph="⏱" testId="events-staleness-badge">{result.staleness.label}</StateChip>
          </p>
        )}
        <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <label htmlFor={`${id}-search`} className={ui.label}>Search events</label>
            <input
              id={`${id}-search`}
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Title, place or club"
              className={ui.input}
            />
          </div>
          <button type="button" onClick={() => setHostOpen(true)} className={ui.primary}>
            <Plus aria-hidden="true" className="h-5 w-5" />
            <span>Host a Campus Hangout</span>
          </button>
        </div>
      </section>

      <Dialog open={hostOpen} onClose={() => setHostOpen(false)} title="Host a Campus Hangout" testId="events-host-dialog">
        <form onSubmit={handleHostMeetup} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={`${id}-title`} className={ui.label}>Title</label>
            <input id={`${id}-title`} type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label htmlFor={`${id}-loc`} className={ui.label}>Location or meeting link</label>
            <input id={`${id}-loc`} type="text" required value={locationName} onChange={(e) => setLocationName(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label htmlFor={`${id}-desc`} className={ui.label}>Description (optional)</label>
            <textarea id={`${id}-desc`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={`${ui.input} py-[var(--sp-2)]`} />
          </div>
          <div>
            <label htmlFor={`${id}-campus`} className={ui.label}>Campus</label>
            <select
              id={`${id}-campus`}
              value={campus}
              onChange={(e) => setCampus(e.target.value === "Marietta" ? "Marietta" : "Kennesaw")}
              className={ui.input}
            >
              <option value="Kennesaw">Kennesaw</option>
              <option value="Marietta">Marietta</option>
            </select>
          </div>
          <label className={ui.checkRow}>
            <input type="checkbox" checked={isVirtual} onChange={(e) => setIsVirtual(e.target.checked)} className={ui.checkbox} data-target-exempt="" />
            <span className="min-w-0">Virtual event (shows on both Campuses)</span>
          </label>
          {formError && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{formError}</p>}
          <div className={`${ui.row} justify-end`}>
            <button type="button" onClick={() => setHostOpen(false)} className={ui.secondary}>Cancel</button>
            <button type="submit" className={ui.strong}>Publish Event</button>
          </div>
        </form>
      </Dialog>

      {result === undefined && <p role="status" className={ui.muted}>Loading events…</p>}
      {result && result.events.length === 0 && <p className={ui.muted}>No events match.</p>}

      <ul className="space-y-[var(--sp-3)]" data-testid="events-list">
        {(result?.events ?? []).map((ev) => {
          const going = ev.myRsvpStatus === "going";
          const interested = ev.myRsvpStatus === "interested";
          return (
            <li key={String(ev._id)} className={`${ui.card} space-y-[var(--sp-2)]`}>
              <div className={ui.row}>
                <span className="text-sm font-bold">{ev.isVirtual ? "Virtual · Both Campuses" : ev.campus}</span>
                <span className="text-sm text-[var(--muted)]">{SOURCE_LABEL[ev.source] ?? ev.source}</span>
                {ev.status === "cancelled_upstream" && <StateChip tone="bad" glyph="✕">Cancelled</StateChip>}
              </div>
              <h2 className={ui.h3}>
                <Link href={`/events/${ev._id}`} className="inline-flex min-h-[var(--target)] max-w-full items-center underline-offset-2 hover:underline">
                  {ev.title}
                  {ev.isFixture ? " · Demo" : ""}
                </Link>
              </h2>
              <p className="text-sm">
                <time dateTime={new Date(ev.startTime).toISOString()}>{when(ev.startTime)}</time>
              </p>
              <p className={`${ui.muted} flex min-w-0 items-center gap-[var(--sp-1)]`}>
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0">{ev.locationName}</span>
              </p>
              <div className={`${ui.row} border-t border-[var(--line)] pt-[var(--sp-2)]`}>
                <button type="button" aria-pressed={going} onClick={() => rsvp(ev._id, going ? "none" : "going")} className={toggleClass(going)}>
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                  <span>Going ({ev.goingCount})</span>
                </button>
                <button
                  type="button"
                  aria-pressed={interested}
                  onClick={() => rsvp(ev._id, interested ? "none" : "interested")}
                  className={toggleClass(interested)}
                >
                  <Star aria-hidden="true" className="h-5 w-5" />
                  <span>Interested ({ev.interestedCount})</span>
                </button>
                {ev.externalUrl && (
                  <a href={ev.externalUrl} target="_blank" rel="noreferrer" className={ui.link}>
                    <span>Source<span className="sr-only">: {ev.title}</span></span>
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                    <NewTab />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EventDetailView({ eventId }: { eventId: string }) {
  const { toast } = useAnnouncer();
  const detail = useViewerQuery(api.communities.getEventDetail, { eventId: eventId as Id<"events"> });
  const setRsvp = useViewerMutation(api.communities.setEventRsvp);

  if (detail === undefined) {
    return (
      <div className={ui.page} aria-busy="true">
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>Event</h1>
        <p role="status" className={ui.muted}>Loading event…</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className={ui.page}>
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>Event not found</h1>
        <Link href="/events" className={ui.secondary}>
          <span aria-hidden="true">←</span> All Events
        </Link>
      </div>
    );
  }

  const { event } = detail;
  const going = detail.myRsvpStatus === "going";

  return (
    <div data-testid="event-detail-view" className={ui.page}>
      <article className={`${ui.card} space-y-[var(--sp-3)]`}>
        <div className={ui.row}>
          <span className="text-sm font-bold">{event.isVirtual ? "Virtual · Both Campuses" : event.campus}</span>
          {event.status === "cancelled_upstream" && <StateChip tone="bad" glyph="✕">Cancelled</StateChip>}
        </div>
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>
          {event.title}
          {event.isFixture ? " · Demo" : ""}
        </h1>
        <p className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)] text-sm">
          <Calendar aria-hidden="true" className="h-4 w-4 shrink-0" />
          <time dateTime={new Date(event.startTime).toISOString()}>{when(event.startTime)}</time>
          <span>· {event.locationName}</span>
        </p>
        {detail.club && (
          <p>
            <Link href={`/clubs/${detail.club.slug}`} className={ui.link}>
              Hosted by {detail.club.name}
            </Link>
          </p>
        )}
        <p className="text-body leading-relaxed">{event.description}</p>
        <div className={ui.row}>
          <button
            type="button"
            aria-pressed={going}
            onClick={() =>
              void setRsvp({ eventId: event._id, rsvpStatus: going ? "none" : "going" }).catch((err: unknown) =>
                toast({ tone: "error", message: "Couldn’t save your RSVP", detail: errorMessage(err, "") })
              )
            }
            className={toggleClass(going)}
          >
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            Going ({detail.goingCount})
          </button>
          <Link href="/events" className={ui.secondary}>
            <span aria-hidden="true">←</span> All Events
          </Link>
        </div>
      </article>
    </div>
  );
}
