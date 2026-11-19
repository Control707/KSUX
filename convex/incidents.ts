import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { viewerMutation, viewerQuery, type ViewerContext } from "./lib/viewer";
import { getIncidentLaunchGate } from "./lib/v2Launch";
import { assertPublishSafety } from "./lib/safety";
import { DAY, HOUR, INCIDENT_NOTES, INCIDENT_PLACES, INCIDENT_REMOVE_REASONS, incidentAge, incidentTextError } from "./lib/incidentPolicy";
import { queueMediaDeletion } from "./lib/mediaCleanup";
import { DEMO_INCIDENT_PHOTO, DEMO_INCIDENT_PHOTO_BLURRED, PHOTO_HOLD_MS, discardIncidentPhoto, heldPhoto } from "./lib/incidentPhotos";
import { requireServerSecret } from "./lib/sessionCredential";
import { assertReviewable } from "./lib/moderationPolicy";

const category = v.union(v.literal("fire"), v.literal("hazard"), v.literal("crash"), v.literal("theft"), v.literal("damage"), v.literal("outage"), v.literal("area_closed"), v.literal("other"));
const campus = v.union(v.literal("Kennesaw"), v.literal("Marietta"));
const nameLevel = v.union(v.literal("show_handle"), v.literal("hidden"));
const reason = v.union(v.literal("identifies_me"), v.literal("identifies_person"), v.literal("false_misleading"), v.literal("harassment"), v.literal("campus_safety"), v.literal("scam_spam"));
function fail(code: string, message: string): never { throw new ConvexError({ code, message }); }
function verified(viewer: ViewerContext) {
  if (viewer.mode !== "demo" && !viewer.actorStudent.canonicalEmail) fail("FORBIDDEN", "Only verified Students can contribute Incidents.");
}
function checkText(text: string, max = 280) {
  const error = incidentTextError(text, max);
  if (error) fail("INCIDENT_TEXT", error);
  assertPublishSafety(text);
  return text.normalize("NFKC").trim();
}
async function scoped(ctx: QueryCtx | MutationCtx, viewer: ViewerContext, id: Id<"incidents">) {
  const row = await ctx.db.get(id);
  if (!row || row.workspaceKey !== viewer.workspaceKey || row.purgeAt <= Date.now()) return null;
  return row;
}
async function owned(ctx: MutationCtx, viewer: ViewerContext, id: Id<"incidents">) {
  const row = await scoped(ctx, viewer, id);
  if (!row || row.authorId !== viewer.actorStudent._id) return fail("NOT_FOUND", "Incident no longer available.");
  return row;
}
async function projection(ctx: QueryCtx, viewer: ViewerContext, row: Doc<"incidents">) {
  const author = await ctx.db.get(row.authorId);
  // Existing 24-hour Demo sessions may still have the original fixture alias.
  const buildingId = row.buildingId === "atrium-building" ? "bldg-osm-225446898" : row.buildingId;
  const place = INCIDENT_PLACES.find((p) => p.id === buildingId && p.campus === row.campus);
  const updates = await ctx.db.query("incidentUpdates").withIndex("by_incident", (q) =>
    q.eq("workspaceKey", viewer.workspaceKey).eq("incidentId", row._id)).take(50);
  const asset = row.photoAssetId ? await ctx.db.get(row.photoAssetId) : null;
  const approved = asset?.workspaceKey === viewer.workspaceKey && asset.purpose === "incident" && asset.status === "attached" &&
    asset.deleteClaimedAt === undefined && asset.reviewStatus === "approved";
  return {
    _id: row._id, category: row.category, campus: row.campus, buildingId: row.buildingId,
    buildingName: place?.name ?? "Campus area", latitude: place?.latitude, longitude: place?.longitude,
    areaDetail: row.areaDetail, observedAt: row.observedAt, text: row.text,
    publishedAt: row.publishedAt, lockedAt: row.lockedAt, lastActivityAt: row.lastActivityAt,
    state: incidentAge(row.publishedAt, Date.now()), demoLabel: row.demoLabel,
    authorLabel: row.nameLevel === "show_handle" && !viewer.blockedStudentIds.has(row.authorId) && author?.accountStatus === "active"
      ? "@" + author.handle : "Student · name hidden",
    isAuthor: row.authorId === viewer.actorStudent._id,
    canEdit: row.authorId === viewer.actorStudent._id && Date.now() < row.lockedAt,
    updateCount: row.updateCount,
    photo: approved ? { blurred: !!asset.blurred } : null,
    updates: updates.filter((u) => u.purgeAt > Date.now()).map((u) => ({
      _id: u._id, kind: u.kind, createdAt: u.createdAt,
      text: u.kind === "author_update" ? u.text : INCIDENT_NOTES[u.templateId ?? ""] ?? "Moderator note",
      href: u.kind === "moderator_note" ? (u.alertId ? `/safety/alerts/${u.alertId}` : u.duplicateIncidentId ? `/safety/${u.duplicateIncidentId}` : u.officialUrl) : undefined,
    })),
  };
}

export const create = viewerMutation({
  args: { category, campus, buildingId: v.string(), areaDetail: v.optional(v.string()), observedAt: v.number(), text: v.string(), nameLevel,
    photoAssetId: v.optional(v.id("mediaAssets")), demoPhoto: v.optional(v.boolean()), blurPhoto: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    verified(ctx.viewer);
    const now = Date.now();
    const text = checkText(args.text);
    const areaDetail = args.areaDetail?.trim() ? checkText(args.areaDetail, 60) : undefined;
    if (!INCIDENT_PLACES.some((p) => p.id === args.buildingId && p.campus === args.campus)) fail("LOCATION", "Choose a listed building or area on that Campus.");
    if (!Number.isFinite(args.observedAt) || args.observedAt > now || args.observedAt < now - DAY) fail("TIME", "Choose an observed time within the last day.");
    // by_author's creation-time ordering gives bounded sliding windows, including
    // deleted Incidents. Deleting never resets the posting allowance.
    const recent = await ctx.db.query("incidents").withIndex("by_author", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("authorId", ctx.viewer.actorStudent._id)).order("desc").take(7);
    if (recent.filter((r) => r.publishedAt > now - HOUR).length >= 3 || recent.filter((r) => r.publishedAt > now - DAY).length >= 6)
      fail("RATE_LIMIT", "Limit reached: 3 Incidents per hour and 6 per day.");
    if (!(await getIncidentLaunchGate(ctx.db, ctx.viewer.mode)).postingEnabled) fail("LAUNCH_CLOSED", "Community Incident posting is unavailable.");
    let photoAssetId = args.photoAssetId;
    if (args.demoPhoto) {
      if (ctx.viewer.mode !== "demo" || photoAssetId) fail("PHOTO", "Static photo fixtures are only available in Judge Demo Mode.");
      photoAssetId = await ctx.db.insert("mediaAssets", { workspaceKey: ctx.viewer.workspaceKey, demoSessionId: ctx.viewer.demoSessionId,
        ownerStudentId: ctx.viewer.actorStudent._id, purpose: "incident", fileKey: `local-inline:incident-${now}-${Math.random()}`,
        url: DEMO_INCIDENT_PHOTO, byteSize: 0, width: 640, height: 400, status: "attached", createdAt: now,
        reviewStatus: "held", holdExpiresAt: now + PHOTO_HOLD_MS, blurred: !!args.blurPhoto });
    } else if (photoAssetId) {
      const asset = await ctx.db.get(photoAssetId);
      if (ctx.viewer.mode === "demo" || process.env.KSUX_V2_INCIDENT_PHOTOS !== "true" || !asset ||
        asset.workspaceKey !== ctx.viewer.workspaceKey || asset.ownerStudentId !== ctx.viewer.actorStudent._id ||
        asset.purpose !== "incident" || asset.status !== "pending" || asset.deleteClaimedAt !== undefined ||
        asset.reviewStatus !== "held" || (asset.holdExpiresAt ?? 0) <= now) fail("PHOTO", "This Incident photo is unavailable.");
      await ctx.db.patch(photoAssetId, { status: "attached" });
    }
    const incidentId = await ctx.db.insert("incidents", {
      category: args.category, campus: args.campus, buildingId: args.buildingId, observedAt: args.observedAt, nameLevel: args.nameLevel,
      text, areaDetail, photoAssetId, workspaceKey: ctx.viewer.workspaceKey, authorId: ctx.viewer.actorStudent._id,
      visibility: "visible", publishedAt: now, lockedAt: now + 5 * 60_000, lastActivityAt: now,
      updateCount: 0, purgeAt: now + 30 * DAY, demoLabel: ctx.viewer.mode === "demo" ? "Demo · not real" : undefined,
    });
    return { incidentId };
  },
});

export const photoAvailability = viewerQuery({ args: {}, handler: async (ctx) => ({
  enabled: ctx.viewer.mode === "demo" || process.env.KSUX_V2_INCIDENT_PHOTOS === "true" && (await getIncidentLaunchGate(ctx.db, ctx.viewer.mode)).postingEnabled,
}) });

/** Only the image proxy can obtain a private storage key. A Student, including the
 * author, cannot read held bytes. Moderator conflicts and CSA guards apply here too. */
export const photoAccess = viewerQuery({ args: { incidentId: v.id("incidents"), serverSecret: v.string(), review: v.boolean() }, handler: async (ctx, args) => {
  await requireServerSecret(args.serverSecret);
  const row = await scoped(ctx, ctx.viewer, args.incidentId);
  if (!row || !row.photoAssetId || ["removed", "deleted"].includes(row.visibility)) return null;
  const asset = await ctx.db.get(row.photoAssetId);
  if (!asset || asset.workspaceKey !== ctx.viewer.workspaceKey || asset.purpose !== "incident" || asset.status !== "attached" || asset.deleteClaimedAt !== undefined) return null;
  if (args.review) {
    await assertReviewable(ctx, "incident", row._id);
    if (!heldPhoto(asset, ctx.viewer.workspaceKey)) return null;
  } else if (row.visibility !== "visible" || incidentAge(row.publishedAt, Date.now()) === "unavailable" || asset.reviewStatus !== "approved") return null;
  return ctx.viewer.mode === "demo"
    ? { fixture: asset.blurred ? DEMO_INCIDENT_PHOTO_BLURRED : DEMO_INCIDENT_PHOTO }
    : { fileKey: asset.fileKey, blurred: !!asset.blurred };
} });

/** Isolated evaluation seam; cannot advance a production hold. */
export const discardDemoPhoto = viewerMutation({ args: { incidentId: v.id("incidents") }, handler: async (ctx, args) => {
  if (ctx.viewer.mode !== "demo") fail("FORBIDDEN", "Only available in Judge Demo Mode.");
  const row = await owned(ctx, ctx.viewer, args.incidentId);
  const asset = row.photoAssetId ? await ctx.db.get(row.photoAssetId) : null;
  if (heldPhoto(asset, ctx.viewer.workspaceKey)) {
    const now = Date.now();
    await ctx.db.patch(asset!._id, { holdExpiresAt: now });
    await discardIncidentPhoto(ctx, { ...asset!, holdExpiresAt: now }, now);
  }
} });

export const activeIncidents = viewerQuery({
  args: { campus },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("incidents").withIndex("by_campus_visibility_activity", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("campus", args.campus).eq("visibility", "visible")
        .gte("lastActivityAt", Date.now() - DAY)).order("desc")
      .filter((q) => q.gte(q.field("publishedAt"), Date.now() - DAY)).take(50);
    return Promise.all(rows.filter((r) => r.purgeAt > Date.now()).sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .map((r) => projection(ctx, ctx.viewer, r)));
  },
});
export const olderIncidents = viewerQuery({
  args: { campus, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const now = Date.now();
    const result = await ctx.db.query("incidents").withIndex("by_campus_visibility_activity", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("campus", args.campus).eq("visibility", "visible")
        .gte("lastActivityAt", now - 7 * DAY)).order("desc")
      .filter((q) => q.and(q.gte(q.field("publishedAt"), now - 7 * DAY), q.lt(q.field("publishedAt"), now - DAY)))
      .paginate({ ...args.paginationOpts, numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)) });
    return { ...result, page: await Promise.all(result.page.filter((r) => r.purgeAt > now)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt).map((r) => projection(ctx, ctx.viewer, r))) };
  },
});
export const incidentDetail = viewerQuery({
  args: { incidentId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("incidents", args.incidentId);
    const row = id ? await scoped(ctx, ctx.viewer, id) : null;
    if (!row) return { state: "unavailable" as const };
    if (row.visibility === "removed") {
      const actions = await ctx.db.query("moderatorActions").withIndex("by_target", (q) =>
        q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("targetType", "incident").eq("targetKey", String(row._id))).order("desc").take(20);
      const decision = actions.find((a) => a.action === "remove" && a.reasonId);
      const reason = decision?.reasonId ? INCIDENT_REMOVE_REASONS[decision.reasonId] : undefined;
      return { state: "removed" as const, ...(reason ? { reason } : {}) };
    }
    if (row.visibility !== "visible") return { state: row.visibility };
    if (incidentAge(row.publishedAt, Date.now()) === "unavailable") return { state: "unavailable" as const };
    return { state: "visible" as const, incident: await projection(ctx, ctx.viewer, row) };
  },
});
export const edit = viewerMutation({
  args: { incidentId: v.id("incidents"), text: v.string() },
  handler: async (ctx, args) => {
    const row = await owned(ctx, ctx.viewer, args.incidentId);
    if (row.visibility !== "visible" || Date.now() >= row.lockedAt) fail("LOCKED", "The original is locked. Add a dated Incident Update instead.");
    await ctx.db.patch(row._id, { text: checkText(args.text), lastActivityAt: Date.now() });
  },
});
export const addUpdate = viewerMutation({
  args: { incidentId: v.id("incidents"), text: v.string() },
  handler: async (ctx, args) => {
    verified(ctx.viewer);
    const row = await owned(ctx, ctx.viewer, args.incidentId);
    if (row.visibility !== "visible" || incidentAge(row.publishedAt, Date.now()) === "unavailable") fail("UNAVAILABLE", "Incident no longer available for updates.");
    if (row.updateCount >= 5) fail("UPDATE_LIMIT", "Limit reached: 5 Author Updates per Incident.");
    await ctx.db.insert("incidentUpdates", { workspaceKey: ctx.viewer.workspaceKey, incidentId: row._id,
      kind: "author_update", authorId: ctx.viewer.actorStudent._id, text: checkText(args.text), createdAt: Date.now(), purgeAt: row.purgeAt });
    await ctx.db.patch(row._id, { updateCount: row.updateCount + 1, lastActivityAt: Date.now() });
  },
});
export const deleteOwn = viewerMutation({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const row = await owned(ctx, ctx.viewer, args.incidentId);
    if (row.photoAssetId) {
      const asset = await ctx.db.get(row.photoAssetId);
      if (asset?.workspaceKey === ctx.viewer.workspaceKey) await queueMediaDeletion(ctx, asset);
    }
    for await (const update of ctx.db.query("incidentUpdates").withIndex("by_incident", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("incidentId", row._id))) await ctx.db.delete(update._id);
    await ctx.db.patch(row._id, { visibility: "deleted", text: "", buildingId: "", areaDetail: undefined, photoAssetId: undefined, observedAt: 0 });
  },
});

export const report = viewerMutation({
  args: { incidentId: v.id("incidents"), reason, emergencyPanelAcknowledged: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    verified(ctx.viewer);
    if (args.reason === "campus_safety" && !args.emergencyPanelAcknowledged) fail("EMERGENCY_PANEL", "Open the Emergency Panel before sending a Campus Safety Moderation Report.");
    const row = await scoped(ctx, ctx.viewer, args.incidentId);
    if (!row || !["visible", "under_review"].includes(row.visibility) || incidentAge(row.publishedAt, Date.now()) === "unavailable"
      || row.authorId === ctx.viewer.actorStudent._id) fail("NOT_FOUND", "Incident no longer available for reporting.");
    const targetKey = "incident:" + row._id;
    const reports = await ctx.db.query("moderationReports").withIndex("by_target", (q) =>
      q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("targetKey", targetKey))
      .filter((q) => q.or(q.eq(q.field("queueStatus"), "open"), q.eq(q.field("queueStatus"), "quarantined"))).collect();
    const pending = reports.filter((r) => r.queueStatus === "open" || r.queueStatus === "quarantined");
    if (pending.some((r) => r.reporterId === ctx.viewer.actorStudent._id)) return { quarantined: row.visibility === "under_review" };
    const now = Date.now();
    const myClaims = [];
    if (args.reason === "identifies_me") {
      for await (const claim of ctx.db.query("moderationReports").withIndex("by_reporter", (q) =>
        q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("reporterId", ctx.viewer.actorStudent._id)).order("desc")) {
        if (claim.createdAt <= now - 30 * DAY) break;
        if (claim.reason === "identifies_me") myClaims.push(claim);
      }
    }
    if (myClaims.filter((r) => r.reason === "identifies_me" && r.createdAt > now - DAY).length >= 3)
      fail("CLAIM_LIMIT", "Limit reached: 3 identifies-me claims per day.");
    const rejected = myClaims.filter((r) => r.reason === "identifies_me" && r.createdAt > now - 30 * DAY &&
      ["restored", "dismissed"].includes(r.queueStatus)).length;
    await ctx.db.insert("moderationReports", { workspaceKey: ctx.viewer.workspaceKey, reporterId: ctx.viewer.actorStudent._id,
      targetType: "incident", targetKey, reason: args.reason, priority: args.reason === "identifies_me" ? 0 : 2,
      queueStatus: row.visibility === "under_review" ? "quarantined" : "open", createdAt: now });
    const valid = new Map<Id<"students">, string>();
    for (const r of pending) {
      const student = await ctx.db.get(r.reporterId);
      if (student?.workspaceKey === ctx.viewer.workspaceKey && student.accountStatus === "active" &&
        (ctx.viewer.mode === "demo" || student.canonicalEmail)) valid.set(r.reporterId, r.reason);
    }
    valid.set(ctx.viewer.actorStudent._id, args.reason);
    const sensitive = [...valid.values()].filter((r) => ["identifies_me", "identifies_person", "false_misleading"].includes(r)).length;
    const quarantined = (args.reason === "identifies_me" && rejected < 3) || sensitive >= 2 || valid.size >= 3 || row.visibility === "under_review";
    if (quarantined) {
      await ctx.db.patch(row._id, { visibility: "under_review" });
      for (const r of pending) await ctx.db.patch(r._id, { queueStatus: "quarantined" });
      // Also mark the just-created row, without leaving it in a lower-priority state.
      const latest = await ctx.db.query("moderationReports").withIndex("by_target", (q) =>
        q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("targetKey", targetKey)).collect();
      for (const r of latest) if (r.queueStatus === "open") await ctx.db.patch(r._id, { queueStatus: "quarantined" });
    }
    return { quarantined };
  },
});
