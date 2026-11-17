import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function isCurrentCampusChatMember(
  ctx: QueryCtx | MutationCtx,
  chat: Doc<"chats">,
  studentId: Id<"students">
): Promise<boolean> {
  if (chat.kind === "club_group") {
    const clubId = ctx.db.normalizeId("clubs", chat.parentId ?? "");
    const club = clubId && await ctx.db.get(clubId);
    return Boolean(club && club.visibilityStatus === "visible" && await ctx.db.query("clubMembers")
      .withIndex("by_club_student", (q) => q.eq("workspaceKey", chat.workspaceKey)
        .eq("clubId", club._id).eq("studentId", studentId))
      .unique());
  }
  if (chat.kind === "course_group") {
    const courseHubId = ctx.db.normalizeId("courseHubs", chat.parentId ?? "");
    const hub = courseHubId && await ctx.db.get(courseHubId);
    return Boolean(hub && !hub.isRetiredFixture && await ctx.db.query("studentEnrollments")
      .withIndex("by_student_hub", (q) => q.eq("workspaceKey", chat.workspaceKey)
        .eq("studentId", studentId).eq("courseHubId", hub._id))
      .first());
  }
  if (chat.kind === "study_group") {
    const sessionId = ctx.db.normalizeId("studySessions", chat.parentId ?? "");
    const session = sessionId && await ctx.db.get(sessionId);
    return Boolean(session && session.workspaceKey === chat.workspaceKey
      && session.attendeeIds.includes(studentId));
  }
  return true;
}

export async function removeCampusChatMember(
  ctx: MutationCtx,
  chat: Doc<"chats">,
  studentId: Id<"students">
) {
  const member = await ctx.db.query("chatMembers")
    .withIndex("by_chat_student", (q) => q.eq("workspaceKey", chat.workspaceKey)
      .eq("chatId", chat._id).eq("studentId", studentId))
    .unique();
  if (member) {
    await ctx.db.delete(member._id);
    await ctx.db.patch(chat._id, { memberCount: Math.max(0, chat.memberCount - 1) });
  }
}

export async function removeCommunityChatMember(
  ctx: MutationCtx,
  workspaceKey: string,
  parentType: "club" | "course_hub",
  parentId: Id<"clubs"> | Id<"courseHubs">,
  studentId: Id<"students">
) {
  const chat = await ctx.db.query("chats")
    .withIndex("by_workspace_parent", (q) => q.eq("workspaceKey", workspaceKey)
      .eq("parentType", parentType).eq("parentId", String(parentId)))
    .unique();
  if (chat) await removeCampusChatMember(ctx, chat, studentId);
}
