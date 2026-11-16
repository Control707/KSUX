import { describe, expect, it } from "vitest";
import {
  buildPrivacySafePushIfEligible,
  dispatchVapidPushToSubscriptions,
} from "../../convex/lib/pushAdapter";

describe("Seam 2 — VAPID Web Push Eligibility, Handle-Only Payloads & 60s Throttling (#23)", () => {
  it("suppresses Group Chats, Spot Openings, Demo workspaces, active readers (<15s), and 60s throttled threads while omitting message text", () => {
    const now = 1_794_830_000_000;

    // Group Chat suppressed
    expect(
      buildPrivacySafePushIfEligible({
        workspaceKey: "prod",
        eventKind: "group_chat",
        senderHandle: "maya_cs",
        href: "/chats/123",
        nowMs: now,
      })
    ).toEqual({ send: false, reason: "high_fanout_suppressed" });

    // Demo workspace suppressed
    expect(
      buildPrivacySafePushIfEligible({
        workspaceKey: "demo:abc",
        eventKind: "dm",
        senderHandle: "maya_cs",
        href: "/chats/123",
        nowMs: now,
      })
    ).toEqual({ send: false, reason: "demo_workspace_disabled" });

    // Throttled within 60s
    expect(
      buildPrivacySafePushIfEligible({
        workspaceKey: "prod",
        eventKind: "dm",
        senderHandle: "maya_cs",
        chatId: "chat_1",
        href: "/chats/chat_1",
        lastPushSentAt: now - 30_000,
        nowMs: now,
      })
    ).toEqual({ send: false, reason: "throttled_60s" });

    // Eligible Deal Chat -> handle-only body with zero private message content!
    const ok = buildPrivacySafePushIfEligible({
      workspaceKey: "prod",
      eventKind: "deal",
      senderHandle: "@alex_owl",
      chatId: "deal_9",
      href: "/chats/deal_9",
      lastPushSentAt: now - 65_000,
      lastReadAt: now - 45_000,
      nowMs: now,
    });
    expect(ok.send).toBe(true);
    if (ok.send) {
      expect(ok.payload.body).toBe(
        "@alex_owl updated your Marketplace Deal Chat"
      );
    }
  });

  it("collects 410 Gone endpoints for automatic pruning", async () => {
    const res = await dispatchVapidPushToSubscriptions(
      [
        { endpoint: "https://push.example/live", p256dh: "k", auth: "a" },
        { endpoint: "https://push.example/dead", p256dh: "k", auth: "a" },
      ],
      {
        title: "KSUX Campus",
        body: "@maya_cs sent a Direct Message",
        href: "/chats/1",
        tag: "ksux-chat-1",
      },
      {
        sendNotification: async (sub) => {
          if (sub.endpoint.endsWith("/dead")) {
            const err: any = new Error("Gone");
            err.statusCode = 410;
            throw err;
          }
        },
      }
    );

    expect(res.delivered).toBe(1);
    expect(res.staleEndpoints).toEqual(["https://push.example/dead"]);
  });
});
