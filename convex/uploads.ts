import { ConvexError, v } from "convex/values";
import { publicAuthMutation, viewerMutation } from "./lib/viewer";
import { requireServerSecret } from "./lib/sessionCredential";

const MAX_UPLOAD_BYTES = 1_048_576;
const MAX_DIMENSION_PX = 1440;
const MAX_DEMO_UPLOADS = 20;
const RESERVATION_TTL_MS = 15 * 60_000;
const purpose = v.union(v.literal("avatar"), v.literal("post"), v.literal("listing"), v.literal("chat"));
const metadata = { purpose, byteSize: v.number(), width: v.number(), height: v.number() };

export const reserveUpload = viewerMutation({
  args: { ...metadata, serverSecret: v.string() },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    if (!Number.isSafeInteger(args.byteSize) || args.byteSize <= 0 || args.byteSize > MAX_UPLOAD_BYTES) {
      throw new ConvexError({ code: "PAYLOAD_TOO_LARGE", message: "Images must be WebP files under 1 MB." });
    }
    if (![args.width, args.height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= MAX_DIMENSION_PX)) {
      throw new ConvexError({ code: "INVALID_DIMENSIONS", message: "Images must be resized to at most 1440px before upload." });
    }

    const { demoSessionId, workspaceKey, actorStudent } = ctx.viewer;
    const now = Date.now();
    if (demoSessionId) {
      const [demo, reservations] = await Promise.all([
        ctx.db.get(demoSessionId),
        ctx.db.query("uploadReservations").withIndex("by_demo_session", (q) =>
          q.eq("demoSessionId", demoSessionId).gt("expiresAt", now)
        ).take(MAX_DEMO_UPLOADS),
      ]);
      if (!demo || demo.uploadCount + reservations.length >= MAX_DEMO_UPLOADS) {
        throw new ConvexError({
          code: "QUOTA_EXCEEDED",
          message: "Judge Demo Mode is capped at 20 image uploads per workspace.",
        });
      }
    }
    return ctx.db.insert("uploadReservations", {
      workspaceKey, demoSessionId, ownerStudentId: actorStudent._id,
      purpose: args.purpose, byteSize: args.byteSize, width: args.width, height: args.height,
      expiresAt: now + RESERVATION_TTL_MS,
    });
  },
});

export const registerMediaAsset = viewerMutation({
  args: {
    reservationId: v.id("uploadReservations"), fileKey: v.string(), url: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const { workspaceKey, actorStudent, demoSessionId } = ctx.viewer;
    const now = Date.now();
    const existing = await ctx.db.query("mediaAssets")
      .withIndex("by_file_key", (q) => q.eq("fileKey", args.fileKey)).unique();
    if (existing && (
      existing.workspaceKey !== workspaceKey || existing.ownerStudentId !== actorStudent._id ||
      existing.status === "deleted" || existing.deleteClaimedAt !== undefined || existing.url !== args.url
    )) {
      throw new ConvexError({ code: "INVALID_UPLOAD", message: "The upload is unavailable." });
    }

    const lease = await ctx.db.get(args.reservationId);
    if (existing && (lease === null || (lease.workspaceKey === workspaceKey && lease.ownerStudentId === actorStudent._id))) {
      if (lease) await ctx.db.delete(lease._id);
      return existing._id;
    }
    if (!lease || lease.expiresAt <= now || lease.workspaceKey !== workspaceKey ||
        lease.ownerStudentId !== actorStudent._id || lease.demoSessionId !== demoSessionId) {
      throw new ConvexError({ code: "INVALID_UPLOAD", message: "The upload reservation has expired." });
    }

    const asset = await ctx.db.insert("mediaAssets", {
      workspaceKey, demoSessionId, ownerStudentId: actorStudent._id,
      fileKey: args.fileKey, url: args.url, purpose: lease.purpose,
      byteSize: lease.byteSize, width: lease.width, height: lease.height,
      status: "pending", createdAt: now,
    });
    if (demoSessionId) {
      const demo = await ctx.db.get(demoSessionId);
      if (!demo || demo.uploadCount >= MAX_DEMO_UPLOADS) {
        throw new ConvexError({ code: "QUOTA_EXCEEDED", message: "Judge Demo Mode is capped at 20 image uploads per workspace." });
      }
      await ctx.db.patch(demoSessionId, { uploadCount: demo.uploadCount + 1 });
    }
    await ctx.db.delete(lease._id);
    return asset;
  },
});

export const abandonUpload = publicAuthMutation({
  args: {
    reservationId: v.id("uploadReservations"), serverSecret: v.string(),
    fileKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireServerSecret(args.serverSecret);
    const lease = await ctx.db.get(args.reservationId);
    if (!lease) return;
    if (args.fileKey && !args.fileKey.startsWith("local-inline:")) {
      const fileKey = args.fileKey;
      const existing = await ctx.db.query("mediaAssets")
        .withIndex("by_file_key", (q) => q.eq("fileKey", fileKey)).unique();
      if (!existing) {
        await ctx.db.insert("mediaAssets", {
          fileKey, url: "", workspaceKey: lease.workspaceKey,
          ownerStudentId: lease.ownerStudentId, purpose: lease.purpose,
          byteSize: lease.byteSize, width: lease.width, height: lease.height,
          createdAt: Date.now(), status: "deleted",
        });
      }
    }
    await ctx.db.delete(lease._id);
  },
});
