import { ConvexError, v } from "convex/values";
import {
  publicAuthMutation,
  publicAuthQuery,
  viewerMutation,
  viewerQuery,
  toPublicStudent,
} from "../lib/viewer";
import {
  DEMO_PERSONA_HANDLES,
  randomShortCode,
} from "../lib/crypto";
import { cloneDemoWorkspaceFixtures } from "./fixtures";

const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export const provisionOrAttachDemoSession = publicAuthMutation({
  args: {
    shortCode: v.optional(v.string()),
    preferredPersona: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestedPersona = (args.preferredPersona || "maya_cs")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
    const activePersona = (DEMO_PERSONA_HANDLES as readonly string[]).includes(
      requestedPersona
    )
      ? requestedPersona
      : "maya_cs";

    if (args.shortCode && args.shortCode.trim().length > 0) {
      const normalizedCode = args.shortCode.trim().toLowerCase();
      const existing = await ctx.db
        .query("demoSessions")
        .withIndex("by_short_code", (q) => q.eq("shortCode", normalizedCode))
        .unique();

      if (existing && existing.expiresAt > now) {
        await ctx.db.patch(existing._id, {
          lastActiveAt: now,
        });
        return {
          demoSessionId: existing._id,
          shortCode: existing.shortCode,
          personaHandle: activePersona,
          isNew: false,
          expiresAt: existing.expiresAt,
        };
      }
    }

    // Generate a fresh collision-free shortCode
    let shortCode: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomShortCode(8);
      const collision = await ctx.db
        .query("demoSessions")
        .withIndex("by_short_code", (q) => q.eq("shortCode", candidate))
        .unique();
      if (!collision) {
        shortCode = candidate;
        break;
      }
    }
    if (!shortCode) {
      throw new ConvexError({ code: "TRY_AGAIN", message: "Could not reserve a Demo link. Please try again." });
    }

    const demoSessionId = await ctx.db.insert("demoSessions", {
      shortCode,
      defaultPersonaHandle: "maya_cs",
      uploadCount: 0,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + DEMO_TTL_MS,
    });

    await cloneDemoWorkspaceFixtures(ctx, demoSessionId, now);

    return {
      demoSessionId,
      shortCode,
      personaHandle: activePersona,
      isNew: true,
      expiresAt: now + DEMO_TTL_MS,
    };
  },
});

export const getDemoWorkspaceInfo = viewerQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.viewer.mode !== "demo" || !ctx.viewer.demoSessionId) {
      return null;
    }
    const demoSession = await ctx.db.get(ctx.viewer.demoSessionId);
    if (!demoSession) return null;

    const personas = [];
    for (const handle of DEMO_PERSONA_HANDLES) {
      const row = await ctx.db
        .query("students")
        .withIndex("by_workspace_handle", (q) =>
          q.eq("workspaceKey", ctx.viewer.workspaceKey).eq("handleLower", handle)
        )
        .unique();
      if (row) {
        personas.push({
          ...toPublicStudent(row),
          activeCampusFilter: row.activeCampusFilter,
        });
      }
    }

    const counterPartyHandle =
      ctx.viewer.actorStudent.handleLower === "alex_owl"
        ? "maya_cs"
        : "alex_owl";

    return {
      demoSessionId: demoSession._id,
      shortCode: demoSession.shortCode,
      uploadCount: demoSession.uploadCount,
      expiresAt: demoSession.expiresAt,
      activePersona: toPublicStudent(ctx.viewer.actorStudent),
      personas,
      coTestCounterpartyHandle: counterPartyHandle,
    };
  },
});

export const resetDemoWorkspace = viewerMutation({
  args: {},
  handler: async (ctx) => {
    const { demoSessionId, demoShortCode, mode } = ctx.viewer;
    if (mode !== "demo" || !demoSessionId || !demoShortCode) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Reset Demo State is only available in Judge Demo Mode.",
      });
    }
    const now = Date.now();
    // Retire the old workspace immediately while leaving its rows available for durable cleanup.
    await ctx.db.patch(demoSessionId, { shortCode: `reset:${demoSessionId}`, expiresAt: now });
    const replacementId = await ctx.db.insert("demoSessions", {
      shortCode: demoShortCode,
      defaultPersonaHandle: "maya_cs",
      uploadCount: 0,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + DEMO_TTL_MS,
    });
    await cloneDemoWorkspaceFixtures(ctx, replacementId, now);
    return {
      ok: true,
      shortCode: demoShortCode,
      resetAt: now,
    };
  },
});

export const checkPublicWelcomeState = publicAuthQuery({
  args: {},
  handler: async (ctx) => {
    const lotSample = await ctx.db.query("parkingLots").take(1);
    return {
      isKsuCatalogSeeded: lotSample.length > 0,
    };
  },
});
