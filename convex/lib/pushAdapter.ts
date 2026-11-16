export type PushEventKind =
  | "dm"
  | "message_request"
  | "deal"
  | "scrappy_reply"
  | "group_chat"
  | "spot_opening";

export interface PushEligibilityInput {
  workspaceKey: string;
  eventKind: PushEventKind;
  senderHandle: string;
  chatId?: string;
  href: string;
  isMuted?: boolean;
  isBlocked?: boolean;
  lastReadAt?: number;
  lastPushSentAt?: number;
  nowMs: number;
}

export interface SafePushPayload {
  title: string;
  body: string;
  href: string;
  tag: string;
}

const PUSH_THROTTLE_MS = 60 * 1000; // 1 push / 60s per (recipient, chatId)
const ACTIVE_READ_GRACE_MS = 15 * 1000; // suppress if read < 15s ago

const ALLOWED_PUSH_KINDS = new Set<PushEventKind>([
  "dm",
  "message_request",
  "deal",
  "scrappy_reply",
]);

export function buildPrivacySafePushIfEligible(
  input: PushEligibilityInput
):
  | { send: true; payload: SafePushPayload }
  | {
      send: false;
      reason:
        | "demo_workspace_disabled"
        | "high_fanout_suppressed"
        | "muted_or_blocked"
        | "active_reader_suppressed"
        | "throttled_60s";
    } {
  if (input.workspaceKey !== "prod") {
    return { send: false, reason: "demo_workspace_disabled" };
  }
  if (!ALLOWED_PUSH_KINDS.has(input.eventKind)) {
    return { send: false, reason: "high_fanout_suppressed" };
  }
  if (input.isMuted || input.isBlocked) {
    return { send: false, reason: "muted_or_blocked" };
  }
  if (
    input.lastReadAt &&
    input.nowMs - input.lastReadAt < ACTIVE_READ_GRACE_MS
  ) {
    return { send: false, reason: "active_reader_suppressed" };
  }
  if (
    input.lastPushSentAt &&
    input.nowMs - input.lastPushSentAt < PUSH_THROTTLE_MS
  ) {
    return { send: false, reason: "throttled_60s" };
  }

  const cleanHandle = input.senderHandle.replace(/^@+/, "");
  // Strictly handle-only + context on lock screen — zero message body or .edu email!
  const contextLabel =
    input.eventKind === "deal"
      ? `@${cleanHandle} updated your Marketplace Deal Chat`
      : input.eventKind === "message_request"
        ? `@${cleanHandle} sent a Message Request`
        : input.eventKind === "scrappy_reply"
          ? `🦉 @scrappy replied to your Post`
          : `@${cleanHandle} sent a Direct Message`;

  return {
    send: true,
    payload: {
      title: "KSUX Campus",
      body: contextLabel,
      href: input.href,
      tag: input.chatId ? `ksux-chat-${input.chatId}` : `ksux-${input.eventKind}`,
    },
  };
}

export interface WebPushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSenderAdapter {
  sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payloadJson: string
  ): Promise<void>;
}

export async function dispatchVapidPushToSubscriptions(
  subscriptions: WebPushSubscriptionRecord[],
  payload: SafePushPayload,
  sender: WebPushSenderAdapter
): Promise<{ delivered: number; staleEndpoints: string[] }> {
  let delivered = 0;
  const staleEndpoints: string[] = [];
  const encoded = JSON.stringify(payload);

  for (const sub of subscriptions.slice(0, 3)) {
    try {
      await sender.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        encoded
      );
      delivered++;
    } catch (err: any) {
      const statusCode = Number(err?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }

  return { delivered, staleEndpoints };
}
