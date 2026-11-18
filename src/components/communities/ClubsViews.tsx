"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Award,
  Calendar,
  Check,
  MessageSquare,
  Plus,
  Search,
  Send,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";

export function ClubsDirectoryView() {
  const [queryText, setQueryText] = useState("");
  const [kindFilter, setKindFilter] = useState<
    "" | "registered_ksu" | "campus_department" | "community"
  >("");
  const [createOpen, setCreateOpen] = useState(false);
  const [browseCampus, setBrowseCampus] = useState<"All KSU" | "Kennesaw" | "Marietta">("All KSU");
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
  const createCommunityClub = useViewerMutation(
    api.communities.createCommunityClub
  );

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createCommunityClub({
        name,
        campus,
        summary: summaryText,
        description: description || summaryText,
      });
      setName("");
      setSummaryText("");
      setDescription("");
      setCreateOpen(false);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not create Club.");
    }
  };

  return (
    <div data-testid="clubs-directory-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              KSU Clubs &amp; Campus Departments
            </h1>
            <p className="text-xs text-[#5E6675]">
              <a href="https://owllife.kennesaw.edu/" target="_blank" rel="noopener noreferrer" className="font-bold text-[#1E3A8A] underline">
                Open the official Owl Life directory
              </a>{" · "}
              <Link href="/events" className="font-bold text-[#1E3A8A] underline">
                Browse Events Calendar →
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#FDBB30] px-3 py-2 text-xs font-extrabold text-[#111317]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Community Club</span>
          </button>
        </div>

        {coverage && (
          <p role="status" className="mt-2 text-sm text-[#5E6675]">
            {coverage === "demo" ? "Judge Demo Mode shows sample Clubs."
              : coverage === "partial" ? "KSUX covers part of the official Club directory for the selected Campus."
              : "Institutional Club data is unavailable for the selected Campus. You can still browse Community Clubs."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2">
            <Search className="h-4 w-4 text-[#5E6675]" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              aria-label="Search Clubs"
              placeholder="Search Clubs by name or topic"
              className="w-full bg-transparent text-xs font-semibold text-[#111317] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter Clubs by Campus"
            value={browseCampus}
            onChange={(event) => {
              const selected = event.currentTarget.value;
              setBrowseCampus(selected === "Kennesaw" || selected === "Marietta" ? selected : "All KSU");
            }}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2 text-xs font-bold text-[#111317]"
          >
            <option value="All KSU">All KSU</option>
            <option value="Kennesaw">Kennesaw</option>
            <option value="Marietta">Marietta</option>
          </select>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as any)}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2 text-xs font-bold text-[#111317]"
          >
            <option value="">All Types</option>
            <option value="registered_ksu">Registered KSU Club</option>
            <option value="campus_department">Campus Department</option>
            <option value="community">Community Club</option>
          </select>
        </div>

        {createOpen && (
          <form
            onSubmit={handleCreateClub}
            className="mt-3 space-y-2.5 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-3.5"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Club Name (e.g. Marietta Trail Runners)"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold sm:col-span-2"
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
            <input
              type="text"
              required
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="Short summary..."
              className="w-full rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs"
            />
            {error && (
              <p className="text-xs font-semibold text-[#B91C1C]">{error}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-4 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Create Community Club
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {clubs?.length === 0 && <p className="text-sm text-[#5E6675]">No Clubs match these filters.</p>}
        {(clubs ?? []).map((club) => (
          <div
            key={String(club._id)}
            className="flex flex-col justify-between gap-2.5 rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-[10px] font-extrabold text-[#855A00]">
                  {club.campus} ·{" "}
                  {club.clubKind === "campus_department"
                    ? "Department"
                    : club.clubKind === "community"
                      ? "Community Club"
                      : "Registered KSU Club"}
                </span>
                <span className="text-[11px] font-bold text-[#5E6675]">
                  {club.memberCount} Owls
                </span>
              </div>
              <Link
                href={`/clubs/${club.slug}`}
                className="mt-1.5 block text-sm font-black text-[#111317] hover:underline"
              >
                {club.name}{club.isFixture ? " · Demo" : ""}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs text-[#5E6675]">
                {club.summary}
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Link
                href={`/clubs/${club.slug}`}
                className="text-xs font-bold text-[#1E3A8A] hover:underline"
              >
                View Club &amp; Events →
              </Link>
              <button
                type="button"
                onClick={() => void toggleJoin({ clubId: club._id })}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                  club.myRole
                    ? "border border-[#111317] bg-white text-[#111317]"
                    : "bg-[#111317] text-[#FDBB30]"
                }`}
              >
                {club.myRole ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>
                      {club.myRole === "officer" ? "Officer" : "Joined"}
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="h-3.5 w-3.5" />
                    <span>Join Club</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClubProfileView({ slug }: { slug: string }) {
  const detail = useViewerQuery(api.communities.getClubBySlug, { slug });
  const toggleJoin = useViewerMutation(api.communities.toggleJoinClub);
  const claimOfficer = useViewerMutation(api.communities.claimClubOfficerRole);
  const createPost = useViewerMutation(api.feed.createPost);
  const createEvent = useViewerMutation(api.communities.createNativeEvent);

  const [postBody, setPostBody] = useState("");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState("");
  const [evLoc, setEvLoc] = useState("");

  if (detail === undefined) {
    return (
      <div className="p-4 text-xs font-semibold text-[#5E6675]">
        Loading Club profile...
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-sm font-bold">
          Club not found.
        </div>
      </div>
    );
  }

  const { club } = detail;

  const handleClaimOfficer = async () => {
    const res = await claimOfficer({ clubId: club._id });
    setClaimMsg(
      res.status === "auto_approved"
        ? "Officer role auto-approved via matching .edu Engage contact email!"
        : "Officer claim submitted to the Moderation Queue for verification."
    );
  };

  return (
    <div data-testid="club-profile-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-[11px] font-extrabold text-[#855A00]">
              {club.campus} Campus
            </span>
            <h1 className="mt-1.5 text-xl font-black text-[#111317]">
              {club.name}{club.isFixture ? " · Demo" : ""}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[#5E6675]">
              {club.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {detail.groupChatId && (
              <Link
                href={`/chats/${detail.groupChatId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-2 text-xs font-extrabold text-[#FDBB30]"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Club Group Chat</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => void toggleJoin({ clubId: club._id })}
              className="rounded-xl bg-[#FDBB30] px-3.5 py-2 text-xs font-extrabold text-[#111317]"
            >
              {detail.myRole ? `Joined (${detail.myRole})` : "Join Club"}
            </button>

            {detail.myRole !== "officer" && (
              <button
                type="button"
                onClick={handleClaimOfficer}
                className="inline-flex items-center gap-1 rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-bold text-[#111317]"
              >
                <Award className="h-3.5 w-3.5 text-[#D99B00]" />
                <span>Claim Officer Role</span>
              </button>
            )}
          </div>
        </div>

        {claimMsg && (
          <p className="mt-3 rounded-xl bg-[#DCFCE7] px-3 py-2 text-xs font-bold text-[#15803D]">
            {claimMsg}
          </p>
        )}

        {detail.myRole === "officer" && (
          <div className="mt-3 border-t border-[#E4E7EE] pt-3">
            <button
              type="button"
              onClick={() => setEventOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-1.5 text-xs font-extrabold text-[#FDBB30]"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>+ Publish Official Club Event</span>
            </button>

            {eventOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const start = Date.now() + 2 * 3600_000;
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
                }}
                className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                <input
                  type="text"
                  required
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Club Event Title"
                  className="rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-semibold"
                />
                <input
                  type="text"
                  required
                  value={evLoc}
                  onChange={(e) => setEvLoc(e.target.value)}
                  placeholder="Building & Room"
                  className="rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-semibold"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#FDBB30] px-3 py-2 text-xs font-extrabold text-[#111317]"
                >
                  Publish Club Event
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Club Posts Composer */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!postBody.trim()) return;
          await createPost({
            body: postBody,
            clubId: club._id,
            crossPostToCampusFeed: true,
          });
          setPostBody("");
        }}
        className="flex gap-2 rounded-2xl border border-[#E4E7EE] bg-white p-3"
      >
        <input
          type="text"
          value={postBody}
          onChange={(e) => setPostBody(e.target.value)}
          placeholder={`Post an announcement in ${club.name} (cross-posts to Campus Feed by default)...`}
          className="flex-1 rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs"
        />
        <button
          type="submit"
          disabled={!postBody.trim()}
          className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3.5 py-2 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span>Post</span>
        </button>
      </form>

      {/* Upcoming Club Events */}
      {detail.events.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Upcoming Club Events
          </h2>
          {detail.events.map((ev: any) => (
            <Link
              key={String(ev._id)}
              href={`/events/${ev._id}`}
              className="block rounded-2xl border border-[#E4E7EE] bg-white p-3.5 text-xs hover:border-[#D99B00]"
            >
              <div className="font-extrabold text-[#111317]">{ev.title}</div>
              <div className="text-[#5E6675]">{ev.locationName}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
