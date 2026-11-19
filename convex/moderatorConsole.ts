import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { viewerQuery, viewerMutation, moderatorMutation, parseMaintainerEmails, type ViewerContext } from "./lib/viewer";
import { assertReviewable, closeReports, exclusion, loadTarget, moderationError, notice, requireModerator, targetReports, writeAction } from "./lib/moderationPolicy";
import { DAY, INCIDENT_NOTES, INCIDENT_PLACES, INCIDENT_REMOVE_REASONS } from "./lib/incidentPolicy";
import { applyLegacyDecision } from "./moderation";
import { cleanupV2Student, closeStudentArtifactsAndMedia } from "./students";
import { presentSource } from "./officialAlerts";
import { sourceInfo } from "./lib/officialAlerts";
import type { ReviewCtx } from "./lib/moderationPolicy";
import { sha256Hex } from "./lib/crypto";

const targetType = v.union(v.literal("incident"), v.literal("post"), v.literal("listing"), v.literal("study_session"), v.literal("student"), v.literal("chat_message"));
type Ctx = MutationCtx & { viewer: ViewerContext };
const pending = (r: Doc<"moderationReports">) => r.queueStatus === "open" || r.queueStatus === "quarantined";
const labels: Record<string, string> = { identifies_me: "◆ Identifies me", photo: "▧ Held photo", incident: "◇ Incident report", post: "▤ Post report", listing: "▱ Listing report" };

export const queue = viewerQuery({
  args: {},
  handler: async (ctx) => {
    requireModerator(ctx);
    // Each priority band is read oldest first. Closed history cannot displace pending work.
    const reports = (await Promise.all((["open", "quarantined"] as const).map((status) => ctx.db.query("moderationReports")
      .withIndex("by_queue_priority", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("queueStatus", status)).take(200)))).flat();
    const keys = new Map(reports.map((r) => [r.targetKey, { type: r.targetType, id: r.targetKey.slice(r.targetType.length + 1) }]));
    // Photos may be held without a Moderation Report. P1's review actions are deliberately separate.
    const held = ctx.viewer.isCsa ? [] : await ctx.db.query("mediaAssets").withIndex("by_review_hold", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("reviewStatus", "held").gt("holdExpiresAt", Date.now())).take(100);
    for (const asset of held) {
      if (!asset.holdExpiresAt || asset.holdExpiresAt <= Date.now()) continue;
      const incident = await ctx.db.query("incidents").withIndex("by_photo", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("photoAssetId", asset._id)).first();
      if (incident) keys.set(`incident:${incident._id}`, { type: "incident", id: incident._id });
    }
    let conflicts = 0;
    const items = [];
    for (const [key, { type, id }] of keys) {
      const target = await loadTarget(ctx, type, id);
      if (!target || target.purgeAt !== undefined && target.purgeAt <= Date.now() || ["removed", "deleted", "deleted_tombstone"].includes(target.status)) continue;
      const why = await exclusion(ctx, type, id, target.authorId);
      if (why) { if (why === "conflict") conflicts++; continue; }
      const rows = (await targetReports(ctx, type, id)).filter(pending);
      const incident = type === "incident" ? target.row as Doc<"incidents"> : null;
      const asset = incident?.photoAssetId ? await ctx.db.get(incident.photoAssetId) : null;
      const heldPhoto = asset?.workspaceKey === ctx.viewer.workspaceKey && asset.reviewStatus === "held" && (asset.holdExpiresAt ?? 0) > Date.now();
      const priority = rows.some((r) => r.reason === "identifies_me") ? 0 : heldPhoto ? 1 : type === "incident" ? 2 : 3;
      if (!rows.length && !heldPhoto) continue;
      const kind = priority === 0 ? "identifies_me" : priority === 1 ? "photo" : type;
      items.push({ key, targetType: type, targetId: id, kind: labels[kind] ?? type.replaceAll("_", " "), priority,
        title: incident ? INCIDENT_PLACES.find((p) => p.id === incident.buildingId)?.name ?? "Incident" : target.text.slice(0, 80),
        campus: incident?.campus, category: incident?.category, status: target.status,
        reasons: Object.entries(rows.reduce<Record<string, number>>((counts, r) => { counts[r.reason] = (counts[r.reason] ?? 0) + 1; return counts; }, {})),
        reporterCount: new Set(rows.map((r) => r.reporterId)).size,
        waitingSince: Math.min(...rows.map((r) => r.createdAt), ...(heldPhoto ? [asset!.createdAt] : [])),
      });
    }
    return { items: items.sort((a, b) => a.priority - b.priority || a.waitingSince - b.waitingSince || a.key.localeCompare(b.key)), conflicts, isCsa: ctx.viewer.isCsa, now: Date.now() };
  },
});

export const review = viewerQuery({
  args: { targetType, targetId: v.string(), showPhoto: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    requireModerator(ctx);
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target || target.purgeAt !== undefined && target.purgeAt <= Date.now() || await exclusion(ctx, args.targetType, args.targetId, target.authorId)) return null;
    const author = await ctx.db.get(target.authorId);
    const incident = args.targetType === "incident" ? target.row as Doc<"incidents"> : null;
    const updates = incident ? await ctx.db.query("incidentUpdates").withIndex("by_incident", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("incidentId", incident._id)).take(100) : [];
    const photo = incident?.photoAssetId ? await ctx.db.get(incident.photoAssetId) : null;
    const photoValid = photo?.workspaceKey === ctx.viewer.workspaceKey && photo.reviewStatus === "held" && (photo.holdExpiresAt ?? 0) > Date.now();
    return { text: target.text, status: target.status, authorHandle: author?.handle ?? "removed", authorId: target.authorId,
      campus: incident?.campus, category: incident?.category,
      building: incident ? INCIDENT_PLACES.find((p) => p.id === incident.buildingId)?.name ?? "Building unavailable" : undefined,
      areaDetail: incident?.areaDetail, observedAt: incident?.observedAt, publishedAt: incident?.publishedAt, lockedAt: incident?.lockedAt,
      authorLabel: incident?.nameLevel === "hidden" ? "Student · name hidden" : `@${author?.handle ?? "removed"}`,
      updates: updates.filter((u) => u.purgeAt > Date.now()).map((u) => ({ id: u._id, kind: u.kind, text: u.kind === "author_update" ? u.text : INCIDENT_NOTES[u.templateId ?? ""], createdAt: u.createdAt,
        href: u.alertId ? `/safety/alerts/${u.alertId}` : u.duplicateIncidentId ? `/safety/${u.duplicateIncidentId}` : undefined })),
      photo: photoValid ? { expiresAt: photo!.holdExpiresAt!, url: args.showPhoto ? photo!.url : undefined } : null,
    };
  },
});

export const noteLinks = viewerQuery({ args: {}, handler: async (ctx) => {
  requireModerator(ctx);
  if (ctx.viewer.isCsa) return { alerts: [], incidents: [] };
  const workspaces = ctx.viewer.mode === "demo" ? [ctx.viewer.workspaceKey] : ["ksu"];
  const alerts = (await Promise.all(workspaces.map((ws) => ctx.db.query("alertItems").withIndex("by_observed", (q) => q.eq("workspaceKey", ws)).order("desc").take(50)))).flat();
  const incidents = (await Promise.all((["Kennesaw", "Marietta"] as const).map((campus) => ctx.db.query("incidents").withIndex("by_campus_visibility_published", (q) =>
    q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("campus", campus).eq("visibility", "visible").gte("publishedAt", Date.now() - 7 * DAY)).take(50)))).flat();
  const listedAlerts = [];
  for (const alert of alerts) if (await linkableAlert(ctx, alert)) listedAlerts.push({ id: alert._id, title: alert.headline });
  return { alerts: listedAlerts,
    incidents: incidents.filter((i) => i.purgeAt > Date.now()).map((i) => ({ id: i._id, title: `${i.campus} · ${INCIDENT_PLACES.find((p) => p.id === i.buildingId)?.name ?? "Incident"}` })) };
} });

async function linkableAlert(ctx: ReviewCtx, alert: Doc<"alertItems">) {
  const workspace = ctx.viewer.mode === "demo" ? ctx.viewer.workspaceKey : "ksu";
  if (alert.workspaceKey !== workspace || alert.state === "no_longer_listed" || alert.purgeAt <= Date.now()) return false;
  const source = await ctx.db.get(alert.sourceId);
  if (!source || source.workspaceKey !== workspace || ctx.viewer.mode !== "demo" && !sourceInfo(source.sourceKey)) return false;
  const display = presentSource(source, Date.now(), ctx.viewer.mode === "demo").display;
  return display === "ok" || display === "stale";
}

async function addNote(ctx: Ctx, incident: Doc<"incidents">, templateId: string, alertId?: Id<"alertItems">, duplicateIncidentId?: Id<"incidents">) {
  const alert = alertId ? await ctx.db.get(alertId) : null;
  return ctx.db.insert("incidentUpdates", { workspaceKey: ctx.viewer.workspaceKey, incidentId: incident._id, kind: "moderator_note",
    templateId, alertId, officialUrl: alert?.officialUrl, duplicateIncidentId, createdAt: Date.now(), purgeAt: incident.purgeAt });
}

export const act = moderatorMutation({
  args: { targetType, targetId: v.string(), requestId: v.string(), action: v.union(v.literal("restore"), v.literal("dismiss"), v.literal("remove"), v.literal("redact"), v.literal("note"), v.literal("suspend")),
    reasonId: v.optional(v.string()), words: v.optional(v.string()), templateId: v.optional(v.string()), addInaccurateNote: v.optional(v.boolean()),
    alertId: v.optional(v.id("alertItems")), duplicateIncidentId: v.optional(v.id("incidents")) },
  handler: async (ctx, args) => {
    if (!args.requestId || args.requestId.length > 100) moderationError("A decision request identifier is required.");
    const requestId = await sha256Hex(args.requestId);
    const previous = await ctx.db.query("moderatorActions").withIndex("by_request", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("actorId", ctx.viewer.actorStudent._id).eq("requestId", requestId)).unique();
    if (previous) return { actionId: previous._id };
    const target = await assertReviewable(ctx, args.targetType, args.targetId);
    if (["removed", "deleted", "deleted_tombstone"].includes(target.status)) moderationError("This item is no longer pending review. Refresh the queue.");
    const reports = (await targetReports(ctx, args.targetType, args.targetId)).filter(pending);
    const incident = args.targetType === "incident" ? target.row as Doc<"incidents"> : null;
    const photo = incident?.photoAssetId ? await ctx.db.get(incident.photoAssetId) : null;
    let redactionNoteId: Id<"incidentUpdates"> | undefined;
    if (!reports.length && !(photo?.reviewStatus === "held" && (photo.holdExpiresAt ?? 0) > Date.now())) moderationError("This item has already left the queue.");
    if (args.action === "remove" && !Object.hasOwn(INCIDENT_REMOVE_REASONS, args.reasonId ?? "")) moderationError("Choose a removal reason the author will see.");
    if (["redact", "note"].includes(args.action) && !incident) moderationError("Only Incidents support Redaction and template notes.");
    if (args.action === "restore" && target.status !== "under_review") moderationError("Only an Under-review item can be restored.");
    if (args.action === "dismiss" && target.status === "under_review") moderationError("Restore an Under-review item instead.");
    if (args.addInaccurateNote && (args.action !== "restore" || !reports.some((r) => r.reason === "false_misleading"))) moderationError("The optional inaccurate note applies to restoring false-or-misleading reports.");
    if (args.action === "redact" && (!args.words?.trim() || !target.text.includes(args.words))) moderationError("Enter exact words present in the original.");
    if (args.action === "note") {
      if (!["inaccurate", "official_notice", "duplicate"].includes(args.templateId ?? "")) moderationError("Choose a fixed note template.");
      if (args.templateId === "official_notice") {
        const alert = args.alertId ? await ctx.db.get(args.alertId) : null;
        if (!alert || !await linkableAlert(ctx, alert)) moderationError("Choose a listed Official Alert.");
      }
      if (args.templateId === "duplicate") {
        const duplicate = args.duplicateIncidentId ? await ctx.db.get(args.duplicateIncidentId) : null;
        if (!duplicate || duplicate._id === incident!._id || duplicate.workspaceKey !== ctx.viewer.workspaceKey || duplicate.visibility !== "visible" || duplicate.purgeAt <= Date.now() || duplicate.publishedAt < Date.now() - 7 * DAY) moderationError("Choose another visible Incident.");
      }
    }
    if (args.action === "suspend") {
      if (!ctx.viewer.isMaintainer) moderationError("Suspending accounts is maintainer-only.");
      // A suspension covers all authored Incidents, so a CSA or involved Moderator must never use a Post as a bypass.
      if (ctx.viewer.isCsa) moderationError("CSA Moderators cannot suspend an author whose Incidents require review.");
      for await (const row of ctx.db.query("incidents").withIndex("by_author", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("authorId", target.authorId))) {
        if (await exclusion(ctx, "incident", String(row._id), row.authorId)) moderationError("An Incident involving you needs another maintainer.");
      }
      await ctx.db.patch(target.authorId, { accountStatus: "suspended" });
      await closeStudentArtifactsAndMedia(ctx, ctx.viewer.workspaceKey, target.authorId, false, true);
      await cleanupV2Student(ctx, ctx.viewer.workspaceKey, target.authorId, false);
    } else if (incident) {
      if (args.action === "redact") {
        await ctx.db.patch(incident._id, { text: incident.text.split(args.words!).join("[removed by moderators]"), visibility: "visible", lastActivityAt: Date.now() });
        redactionNoteId = await addNote(ctx, incident, "redaction");
      } else if (args.action === "note") await addNote(ctx, incident, args.templateId!, args.templateId === "official_notice" ? args.alertId : undefined, args.templateId === "duplicate" ? args.duplicateIncidentId : undefined);
      else if (args.action === "remove") {
        const purgeAt = Date.now() + 30 * DAY;
        await ctx.db.patch(incident._id, { visibility: "removed", purgeAt });
        for await (const update of ctx.db.query("incidentUpdates").withIndex("by_incident", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("incidentId", incident._id))) await ctx.db.patch(update._id, { purgeAt });
      } else if (args.action === "restore") {
        await ctx.db.patch(incident._id, { visibility: "visible" });
        if (args.addInaccurateNote) await addNote(ctx, incident, "inaccurate");
      }
    } else if (args.action !== "dismiss") await applyLegacyDecision(ctx, { targetType: args.targetType as "post", targetId: args.targetId, decision: args.action as "remove" | "restore", reasonId: args.reasonId }, false);
    const actionId = await writeAction(ctx, { action: args.action, targetType: args.action === "suspend" ? "student" : args.targetType,
      targetKey: args.action === "suspend" ? String(target.authorId) : args.targetId, subjectId: target.authorId, requestId,
      caseTargetType: args.action === "suspend" ? args.targetType : undefined, caseTargetKey: args.action === "suspend" ? args.targetId : undefined,
      reasonId: args.action === "remove" ? args.reasonId : undefined,
      templateId: args.action === "redact" ? "redaction" : args.addInaccurateNote ? "inaccurate" : args.action === "note" ? args.templateId : undefined,
      contentSnapshot: JSON.stringify({ text: target.text, status: target.status, redactionNoteId }) });
    if (args.action !== "note") await closeReports(ctx, args.targetType, args.targetId, args.action === "remove" || args.action === "suspend" ? "removed" : args.action === "dismiss" ? "dismissed" : "restored", actionId);
    if (args.action !== "dismiss") await notice(ctx, target.authorId, actionId,
      args.action === "remove" ? `Removed: ${INCIDENT_REMOVE_REASONS[args.reasonId!]}` : args.action === "suspend" ? "Your account was suspended. You can submit one Appeal from this notice." : args.action === "redact" ? "Identifying details removed" : args.action === "note" ? INCIDENT_NOTES[args.templateId!]! : "Incident restored.",
      ["remove", "redact", "suspend"].includes(args.action));
    return { actionId };
  },
});

export const actionLog = viewerQuery({ args: {}, handler: async (ctx) => {
  requireModerator(ctx);
  const rows = await ctx.db.query("moderatorActions").withIndex("by_created", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey)).order("desc").take(200);
  const items = [];
  for (const row of rows) {
    if (row.purgeAt <= Date.now() || ctx.viewer.isCsa && row.targetType === "incident") continue;
    // The log contains metadata only. Content snapshots are disclosed solely in a guarded Appeal.
    items.push({ id: row._id, action: row.action, targetType: row.targetType, targetKey: row.targetKey, createdAt: row.createdAt,
      moderator: (await ctx.db.get(row.actorId))?.handle ?? "removed", reason: INCIDENT_REMOVE_REASONS[row.reasonId ?? ""] ?? INCIDENT_NOTES[row.templateId ?? ""],
      snapshotUntil: row.contentSnapshot && (row.snapshotPurgeAt ?? 0) > Date.now() ? row.snapshotPurgeAt : undefined });
  }
  return items;
} });

export const myNotices = viewerQuery({ args: {}, allowSuspended: true, handler: async (ctx) => {
  const rows = await ctx.db.query("moderationNotices").withIndex("by_student", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("studentId", ctx.viewer.actorStudent._id)).order("desc").take(100);
  return Promise.all(rows.filter((r) => r.purgeAt > Date.now()).map(async (row) => {
    const decision = await ctx.db.get(row.actionId);
    const appeal = await ctx.db.query("appeals").withIndex("by_decision", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("decisionActionId", row.actionId)).unique();
    return { ...row, targetType: decision?.targetType, targetKey: decision?.targetKey,
      canAppeal: row.canAppeal && Boolean(decision && (decision.snapshotPurgeAt ?? 0) > Date.now()) && !appeal,
      appealStatus: appeal?.status };
  }));
} });

export const submitAppeal = viewerMutation({
  allowSuspended: true, args: { decisionActionId: v.id("moderatorActions"), text: v.string() }, handler: async (ctx, args) => {
    const decision = await ctx.db.get(args.decisionActionId);
    if (!decision || decision.workspaceKey !== ctx.viewer.workspaceKey || decision.subjectId !== ctx.viewer.actorStudent._id || !["remove", "redact", "suspend"].includes(decision.action) || (decision.snapshotPurgeAt ?? 0) <= Date.now()) moderationError("This decision is not available for an Appeal.");
    const text = args.text.trim();
    if (!text || text.length > 1000) moderationError("Use 1–1000 characters for your Appeal.");
    if (await ctx.db.query("appeals").withIndex("by_decision", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("decisionActionId", decision._id)).unique()) moderationError("Only one Appeal per decision.");
    return ctx.db.insert("appeals", { workspaceKey: ctx.viewer.workspaceKey, decisionActionId: decision._id, appellantId: ctx.viewer.actorStudent._id, status: "open", text,
      createdAt: Date.now(), purgeAt: decision.snapshotPurgeAt! });
  },
});

export const appeals = viewerQuery({ args: {}, handler: async (ctx) => {
  requireModerator(ctx);
  const rows = (await Promise.all((["open", "upheld", "overturned"] as const).map((status) => ctx.db.query("appeals").withIndex("by_status", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("status", status)).take(100)))).flat();
  let csaExcluded = 0, conflicts = 0;
  const items = [];
  for (const row of rows.sort((a, b) => a.createdAt - b.createdAt)) {
    if (row.purgeAt <= Date.now()) continue;
    const decision = await ctx.db.get(row.decisionActionId);
    if (!decision || decision.workspaceKey !== ctx.viewer.workspaceKey) continue;
    if (ctx.viewer.isCsa && (decision.targetType === "incident" || decision.action === "suspend")) { csaExcluded++; continue; }
    const involved = row.appellantId === ctx.viewer.actorStudent._id || decision.actorId === ctx.viewer.actorStudent._id ||
      await appealConflict(ctx, decision, row.appellantId);
    if (involved) { conflicts++; continue; }
    items.push({ id: row._id, status: row.status, createdAt: row.createdAt, text: row.text, decisionId: decision._id,
      action: decision.action, targetType: decision.targetType, targetKey: decision.targetKey, reason: INCIDENT_REMOVE_REASONS[decision.reasonId ?? ""],
      moderator: (await ctx.db.get(decision.actorId))?.handle ?? "removed", decidedAt: decision.createdAt, maintainerOnly: decision.action === "suspend" });
  }
  return { items, csaExcluded, conflicts };
} });

export const appealSnapshot = viewerQuery({ args: { appealId: v.id("appeals") }, handler: async (ctx, args) => {
  const { decision } = await reviewableAppeal(ctx, args.appealId);
  return (decision.snapshotPurgeAt ?? 0) > Date.now() ? decision.contentSnapshot : undefined;
} });

async function reviewableAppeal(ctx: Parameters<typeof requireModerator>[0], id: Id<"appeals">) {
  requireModerator(ctx);
  const appeal = await ctx.db.get(id);
  const decision = appeal ? await ctx.db.get(appeal.decisionActionId) : null;
  if (!appeal || !decision || appeal.workspaceKey !== ctx.viewer.workspaceKey || decision.workspaceKey !== ctx.viewer.workspaceKey || appeal.purgeAt <= Date.now()) moderationError("Appeal no longer available.");
  if (appeal.appellantId === ctx.viewer.actorStudent._id || decision.actorId === ctx.viewer.actorStudent._id ||
    ctx.viewer.isCsa && (decision.targetType === "incident" || decision.action === "suspend") ||
    await appealConflict(ctx, decision, appeal.appellantId)) moderationError("A different Moderator without a conflict reviews this Appeal.");
  if (decision.action === "suspend" && !ctx.viewer.isMaintainer) moderationError("Only a different maintainer can review a suspension Appeal.");
  return { appeal, decision };
}

async function appealConflict(ctx: ReviewCtx, decision: Doc<"moderatorActions">, authorId: Id<"students">) {
  if (await exclusion(ctx, decision.caseTargetType ?? decision.targetType, decision.caseTargetKey ?? decision.targetKey, authorId)) return true;
  if (decision.action === "suspend") {
    for await (const incident of ctx.db.query("incidents").withIndex("by_author", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("authorId", authorId))) {
      if (await exclusion(ctx, "incident", String(incident._id), authorId)) return true;
    }
  }
  return false;
}

export const decideAppeal = moderatorMutation({ args: { appealId: v.id("appeals"), reverse: v.boolean() }, handler: async (ctx, args) => {
  const { appeal, decision } = await reviewableAppeal(ctx, args.appealId);
  if (appeal.status !== "open") moderationError("This Appeal is final and has already been reviewed.");
  const target = await loadTarget(ctx, decision.targetType, decision.targetKey);
  if (args.reverse) {
    if (!target || target.status === "deleted" || target.purgeAt !== undefined && target.purgeAt <= Date.now()) moderationError("The original item is no longer available.");
    const later = await ctx.db.query("moderatorActions").withIndex("by_target", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("targetType", decision.targetType).eq("targetKey", decision.targetKey)).order("desc").first();
    if (later?._id !== decision._id) moderationError("A newer decision exists. A maintainer must review the current item.");
    if (decision.action === "suspend") await ctx.db.patch(appeal.appellantId, { accountStatus: "active" });
    else if (decision.targetType === "incident") {
      const incident = target.row as Doc<"incidents">;
      if (decision.action === "redact") {
        if (!decision.contentSnapshot || (decision.snapshotPurgeAt ?? 0) <= Date.now()) moderationError("The content snapshot has expired.");
        const snapshot = JSON.parse(decision.contentSnapshot) as { text: string; redactionNoteId?: Id<"incidentUpdates"> };
        await ctx.db.patch(incident._id, { text: snapshot.text, visibility: "visible" });
        if (snapshot.redactionNoteId) {
          const note = await ctx.db.get(snapshot.redactionNoteId);
          if (note?.workspaceKey === ctx.viewer.workspaceKey && note.incidentId === incident._id && note.templateId === "redaction") await ctx.db.delete(note._id);
        }
      } else await ctx.db.patch(incident._id, { visibility: "visible" });
    } else await applyLegacyDecision(ctx, { targetType: decision.targetType as "post", targetId: decision.targetKey, decision: "restore" }, false);
  }
  await ctx.db.patch(appeal._id, { status: args.reverse ? "overturned" : "upheld", reviewerId: ctx.viewer.actorStudent._id });
  const actionId = await writeAction(ctx, { action: args.reverse ? "appeal_reversed" : "appeal_upheld", targetType: decision.targetType, targetKey: decision.targetKey, subjectId: appeal.appellantId,
    contentSnapshot: target && target.status !== "deleted" && (target.purgeAt ?? Infinity) > Date.now() ? target.text : undefined });
  await notice(ctx, appeal.appellantId, actionId, args.reverse ? "Decision reversed. Your Appeal is final." : "Decision upheld. Your Appeal is final.");
  return { actionId };
} });

export const roster = viewerQuery({ args: {}, handler: async (ctx) => {
  if (!ctx.viewer.isMaintainer || ctx.viewer.mode !== "student") return [];
  const rows = await ctx.db.query("moderators").withIndex("by_revoked", (q) => q.eq("workspaceKey", "prod").eq("revokedAt", undefined)).take(100);
  return Promise.all(rows.map(async (r) => ({ ...r, handle: (await ctx.db.get(r.studentId))?.handle ?? "removed" })));
} });

export const appoint = moderatorMutation({ args: { handle: v.string(), csaStatement: v.string(), csaStatus: v.union(v.literal("not_csa"), v.literal("csa")) }, handler: async (ctx, args) => {
  if (!ctx.viewer.isMaintainer || ctx.viewer.mode !== "student") moderationError("Only production maintainers appoint Moderators.");
  const student = await ctx.db.query("students").withIndex("by_workspace_handle", (q) => q.eq("workspaceKey", "prod").eq("handleLower", args.handle.trim().replace(/^@/, "").toLowerCase())).unique();
  if (!student || student.accountStatus !== "active" || student.emailDomainBadge !== "verified_student" || !student.canonicalEmail?.endsWith("@students.kennesaw.edu")) moderationError("Appoint an active, verified @students.kennesaw.edu Student.");
  const csaStatement = args.csaStatement.trim();
  if (csaStatement.length < 20 || csaStatement.length > 1000) moderationError("Record the Student’s plain-text CSA statement (20–1000 characters).");
  const existing = await ctx.db.query("moderators").withIndex("by_student", (q) => q.eq("workspaceKey", "prod").eq("studentId", student._id)).unique();
  const values = { appointedById: ctx.viewer.actorStudent._id, appointedAt: Date.now(), csaStatement, isCsa: args.csaStatus === "csa", revokedAt: undefined, purgeAt: undefined };
  if (existing) await ctx.db.patch(existing._id, values);
  else await ctx.db.insert("moderators", { workspaceKey: "prod", studentId: student._id, ...values });
  await writeAction(ctx, { action: "moderator_appoint", targetType: "student", targetKey: String(student._id) });
} });

export const revoke = moderatorMutation({ args: { studentId: v.id("students") }, handler: async (ctx, args) => {
  if (!ctx.viewer.isMaintainer || ctx.viewer.mode !== "student") moderationError("Only production maintainers revoke Moderators.");
  const row = await ctx.db.query("moderators").withIndex("by_student", (q) => q.eq("workspaceKey", "prod").eq("studentId", args.studentId)).unique();
  if (!row || row.revokedAt !== undefined) moderationError("Active appointment not found.");
  const student = await ctx.db.get(row.studentId);
  // Revoking a roster appointment must not erase a maintainer's CSA guard.
  const retainCsa = row.isCsa && Boolean(student?.canonicalEmail && parseMaintainerEmails(process.env.KSUX_MAINTAINER_EMAILS).has(student.canonicalEmail));
  await ctx.db.patch(row._id, { revokedAt: Date.now(), purgeAt: retainCsa ? undefined : Date.now() + 30 * DAY });
  await writeAction(ctx, { action: "moderator_revoke", targetType: "student", targetKey: String(args.studentId) });
} });
