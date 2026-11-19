import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DAY } from "./incidentPolicy";
import { queueMediaDeletion } from "./mediaCleanup";

export const PHOTO_HOLD_MS = 2 * DAY;
export const DEMO_INCIDENT_PHOTO = "/fixtures/incident-photo.svg";
export const DEMO_INCIDENT_PHOTO_BLURRED = "/fixtures/incident-photo-blurred.svg";

export function heldPhoto(asset: Doc<"mediaAssets"> | null, workspaceKey: string, now = Date.now()) {
  return asset?.workspaceKey === workspaceKey && asset.purpose === "incident" && asset.status === "attached" &&
    asset.deleteClaimedAt === undefined && asset.reviewStatus === "held" && (asset.holdExpiresAt ?? 0) > now;
}

/** Detach and notify atomically, before storage cleanup; retries cannot duplicate a notice. */
export async function discardIncidentPhoto(ctx: MutationCtx, asset: Doc<"mediaAssets">, now: number) {
  if (asset.reviewStatus !== "held" || (asset.holdExpiresAt ?? Infinity) > now) return;
  await queueMediaDeletion(ctx, asset);
  await ctx.db.patch(asset._id, { reviewStatus: "rejected", url: "" });
  const incident = await ctx.db.query("incidents").withIndex("by_photo", (q) =>
    q.eq("workspaceKey", asset.workspaceKey).eq("photoAssetId", asset._id)).first();
  if (!incident) return;
  await ctx.db.patch(incident._id, { photoAssetId: undefined });
  if (incident.visibility === "deleted" || incident.purgeAt <= now) return;
  const actionId = await ctx.db.insert("moderatorActions", {
    workspaceKey: asset.workspaceKey, action: "photo_discard", targetType: "incident", targetKey: String(incident._id),
    subjectId: incident.authorId, createdAt: now, purgeAt: now + 365 * DAY,
  });
  await ctx.db.insert("moderationNotices", { workspaceKey: asset.workspaceKey, studentId: incident.authorId, actionId,
    message: "Your Incident photo was discarded because nobody reviewed it within 48 hours. Your Incident text is unchanged.",
    canAppeal: false, createdAt: now, purgeAt: now + 30 * DAY });
}
