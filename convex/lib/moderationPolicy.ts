import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ViewerContext } from "./viewer";
import { DAY } from "./incidentPolicy";

export type ReviewCtx = (QueryCtx | MutationCtx) & { viewer: ViewerContext };
export function moderationError(message: string): never { throw new ConvexError({ code: "MODERATION", message }); }
export function requireModerator(ctx: ReviewCtx) {
  if (!ctx.viewer.isModerator) moderationError("Moderator access is required.");
}
export async function loadTarget(ctx: ReviewCtx, targetType: string, targetId: string) {
  const tables = { incident: "incidents", post: "posts", listing: "listings", study_session: "studySessions", student: "students", chat_message: "chatMessages" } as const;
  const table = tables[targetType as keyof typeof tables];
  if (!table) return null;
  const id = ctx.db.normalizeId(table, targetId);
  const row = id ? await ctx.db.get(id) : null;
  if (!row || row.workspaceKey !== ctx.viewer.workspaceKey) return null;
  // A narrow projection prevents private Student/chat data from entering the console.
  const data = row as unknown as Record<string, any>;
  const authorId = (data.authorId ?? data.sellerId ?? data.hostId ?? data.senderId ?? (targetType === "student" ? row._id : undefined)) as Id<"students">;
  return { row, authorId, text: String(data.text ?? data.body ?? data.description ?? data.title ?? data.displayName ?? ""),
    status: String(data.visibility ?? data.visibilityStatus ?? data.accountStatus ?? "visible"),
    purgeAt: data.purgeAt as number | undefined };
}
export async function targetReports(ctx: ReviewCtx, targetType: string, targetId: string) {
  return ctx.db.query("moderationReports").withIndex("by_target", (q) => q.eq("workspaceKey", ctx.viewer.workspaceKey)
    .eq("targetKey", `${targetType}:${targetId}`)).collect();
}
export async function exclusion(ctx: ReviewCtx, targetType: string, targetId: string, authorId: Id<"students">) {
  if (targetType === "incident" && ctx.viewer.isCsa) return "csa";
  if (authorId === ctx.viewer.actorStudent._id) return "conflict";
  const reports = await targetReports(ctx, targetType, targetId);
  return reports.some((r) => r.reporterId === ctx.viewer.actorStudent._id) ? "conflict" : null;
}
export async function assertReviewable(ctx: ReviewCtx, targetType: string, targetId: string) {
  requireModerator(ctx);
  const target = await loadTarget(ctx, targetType, targetId);
  if (!target || (target.purgeAt !== undefined && target.purgeAt <= Date.now())) moderationError("Item no longer available.");
  const why = await exclusion(ctx, targetType, targetId, target.authorId);
  if (why) moderationError(why === "csa" ? "CSA Moderators cannot access Incident items." : "This item involves you. Another Moderator handles it.");
  return target;
}
export async function writeAction(ctx: MutationCtx & { viewer: ViewerContext }, input: {
  action: string; targetType: string; targetKey: string; subjectId?: Id<"students">;
  contentSnapshot?: string; reasonId?: string; templateId?: string; requestId?: string;
  caseTargetType?: string; caseTargetKey?: string;
}) {
  const now = Date.now();
  return ctx.db.insert("moderatorActions", { ...input, workspaceKey: ctx.viewer.workspaceKey, actorId: ctx.viewer.actorStudent._id,
    createdAt: now, purgeAt: now + 365 * DAY, snapshotPurgeAt: input.contentSnapshot === undefined ? undefined : now + 30 * DAY });
}
export async function notice(ctx: MutationCtx & { viewer: ViewerContext }, studentId: Id<"students">, actionId: Id<"moderatorActions">, message: string, canAppeal = false) {
  await ctx.db.insert("moderationNotices", { workspaceKey: ctx.viewer.workspaceKey, studentId, actionId, message, canAppeal,
    createdAt: Date.now(), purgeAt: Date.now() + 30 * DAY });
}
export async function closeReports(ctx: MutationCtx & { viewer: ViewerContext }, targetType: string, targetId: string, status: Doc<"moderationReports">["queueStatus"], actionId: Id<"moderatorActions">) {
  for (const report of await targetReports(ctx, targetType, targetId)) {
    if (!["open", "quarantined"].includes(report.queueStatus)) continue;
    await ctx.db.patch(report._id, { queueStatus: status, reviewedById: ctx.viewer.actorStudent._id });
    if (report.reason === "identifies_me" && status === "restored") await notice(ctx, report.reporterId, actionId, "The Incident you claimed identifies you was restored after review.");
  }
}

/** A suspended Student can reauthenticate only to read notices and exercise the
 * time-limited Appeal. Ordinary viewer functions still reject the account. */
export async function hasSuspensionAppealAccess(ctx: QueryCtx | MutationCtx, studentId: Id<"students">, now: number) {
  const rows = await ctx.db.query("moderationNotices").withIndex("by_student", (q) =>
    q.eq("workspaceKey", "prod").eq("studentId", studentId)).order("desc").take(100);
  for (const row of rows) {
    if (!row.canAppeal || row.purgeAt <= now) continue;
    const action = await ctx.db.get(row.actionId);
    if (action?.action === "suspend" && action.subjectId === studentId && (action.snapshotPurgeAt ?? 0) > now) return true;
  }
  return false;
}
