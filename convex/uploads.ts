import { ConvexError, v } from "convex/values";
import { viewerMutation, viewerQuery } from "./lib/viewer";

const MAX_UPLOAD_BYTES = 1_048_576; // 1 MB hard route cap
const MAX_DIMENSION_PX = 1440;
const MAX_DEMO_UPLOADS = 20;

export const authorizeUpload = viewerQuery({
  args: {
    purpose: v.union(
      v.literal("avatar"),
      v.literal("post"),
      v.literal("listing"),
      v.literal("chat")
    ),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.byteSize <= 0 || args.byteSize > MAX_UPLOAD_BYTES) {
      throw new ConvexError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Images must be EXIF-stripped WebP files under 1 MB.",
      });
    }
    if (
      args.width <= 0 ||
      args.height <= 0 ||
      args.width > MAX_DIMENSION_PX ||
      args.height > MAX_DIMENSION_PX
    ) {
      throw new ConvexError({
        code: "INVALID_DIMENSIONS",
        message: "Images must be resized to at most 1440px before upload.",
      });
    }

    if (ctx.viewer.mode === "demo" && ctx.viewer.demoSessionId) {
      const demo = await ctx.db.get(ctx.viewer.demoSessionId);
      if (!demo || demo.uploadCount >= MAX_DEMO_UPLOADS) {
        throw new ConvexError({
          code: "QUOTA_EXCEEDED",
          message:
            "Judge Demo Mode is capped at 20 image uploads per workspace. Use Reset Demo State to clear.",
        });
      }
    }

    return {
      ok: true,
      workspaceKey: ctx.viewer.workspaceKey,
      demoSessionId: ctx.viewer.demoSessionId,
      ownerStudentId: ctx.viewer.actorStudent._id,
    };
  },
});

export const registerMediaAsset = viewerMutation({
  args: {
    fileKey: v.string(),
    url: v.string(),
    purpose: v.union(
      v.literal("avatar"),
      v.literal("post"),
      v.literal("listing"),
      v.literal("chat")
    ),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.byteSize <= 0 || args.byteSize > MAX_UPLOAD_BYTES) {
      throw new ConvexError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Images must be EXIF-stripped WebP files under 1 MB.",
      });
    }
    if (
      args.width <= 0 ||
      args.height <= 0 ||
      args.width > MAX_DIMENSION_PX ||
      args.height > MAX_DIMENSION_PX
    ) {
      throw new ConvexError({
        code: "INVALID_DIMENSIONS",
        message: "Images must be resized to at most 1440px before upload.",
      });
    }

    if (ctx.viewer.mode === "demo" && ctx.viewer.demoSessionId) {
      const demo = await ctx.db.get(ctx.viewer.demoSessionId);
      if (!demo || demo.uploadCount >= MAX_DEMO_UPLOADS) {
        throw new ConvexError({
          code: "QUOTA_EXCEEDED",
          message:
            "Judge Demo Mode is capped at 20 image uploads per workspace.",
        });
      }
      await ctx.db.patch(ctx.viewer.demoSessionId, {
        uploadCount: demo.uploadCount + 1,
      });
    }

    const existing = await ctx.db
      .query("mediaAssets")
      .withIndex("by_file_key", (q) => q.eq("fileKey", args.fileKey))
      .unique();
    if (existing) {
      return existing._id;
    }

    const assetId = await ctx.db.insert("mediaAssets", {
      workspaceKey: ctx.viewer.workspaceKey,
      demoSessionId: ctx.viewer.demoSessionId,
      ownerStudentId: ctx.viewer.actorStudent._id,
      fileKey: args.fileKey,
      url: args.url,
      purpose: args.purpose,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      status: "pending",
      createdAt: Date.now(),
    });

    return assetId;
  },
});
