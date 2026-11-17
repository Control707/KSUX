"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { UTApi } from "uploadthing/server";

export const deleteUploadThingFiles = internalAction({
  args: {
    fileKeys: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const localKeys = args.fileKeys.filter((key) => key.startsWith("local-inline:"));
    const remoteKeys = args.fileKeys.filter((key) => key && !key.startsWith("local-inline:"));
    const token = process.env.UPLOADTHING_TOKEN?.trim();
    if (!token || remoteKeys.length === 0) {
      return { deletedFileKeys: localKeys };
    }
    try {
      const utapi = new UTApi({ token });
      const result = await utapi.deleteFiles(remoteKeys);
      // A successful request also acknowledges keys that were already absent.
      return { deletedFileKeys: result.success ? [...localKeys, ...remoteKeys] : localKeys };
    } catch (error) {
      console.warn("UploadThing cleanup will be retried", error instanceof Error ? error.name : "UnknownError");
      return { deletedFileKeys: localKeys };
    }
  },
});
