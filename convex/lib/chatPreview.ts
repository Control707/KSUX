import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { makeTargetKey, type ViewerContext } from "./viewer";

export async function getChatPreview(ctx: QueryCtx, chat: Doc<"chats">, viewer: ViewerContext) {
  const hasMessageReports = Array.from(viewer.hiddenTargetKeys).some((key) => key.startsWith("chat_message:"));
  if (hasMessageReports || viewer.blockedStudentIds.size) {
    const latest = await ctx.db.query("chatMessages").withIndex("by_chat_seq", (q) =>
      q.eq("workspaceKey", chat.workspaceKey).eq("chatId", chat._id).eq("seq", chat.messageSeq)
    ).unique();
    if (latest && viewer.hiddenTargetKeys.has(makeTargetKey("chat_message", latest._id))) {
      return "[Reported message hidden]";
    }
    if (latest?.senderId && viewer.blockedStudentIds.has(latest.senderId)) {
      return "[Blocked message hidden]";
    }
  }
  return chat.lastMessagePreview;
}
