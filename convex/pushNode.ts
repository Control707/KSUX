"use node";

import webpush from "web-push";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { dispatchVapidPushToSubscriptions } from "./lib/pushAdapter";

export const sendPushPayloadNode = internalAction({
  args: {
    studentId: v.id("students"),
    title: v.string(),
    body: v.string(),
    href: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, args) => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject =
      process.env.VAPID_SUBJECT?.trim() ||
      "mailto:maintainer@students.kennesaw.edu";

    if (!publicKey || !privateKey) {
      return { delivered: 0, skipped: "vapid_not_configured" };
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const subs = await ctx.runQuery(
      internal.push.listStudentSubscriptionsInternal,
      { studentId: args.studentId }
    );
    if (subs.length === 0) {
      return { delivered: 0, skipped: "no_subscriptions" };
    }

    const result = await dispatchVapidPushToSubscriptions(
      subs,
      {
        title: args.title,
        body: args.body,
        href: args.href,
        tag: args.tag,
      },
      {
        sendNotification: async (sub, payloadJson) => {
          await webpush.sendNotification(sub, payloadJson);
        },
      }
    );

    if (result.staleEndpoints.length > 0) {
      await ctx.runMutation(internal.push.pruneStaleEndpointsInternal, {
        endpoints: result.staleEndpoints,
      });
    }

    return { delivered: result.delivered };
  },
});

/** Official Alert fan-out (ADR-0007): one batch of opted-in subscriptions, source-named payload only. */
export const sendPushToSubscriptionsNode = internalAction({
  args: {
    subscriptions: v.array(v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() })),
    title: v.string(),
    body: v.string(),
    href: v.string(),
    tag: v.string(),
  },
  handler: async (ctx, { subscriptions, ...payload }) => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!publicKey || !privateKey) return { delivered: 0, skipped: "vapid_not_configured" };
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:maintainer@students.kennesaw.edu", publicKey, privateKey);
    let delivered = 0;
    const stale: string[] = [];
    const encoded = JSON.stringify(payload);
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, encoded, { TTL: 60 * 60 });
        delivered++;
      } catch (err: any) {
        const status = Number(err?.statusCode ?? 0);
        if (status === 404 || status === 410) stale.push(sub.endpoint);
      }
    }
    if (stale.length) await ctx.runMutation(internal.push.pruneStaleEndpointsInternal, { endpoints: stale });
    return { delivered };
  },
});
