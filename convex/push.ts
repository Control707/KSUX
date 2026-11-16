import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { verifiedStudentMutation, viewerQuery } from "./lib/viewer";

const MAX_ENDPOINTS_PER_STUDENT = 3;

export const getMyPushSubscriptions = viewerQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.viewer.mode !== "student") {
      return { supportedInMode: false, endpoints: [] as string[] };
    }
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_student", (q) =>
        q.eq("studentId", ctx.viewer.actorStudent._id)
      )
      .take(10);
    return {
      supportedInMode: true,
      endpoints: rows.map((r) => r.endpoint),
    };
  },
});

export const registerPushSubscription = verifiedStudentMutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const studentId = ctx.viewer.actorStudent._id;
    const cleanEndpoint = args.endpoint.trim();

    const existingByEndpoint = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", cleanEndpoint))
      .unique();

    if (existingByEndpoint) {
      await ctx.db.patch(existingByEndpoint._id, {
        studentId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
        lastUsedAt: now,
      });
      return { subscriptionId: existingByEndpoint._id };
    }

    const mySubs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_student", (q) => q.eq("studentId", studentId))
      .take(10);

    // Cap at <= 3 endpoints per verified Student (evict oldest lastUsedAt)
    if (mySubs.length >= MAX_ENDPOINTS_PER_STUDENT) {
      const sortedOldest = [...mySubs].sort(
        (a, b) => a.lastUsedAt - b.lastUsedAt
      );
      const excess = mySubs.length - MAX_ENDPOINTS_PER_STUDENT + 1;
      for (let i = 0; i < excess; i++) {
        await ctx.db.delete(sortedOldest[i]!._id);
      }
    }

    const subscriptionId = await ctx.db.insert("pushSubscriptions", {
      studentId,
      endpoint: cleanEndpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: now,
      lastUsedAt: now,
    });

    return { subscriptionId };
  },
});

export const unregisterPushSubscription = verifiedStudentMutation({
  args: {
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint.trim()))
      .unique();
    if (existing && existing.studentId === ctx.viewer.actorStudent._id) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});

export const listStudentSubscriptionsInternal = internalQuery({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .take(5);
    return rows.map((r) => ({
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
    }));
  },
});

export const pruneStaleEndpointsInternal = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const ep of args.endpoints) {
      const existing = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", ep))
        .unique();
      if (existing) await ctx.db.delete(existing._id);
    }
  },
});
