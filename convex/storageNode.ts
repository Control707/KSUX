"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { UTApi } from "uploadthing/server";

export const deleteUploadThingFiles = internalAction({
  args: {
    fileKeys: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const remoteKeys = args.fileKeys.filter(
      (k) => k && !k.startsWith("local-inline:")
    );
    if (remoteKeys.length === 0) {
      return { deleted: 0, skipped: args.fileKeys.length };
    }
    const token = process.env.UPLOADTHING_TOKEN;
    if (!token) {
      return { deleted: 0, skipped: remoteKeys.length };
    }
    const utapi = new UTApi({ token });
    await utapi.deleteFiles(remoteKeys);
    return { deleted: remoteKeys.length, skipped: 0 };
  },
});
