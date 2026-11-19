"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { BookOpen, CheckCircle2, ExternalLink, GraduationCap, MessageSquare, Send } from "lucide-react";
import { PrivateScheduleEditor } from "./PrivateScheduleEditor";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";
import { NewTab, StateChip, errorMessage, toggleClass, ui } from "@/components/communities/campusLifeUi";

type Tab = "stream" | "syllabus" | "search";

export function CourseHubView({ subjectCourse }: { subjectCourse: string }) {
  const id = useId();
  const { toast } = useAnnouncer();
  const { auth, authArgs } = useViewerClient();
  const studentScope =
    auth.status === "demo" ? auth.demoShortCode + ":" + auth.demoPersonaHandle : auth.status === "student" ? auth.studentId : auth.status;
  const [selectedTerm, setSelectedTerm] = useState<string>();
  const banner = useViewerQuery(api.courses.listBannerTerms, {});
  const termCode = selectedTerm ?? banner?.activeTerm;
  const [activeTab, setActiveTab] = useState<Tab>("stream");
  const [sectionFilter, setSectionFilter] = useState<"all" | "mine">("all");
  const [searchInput, setSearchInput] = useState("");
  const [postBody, setPostBody] = useState("");
  const [crossPost, setCrossPost] = useState(false);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  const detail = useViewerQuery(api.courses.getCourseHubDetail, termCode ? { subjectCourse, termCode, sectionFilter } : "skip");
  const searchResults = useViewerQuery(
    api.courses.searchCatalog,
    activeTab === "search" && termCode ? { termCode, queryText: searchInput } : "skip"
  );
  const syllabus = useViewerQuery(
    api.courses.getCourseSyllabus,
    activeTab === "syllabus" && termCode ? { subjectCourse, termCode, crn: detail?.myEnrollment?.crn } : "skip"
  );

  const enrollMutation = useViewerMutation(api.courses.enrollInCourseHub);
  const leaveMutation = useViewerMutation(api.courses.leaveCourseHub);
  const createPost = useViewerMutation(api.feed.createPost);
  const fetchSyllabusAction = useAction(api.courses.fetchAndCacheSyllabus);
  const touchSyllabus = useViewerMutation(api.courses.touchCourseSyllabus);
  const openedCacheEntry = syllabus?.cacheHit ? syllabus.cacheEntryId : undefined;

  useEffect(() => {
    if (openedCacheEntry) void touchSyllabus({ cacheEntryId: openedCacheEntry }).catch(() => {});
  }, [openedCacheEntry, touchSyllabus]);

  const fail = (what: string) => (err: unknown) => toast({ tone: "error", message: what, detail: errorMessage(err, "") });

  const handlePostInHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.hub || !postBody.trim()) return;
    try {
      await createPost({ body: postBody, courseHubId: detail.hub._id, crossPostToCampusFeed: crossPost });
      setPostBody("");
      toast({ tone: "success", message: "Posted in the Course Hub" });
    } catch (err) {
      fail("Couldn’t post")(err);
    }
  };

  const triggerLazySyllabusFetch = async () => {
    if (!authArgs) return;
    setLoadingSyllabus(true);
    try {
      await fetchSyllabusAction({ ...authArgs, subjectCourse, termCode, crn: detail?.myEnrollment?.crn });
    } catch (err) {
      fail("Couldn’t load the syllabus")(err);
    } finally {
      setLoadingSyllabus(false);
    }
  };

  return (
    <div data-testid="course-hub-view" className={ui.page}>
      <section className={`${ui.card} space-y-[var(--sp-3)]`}>
        <div className={ui.row}>
          <span className="inline-flex items-center gap-[var(--sp-1)] rounded-full bg-[var(--ink)] px-[var(--sp-2)] text-sm font-bold text-[var(--bg)]">
            <GraduationCap aria-hidden="true" className="h-4 w-4" />
            {detail?.hub.subjectCourse ?? subjectCourse}
          </span>
          <span className="text-sm text-[var(--muted)]">Course Hubs are KSU-wide</span>
        </div>
        <h1 data-route-heading="" tabIndex={-1} className={ui.h1}>
          {detail?.hub.title ?? `${subjectCourse} Course Hub`}
        </h1>
        <div className="max-w-md">
          <label htmlFor={`${id}-term`} className={ui.label}>Banner term</label>
          <select
            id={`${id}-term`}
            value={termCode ?? ""}
            disabled={!banner}
            onChange={(e) => setSelectedTerm(e.currentTarget.value)}
            className={ui.input}
          >
            {!banner && <option value="">Loading terms…</option>}
            {banner?.terms.map((term) => (
              <option key={term.code} value={term.code}>
                {term.label} ({term.code})
              </option>
            ))}
          </select>
        </div>
        {banner?.terms
          .filter(({ code }) => code === termCode)
          .map((term) => (
            <p key={term.code} className={ui.muted}>
              Banner subset · {term.sections} sections
              {term.lastSuccessAt &&
                " · Refreshed " + new Date(term.lastSuccessAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
            </p>
          ))}
        {detail?.myEnrollment && (
          <p>
            <StateChip tone="ok" glyph="✓">
              Enrolled · private CRN {detail.myEnrollment.crn ?? "saved"}
              {detail.myEnrollment.section ? ` · Section ${detail.myEnrollment.section.sectionNumber}` : ""}
            </StateChip>
          </p>
        )}
        {detail?.groupChatId && (
          <Link href={`/chats/${detail.groupChatId}`} className={ui.strong}>
            <MessageSquare aria-hidden="true" className="h-5 w-5" />
            <span>Course Group Chat</span>
          </Link>
        )}

        {termCode && <PrivateScheduleEditor key={studentScope + ":" + termCode} termCode={termCode} />}

        {detail && (
          <section aria-labelledby={`${id}-sections`} className="space-y-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]">
            <h2 id={`${id}-sections`} className={ui.h2}>Sections</h2>
            <p className={ui.muted}>Pick your section to join this Hub. Your CRN stays private.</p>
            <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
              {detail.sections.map((sec) => {
                const isMine = detail.myEnrollment?.section?._id === sec._id;
                return (
                  <li key={String(sec._id)} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={isMine}
                      onClick={() => void enrollMutation({ termCode, sectionId: sec._id }).catch(fail("Couldn’t join this section"))}
                      className={`${toggleClass(isMine)} w-full flex-col items-start justify-center py-[var(--sp-2)] text-left`}
                    >
                      <span className="flex flex-wrap items-center gap-[var(--sp-2)]">
                        {isMine && <span aria-hidden="true">✓</span>}
                        Section {sec.sectionNumber} · CRN {sec.crn}
                      </span>
                      <span className="font-normal">{sec.instructorName}</span>
                    </button>
                    <span className="mt-[var(--sp-1)] inline-block">
                      <CampusBadge campus={sec.campus} />
                    </span>
                  </li>
                );
              })}
            </ul>
            {detail.isEnrolled && (
              <button
                type="button"
                onClick={() => void leaveMutation({ courseHubId: detail.hub._id }).catch(fail("Couldn’t leave the Hub"))}
                className={ui.danger}
              >
                Leave Hub
              </button>
            )}
          </section>
        )}

        <div className="border-t border-[var(--line)] pt-[var(--sp-3)]">
          <SegmentedControl
            label="Course Hub view"
            options={[
              { value: "stream", label: "Hub Activity" },
              { value: "syllabus", label: "Syllabus" },
              { value: "search", label: "Find a course" },
            ] as const}
            value={activeTab}
            onChange={setActiveTab}
            testIdPrefix="course-tab"
          />
        </div>
      </section>

      {activeTab === "stream" && detail && (
        <section aria-labelledby={`${id}-activity`} className="space-y-[var(--sp-3)]">
          <h2 id={`${id}-activity`} className={ui.h2}>Hub Activity</h2>
          <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-[minmax(0,1fr)_auto]">
            <SegmentedControl
              label="Show posts from"
              hideLabel={false}
              options={[{ value: "all", label: "All sections" }, { value: "mine", label: "My section" }] as const}
              value={sectionFilter}
              onChange={setSectionFilter}
              testIdPrefix="course-section-filter"
            />
            <Link href="/study?host=1" className={ui.secondary}>
              Host a Study Session
            </Link>
          </div>

          <form onSubmit={handlePostInHub} className={`${ui.card} space-y-[var(--sp-2)]`}>
            <label htmlFor={`${id}-post`} className={ui.label}>Ask a question in {detail.hub.subjectCourse}</label>
            <textarea
              id={`${id}-post`}
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              rows={3}
              maxLength={500}
              className={`${ui.input} py-[var(--sp-2)]`}
            />
            <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
              <label className={ui.checkRow}>
                <input
                  type="checkbox"
                  checked={crossPost}
                  onChange={(e) => setCrossPost(e.target.checked)}
                  className={ui.checkbox}
                  data-target-exempt=""
                />
                <span className="min-w-0">Also post to the All KSU Feed</span>
              </label>
              <button type="submit" disabled={!postBody.trim()} className={ui.strong}>
                <Send aria-hidden="true" className="h-5 w-5" />
                <span>Post in Hub</span>
              </button>
            </div>
          </form>

          {detail.studySessions.length > 0 && (
            <section aria-labelledby={`${id}-ss`} className={`${ui.card} space-y-[var(--sp-2)]`}>
              <h3 id={`${id}-ss`} className={ui.h3}>Active Course Study Sessions</h3>
              <ul className="space-y-[var(--sp-2)]">
                {detail.studySessions.map((ss: { _id: string; title: string; attendeeIds: unknown[]; maxSeats: number; visibility: string }) => (
                  <li key={String(ss._id)}>
                    <Link href="/study" className={`${ui.subCard} flex min-h-[var(--target)] flex-wrap items-center justify-between gap-[var(--sp-2)]`}>
                      <span className="font-bold">{ss.title}</span>
                      <span className="text-sm">
                        {ss.attendeeIds.length} of {ss.maxSeats} seats ·{" "}
                        {ss.visibility === "course_members_only" ? "Course members only" : "Anyone on Campus"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="space-y-[var(--sp-2)]">
            {detail.posts.map((p: { _id: string; body: string; author: { displayName: string; handle: string } }) => (
              <li key={String(p._id)} className={ui.card}>
                <p className="font-bold">
                  {p.author.displayName} <span className="font-normal text-[var(--muted)]">@{p.author.handle}</span>
                </p>
                <p className="mt-[var(--sp-1)] text-body">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab === "syllabus" && (
        <section aria-labelledby={`${id}-syl`} className={`${ui.card} space-y-[var(--sp-3)]`}>
          <h2 id={`${id}-syl`} className={ui.h2}>Syllabus summary</h2>
          <p className={ui.muted}>{syllabus?.matchedSectionLabel ?? "Checking the syllabus cache…"}</p>
          {syllabus?.sourceUrl && (
            <a href={syllabus.sourceUrl} target="_blank" rel="noreferrer" className={ui.secondary}>
              <span>Open on Simple Syllabus</span>
              <ExternalLink aria-hidden="true" className="h-5 w-5" />
              <NewTab />
            </a>
          )}
          {syllabus?.isFallbackSection && (
            <p>
              <StateChip tone="warn" glyph="⚠">From another section: {syllabus.matchedSectionLabel}</StateChip>
            </p>
          )}
          {syllabus?.summary ? (
            <div className="space-y-[var(--sp-3)] text-sm">
              <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
                <div className={ui.subCard}>
                  <h3 className="text-body font-bold">Instructor &amp; office hours</h3>
                  <p className="mt-[var(--sp-1)]">
                    {syllabus.summary.instructor} · {syllabus.summary.officeHours}
                  </p>
                </div>
                <div className={ui.subCard}>
                  <h3 className="text-body font-bold">Textbooks</h3>
                  <ul className="mt-[var(--sp-1)] list-disc pl-[var(--sp-4)]">
                    {(syllabus.summary.textbooks ?? []).map((tb: string, i: number) => (
                      <li key={i}>{tb}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className={ui.subCard}>
                <h3 className="text-body font-bold">Grading weights</h3>
                <ul className="mt-[var(--sp-1)] flex flex-wrap gap-[var(--sp-2)]">
                  {(syllabus.summary.gradingWeights ?? []).map((gw: { label: string; weight: string | number }, idx: number) => (
                    <li key={idx} className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] px-[var(--sp-2)] font-bold">
                      {gw.label}: {gw.weight}
                    </li>
                  ))}
                </ul>
              </div>
              {syllabus.summary.policies && <p className="text-[var(--muted)]">{syllabus.summary.policies}</p>}
            </div>
          ) : (
            <button type="button" disabled={loadingSyllabus} onClick={() => void triggerLazySyllabusFetch()} className={ui.strong}>
              <BookOpen aria-hidden="true" className="h-5 w-5" />
              <span>{loadingSyllabus ? "Loading from Simple Syllabus…" : "Load syllabus summary"}</span>
            </button>
          )}
        </section>
      )}

      {activeTab === "search" && (
        <section aria-labelledby={`${id}-find`} className={`${ui.card} space-y-[var(--sp-3)]`}>
          <h2 id={`${id}-find`} className={ui.h2}>Find a course</h2>
          <div>
            <label htmlFor={`${id}-q`} className={ui.label}>CRN or course code</label>
            <input
              id={`${id}-q`}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="e.g. 83190 or CS 3305"
              className={ui.input}
            />
          </div>
          <ul className="space-y-[var(--sp-2)]">
            {(searchResults ?? []).map(
              (item) => (
                <li key={String(item._id)} className={`${ui.subCard} flex flex-wrap items-center justify-between gap-[var(--sp-2)]`}>
                  <div className="min-w-0">
                    <Link href={`/courses/${encodeURIComponent(item.subjectCourse)}`} className={ui.link}>
                      {item.subjectCourse} · {item.title}
                    </Link>
                    <p className="text-sm text-[var(--muted)]">
                      {item.matchedCrnSection
                        ? `${item.matchedCrnSection.isFixture ? "Sample" : "Matched"} CRN ${item.matchedCrnSection.crn} · ${item.matchedCrnSection.campus}`
                        : `${item.sections.length} ${item.sections.some((section: { isFixture?: boolean }) => section.isFixture) ? "sample" : "published"} sections in ${termCode}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void enrollMutation({
                        termCode,
                        courseHubId: item._id,
                        sectionId: item.matchedCrnSection?._id,
                      })
                        .then(() => toast({ tone: "success", message: `Joined ${item.subjectCourse}` }))
                        .catch(fail("Couldn’t join the Hub"))
                    }
                    className={ui.primary}
                  >
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    <span>
                      Join Hub<span className="sr-only"> {item.subjectCourse}</span>
                    </span>
                  </button>
                </li>
              )
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
