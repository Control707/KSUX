import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isItemVisibleToViewer, viewerMutation, viewerQuery, type ViewerContext } from "./lib/viewer";
import { classOccurrences, exportEventsCalendar, reminderKey, type AgendaItem } from "./lib/agendaItems";
import { easternDate } from "./lib/easternDate";

const DAYS = 14;
const LIMIT = 200;
const LEAD_TIME = 15 * 60_000;
const defaultSettings = { class: false, deadline: false, event: false, study: false };
const settingsValidator = v.object({ class: v.boolean(), deadline: v.boolean(), event: v.boolean(), study: v.boolean() });

function readState(ctx: QueryCtx, viewer: ViewerContext) {
  return ctx.db.query("agendaReminderState").withIndex("by_student", (q) =>
    q.eq("workspaceKey", viewer.workspaceKey).eq("studentId", viewer.actorStudent._id)).unique();
}

function visibleSession(viewer: ViewerContext, session: Doc<"studySessions">) {
  return session.workspaceKey === viewer.workspaceKey && session.attendeeIds.includes(viewer.actorStudent._id)
    && (session.visibility !== "course_members_only" || Boolean(session.courseHubId && viewer.enrolledCourseHubIds.has(session.courseHubId)))
    && isItemVisibleToViewer(viewer, { targetType: "study_session", targetId: session._id,
      authorId: session.hostId, visibilityStatus: session.visibilityStatus });
}

async function readAgenda(ctx: QueryCtx, viewer: ViewerContext, now: number) {
  const owner = { workspaceKey: viewer.workspaceKey, studentId: viewer.actorStudent._id };
  const [terms, enrollments, rsvps, memberships] = await Promise.all([
    ctx.db.query("privateScheduleTerms").withIndex("by_student_term", (q) =>
      q.eq("workspaceKey", owner.workspaceKey).eq("studentId", owner.studentId)).order("desc").take(20),
    ctx.db.query("studentEnrollments").withIndex("by_student_term", (q) =>
      q.eq("workspaceKey", owner.workspaceKey).eq("studentId", owner.studentId)).order("desc").take(100),
    ctx.db.query("eventRsvps").withIndex("by_student", (q) =>
      q.eq("workspaceKey", owner.workspaceKey).eq("studentId", owner.studentId)).order("desc").take(LIMIT),
    // Membership is an indexed path to joined Study Sessions; attendance remains authoritative.
    ctx.db.query("chatMembers").withIndex("by_student_kind", (q) =>
      q.eq("workspaceKey", owner.workspaceKey).eq("studentId", owner.studentId).eq("chatKind", "study_group")).order("desc").take(LIMIT),
  ]);
  const items = new Map<string, AgendaItem>();
  const add = (item: AgendaItem) => {
    const date = easternDate(item.startsAt);
    if ((item.endsAt ?? item.startsAt) >= now && date < easternDate(now, DAYS)) items.set(item.key, item);
  };
  const sections = new Map<Id<"courseSections">, { section: Doc<"courseSections">; href: string }>();
  const courseLinks = new Map<string, string>();
  for (const enrollment of enrollments) {
    const hub = await ctx.db.get(enrollment.courseHubId);
    const href = hub && !hub.isRetiredFixture ? "/courses/" + encodeURIComponent(hub.subjectCourse) : "/agenda#private-schedule";
    if (hub && !hub.isRetiredFixture) courseLinks.set(hub.subjectCourse, href);
    const section = enrollment.sectionId ? await ctx.db.get(enrollment.sectionId) : null;
    if (section && !section.isRetiredFixture && section.termCode === enrollment.termCode && hub && !hub.isRetiredFixture) {
      sections.set(section._id, { section, href });
      const imported = terms.some((term) => term.termCode === enrollment.termCode && term.entries.some((entry) => entry.sectionId === section._id));
      if (!imported) section.meetings.forEach((meeting) => classOccurrences({
        ...meeting, key: "class:" + section._id + ":" + meeting.startMinutes, title: hub.subjectCourse + " · " + hub.title,
        termCode: enrollment.termCode, campus: section.campus,
        location: [meeting.buildingName, meeting.roomNumber].filter(Boolean).join(" · "), source: "Banner · enrolled class", href,
      }, now, DAYS).forEach(add));
    }
    for (const deadline of enrollment.personalDeadlines) add({
      key: "deadline:" + enrollment.termCode + ":" + deadline.uid, kind: "deadline", title: deadline.title,
      startsAt: deadline.dueAt, location: deadline.location, source: ".ics import · private deadline", href, cancelled: false,
    });
  }
  for (const term of terms) {
    for (const entry of term.entries) {
      let matched = entry.sectionId ? sections.get(entry.sectionId) : undefined;
      if (entry.sectionId && !matched) {
        const section = await ctx.db.get(entry.sectionId);
        const hub = section ? await ctx.db.get(section.courseHubId) : null;
        if (section && !section.isRetiredFixture && section.termCode === term.termCode && hub && !hub.isRetiredFixture) {
          matched = { section, href: "/courses/" + encodeURIComponent(hub.subjectCourse) };
          sections.set(section._id, matched);
        }
      }
      // The same meeting retains its identity when a Banner enrollment is imported.
      // Reimporting that meeting under another UID must not duplicate it either.
      const key = matched ? `class:${matched.section._id}:${entry.startMinutes}` : `class:${term.termCode}:${entry.key}`;
      classOccurrences({ ...entry, key,
        termCode: term.termCode, campus: matched?.section.campus,
        location: entry.location ?? matched?.section.meetings[0]?.buildingName,
        source: entry.key.startsWith("ics:") ? ".ics import · private class" : "Manually saved · private class",
        href: matched?.href ?? `/agenda?term=${term.termCode}#private-schedule`,
      }, now, DAYS).forEach(add);
    }
    for (const deadline of term.personalDeadlines) {
      const existing = items.get("deadline:" + term.termCode + ":" + deadline.uid);
      add({ key: "deadline:" + term.termCode + ":" + deadline.uid, kind: "deadline", title: deadline.title,
        startsAt: deadline.dueAt, location: deadline.location, source: ".ics import · private deadline",
        href: existing?.href ?? (deadline.courseCode ? courseLinks.get(deadline.courseCode) : undefined) ?? `/agenda?term=${term.termCode}#private-schedule`, cancelled: false });
    }
  }
  for (const rsvp of rsvps) {
    const event = await ctx.db.get(rsvp.eventId);
    if (!event || (event.workspaceKey !== "ksu" && event.workspaceKey !== viewer.workspaceKey) ||
      !isItemVisibleToViewer(viewer, { targetType: "post", targetId: event._id,
        authorId: event.organizerStudentId, visibilityStatus: event.visibilityStatus })) continue;
    add({ key: "event:" + event._id, kind: "event", title: event.title, startsAt: event.startTime, endsAt: event.endTime,
      campus: event.isVirtual ? undefined : event.campus, location: event.locationName,
      source: event.source + " · " + rsvp.rsvpStatus + (event.isFixture ? " · Demo fixture" : ""),
      href: "/events/" + event._id, cancelled: event.status !== "scheduled" });
  }
  for (const member of memberships) {
    const chat = await ctx.db.get(member.chatId);
    if (!chat || chat.workspaceKey !== viewer.workspaceKey || chat.parentType !== "study_session" || !chat.parentId) continue;
    const sessionId = ctx.db.normalizeId("studySessions", chat.parentId);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session || !visibleSession(viewer, session)) continue;
    const room = await ctx.db.get(session.studyRoomId);
    add({ key: "study:" + session._id, kind: "study", title: session.title, startsAt: session.startTime, endsAt: session.endTime,
      campus: session.campus, location: room ? room.buildingName + " · " + room.roomNumber : undefined,
      source: "Joined Study Session", href: "/study/" + session._id, cancelled: session.status !== "scheduled" });
  }
  return { items: [...items.values()].sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key)),
    days: DAYS, timeZone: "America/New_York", limited: terms.length === 20 || enrollments.length === 100 || rsvps.length === LIMIT || memberships.length === LIMIT };
}

// refreshDate changes the subscription at Eastern midnight; it never controls server time.
export const listMyAgenda = viewerQuery({ args: { refreshDate: v.optional(v.string()) }, handler: (ctx) => readAgenda(ctx, ctx.viewer, Date.now()) });

export const exportMyEvents = viewerQuery({ args: {}, handler: async (ctx) => {
  const now = Date.now();
  const agenda = await readAgenda(ctx, ctx.viewer, now);
  return exportEventsCalendar(agenda.items, now);
} });

export const getMyStudySession = viewerQuery({ args: { sessionId: v.string() }, handler: async (ctx, args) => {
  const sessionId = ctx.db.normalizeId("studySessions", args.sessionId);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  if (!session || !visibleSession(ctx.viewer, session)) return null;
  const room = await ctx.db.get(session.studyRoomId);
  return { session, location: room ? room.buildingName + " · " + room.roomNumber : "Campus space" };
} });

export const getReminderSettings = viewerQuery({ args: {}, handler: async (ctx) =>
  (await readState(ctx, ctx.viewer))?.settings ?? defaultSettings });

export const setReminderSettings = viewerMutation({ args: { settings: settingsValidator }, handler: async (ctx, args) => {
  const state = await readState(ctx, ctx.viewer);
  if (state) await ctx.db.patch(state._id, { settings: args.settings });
  else await ctx.db.insert("agendaReminderState", { workspaceKey: ctx.viewer.workspaceKey,
    studentId: ctx.viewer.actorStudent._id, settings: args.settings, deliveries: [] });
  return args.settings;
} });

/** Atomic claims deduplicate concurrent tabs/devices. Revalidate live sources before claiming. */
export const claimDueReminders = viewerMutation({ args: {}, handler: async (ctx) => {
  const state = await readState(ctx, ctx.viewer);
  if (!state || !Object.values(state.settings).some(Boolean)) return [];
  const now = Date.now();
  const { items } = await readAgenda(ctx, ctx.viewer, now);
  const deliveries = state.deliveries.filter((delivery) => delivery.expiresAt > now);
  const claimed = new Set(deliveries.map(({ key }) => key));
  const due = items.filter((item) => !item.cancelled && state.settings[item.kind]
    && item.startsAt > now && item.startsAt <= now + LEAD_TIME && !claimed.has(reminderKey(item)));
  // Bound receipt storage without evicting live deduplication keys.
  const batch = due.slice(0, Math.max(0, 1000 - deliveries.length));
  if (batch.length || deliveries.length !== state.deliveries.length) await ctx.db.patch(state._id, {
    deliveries: [...deliveries, ...batch.map((item) => ({ key: reminderKey(item), expiresAt: item.startsAt }))],
  });
  return batch;
} });
