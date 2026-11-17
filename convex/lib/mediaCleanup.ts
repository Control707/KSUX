import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// The registry row doubles as the durable cleanup record until storage acknowledges deletion.
export async function queueMediaDeletion(ctx: MutationCtx, asset: Doc<"mediaAssets">) {
  await ctx.db.patch(asset._id, {
    status: "deleted",
    demoSessionId: undefined,
  });
}
