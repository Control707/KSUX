import bannerSeed from "../data/ksu-seed/banner-verified.json";
import courseFixtures from "../data/ksu-seed/courses.json";
import { activeBannerTerm, bannerCoursePattern, bannerCourseUrl, bannerSection, bannerSectionSignature, bannerTermKey, bannerTermKeyPrefix, bannerTermPattern, MAX_BANNER_SECTIONS, parseBannerCoursePage, termLabel, validateBannerSections } from "./lib/bannerCatalog";
import { computePayloadHash, evaluateFailureStatePatch, isSuddenDropOrEmpty } from "./lib/syncGuard";
import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  filterVisibleContent,
  viewerAuthArgs,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { hydratePostCards } from "./feed";
import { parseStatelessScheduleIcs, stripAnyTokenUrls } from "./lib/icsParser";
import { fetchSimpleSyllabusSummary } from "./lib/syllabusAdapter";
import { Doc, Id } from "./_generated/dataModel";
import { removeCommunityChatMember } from "./lib/campusChat";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SYLLABUS_LRU_CAP = 500;

function enrollmentTermFields(
  existing: Doc<"studentEnrollments">,
  termCode: string,
  section: Doc<"courseSections"> | null
) {
  const sameTerm = existing.termCode === termCode;
  return {
    termCode,
    sectionId: section?._id ?? (sameTerm ? existing.sectionId : undefined),
    crn: section?.crn ?? (sameTerm ? existing.crn : undefined),
    personalDeadlines: sameTerm ? existing.personalDeadlines : [],
  };
}

export function normalizeSubjectCourse(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const m = cleaned.match(/^([A-Z]{2,4})\s*[- ]?\s*(\d{4}[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return cleaned;
}

export async function ensureLazyCommunityGroupChat(
  ctx: MutationCtx,
  params: {
    workspaceKey: string;
    studentId: Id<"students">;
    parentType: "club" | "course_hub";
    parentId: string;
    title: string;
    role?: "admin" | "member";
    now: number;
  }
): Promise<Id<"chats">> {
  const chat = await ctx.db
    .query("chats")
    .withIndex("by_workspace_parent", (q) =>
      q
        .eq("workspaceKey", params.workspaceKey)
        .eq("parentType", params.parentType)
        .eq("parentId", params.parentId)
    )
    .unique();

  const chatKind =
    params.parentType === "club"
      ? ("club_group" as const)
      : ("course_group" as const);

  if (!chat) {
    const chatId = await ctx.db.insert("chats", {
      workspaceKey: params.workspaceKey,
      kind: chatKind,
      parentType: params.parentType,
      parentId: params.parentId,
      requestStatus: "active",
      title: params.title,
      memberCount: 1,
      messageSeq: 0,
      lastMessageAt: params.now,
    });
    await ctx.db.insert("chatMembers", {
      workspaceKey: params.workspaceKey,
      chatId,
      studentId: params.studentId,
      chatKind,
      role: params.role ?? "member",
      badgeMode: "dot",
      lastReadSeq: 0,
      lastReadAt: params.now,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: params.now,
      joinedAt: params.now,
    });
    return chatId;
  }

  const existingMember = await ctx.db
    .query("chatMembers")
    .withIndex("by_chat_student", (q) =>
      q
        .eq("workspaceKey", params.workspaceKey)
        .eq("chatId", chat!._id)
        .eq("studentId", params.studentId)
    )
    .unique();

  if (!existingMember) {
    await ctx.db.insert("chatMembers", {
      workspaceKey: params.workspaceKey,
      chatId: chat._id,
      studentId: params.studentId,
      chatKind,
      role: params.role ?? "member",
      badgeMode: "dot",
      lastReadSeq: chat.messageSeq,
      lastReadAt: params.now,
      hasUnread: false,
      isMuted: false,
      isArchived: false,
      lastChatMessageAt: chat.lastMessageAt,
      joinedAt: params.now,
    });
    await ctx.db.patch(chat._id, {
      memberCount: chat.memberCount + 1,
    });
  } else if (params.role && existingMember.role !== params.role) {
    await ctx.db.patch(existingMember._id, { role: params.role });
  }

  return chat._id;
}

const checkedInBannerTerms = [...new Set(bannerSeed.map(({ termCode }) => termCode))];

async function getBannerTerms(ctx: QueryCtx) {
  const syncRows = await ctx.db.query("feedSyncState").withIndex("by_source", (query) =>
    query.gte("sourceKey", bannerTermKeyPrefix).lt("sourceKey", bannerTermKeyPrefix + "\uffff")
  ).order("desc").take(12);
  const metadata = new Map(syncRows.filter((row) => row.lastSuccessAt !== undefined && row.lastPayloadHash)
    .map((row) => [row.sourceKey.slice(bannerTermKeyPrefix.length), row]));
  const codes = [...new Set([...checkedInBannerTerms, ...metadata.keys()])].sort().reverse();
  return {
    activeTerm: activeBannerTerm(codes) ?? checkedInBannerTerms[0]!,
    terms: codes.map((code) => ({
      code, label: termLabel(code),
      sections: metadata.get(code)?.activeRecordCount ?? bannerSeed.filter((row) => row.termCode === code).length,
      lastSuccessAt: metadata.get(code)?.lastSuccessAt ?? null,
    })),
  };
}

export const listBannerTerms = viewerQuery({ args: {}, handler: getBannerTerms });

export const applyBannerTerm = internalMutation({
  args: { termCode: v.string(), courses: v.array(v.string()), rows: v.array(bannerSection), leaseUntil: v.optional(v.number()) },
  handler: async (ctx, { termCode, courses, rows, leaseUntil }) => {
    if (!bannerTermPattern.test(termCode) || !courses.length || courses.length > 8
      || courses.some((course) => !bannerCoursePattern.test(course))) {
      throw new ConvexError("Invalid Banner refresh scope");
    }
    const sections = validateBannerSections(rows);
    const requested = new Set(courses);
    const covered = new Set(sections.map(({ subjectCourse }) => subjectCourse));
    if (covered.size !== requested.size || [...covered].some((course) => !requested.has(course))) {
      throw new ConvexError("Incomplete Banner course coverage. The catalog was retained.");
    }
    const hash = await computePayloadHash(sections);
    const now = Date.now();
    const sourceKey = bannerTermKey(termCode);
    const state = await ctx.db.query("feedSyncState").withIndex("by_source", (query) =>
      query.eq("sourceKey", sourceKey)).unique();

    if (leaseUntil !== undefined && (state?.refreshInFlightUntil !== leaseUntil || leaseUntil <= now)) {
      throw new ConvexError("Banner refresh lease expired. The catalog was retained.");
    }
    const bannerScope = [...requested].sort().join(",");
    if (state?.bannerScope === bannerScope && isSuddenDropOrEmpty(state.activeRecordCount, sections.length)) {
      throw new ConvexError("Unexpected drop in Banner coverage. The catalog was retained.");
    }

    let changedSections = 0;
    if (state?.lastPayloadHash !== hash) {
      for (const subjectCourse of [...covered]) {
        const entries = sections.filter((row) => row.subjectCourse === subjectCourse);
        const [subjectCode, number] = subjectCourse.split(" ");
        const hub = await ctx.db.query("courseHubs").withIndex("by_subject_course", (query) =>
          query.eq("subjectCourse", subjectCourse)).unique();
        const title = entries[0]!.title;
        const fields = {
          subjectCourse, subjectCode: subjectCode!, courseNumber: number!,
          title, searchText: [subjectCourse, subjectCode! + number!, title].join(" "),
          campuses: [...new Set([...(hub?.catalogSource && hub.catalogSource !== "fixture" ? hub.campuses : []), ...entries.map(({ campus }) => campus)])],
          activeTerms: [...new Set([...(hub?.catalogSource && hub.catalogSource !== "fixture" ? hub.activeTerms : []), termCode])].sort(),
          catalogSource: "banner_live" as const,
        };
        const hubId = hub?._id ?? await ctx.db.insert("courseHubs", { ...fields, prodEnrollmentCount: 0 });
        if (hub) {
          const fixture = courseFixtures.courseHubs.find((row) => row.subjectCourse === subjectCourse);
          const fixtureCount = fixture && (hub.catalogSource === "fixture" || !hub.catalogSource)
            && hub.searchText === fixture.searchText ? fixture.prodEnrollmentCount : 0;
          await ctx.db.patch(hubId, { ...fields, isRetiredFixture: undefined,
            prodEnrollmentCount: Math.max(0, hub.prodEnrollmentCount - fixtureCount) });
        }
        // Promoting a fixture Hub must not bless its other, unverified sections.
        // Keep IDs for existing schedules, but remove these rows from discovery.
        if (hub?.catalogSource === "fixture" || hub?.isRetiredFixture) {
          const fixtureSections = await ctx.db.query("courseSections")
            .withIndex("by_hub_term", (query) => query.eq("courseHubId", hubId)).take(301);
          if (fixtureSections.length > 300) throw new ConvexError("Fixture cleanup exceeds the bounded Banner scope.");
          for (const fixture of fixtureSections) {
            if (fixture.isFixture && !fixture.bannerRefreshed && !fixture.isRetiredFixture) {
              await ctx.db.patch(fixture._id, { isRetiredFixture: true });
            }
          }
        }
        for (const { subjectCourse: _course, title: _title, ...section } of entries) {
          const existing = await ctx.db.query("courseSections").withIndex("by_term_crn", (query) =>
            query.eq("termCode", termCode).eq("crn", section.crn)).unique();
          if (existing && !existing.isFixture && !existing.isRetiredFixture && existing.courseHubId !== hubId) {
            throw new ConvexError("Banner CRN belongs to another Course Hub. The catalog was retained.");
          }
          const fields = { ...section, termCode, courseHubId: hubId, bannerRefreshed: true };
          if (!existing) {
            await ctx.db.insert("courseSections", fields);
            changedSections++;
          } else if (existing.isFixture || existing.isRetiredFixture || !existing.bannerRefreshed
            || existing.courseHubId !== hubId || bannerSectionSignature(section) !== bannerSectionSignature(existing)) {
            await ctx.db.patch(existing._id, { ...fields, isFixture: undefined, isRetiredFixture: undefined });
            changedSections++;
          }
        }
      }
    }
    const metadata = { bannerScope, lastSuccessAt: now, lastAttemptAt: now, lastOutcome: "accepted" as const,
      lastAcceptedCount: sections.length, consecutiveFailures: 0, activeRecordCount: sections.length, lastPayloadHash: hash,
      backoffUntil: undefined, refreshInFlightUntil: undefined, lastError: undefined };
    if (state) await ctx.db.patch(state._id, metadata);
    else await ctx.db.insert("feedSyncState", { sourceKey, ...metadata });
    return { termCode, sections: sections.length, changedSections };
  },
});

export const beginBannerRefresh = internalMutation({
  args: { termCode: v.string() },
  handler: async (ctx, { termCode }) => {
    const now = Date.now();
    const sourceKey = bannerTermKey(termCode);
    const state = await ctx.db.query("feedSyncState").withIndex("by_source", (q) => q.eq("sourceKey", sourceKey)).unique();
    if (state?.backoffUntil && state.backoffUntil > now) throw new ConvexError("Banner refresh is in backoff. Try again later.");
    if (state?.refreshInFlightUntil && state.refreshInFlightUntil > now) throw new ConvexError("A Banner refresh is already in progress.");
    // Eight requests with an 8s timeout and seven pacing delays fit in two minutes.
    const leaseUntil = now + 120_000;
    if (state) await ctx.db.patch(state._id, { lastAttemptAt: now, refreshInFlightUntil: leaseUntil });
    else await ctx.db.insert("feedSyncState", { sourceKey, lastAttemptAt: now,
      refreshInFlightUntil: leaseUntil, consecutiveFailures: 0, activeRecordCount: 0 });
    return leaseUntil;
  },
});

export const failBannerRefresh = internalMutation({
  args: { termCode: v.string(), leaseUntil: v.number(), message: v.string() },
  handler: async (ctx, { termCode, leaseUntil, message }) => {
    const state = await ctx.db.query("feedSyncState")
      .withIndex("by_source", (q) => q.eq("sourceKey", bannerTermKey(termCode))).unique();
    if (state?.refreshInFlightUntil === leaseUntil) {
      await ctx.db.patch(state._id, evaluateFailureStatePatch(state, Date.now(), message));
    }
  },
});

export const refreshBannerTerm = internalAction({
  args: { termCode: v.string(), courses: v.array(v.string()) },
  handler: async (ctx, { termCode, courses }): Promise<{ termCode: string; sections: number; changedSections: number }> => {
    const scope = [...new Set(courses.map(normalizeSubjectCourse))].sort();
    if (!scope.length || scope.length > 8) throw new ConvexError("Refresh one to eight published courses per term.");
    // Validate the entire scope before contacting any upstream or claiming a lease.
    const urls = scope.map((course) => bannerCourseUrl(termCode, course));
    const leaseUntil = await ctx.runMutation(internal.courses.beginBannerRefresh, { termCode });
    try {
      const rows = [];
      for (const [index, course] of scope.entries()) {
        const response = await fetch(urls[index]!, {
          redirect: "error", signal: AbortSignal.timeout(8000), headers: { Accept: "text/html" },
        });
        if (!response.ok) throw new ConvexError("Public Banner request failed for " + course);
        rows.push(...parseBannerCoursePage(await response.text(), termCode, course));
        if (rows.length > MAX_BANNER_SECTIONS) throw new ConvexError("Banner scope exceeds 300 sections.");
        if (index < scope.length - 1) await new Promise((resolve) => setTimeout(resolve, 1250));
      }
      return await ctx.runMutation(internal.courses.applyBannerTerm, { termCode, courses: scope, rows, leaseUntil });
    } catch (error) {
      await ctx.runMutation(internal.courses.failBannerRefresh, {
        termCode, leaseUntil, message: error instanceof Error ? error.message : "Public Banner refresh failed",
      });
      throw error;
    }
  },
});
export const searchCatalog = viewerQuery({
  args: {
    termCode: v.optional(v.string()),
    queryText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const termCode = args.termCode ?? (await getBannerTerms(ctx)).activeTerm;
    const qText = args.queryText?.trim() ?? "";

    // Instant 5-digit CRN O(1) lookup via courseSections.by_term_crn
    if (/^\d{5}$/.test(qText)) {
      const exactSection = await ctx.db
        .query("courseSections")
        .withIndex("by_term_crn", (q) =>
          q.eq("termCode", termCode).eq("crn", qText)
        )
        .unique();
      if (!exactSection || exactSection.isRetiredFixture) {
        return [];
      }
      const hub = await ctx.db.get(exactSection.courseHubId);
      if (!hub || hub.isRetiredFixture) return [];
      return [
        {
          _id: hub._id,
          subjectCourse: hub.subjectCourse,
          title: hub.title,
          campuses: hub.campuses,
          matchedCrnSection: exactSection,
          sections: [exactSection],
        },
      ];
    }

    const hubs = qText
      ? await ctx.db
          .query("courseHubs")
          .withSearchIndex("search_course_hubs", (q) =>
            q.search("searchText", qText)
          )
          .filter((q) => q.neq(q.field("isRetiredFixture"), true))
          .take(15)
      : await ctx.db.query("courseHubs")
        .filter((q) => q.neq(q.field("isRetiredFixture"), true)).take(15);

    return Promise.all(
      hubs.map(async (hub) => {
        const sections = await ctx.db
          .query("courseSections")
          .withIndex("by_hub_term", (q) =>
            q.eq("courseHubId", hub._id).eq("termCode", termCode)
          )
          .filter((q) => q.neq(q.field("isRetiredFixture"), true))
          .take(10);
        return {
          _id: hub._id,
          subjectCourse: hub.subjectCourse,
          title: hub.title,
          campuses: hub.campuses,
          matchedCrnSection: null,
          sections,
        };
      })
    );
  },
});

export const getCourseHubDetail = viewerQuery({
  args: {
    subjectCourse: v.string(),
    termCode: v.optional(v.string()),
    sectionFilter: v.optional(v.union(v.literal("all"), v.literal("mine"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const termCode = args.termCode ?? (await getBannerTerms(ctx)).activeTerm;
    const normalized = normalizeSubjectCourse(args.subjectCourse);

    const hub = await ctx.db
      .query("courseHubs")
      .withIndex("by_subject_course", (q) => q.eq("subjectCourse", normalized))
      .unique();
    if (!hub || hub.isRetiredFixture) return null;

    const [sections, myEnrollment, groupChat, rawPosts, rawSessions] =
      await Promise.all([
        ctx.db
          .query("courseSections")
          .withIndex("by_hub_term", (q) =>
            q.eq("courseHubId", hub._id).eq("termCode", termCode)
          )
          .filter((q) => q.neq(q.field("isRetiredFixture"), true))
          .take(25),
        ctx.db
          .query("studentEnrollments")
          .withIndex("by_student_hub", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("studentId", viewer.actorStudent._id)
              .eq("courseHubId", hub._id)
          )
          .first(),
        ctx.db
          .query("chats")
          .withIndex("by_workspace_parent", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("parentType", "course_hub")
              .eq("parentId", String(hub._id))
          )
          .unique(),
        ctx.db
          .query("posts")
          .withIndex("by_course_hub", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("courseHubId", hub._id)
              .eq("visibilityStatus", "visible")
          )
          .order("desc")
          .take(25),
        ctx.db
          .query("studySessions")
          .withIndex("by_course_hub_end", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("courseHubId", hub._id)
              .gt("endTime", now)
          )
          .take(10),
      ]);

    const mySection = myEnrollment?.sectionId
      ? sections.find((s) => s._id === myEnrollment.sectionId) ??
        (await ctx.db.get(myEnrollment.sectionId))
      : null;

    const filteredPosts = filterVisibleContent(rawPosts, viewer, {
      targetType: "post",
      getAuthorId: (p) => p.authorId,
    }).filter((p) => {
      if (p.rootPostId) return false;
      if (args.sectionFilter === "mine" && myEnrollment?.sectionId) {
        return p.authorSectionId === myEnrollment.sectionId;
      }
      return true;
    });

    const posts = await hydratePostCards(ctx, filteredPosts, viewer);

    // Course Hub Members Only Study Sessions are ONLY returned if viewer is enrolled!
    const visibleSessions = myEnrollment
      ? filterVisibleContent(rawSessions, viewer, {
          targetType: "study_session",
          getAuthorId: (s) => s.hostId,
        }).filter((s) => s.status === "scheduled")
      : filterVisibleContent(rawSessions, viewer, {
          targetType: "study_session",
          getAuthorId: (s) => s.hostId,
        }).filter(
          (s) => s.status === "scheduled" && s.visibility === "campus_open"
        );

    return {
      hub,
      termCode,
      sections,
      isEnrolled: Boolean(myEnrollment),
      // Strictly viewer's own enrollment/section — never leaks classmates' CRNs or schedules
      myEnrollment: myEnrollment
        ? {
            _id: myEnrollment._id,
            termCode: myEnrollment.termCode,
            crn: myEnrollment.crn,
            section: mySection,
            personalDeadlines: myEnrollment.personalDeadlines,
          }
        : null,
      groupChatId: groupChat?._id ?? null,
      posts,
      studySessions: visibleSessions,
    };
  },
});

export const getMyPrivateSchedule = viewerQuery({
  args: {
    targetStudentId: v.optional(v.id("students")),
    termCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    // Hard Schedule Privacy invariant: reject any attempt to read another Student's CRNs or .ics deadlines
    if (
      args.targetStudentId &&
      args.targetStudentId !== viewer.actorStudent._id
    ) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "Personal CRN schedules and .ics assignment deadlines are private to the owning Student.",
      });
    }

    const enrollments = args.termCode
      ? await ctx.db
          .query("studentEnrollments")
          .withIndex("by_student_term", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("studentId", viewer.actorStudent._id)
              .eq("termCode", args.termCode!)
          )
          .take(20)
      : await ctx.db
          .query("studentEnrollments")
          .withIndex("by_student_term", (q) =>
            q
              .eq("workspaceKey", viewer.workspaceKey)
              .eq("studentId", viewer.actorStudent._id)
          )
          .take(20);

    const privateTerms = await ctx.db.query("privateScheduleTerms")
      .withIndex("by_student_term", (q) => {
        const student = q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id);
        return args.termCode ? student.eq("termCode", args.termCode) : student;
      }).take(20);
    const privateDeadlines = new Map(privateTerms.map(({ termCode, personalDeadlines }) => [termCode, personalDeadlines]));

    return Promise.all(
      enrollments.map(async (enr) => {
        const [hub, section] = await Promise.all([
          ctx.db.get(enr.courseHubId),
          enr.sectionId ? ctx.db.get(enr.sectionId) : Promise.resolve(null),
        ]);
        return {
          _id: enr._id,
          termCode: enr.termCode,
          crn: enr.crn,
          courseHub: hub,
          section,
          personalDeadlines: [
            ...enr.personalDeadlines,
            ...(privateDeadlines.get(enr.termCode) ?? []).filter((deadline) =>
              deadline.courseCode === hub?.subjectCourse && !enr.personalDeadlines.some(({ uid }) => uid === deadline.uid)),
          ],
        };
      })
    );
  },
});

export const enrollInCourseHub = viewerMutation({
  args: {
    termCode: v.optional(v.string()),
    courseHubId: v.optional(v.id("courseHubs")),
    crn: v.optional(v.string()),
    sectionId: v.optional(v.id("courseSections")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const termCode = args.termCode ?? (await getBannerTerms(ctx)).activeTerm;

    let matchedSection: Doc<"courseSections"> | null = null;
    if (args.sectionId) {
      matchedSection = await ctx.db.get(args.sectionId);
      if (!matchedSection || matchedSection.isRetiredFixture || (args.termCode && matchedSection.termCode !== args.termCode)
          || (args.courseHubId && matchedSection.courseHubId !== args.courseHubId)) {
        throw new ConvexError({ code: "NOT_FOUND", message: "The section does not match this Course Hub and term." });
      }
    } else if (args.crn) {
      matchedSection = await ctx.db
        .query("courseSections")
        .withIndex("by_term_crn", (q) =>
          q.eq("termCode", termCode).eq("crn", args.crn!.trim())
        )
        .unique();
      if (!matchedSection || matchedSection.isRetiredFixture) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `No Banner 9 section found for CRN ${args.crn} in term ${termCode}.`,
        });
      }
    }

    const courseHubId = matchedSection?.courseHubId ?? args.courseHubId;
    if (!courseHubId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Provide a courseHubId or 5-digit CRN.",
      });
    }

    const hub = await ctx.db.get(courseHubId);
    if (!hub || hub.isRetiredFixture) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Course Hub not found.",
      });
    }

    const existing = await ctx.db
      .query("studentEnrollments")
      .withIndex("by_student_hub", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("courseHubId", hub._id)
      )
      .first();

    let enrollmentId: Id<"studentEnrollments">;
    if (existing) {
      await ctx.db.patch(existing._id,
        enrollmentTermFields(existing, matchedSection?.termCode ?? termCode, matchedSection));
      enrollmentId = existing._id;
    } else {
      enrollmentId = await ctx.db.insert("studentEnrollments", {
        workspaceKey: viewer.workspaceKey,
        studentId: viewer.actorStudent._id,
        termCode: matchedSection?.termCode ?? termCode,
        courseHubId: hub._id,
        sectionId: matchedSection?._id,
        crn: matchedSection?.crn,
        personalDeadlines: [],
        createdAt: now,
      });
      // Immutable "ksu" guardrail: ONLY prod enrollments modify prodEnrollmentCount!
      if (viewer.workspaceKey === "prod") {
        await ctx.db.patch(hub._id, {
          prodEnrollmentCount: hub.prodEnrollmentCount + 1,
        });
      }
    }

    const groupChatId = await ensureLazyCommunityGroupChat(ctx, {
      workspaceKey: viewer.workspaceKey,
      studentId: viewer.actorStudent._id,
      parentType: "course_hub",
      parentId: String(hub._id),
      title: `${hub.subjectCourse} · ${hub.title}`,
      now,
    });

    return {
      enrollmentId,
      courseHubId: hub._id,
      subjectCourse: hub.subjectCourse,
      groupChatId,
    };
  },
});

export const leaveCourseHub = viewerMutation({
  args: {
    courseHubId: v.id("courseHubs"),
  },
  handler: async (ctx, args) => {
    const { viewer } = ctx;
    const existing = await ctx.db
      .query("studentEnrollments")
      .withIndex("by_student_hub", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("courseHubId", args.courseHubId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      if (viewer.workspaceKey === "prod") {
        const hub = await ctx.db.get(args.courseHubId);
        if (hub && hub.prodEnrollmentCount > 0) {
          await ctx.db.patch(hub._id, {
            prodEnrollmentCount: hub.prodEnrollmentCount - 1,
          });
        }
      }
    }
    await removeCommunityChatMember(ctx, viewer.workspaceKey, "course_hub",
      args.courseHubId, viewer.actorStudent._id);
    return { ok: true };
  },
});

const scheduleDays = ["M", "T", "W", "R", "F", "S", "U"];
const MAX_PRIVATE_SCHEDULE_ITEMS = 100;
const privateClassFields = {
  title: v.string(),
  days: v.array(v.string()),
  startMinutes: v.number(),
  endMinutes: v.optional(v.number()),
  location: v.optional(v.string()),
};

function readScheduleTerm(ctx: QueryCtx, workspaceKey: string, studentId: Id<"students">, termCode: string) {
  if (!/^\d{6}$/.test(termCode)) throw new ConvexError("Choose a valid schedule term.");
  return ctx.db.query("privateScheduleTerms").withIndex("by_student_term", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("studentId", studentId).eq("termCode", termCode)
  ).unique();
}

type PrivateClass = Doc<"privateScheduleTerms">["entries"][number];

function toPrivateClass(key: string, fields: Omit<PrivateClass, "key">): PrivateClass {
  const title = stripAnyTokenUrls(fields.title).slice(0, 140);
  const location = fields.location === undefined ? undefined : stripAnyTokenUrls(fields.location).slice(0, 160);
  const validTime = (minutes: number) => Number.isInteger(minutes) && minutes >= 0 && minutes < 1440;
  if (!title || !fields.days.length || fields.days.some((day) => !scheduleDays.includes(day)) ||
      !validTime(fields.startMinutes) || (fields.endMinutes !== undefined && !validTime(fields.endMinutes))) {
    throw new ConvexError("Enter a class name, meeting day and valid meeting time.");
  }
  return {
    key,
    title,
    days: scheduleDays.filter((day) => fields.days.includes(day)),
    startMinutes: fields.startMinutes,
    endMinutes: fields.endMinutes,
    location: location || undefined,
  };
}

async function parseScheduleMatches(ctx: QueryCtx, rawIcs: string, termCode: string) {
  let parsed: ReturnType<typeof parseStatelessScheduleIcs>;
  try {
    parsed = parseStatelessScheduleIcs(rawIcs);
  } catch (problem) {
    // Plain Errors are redacted in production; surface the parser's reason to the Student.
    throw new ConvexError(problem instanceof Error ? problem.message : "Could not read this .ics file.");
  }
  const blocks = await Promise.all(parsed.classBlocks.map(async (block) => {
    const byCrn = block.crnCandidate ? await ctx.db.query("courseSections")
      .withIndex("by_term_crn", (q) => q.eq("termCode", termCode).eq("crn", block.crnCandidate!)).unique() : null;
    const exactCrn = byCrn?.isRetiredFixture ? null : byCrn;
    const hub = exactCrn ? await ctx.db.get(exactCrn.courseHubId) : block.courseCodeCandidate
      ? await ctx.db.query("courseHubs").withIndex("by_subject_course", (q) =>
        q.eq("subjectCourse", normalizeSubjectCourse(block.courseCodeCandidate!))).unique()
      : null;
    const activeHub = hub?.isRetiredFixture ? null : hub;
    const sections = activeHub && !exactCrn ? await ctx.db.query("courseSections")
      .withIndex("by_hub_term", (q) => q.eq("courseHubId", activeHub._id).eq("termCode", termCode))
      .filter((q) => q.neq(q.field("isRetiredFixture"), true)).take(60) : [];
    const sameTime = sections.filter((section) => section.meetings.some((meeting) =>
      block.byDays.length > 0 && block.byDays.every((day) => meeting.days.includes(day))
        && block.startMinutes === meeting.startMinutes));
    const exact = activeHub ? exactCrn ?? (sameTime.length === 1 ? sameTime[0] : null) : null;
    const options = exact ? [exact] : sameTime.length ? sameTime : sections;
    const status = exact ? "exact" : options.length ? "ambiguous" : "unmatched";
    const reason = exact ? (exactCrn ? "Matched published CRN." : "Matched course code and meeting time.")
      : sameTime.length > 1 ? "More than one section matches the meeting time."
      : options.length ? "No section matches the meeting time. Choose a section or save privately."
      : "No published section matches this class.";
    const entry = block.startMinutes === undefined || !block.byDays.length ? null : toPrivateClass(
      "ics:" + block.uid, {
        title: block.summary || block.courseCodeCandidate || "Imported class",
        days: block.byDays,
        startMinutes: block.startMinutes,
        endMinutes: block.endMinutes,
        location: block.location,
      });
    return { block, entry, hub: activeHub, options, exact, status, reason };
  }));
  return { blocks, deadlines: parsed.deadlines };
}

export const previewScheduleFromIcs = viewerQuery({
  args: { rawIcs: v.string(), termCode: v.string() },
  handler: async (ctx, args) => {
    const { blocks, deadlines } = await parseScheduleMatches(ctx, args.rawIcs, args.termCode);
    return {
      blocks: blocks.map(({ block, entry, exact, options, status, reason }, index) => ({
        index,
        title: entry?.title ?? block.summary,
        entry,
        status,
        reason: entry ? reason : reason + " No valid meeting time is available to save privately.",
        exactSectionId: exact?._id,
        options: options.map(({ _id, sectionNumber, crn, campus, meetings }) => ({
          _id, sectionNumber, crn, campus, time: meetings[0]?.timeLabel,
        })),
      })),
      deadlineCount: deadlines.length,
    };
  },
});

export const listMyPrivateClasses = viewerQuery({
  args: { termCode: v.string() },
  handler: async (ctx, { termCode }) => (await readScheduleTerm(
    ctx, ctx.viewer.workspaceKey, ctx.viewer.actorStudent._id, termCode
  ))?.entries ?? [],
});

export const savePrivateClass = viewerMutation({
  args: { termCode: v.string(), key: v.optional(v.string()), ...privateClassFields },
  handler: async (ctx, args) => {
    const { workspaceKey, actorStudent } = ctx.viewer;
    const term = await readScheduleTerm(ctx, workspaceKey, actorStudent._id, args.termCode);
    const entries = term?.entries ?? [];
    const key = args.key ?? "manual:" + crypto.randomUUID();
    const index = entries.findIndex((entry) => entry.key === key);
    if (args.key && index === -1) throw new ConvexError("Private class not found.");
    const entry = { ...toPrivateClass(key, args), sectionId: entries[index]?.sectionId };
    if (index === -1) entries.push(entry);
    else entries[index] = entry;
    if (entries.length > MAX_PRIVATE_SCHEDULE_ITEMS) throw new ConvexError("This term already has 100 private classes.");
    if (term) await ctx.db.patch(term._id, { entries });
    else await ctx.db.insert("privateScheduleTerms", {
      workspaceKey, studentId: actorStudent._id, termCode: args.termCode, entries, personalDeadlines: [],
    });
    return key;
  },
});

export const removePrivateClass = viewerMutation({
  args: { termCode: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const term = await readScheduleTerm(ctx, ctx.viewer.workspaceKey, ctx.viewer.actorStudent._id, args.termCode);
    if (term) await ctx.db.patch(term._id, { entries: term.entries.filter((entry) => entry.key !== args.key) });
  },
});

export const importScheduleFromIcs = viewerMutation({
  args: {
    rawIcs: v.string(),
    termCode: v.optional(v.string()),
    selections: v.optional(v.array(v.object({
      index: v.number(),
      sectionId: v.union(v.id("courseSections"), v.null()),
    }))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const termCode = args.termCode ?? (await getBannerTerms(ctx)).activeTerm;
    const term = await readScheduleTerm(ctx, viewer.workspaceKey, viewer.actorStudent._id, termCode);
    const parsed = await parseScheduleMatches(ctx, args.rawIcs, termCode);
    const selections = new Map(args.selections?.map(({ index, sectionId }) => [index, sectionId]));
    const privateEntries = new Map(term?.entries.map((entry) => [entry.key, entry]));
    const originalEntries = new Set(privateEntries.keys());
    const matchedHubIds = new Set<Id<"courseHubs">>();
    const enrolledResults: Array<{ subjectCourse: string; crn?: string }> = [];

    for (const [index, match] of parsed.blocks.entries()) {
      const selected = selections.get(index);
      const section = selected === undefined ? match.exact : match.options.find(({ _id }) => _id === selected);
      if (selected && !section) throw new ConvexError("A selected section is no longer available. Preview the file again.");
      const { hub, entry } = match;
      const alreadyMatched = hub && matchedHubIds.has(hub._id);
      if (entry) {
        const saved = privateEntries.get(entry.key) ?? entry;
        privateEntries.set(entry.key, { ...saved, sectionId: section?._id });
      }
      if (!section || !hub || alreadyMatched) continue;
      matchedHubIds.add(hub._id);

      const existing = await ctx.db
        .query("studentEnrollments")
        .withIndex("by_student_hub", (q) =>
          q
            .eq("workspaceKey", viewer.workspaceKey)
            .eq("studentId", viewer.actorStudent._id)
            .eq("courseHubId", hub!._id)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, enrollmentTermFields(existing, termCode, section));
      } else {
        await ctx.db.insert("studentEnrollments", {
          workspaceKey: viewer.workspaceKey,
          studentId: viewer.actorStudent._id,
          termCode,
          courseHubId: hub._id,
          sectionId: section?._id,
          crn: section?.crn,
          personalDeadlines: [],
          createdAt: now,
        });
        if (viewer.workspaceKey === "prod") {
          await ctx.db.patch(hub._id, {
            prodEnrollmentCount: hub.prodEnrollmentCount + 1,
          });
        }
      }

      await ensureLazyCommunityGroupChat(ctx, {
        workspaceKey: viewer.workspaceKey,
        studentId: viewer.actorStudent._id,
        parentType: "course_hub",
        parentId: String(hub._id),
        title: `${hub.subjectCourse} · ${hub.title}`,
        now,
      });

      enrolledResults.push({
        subjectCourse: hub.subjectCourse,
        crn: section?.crn,
      });
    }

    // Distribute extracted personal assignment deadlines across enrollments (capped at <= 100 total)
    const allMyEnrollments = await ctx.db
      .query("studentEnrollments")
      .withIndex("by_student_term", (q) =>
        q
          .eq("workspaceKey", viewer.workspaceKey)
          .eq("studentId", viewer.actorStudent._id)
          .eq("termCode", termCode)
      )
      .take(20);

    const termDeadlines = [...(term?.personalDeadlines ?? [])];
    const knownDeadlineIds = new Set([
      ...termDeadlines,
      ...allMyEnrollments.flatMap((row) => row.personalDeadlines),
    ].map(({ uid }) => uid));
    let savedDeadlines = 0;
    for (const deadline of parsed.deadlines) {
      if (knownDeadlineIds.size >= MAX_PRIVATE_SCHEDULE_ITEMS) break;
      if (knownDeadlineIds.has(deadline.uid)) continue;
      termDeadlines.push(deadline);
      knownDeadlineIds.add(deadline.uid);
      savedDeadlines++;
    }

    const entries = [...privateEntries.values()];
    if (entries.length > MAX_PRIVATE_SCHEDULE_ITEMS) throw new ConvexError("This import would exceed 100 private classes in this term.");
    if (term) await ctx.db.patch(term._id, { entries, personalDeadlines: termDeadlines });
    else if (entries.length || termDeadlines.length) await ctx.db.insert("privateScheduleTerms", {
      workspaceKey: viewer.workspaceKey, studentId: viewer.actorStudent._id, termCode, entries, personalDeadlines: termDeadlines,
    });
    return {
      matchedCourses: enrolledResults,
      importedDeadlinesCount: savedDeadlines,
      importedPrivateClassCount: entries.filter(({ key }) => !originalEntries.has(key)).length,
    };
  },
});

export const getCourseSyllabus = viewerQuery({
  args: {
    subjectCourse: v.string(),
    termCode: v.optional(v.string()),
    crn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const termCode = args.termCode ?? (await getBannerTerms(ctx)).activeTerm;
    const normalized = normalizeSubjectCourse(args.subjectCourse);

    // 1. Exact (term, subjectCourse, CRN) lookup
    if (args.crn) {
      const exactKey = `${termCode}:${normalized}:${args.crn}`;
      const exactHit = await ctx.db
        .query("courseSyllabiCache")
        .withIndex("by_cache_key", (q) => q.eq("cacheKey", exactKey))
        .unique();
      if (exactHit && exactHit.expiresAt > now && exactHit.status === "found") {
        return {
          cacheHit: true,
          cacheEntryId: exactHit._id,
          status: exactHit.status,
          isFallbackSection: false,
          matchedSectionLabel: exactHit.matchedSectionLabel,
          sourceUrl:
            exactHit.sourceUrl ??
            `https://kennesaw.simplesyllabus.com/en-US/doc-library?search=${encodeURIComponent(normalized)}`,
          summary: exactHit.summaryJson
            ? JSON.parse(exactHit.summaryJson)
            : null,
        };
      }
    }

    // 2. Fallback to another published section of the same (subjectCourse, termCode)
    const courseEntries = await ctx.db
      .query("courseSyllabiCache")
      .withIndex("by_subject_course", (q) =>
        q.eq("subjectCourse", normalized).eq("termCode", termCode)
      )
      .take(10);

    const validFound = courseEntries.find(
      (e) => e.expiresAt > now && e.status === "found"
    );
    if (validFound) {
      const isDifferentCrn = Boolean(
        args.crn && validFound.crn && validFound.crn !== args.crn
      );
      const label = isDifferentCrn
        ? `Showing syllabus from ${validFound.matchedSectionLabel}`
        : validFound.matchedSectionLabel;
      return {
        cacheHit: true,
        cacheEntryId: validFound._id,
        status: "found" as const,
        isFallbackSection: isDifferentCrn,
        matchedSectionLabel: label,
        sourceUrl:
          validFound.sourceUrl ??
          `https://kennesaw.simplesyllabus.com/en-US/doc-library?search=${encodeURIComponent(normalized)}`,
        summary: validFound.summaryJson
          ? JSON.parse(validFound.summaryJson)
          : null,
      };
    }

    const validMiss = courseEntries.find(
      (e) => e.expiresAt > now && e.status === "not_found"
    );
    if (validMiss) {
      return {
        cacheHit: true,
        cacheEntryId: validMiss._id,
        status: "not_found" as const,
        isFallbackSection: false,
        matchedSectionLabel: validMiss.matchedSectionLabel,
        sourceUrl:
          validMiss.sourceUrl ??
          `https://kennesaw.simplesyllabus.com/en-US/doc-library?search=${encodeURIComponent(normalized)}`,
        summary: null,
      };
    }

    return {
      cacheHit: false,
      status: "uncached" as const,
      isFallbackSection: false,
      matchedSectionLabel: "Fetch on demand from Simple Syllabus",
      sourceUrl: `https://kennesaw.simplesyllabus.com/en-US/doc-library?search=${encodeURIComponent(normalized)}`,
      summary: null,
    };
  },
});

export const touchCourseSyllabus = viewerMutation({
  args: { cacheEntryId: v.id("courseSyllabiCache") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.cacheEntryId);
    const now = Date.now();
    if (entry && entry.expiresAt > now && now - entry.lastAccessedAt >= 60 * 60_000) {
      await ctx.db.patch(entry._id, { lastAccessedAt: now });
    }
  },
});

export const upsertSyllabusCacheEntry = internalMutation({
  args: {
    subjectCourse: v.string(),
    termCode: v.string(),
    crn: v.optional(v.string()),
    matchedSectionLabel: v.string(),
    status: v.union(v.literal("found"), v.literal("not_found")),
    summaryJson: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    nowOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.nowOverride ?? Date.now();
    const normalized = normalizeSubjectCourse(args.subjectCourse);
    const cacheKey = `${args.termCode}:${normalized}:${args.crn ?? "any"}`;
    const ttl = args.status === "found" ? SEVEN_DAYS_MS : ONE_DAY_MS;

    const existing = await ctx.db
      .query("courseSyllabiCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", cacheKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        matchedSectionLabel: args.matchedSectionLabel,
        status: args.status,
        summaryJson: args.summaryJson,
        sourceUrl: args.sourceUrl,
        fetchedAt: now,
        lastAccessedAt: now,
        expiresAt: now + ttl,
      });
      return existing._id;
    }

    const insertedId = await ctx.db.insert("courseSyllabiCache", {
      cacheKey,
      subjectCourse: normalized,
      termCode: args.termCode,
      crn: args.crn,
      matchedSectionLabel: args.matchedSectionLabel,
      status: args.status,
      summaryJson: args.summaryJson,
      sourceUrl: args.sourceUrl,
      fetchedAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttl,
    });

    // Enforce 500-row LRU eviction cap via by_lru ascending
    const allCountCheck = await ctx.db
      .query("courseSyllabiCache")
      .withIndex("by_lru")
      .order("asc")
      .take(SYLLABUS_LRU_CAP + 25);

    if (allCountCheck.length > SYLLABUS_LRU_CAP) {
      const overflow = allCountCheck.length - SYLLABUS_LRU_CAP;
      for (let i = 0; i < overflow; i++) {
        await ctx.db.delete(allCountCheck[i]!._id);
      }
    }

    return insertedId;
  },
});

export const fetchAndCacheSyllabus = action({
  args: {
    ...viewerAuthArgs,
    subjectCourse: v.string(),
    termCode: v.optional(v.string()),
    crn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify viewerContext before invoking external Simple Syllabus fetch
    const { activeTerm } = await ctx.runQuery(api.courses.listBannerTerms, {
      sessionToken: args.sessionToken,
      demoShortCode: args.demoShortCode,
      demoPersonaHandle: args.demoPersonaHandle,
    });

    const termCode = args.termCode ?? activeTerm;
    const normalized = normalizeSubjectCourse(args.subjectCourse);

    // Return cached entry immediately if already present
    const cached: any = await ctx.runQuery(api.courses.getCourseSyllabus, {
      sessionToken: args.sessionToken,
      demoShortCode: args.demoShortCode,
      demoPersonaHandle: args.demoPersonaHandle,
      subjectCourse: normalized,
      termCode,
      crn: args.crn,
    });
    if (cached.cacheHit) {
      await ctx.runMutation(api.courses.touchCourseSyllabus, {
        sessionToken: args.sessionToken,
        demoShortCode: args.demoShortCode,
        demoPersonaHandle: args.demoPersonaHandle,
        cacheEntryId: cached.cacheEntryId,
      });
      return cached;
    }

    const fetched = await fetchSimpleSyllabusSummary({
      subjectCourse: normalized,
      termCode,
      crn: args.crn,
    });

    if (fetched.status === "found" || fetched.status === "not_found") {
      await ctx.runMutation(internal.courses.upsertSyllabusCacheEntry, {
        subjectCourse: normalized,
        termCode,
        crn: fetched.matchedCrn ?? args.crn,
        matchedSectionLabel: fetched.matchedSectionLabel,
        status: fetched.status,
        summaryJson: fetched.summary
          ? JSON.stringify(fetched.summary)
          : undefined,
        sourceUrl: fetched.sourceUrl,
      });
    }

    return {
      cacheHit: false,
      status: fetched.status,
      isFallbackSection: Boolean(
        args.crn && fetched.matchedCrn && fetched.matchedCrn !== args.crn
      ),
      matchedSectionLabel: fetched.matchedSectionLabel,
      sourceUrl: fetched.sourceUrl,
      summary: fetched.summary ?? null,
    };
  },
});
