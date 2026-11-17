import { ConvexError, v } from "convex/values";
import { action, internalMutation, MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  filterVisibleContent,
  viewerAuthArgs,
  viewerMutation,
  viewerQuery,
} from "./lib/viewer";
import { hydratePostCards } from "./feed";
import { parseStatelessScheduleIcs } from "./lib/icsParser";
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

export const searchCatalog = viewerQuery({
  args: {
    termCode: v.optional(v.string()),
    queryText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const termCode = args.termCode ?? "202608";
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
    const termCode = args.termCode ?? "202608";
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
          personalDeadlines: enr.personalDeadlines,
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
    const termCode = args.termCode ?? "202608";

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

export const importScheduleFromIcs = viewerMutation({
  args: {
    rawIcs: v.string(),
    termCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { viewer } = ctx;
    const termCode = args.termCode ?? "202608";

    const parsed = parseStatelessScheduleIcs(args.rawIcs);
    const matchedHubIds = new Set<string>();
    const enrolledResults: Array<{
      subjectCourse: string;
      crn?: string;
    }> = [];

    for (const block of parsed.classBlocks) {
      let section: Doc<"courseSections"> | null = null;
      let hub: Doc<"courseHubs"> | null = null;

      if (block.crnCandidate) {
        section = await ctx.db
          .query("courseSections")
          .withIndex("by_term_crn", (q) =>
            q.eq("termCode", termCode).eq("crn", block.crnCandidate!)
          )
          .unique();
        if (section?.isRetiredFixture) section = null;
        if (section) {
          hub = await ctx.db.get(section.courseHubId);
        }
      }

      if (!hub && block.courseCodeCandidate) {
        const normalized = normalizeSubjectCourse(block.courseCodeCandidate);
        hub = await ctx.db
          .query("courseHubs")
          .withIndex("by_subject_course", (q) =>
            q.eq("subjectCourse", normalized)
          )
          .unique();
        if (hub?.isRetiredFixture) hub = null;
        if (hub && !section) {
          const candidates = await ctx.db
            .query("courseSections")
            .withIndex("by_hub_term", (q) =>
              q.eq("courseHubId", hub!._id).eq("termCode", termCode)
            )
            .filter((q) => q.neq(q.field("isRetiredFixture"), true))
            .take(15);
          const matches = candidates.filter((candidate) => candidate.meetings.some((meeting) =>
            block.byDays.length > 0 && block.byDays.every((day) => meeting.days.includes(day))
            && block.startMinutes === meeting.startMinutes));
          section = matches.length === 1 ? matches[0]! : null;
        }
      }

      if (!hub || hub.isRetiredFixture || matchedHubIds.has(String(hub._id))) continue;
      matchedHubIds.add(String(hub._id));

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

    let savedDeadlines = 0;
    if (allMyEnrollments.length > 0 && parsed.deadlines.length > 0) {
      const hubCodeToEnrollment = new Map<string, Doc<"studentEnrollments">>();
      for (const enr of allMyEnrollments) {
        const h = await ctx.db.get(enr.courseHubId);
        if (h) hubCodeToEnrollment.set(h.subjectCourse, enr);
      }

      const buckets = new Map<
        Id<"studentEnrollments">,
        Doc<"studentEnrollments">["personalDeadlines"]
      >();
      for (const enr of allMyEnrollments) {
        buckets.set(enr._id, [...enr.personalDeadlines]);
      }

      const fallbackTarget = allMyEnrollments[0]!;
      let totalCount = allMyEnrollments.reduce(
        (acc, e) => acc + e.personalDeadlines.length,
        0
      );

      for (const dl of parsed.deadlines) {
        if (totalCount >= 100) break;
        const targetEnr =
          (dl.courseCode
            ? hubCodeToEnrollment.get(normalizeSubjectCourse(dl.courseCode))
            : undefined) ?? fallbackTarget;
        const list = buckets.get(targetEnr._id)!;
        if (!list.some((existing) => existing.uid === dl.uid)) {
          list.push(dl);
          totalCount++;
          savedDeadlines++;
        }
      }

      for (const [enrId, list] of buckets.entries()) {
        await ctx.db.patch(enrId, {
          personalDeadlines: list.slice(0, 100),
        });
      }
    }

    return {
      matchedCourses: enrolledResults,
      importedDeadlinesCount: savedDeadlines,
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
    const termCode = args.termCode ?? "202608";
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
    await ctx.runQuery(api.shell.shellSummary, {
      sessionToken: args.sessionToken,
      demoShortCode: args.demoShortCode,
      demoPersonaHandle: args.demoPersonaHandle,
    });

    const termCode = args.termCode ?? "202608";
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
