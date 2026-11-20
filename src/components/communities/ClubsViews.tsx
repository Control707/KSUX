"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { Award, Calendar, Check, MessageSquare, Plus, Send, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge } from "@/components/a11y/controls";
import { NewTab, errorMessage, toggleClass, ui } from "./campusLifeUi";

type BrowseCampus = "All KSU" | "Kennesaw" | "Marietta";

function kindLabel(kind: string) {
  return kind === "campus_department" ? "Campus Department" : kind === "community" ? "Community Club" : "Registered KSU Club";
}

export function ClubsDirectoryView() {
  const id = useId();
  const { toast } = useAnnouncer();
  const [queryText, setQueryText] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | "registered_ksu" | "campus_department" | "community">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [browseCampus, setBrowseCampus] = useState<BrowseCampus>("All KSU");
  const [name, setName] = useState("");
  const [campus, setCampus] = useState<"Kennesaw" | "Marietta">("Kennesaw");
  const [summaryText, setSummaryText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clubs = useViewerQuery(api.communities.listClubs, {
    campusOverride: browseCampus,
    queryText: queryText || undefined,
    clubKindFilter: kindFilter || undefined,
  });
  const coverage = useViewerQuery(api.communities.getClubDirectoryCoverage, { campusOverride: browseCampus });
  const toggleJoin = useViewerMutation(api.communities.toggleJoinClub);
  const createCommunityClub = useViewerMutation(api.communities.createCommunityClub);

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createCommunityClub({ name, campus, summary: summaryText, description: description || summaryText });
      setName("");
      setSummaryText("");
      setDescription("");
      setCreateOpen(false);
      toast({ tone: "success", message: "Community Club created" });
    } catch (err) {
      setError(errorMessage(err, "Could not create the Club."));
    }
  };

  return (
    <div data-testid="clubs-directory-view" className={ui.page}>
      <section aria-labelledby={`${id}-h`} className={`${ui.card} space-y-[var(--sp-3)]`}>
        <h1 id={`${id}-h`} data-route-heading="" tabIndex={-1} className={ui.h1}>
          Clubs &amp; Campus Departments
        </h1>
        <p className="text-sm">
          <a href="https://owllife.kennesaw.edu/" target="_blank" rel="noopener noreferrer" className="font-bold underline">
            Open the official Owl Life directory
            <NewTab />
          </a>
          {" · "}
          <Link href="/events" className="font-bold underline">
            Browse Events
          </Link>
        </p>
        {coverage && (
          <p role="status" className={ui.muted}>
            {coverage === "demo"
              ? "Judge Demo Mode shows sample Clubs."
              : coverage === "partial"
                ? "OwlSide covers part of the official Club directory for the selected Campus."
                : "Institutional Club data is unavailable for the selected Campus. You can still browse Community Clubs."}
          </p>
        )}
        <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-3">
          <div className="min-w-0">
            <label htmlFor={`${id}-search`} className={ui.label}>Search Clubs</label>
            <input
              id={`${id}-search`}
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Name or topic"
              className={ui.input}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-campus`} className={ui.label}>Filter Clubs by Campus</label>
            <select
              id={`${id}-campus`}
              data-testid="clubs-campus-filter"
              value={browseCampus}
              onChange={(event) => {
                const selected = event.currentTarget.value;
                setBrowseCampus(selected === "Kennesaw" || selected === "Marietta" ? selected : "All KSU");
              }}
              className={ui.input}
            >
              <option value="All KSU">All KSU</option>
              <option value="Kennesaw">Kennesaw</option>
              <option value="Marietta">Marietta</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-kind`} className={ui.label}>Type</label>
            <select
              id={`${id}-kind`}
              value={kindFilter}
              onChange={(e) => {
                const v = e.target.value;
                setKindFilter(v === "registered_ksu" || v === "campus_department" || v === "community" ? v : "");
              }}
              className={ui.input}
            >
              <option value="">All types</option>
              <option value="registered_ksu">Registered KSU Club</option>
              <option value="campus_department">Campus Department</option>
              <option value="community">Community Club</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={ui.primary}>
          <Plus aria-hidden="true" className="h-5 w-5" />
          <span>Start a Community Club</span>
        </button>
      </section>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Start a Community Club"
        description="Community Clubs are run by Students. They are not registered with KSU."
        testId="clubs-create-dialog"
      >
        <form onSubmit={handleCreateClub} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={`${id}-name`} className={ui.label}>Club name</label>
            <input id={`${id}-name`} type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marietta Trail Runners" className={ui.input} />
          </div>
          <div>
            <label htmlFor={`${id}-ccampus`} className={ui.label}>Campus</label>
            <select
              id={`${id}-ccampus`}
              value={campus}
              onChange={(e) => setCampus(e.target.value === "Marietta" ? "Marietta" : "Kennesaw")}
              className={ui.input}
            >
              <option value="Kennesaw">Kennesaw</option>
              <option value="Marietta">Marietta</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-summary`} className={ui.label}>Short summary</label>
            <input id={`${id}-summary`} type="text" required value={summaryText} onChange={(e) => setSummaryText(e.target.value)} className={ui.input} />
          </div>
          {error && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{error}</p>}
          <div className={`${ui.row} justify-end`}>
            <button type="button" onClick={() => setCreateOpen(false)} className={ui.secondary}>Cancel</button>
            <button type="submit" className={ui.strong}>Create Community Club</button>
          </div>
        </form>
      </Dialog>

      {clubs === undefined && <p role="status" className={ui.muted}>Loading Clubs…</p>}
      {clubs?.length === 0 && <p className={ui.muted}>No Clubs match these filters.</p>}
      <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] md:grid-cols-2" data-testid="clubs-list">
        {(clubs ?? []).map((club) => (
          <li key={String(club._id)} className={`${ui.card} flex flex-col justify-between gap-[var(--sp-2)]`}>
            <div className="min-w-0 space-y-[var(--sp-1)]">
              <div className={ui.row}>
                <CampusBadge campus={club.campus} />
                <span className="text-sm text-[var(--muted)]">{kindLabel(club.clubKind)}</span>
                <span className="text-sm text-[var(--muted)]">· {club.memberCount} members</span>
              </div>
              <h2 className={ui.h3}>
                <Link href={`/clubs/${club.slug}`} className="inline-flex min-h-[var(--target)] max-w-full items-center underline-offset-2 hover:underline">
                  {club.name}
                  {club.isFixture ? " · Demo" : ""}
                </Link>
              </h2>
              <p className="line-clamp-3 text-sm text-[var(--muted)]">{club.summary}</p>
            </div>
            <div className={ui.row}>
              <button
                type="button"
                aria-pressed={Boolean(club.myRole)}
                onClick={() =>
                  void toggleJoin({ clubId: club._id }).catch((err: unknown) =>
                    toast({ tone: "error", message: "Couldn’t update membership", detail: errorMessage(err, "") })
                  )
                }
                className={toggleClass(Boolean(club.myRole))}
              >
                {club.myRole ? <Check aria-hidden="true" className="h-5 w-5" /> : <Users aria-hidden="true" className="h-5 w-5" />}
                <span>
                  {club.myRole ? (club.myRole === "officer" ? "Officer" : "Joined") : "Join"}
                  <span className="sr-only"> {club.name}</span>
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ClubProfileView({ slug }: { slug: string }) {
  const id = useId();
  const { toast } = useAnnouncer();
  const detail = useViewerQuery(api.communities.getClubBySlug, { slug });
  const toggleJoin = useViewerMutation(api.communities.toggleJoinClub);
  const claimOfficer = useViewerMutation(api.communities.claimClubOfficerRole);
  const createPost = useViewerMutation(api.feed.createPost);
  const createEvent = useViewerMutation(api.communities.createNativeEvent);

  const [postBody, setPostBody] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evLoc, setEvLoc] = useState("");
  const [eventError, setEventError] = useState<string | null>(null);

  if (detail === undefined) {
    return (
      <div className={ui.page} aria-busy="true">
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>Club</h1>
        <p role="status" className={ui.muted}>Loading Club…</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className={ui.page}>
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>Club not found</h1>
        <Link href="/clubs" className={ui.secondary}>
          <span aria-hidden="true">←</span> All Clubs
        </Link>
      </div>
    );
  }

  const { club } = detail;

  const handleClaimOfficer = async () => {
    try {
      const res = await claimOfficer({ clubId: club._id });
      toast({
        tone: "success",
        message: res.status === "auto_approved" ? "Officer role approved" : "Officer claim sent to OwlSide moderators",
        detail: res.status === "auto_approved" ? "Your .edu email matched the Club contact." : "A moderator will review it.",
      });
    } catch (err) {
      toast({ tone: "error", message: "Couldn’t claim the officer role", detail: errorMessage(err, "") });
    }
  };

  return (
    <div data-testid="club-profile-view" className={ui.page}>
      <section className={`${ui.card} space-y-[var(--sp-3)]`}>
        <div className={ui.row}>
          <CampusBadge campus={club.campus} />
          <span className="text-sm text-[var(--muted)]">{kindLabel(club.clubKind)}</span>
        </div>
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>
          {club.name}
          {club.isFixture ? " · Demo" : ""}
        </h1>
        <p className="text-body leading-relaxed">{club.description}</p>
        <div className={ui.row}>
          {detail.groupChatId && (
            <Link href={`/chats/${detail.groupChatId}`} className={ui.strong}>
              <MessageSquare aria-hidden="true" className="h-5 w-5" />
              <span>Club Group Chat</span>
            </Link>
          )}
          <button
            type="button"
            aria-pressed={Boolean(detail.myRole)}
            onClick={() =>
              void toggleJoin({ clubId: club._id }).catch((err: unknown) =>
                toast({ tone: "error", message: "Couldn’t update membership", detail: errorMessage(err, "") })
              )
            }
            className={toggleClass(Boolean(detail.myRole))}
          >
            {detail.myRole ? <Check aria-hidden="true" className="h-5 w-5" /> : <Users aria-hidden="true" className="h-5 w-5" />}
            {detail.myRole ? `Joined (${detail.myRole})` : "Join Club"}
          </button>
          {detail.myRole !== "officer" && (
            <button type="button" onClick={() => void handleClaimOfficer()} className={ui.secondary}>
              <Award aria-hidden="true" className="h-5 w-5" />
              <span>Claim Officer Role</span>
            </button>
          )}
          {detail.myRole === "officer" && (
            <button type="button" onClick={() => setEventOpen(true)} className={ui.primary}>
              <Calendar aria-hidden="true" className="h-5 w-5" />
              <span>Publish Club Event</span>
            </button>
          )}
        </div>
      </section>

      <Dialog open={eventOpen} onClose={() => setEventOpen(false)} title="Publish a Club Event" testId="club-event-dialog">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setEventError(null);
            const start = Date.now() + 2 * 3600_000;
            try {
              await createEvent({
                title: evTitle,
                description: `Hosted by ${club.name}`,
                campus: club.campus,
                isVirtual: false,
                locationName: evLoc || `${club.campus} Student Center`,
                startTime: start,
                endTime: start + 2 * 3600_000,
                clubId: club._id,
              });
              setEvTitle("");
              setEvLoc("");
              setEventOpen(false);
              toast({ tone: "success", message: "Club Event published" });
            } catch (err) {
              setEventError(errorMessage(err, "Could not publish the event."));
            }
          }}
          className="space-y-[var(--sp-3)]"
        >
          <div>
            <label htmlFor={`${id}-evtitle`} className={ui.label}>Event title</label>
            <input id={`${id}-evtitle`} type="text" required value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className={ui.input} />
          </div>
          <div>
            <label htmlFor={`${id}-evloc`} className={ui.label}>Building &amp; room</label>
            <input id={`${id}-evloc`} type="text" required value={evLoc} onChange={(e) => setEvLoc(e.target.value)} className={ui.input} />
          </div>
          {eventError && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{eventError}</p>}
          <div className={`${ui.row} justify-end`}>
            <button type="button" onClick={() => setEventOpen(false)} className={ui.secondary}>Cancel</button>
            <button type="submit" className={ui.strong}>Publish Club Event</button>
          </div>
        </form>
      </Dialog>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!postBody.trim()) return;
          try {
            await createPost({ body: postBody, clubId: club._id, crossPostToCampusFeed: true });
            setPostBody("");
            toast({ tone: "success", message: "Posted to the Club" });
          } catch (err) {
            toast({ tone: "error", message: "Couldn’t post", detail: errorMessage(err, "") });
          }
        }}
        className={`${ui.card} space-y-[var(--sp-2)]`}
      >
        <label htmlFor={`${id}-post`} className={ui.label}>Post an announcement</label>
        <p id={`${id}-post-help`} className={ui.muted}>Also shows in the All KSU Feed.</p>
        <div className="flex min-w-0 flex-wrap items-end gap-[var(--sp-2)]">
          <input
            id={`${id}-post`}
            aria-describedby={`${id}-post-help`}
            type="text"
            value={postBody}
            onChange={(e) => setPostBody(e.target.value)}
            className={`${ui.input} mt-0 flex-1 basis-48`}
          />
          <button type="submit" disabled={!postBody.trim()} className={ui.strong}>
            <Send aria-hidden="true" className="h-5 w-5" />
            <span>Post</span>
          </button>
        </div>
      </form>

      {detail.events.length > 0 && (
        <section aria-labelledby={`${id}-events`} className="space-y-[var(--sp-2)]">
          <h2 id={`${id}-events`} className={ui.h2}>Upcoming Club Events</h2>
          <ul className="space-y-[var(--sp-2)]">
            {detail.events.map((ev: { _id: string; title: string; locationName: string }) => (
              <li key={String(ev._id)}>
                <Link href={`/events/${ev._id}`} className={`${ui.card} block min-h-[var(--target)] hover:bg-[var(--surface-2)]`}>
                  <span className="block font-bold">{ev.title}</span>
                  <span className="block text-sm text-[var(--muted)]">{ev.locationName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
