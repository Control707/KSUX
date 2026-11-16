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
