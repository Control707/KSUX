"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  MessageSquare,
  Search,
  Send,
} from "lucide-react";
import { PrivateScheduleEditor } from "./PrivateScheduleEditor";
import { api } from "@convex/_generated/api";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";

export function CourseHubView({ subjectCourse }: { subjectCourse: string }) {
  const { auth, authArgs } = useViewerClient();
  const studentScope = auth.status === "demo" ? auth.demoShortCode + ":" + auth.demoPersonaHandle
    : auth.status === "student" ? auth.studentId : auth.status;
  const [termCode, setTermCode] = useState<"202608" | "202701">("202608");
  const [activeTab, setActiveTab] = useState<"stream" | "syllabus" | "search">(
    "stream"
  );
  const [sectionFilter, setSectionFilter] = useState<"all" | "mine">("all");
  const [searchInput, setSearchInput] = useState("");
  const [postBody, setPostBody] = useState("");
  const [crossPost, setCrossPost] = useState(false);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  const detail = useViewerQuery(api.courses.getCourseHubDetail, {
    subjectCourse,
    termCode,
    sectionFilter,
  });

  const searchResults = useViewerQuery(
    api.courses.searchCatalog,
    activeTab === "search" ? { termCode, queryText: searchInput } : "skip"
  );

  const syllabus = useViewerQuery(
    api.courses.getCourseSyllabus,
    activeTab === "syllabus"
      ? {
          subjectCourse,
          termCode,
          crn: detail?.myEnrollment?.crn,
        }
      : "skip"
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

  const handlePostInHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail?.hub || !postBody.trim()) return;
    await createPost({
      body: postBody,
      courseHubId: detail.hub._id,
      crossPostToCampusFeed: crossPost,
    });
    setPostBody("");
  };

  const triggerLazySyllabusFetch = async () => {
    if (!authArgs) return;
    setLoadingSyllabus(true);
    try {
      await fetchSyllabusAction({
        ...authArgs,
        subjectCourse,
        termCode,
        crn: detail?.myEnrollment?.crn,
      });
    } finally {
      setLoadingSyllabus(false);
    }
  };

  return (
    <div data-testid="course-hub-view" className="space-y-4 p-4">
      {/* Header & Term Selector */}
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#111317] px-2.5 py-0.5 text-xs font-extrabold text-[#FDBB30]">
                <GraduationCap className="h-3.5 w-3.5" />
                {detail?.hub.subjectCourse ?? subjectCourse}
              </span>
              <select
                value={termCode}
                onChange={(e) =>
                  setTermCode(e.target.value as "202608" | "202701")
                }
                className="rounded-lg border border-[#E4E7EE] bg-[#F4F6FA] px-2.5 py-1 text-xs font-bold text-[#111317]"
              >
                <option value="202608">Fall 2026 (202608)</option>
                <option value="202701">Spring 2027 (202701)</option>
              </select>
            </div>
            <h1 className="mt-1.5 text-lg font-black text-[#111317]">
              {detail?.hub.title ?? "KSU Course Hub"}
            </h1>
            {detail?.myEnrollment && (
              <p className="mt-0.5 text-xs font-semibold text-[#15803D]">
                ✓ Enrolled (Private CRN {detail.myEnrollment.crn ?? "Bound"}
                {detail.myEnrollment.section
                  ? ` · Section ${detail.myEnrollment.section.sectionNumber} · ${detail.myEnrollment.section.campus}`
                  : ""}
                )
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {detail?.groupChatId && (
              <Link
                href={`/chats/${detail.groupChatId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-2 text-xs font-extrabold text-[#FDBB30]"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Course Group Chat</span>
              </Link>
            )}

          </div>
        </div>

        <PrivateScheduleEditor key={studentScope + ":" + termCode} termCode={termCode} />

        {/* Section Picker / Enrollment Controls */}
        {detail && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#E4E7EE] pt-3">
            {detail.sections.map((sec) => {
              const isMine = detail.myEnrollment?.section?._id === sec._id;
              return (
                <button
                  key={String(sec._id)}
                  type="button"
                  onClick={() =>
                    void enrollMutation({
                      termCode,
                      sectionId: sec._id,
                    })
                  }
                  className={`rounded-xl border px-3 py-1.5 text-left text-xs transition ${
                    isMine
                      ? "border-[#111317] bg-[#111317] font-extrabold text-[#FDBB30]"
                      : "border-[#E4E7EE] bg-[#F9FAFC] font-semibold text-[#111317] hover:border-[#D99B00]"
                  }`}
                >
                  <div>
                    Sec {sec.sectionNumber} · CRN {sec.crn} ({sec.campus})
                  </div>
                  <div className="text-[10.5px] opacity-80">
                    {sec.instructorName}
                  </div>
                </button>
              );
            })}
            {detail.isEnrolled && (
              <button
                type="button"
                onClick={() =>
                  void leaveMutation({ courseHubId: detail.hub._id })
                }
                className="rounded-xl border border-[#E4E7EE] px-2.5 py-1.5 text-xs font-bold text-[#B91C1C]"
              >
                Leave Hub
              </button>
            )}
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="mt-3 flex gap-1.5 border-t border-[#E4E7EE] pt-3">
          {(
            [
              ["stream", "Hub Activity"],
              ["syllabus", "Simple Syllabus"],
              ["search", "Search All Courses / CRN"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                activeTab === tab
                  ? "bg-[#111317] text-[#FDBB30]"
                  : "bg-[#F4F6FA] text-[#5E6675]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Hub Stream + All Sections | My Section Filter */}
      {activeTab === "stream" && detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-xl border border-[#E4E7EE] bg-white p-1">
              {(["all", "mine"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSectionFilter(f)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${
                    sectionFilter === f
                      ? "bg-[#111317] text-[#FDBB30]"
                      : "text-[#5E6675]"
                  }`}
                >
                  {f === "all" ? "All Sections" : "My Section"}
                </button>
              ))}
            </div>

            <Link
              href="/study?host=1"
              className="text-xs font-extrabold text-[#1E3A8A] hover:underline"
            >
              + Host Course Study Session →
            </Link>
          </div>

          <form
            onSubmit={handlePostInHub}
            className="space-y-2 rounded-2xl border border-[#E4E7EE] bg-white p-3.5"
          >
            <textarea
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={`Ask a question in ${detail.hub.subjectCourse} (stays in this Hub & Following unless cross-posted)...`}
              className="w-full rounded-xl border border-[#E4E7EE] p-2.5 text-xs focus:border-[#111317] focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5E6675]">
                <input
                  type="checkbox"
                  checked={crossPost}
                  onChange={(e) => setCrossPost(e.target.checked)}
                />
                <span>Cross-post to main Campus Feed</span>
              </label>
              <button
                type="submit"
                disabled={!postBody.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3.5 py-1.5 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Post in Hub</span>
              </button>
            </div>
          </form>

          {detail.studySessions.length > 0 && (
            <div className="rounded-2xl border border-[#FDBB30] bg-[#FFFDF7] p-3.5">
              <div className="text-xs font-extrabold text-[#111317]">
                📚 Active Course Study Sessions
              </div>
              <div className="mt-2 space-y-1.5">
                {detail.studySessions.map((ss: any) => (
                  <Link
                    key={String(ss._id)}
                    href="/study"
                    className="flex items-center justify-between rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-[#111317]">{ss.title}</span>
                    <span className="text-[11px] font-bold text-[#15803D]">
                      {ss.attendeeIds.length}/{ss.maxSeats} seats ·{" "}
                      {ss.visibility === "course_members_only"
                        ? "Course Members Only"
                        : "Campus-Open"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {detail.posts.map((p: any) => (
            <div
              key={String(p._id)}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 text-xs"
            >
              <div className="font-extrabold text-[#111317]">
                {p.author.displayName}{" "}
                <span className="font-normal text-[#5E6675]">
                  @{p.author.handle}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-[#1B1F27]">{p.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Lazy Simple Syllabus */}
      {activeTab === "syllabus" && (
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-[#111317]">
                Simple Syllabus Summary
              </h2>
              <p className="text-xs font-semibold text-[#5E6675]">
                {syllabus?.matchedSectionLabel ?? "Checking syllabus cache..."}
              </p>
            </div>
            {syllabus?.sourceUrl && (
              <a
                href={syllabus.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-[#E4E7EE] px-3 py-1.5 text-xs font-bold text-[#1E3A8A]"
              >
                <span>Official Simple Syllabus</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {syllabus?.isFallbackSection && (
            <div className="mt-3 rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs font-bold text-[#92400E]">
              Section Provenance: {syllabus.matchedSectionLabel}
            </div>
          )}

          {syllabus?.summary ? (
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#F9FAFC] p-3">
                  <div className="font-extrabold text-[#111317]">
                    Instructor &amp; Office Hours
                  </div>
                  <p className="mt-1 text-[#374151]">
                    {syllabus.summary.instructor} ·{" "}
                    {syllabus.summary.officeHours}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F9FAFC] p-3">
                  <div className="font-extrabold text-[#111317]">Textbooks</div>
                  <ul className="mt-1 list-disc pl-4 text-[#374151]">
                    {(syllabus.summary.textbooks ?? []).map(
                      (tb: string, i: number) => (
                        <li key={i}>{tb}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl bg-[#F9FAFC] p-3">
                <div className="font-extrabold text-[#111317]">
                  Grading Weights
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(syllabus.summary.gradingWeights ?? []).map(
                    (gw: any, idx: number) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-[#E4E7EE] bg-white px-2.5 py-1 font-bold text-[#111317]"
                      >
                        {gw.label}: {gw.weight}
                      </span>
                    )
                  )}
                </div>
              </div>

              {syllabus.summary.policies && (
                <p className="text-[#5E6675]">{syllabus.summary.policies}</p>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                disabled={loadingSyllabus}
                onClick={triggerLazySyllabusFetch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>
                  {loadingSyllabus
                    ? "Fetching from kennesaw.simplesyllabus.com..."
                    : "Load Simple Syllabus Summary"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Dual-Term Banner 9 CRN / Course Typeahead */}
      {activeTab === "search" && (
        <div className="space-y-3 rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2">
            <Search className="h-4 w-4 text-[#5E6675]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by 5-digit CRN (e.g. 83190) or course code (CS 3305, ME 3101)..."
              className="w-full bg-transparent text-xs font-semibold text-[#111317] focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            {(searchResults ?? []).map((item: any) => (
              <div
                key={String(item._id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E4E7EE] p-3 text-xs"
              >
                <div>
                  <Link
                    href={`/courses/${encodeURIComponent(item.subjectCourse)}`}
                    className="font-black text-[#111317] hover:underline"
                  >
                    {item.subjectCourse} · {item.title}
                  </Link>
                  <div className="text-[11px] text-[#5E6675]">
                    {item.matchedCrnSection
                      ? `${item.matchedCrnSection.isFixture ? "Sample" : "Matched"} CRN ${item.matchedCrnSection.crn} · ${item.matchedCrnSection.campus}`
                      : `${item.sections.length} ${item.sections.some((section: { isFixture?: boolean }) => section.isFixture) ? "sample" : "published"} sections in ${termCode}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void enrollMutation({
                      termCode,
                      courseHubId: item._id,
                      sectionId: item.matchedCrnSection?._id,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-1.5 font-extrabold text-[#111317]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Join Hub</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
