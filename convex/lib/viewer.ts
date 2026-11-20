import { ConvexError, PropertyValidators, v, ObjectType } from "convex/values";
import {
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { canonicalizeKsuEmail } from "./crypto";
import { resolveStudentSessionHash } from "./sessionCredential";

export const viewerAuthArgs = {
  sessionToken: v.optional(v.string()),
  demoShortCode: v.optional(v.string()),
  demoPersonaHandle: v.optional(v.string()),
};

export interface ViewerContext {
  mode: "student" | "demo";
  studentSessionId?: Id<"studentSessions">;
  studentSessionTokenHash?: string;
  studentSessionExpiresAt?: number;
  isBrowserCredential?: boolean;
  workspaceKey: string;
  demoSessionId?: Id<"demoSessions">;
  demoShortCode?: string;
  actorStudent: Doc<"students">;
  blockedStudentIds: ReadonlySet<Id<"students">>;
  hiddenTargetKeys: ReadonlySet<string>;
  enrolledCourseHubIds: ReadonlySet<Id<"courseHubs">>;
  isModerator: boolean;
  isMaintainer: boolean;
  isCsa: boolean;
}

export interface PublicStudentProfile {
  _id: Id<"students">;
  handle: string;
  displayName: string;
  emailDomainBadge: "verified_student" | "faculty_staff";
  homeCampus: "Kennesaw" | "Marietta";
  major?: string;
  classYear?: string;
  avatarUrl?: string;
  completedDealCount: number;
  onboardingCompleted: boolean;
  joinedAt: number;
  isRemoved: boolean;
}

export function toPublicStudent(
  student: Doc<"students"> | null | undefined
): PublicStudentProfile {
  if (!student || student.accountStatus !== "active") {
    return {
      _id: (student?._id ?? "") as Id<"students">,
      handle: "removed",
      displayName: "[Removed Student]",
      emailDomainBadge: "verified_student",
      homeCampus: student?.homeCampus ?? "Kennesaw",
      completedDealCount: 0,
      onboardingCompleted: true,
      joinedAt: student?.joinedAt ?? 0,
      isRemoved: true,
    };
  }
  return {
    _id: student._id,
    handle: student.handle,
    displayName: student.displayName,
    emailDomainBadge: student.emailDomainBadge,
    homeCampus: student.homeCampus,
    major: student.major,
    classYear: student.classYear,
    avatarUrl: student.avatarUrl,
    completedDealCount: student.completedDealCount,
    onboardingCompleted: student.onboardingCompleted ?? true,
    joinedAt: student.joinedAt,
    isRemoved: false,
  };
}

export function parseMaintainerEmails(envVal: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!envVal) return out;
  for (const part of envVal.split(",")) {
    const parsed = canonicalizeKsuEmail(part);
    if (parsed.ok) {
      out.add(parsed.canonicalEmail);
    } else if (part.trim()) {
      out.add(part.trim().toLowerCase());
    }
  }
  return out;
}

const SLIDING_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function resolveViewerFromDb(
  ctx: QueryCtx | MutationCtx,
  auth: {
    sessionToken?: string;
    demoShortCode?: string;
    demoPersonaHandle?: string;
  },
  options: { isMutation?: boolean; allowSuspended?: boolean } = {}
): Promise<ViewerContext> {
  const now = Date.now();

  let mode: "student" | "demo";
  let workspaceKey: string;
  let demoSessionId: Id<"demoSessions"> | undefined;
  let demoShortCode: string | undefined;
  let actorStudent: Doc<"students"> | null = null;
  let isModerator = false;
  let isMaintainer = false;
  let isCsa = false;
  let studentSessionId: Id<"studentSessions"> | undefined;
  let studentSessionTokenHash: string | undefined;
  let studentSessionExpiresAt: number | undefined;
  let isBrowserCredential: boolean | undefined;

  if (auth.sessionToken && auth.sessionToken.trim().length > 0) {
    const token = auth.sessionToken.trim();
    isBrowserCredential = token.startsWith("b1.");
    const tokenHash = await resolveStudentSessionHash(token, now);
    const session = tokenHash ? await ctx.db
      .query("studentSessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique() : null;

    if (!session || session.expiresAt <= now) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Session expired or invalid. Please sign in again.",
      });
    }

    actorStudent = await ctx.db.get(session.studentId);
    if (
      !actorStudent ||
      actorStudent.workspaceKey !== "prod" ||
      (actorStudent.accountStatus !== "active" && !(options.allowSuspended && actorStudent.accountStatus === "suspended"))
    ) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "This Student profile is no longer active.",
      });
    }

    studentSessionId = session._id;
    studentSessionTokenHash = session.tokenHash;
    studentSessionExpiresAt = session.expiresAt;
    if (
      options.isMutation &&
      "patch" in ctx.db &&
      now - session.lastRefreshedAt >= SLIDING_REFRESH_INTERVAL_MS
    ) {
      studentSessionExpiresAt = now + SESSION_DURATION_MS;
      await (ctx as MutationCtx).db.patch(session._id, {
        lastRefreshedAt: now,
        expiresAt: studentSessionExpiresAt,
      });
    }

    const maintainers = parseMaintainerEmails(
      process.env.OWLSIDE_MAINTAINER_EMAILS
    );
    isMaintainer = Boolean(
      actorStudent.canonicalEmail &&
        maintainers.has(actorStudent.canonicalEmail)
    );
    const appointment = await ctx.db.query("moderators").withIndex("by_student", (q) =>
      q.eq("workspaceKey", "prod").eq("studentId", actorStudent!._id)).unique();
    const appointed = Boolean(appointment && appointment.revokedAt === undefined &&
      appointment.appointedAt <= now && (appointment.purgeAt === undefined || appointment.purgeAt > now) &&
      actorStudent.emailDomainBadge === "verified_student" &&
      actorStudent.canonicalEmail?.endsWith("@students.kennesaw.edu"));
    isModerator = isMaintainer || appointed;
    isCsa = Boolean(appointment?.isCsa && (appointed || isMaintainer));
    mode = "student";
    workspaceKey = "prod";
  } else if (auth.demoShortCode && auth.demoShortCode.trim().length > 0) {
    const cleanCode = auth.demoShortCode.trim().toLowerCase();
    const demoSession = await ctx.db
      .query("demoSessions")
      .withIndex("by_short_code", (q) => q.eq("shortCode", cleanCode))
      .unique();

    if (!demoSession || demoSession.expiresAt <= now) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Judge Demo Mode session expired or not found.",
      });
    }

    workspaceKey = `demo:${demoSession._id}`;
    const requestedHandle = (
      auth.demoPersonaHandle ||
      demoSession.defaultPersonaHandle ||
      "maya_cs"
    )
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();

    actorStudent = await ctx.db
      .query("students")
      .withIndex("by_workspace_handle", (q) =>
        q.eq("workspaceKey", workspaceKey).eq("handleLower", requestedHandle)
      )
      .unique();

    if (!actorStudent) {
      actorStudent = await ctx.db
        .query("students")
        .withIndex("by_workspace_handle", (q) =>
          q.eq("workspaceKey", workspaceKey).eq("handleLower", "maya_cs")
        )
        .unique();
    }

    if (!actorStudent || (actorStudent.accountStatus !== "active" && !(options.allowSuspended && actorStudent.accountStatus === "suspended"))) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Demo Student persona unavailable in this workspace.",
      });
    }

    if (
      options.isMutation &&
      "patch" in ctx.db &&
      now - demoSession.lastActiveAt >= 60_000
    ) {
      await (ctx as MutationCtx).db.patch(demoSession._id, {
        lastActiveAt: now,
      });
    }

    mode = "demo";
    demoSessionId = demoSession._id;
    demoShortCode = demoSession.shortCode;
    isModerator = true;
    isMaintainer = actorStudent.handleLower === "maya_cs";
  } else {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in with KSU .edu email or enter Judge Demo Mode.",
    });
  }

  return loadViewerScope(ctx, {
    mode,
    studentSessionId,
    studentSessionTokenHash,
    studentSessionExpiresAt,
    isBrowserCredential,
    workspaceKey,
    demoSessionId,
    demoShortCode,
    actorStudent,
    isModerator,
    isMaintainer,
    isCsa,
  });
}

export async function loadViewerScope(
  ctx: QueryCtx | MutationCtx,
  identity: Omit<ViewerContext, "blockedStudentIds" | "hiddenTargetKeys" | "enrolledCourseHubIds">
): Promise<ViewerContext> {
  const { workspaceKey, actorStudent } = identity;
  const [blocksByMe, blocksAgainstMe, myReports, myEnrollments] =
    await Promise.all([
      ctx.db
        .query("studentBlocks")
        .withIndex("by_blocker", (q) =>
          q.eq("workspaceKey", workspaceKey).eq("blockerId", actorStudent._id)
        )
        .take(200),
      ctx.db
        .query("studentBlocks")
        .withIndex("by_blocked", (q) =>
          q.eq("workspaceKey", workspaceKey).eq("blockedId", actorStudent._id)
        )
        .take(200),
      ctx.db
        .query("moderationReports")
        .withIndex("by_reporter", (q) =>
          q.eq("workspaceKey", workspaceKey).eq("reporterId", actorStudent._id)
        )
        .take(200),
      ctx.db
        .query("studentEnrollments")
        .withIndex("by_student_hub", (q) =>
          q.eq("workspaceKey", workspaceKey).eq("studentId", actorStudent._id)
        )
        .take(50),
    ]);

  const blockedStudentIds = new Set<Id<"students">>();
  for (const row of blocksByMe) blockedStudentIds.add(row.blockedId);
  for (const row of blocksAgainstMe) blockedStudentIds.add(row.blockerId);

  const hiddenTargetKeys = new Set<string>();
  for (const report of myReports) {
    if (report.queueStatus !== "restored") {
      hiddenTargetKeys.add(report.targetKey);
    }
  }

  const enrolledCourseHubIds = new Set<Id<"courseHubs">>();
  for (const enrollment of myEnrollments) {
    enrolledCourseHubIds.add(enrollment.courseHubId);
  }

  return {
    ...identity,
    blockedStudentIds,
    hiddenTargetKeys,
    enrolledCourseHubIds,
  };
}

export function makeTargetKey(
  targetType: "post" | "listing" | "study_session" | "student" | "chat_message",
  targetId: string
): string {
  return `${targetType}:${targetId}`;
}

export function isItemVisibleToViewer(
  viewer: ViewerContext,
  opts: {
    targetType:
      | "post"
      | "listing"
      | "study_session"
      | "student"
      | "chat_message";
    targetId: string;
    authorId?: Id<"students">;
    visibilityStatus?: string;
    allowTombstone?: boolean;
  }
): boolean {
  if (opts.visibilityStatus && opts.visibilityStatus !== "visible") {
    if (
      !(opts.allowTombstone && opts.visibilityStatus === "deleted_tombstone")
    ) {
      return false;
    }
  }
  if (
    viewer.hiddenTargetKeys.has(makeTargetKey(opts.targetType, opts.targetId))
  ) {
    return false;
  }
  if (opts.authorId && viewer.blockedStudentIds.has(opts.authorId)) {
    return false;
  }
  return true;
}

export function filterVisibleContent<
  T extends {
    _id: string;
    visibilityStatus?: string;
  },
>(
  docs: T[],
  viewer: ViewerContext,
  opts: {
    targetType: "post" | "listing" | "study_session" | "student";
    getAuthorId?: (doc: T) => Id<"students"> | undefined;
    allowTombstone?: boolean;
  }
): T[] {
  return docs.filter((doc) =>
    isItemVisibleToViewer(viewer, {
      targetType: opts.targetType,
      targetId: String(doc._id),
      authorId: opts.getAuthorId ? opts.getAuthorId(doc) : undefined,
      visibilityStatus: doc.visibilityStatus,
      allowTombstone: opts.allowTombstone,
    })
  );
}

// =========================================================================
// Public Auth Function Wrappers (Welcome Gate, OTP, & Demo Bootstrap ONLY)
// =========================================================================
export const publicAuthQuery = query;
export const publicAuthMutation = mutation;

// =========================================================================
// Authenticated Viewer Function Wrappers
// =========================================================================

export function viewerQuery<ArgsValidator extends PropertyValidators, Output>({
  args,
  handler,
  allowSuspended = false,
}: {
  args: ArgsValidator;
  allowSuspended?: boolean;
  handler: (
    ctx: QueryCtx & { viewer: ViewerContext },
    args: ObjectType<ArgsValidator>
  ) => Promise<Output> | Output;
}) {
  return query({
    args: {
      ...viewerAuthArgs,
      ...args,
    } as any,
    handler: async (ctx, fullArgs: any) => {
      const viewer = await resolveViewerFromDb(ctx, {
        sessionToken: fullArgs.sessionToken,
        demoShortCode: fullArgs.demoShortCode,
        demoPersonaHandle: fullArgs.demoPersonaHandle,
      }, { allowSuspended });
      const enrichedCtx = Object.assign(ctx, { viewer });
      return handler(enrichedCtx, fullArgs);
    },
  });
}

export function viewerMutation<
  ArgsValidator extends PropertyValidators,
  Output,
>({
  args,
  handler,
  allowSuspended = false,
}: {
  args: ArgsValidator;
  allowSuspended?: boolean;
  handler: (
    ctx: MutationCtx & { viewer: ViewerContext },
    args: ObjectType<ArgsValidator>
  ) => Promise<Output> | Output;
}) {
  return mutation({
    args: {
      ...viewerAuthArgs,
      ...args,
    } as any,
    handler: async (ctx, fullArgs: any) => {
      const viewer = await resolveViewerFromDb(
        ctx,
        {
          sessionToken: fullArgs.sessionToken,
          demoShortCode: fullArgs.demoShortCode,
          demoPersonaHandle: fullArgs.demoPersonaHandle,
        },
        { isMutation: true, allowSuspended }
      );
      const enrichedCtx = Object.assign(ctx, { viewer });
      return handler(enrichedCtx, fullArgs);
    },
  });
}

export function verifiedStudentMutation<
  ArgsValidator extends PropertyValidators,
  Output,
>({
  args,
  handler,
}: {
  args: ArgsValidator;
  handler: (
    ctx: MutationCtx & { viewer: ViewerContext },
    args: ObjectType<ArgsValidator>
  ) => Promise<Output> | Output;
}) {
  return mutation({
    args: {
      ...viewerAuthArgs,
      ...args,
    } as any,
    handler: async (ctx, fullArgs: any) => {
      const viewer = await resolveViewerFromDb(
        ctx,
        {
          sessionToken: fullArgs.sessionToken,
          demoShortCode: fullArgs.demoShortCode,
          demoPersonaHandle: fullArgs.demoPersonaHandle,
        },
        { isMutation: true }
      );
      if (viewer.mode !== "student" || viewer.workspaceKey !== "prod") {
        throw new ConvexError({
          code: "FORBIDDEN",
          message:
            "This action requires a verified KSU .edu Student session.",
        });
      }
      const enrichedCtx = Object.assign(ctx, { viewer });
      return handler(enrichedCtx, fullArgs);
    },
  });
}

export function moderatorMutation<
  ArgsValidator extends PropertyValidators,
  Output,
>({
  args,
  handler,
}: {
  args: ArgsValidator;
  handler: (
    ctx: MutationCtx & { viewer: ViewerContext },
    args: ObjectType<ArgsValidator>
  ) => Promise<Output> | Output;
}) {
  return mutation({
    args: {
      ...viewerAuthArgs,
      ...args,
    } as any,
    handler: async (ctx, fullArgs: any) => {
      const viewer = await resolveViewerFromDb(
        ctx,
        {
          sessionToken: fullArgs.sessionToken,
          demoShortCode: fullArgs.demoShortCode,
          demoPersonaHandle: fullArgs.demoPersonaHandle,
        },
        { isMutation: true }
      );
      if (!viewer.isModerator) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Maintainer moderation access is required.",
        });
      }
      const enrichedCtx = Object.assign(ctx, { viewer });
      return handler(enrichedCtx, fullArgs);
    },
  });
}
