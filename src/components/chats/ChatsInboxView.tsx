"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  MessageSquarePlus,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";

export function ChatsInboxView() {
  const router = useRouter();
  const { auth } = useViewerClient();
  const [tab, setTab] = useState<"all" | "dm" | "group" | "deal">("all");
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [dmTargetHandle, setDmTargetHandle] = useState("");
  const [dmOpener, setDmOpener] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupInvites, setGroupInvites] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const inbox = useViewerQuery(api.chats.listInbox, { tabFilter: tab });
  const pushInfo = useViewerQuery(api.push.getMyPushSubscriptions, {});
  const startDm = useViewerMutation(api.chats.startOrOpenDirectMessage);
  const createGroup = useViewerMutation(api.chats.createCustomGroupChat);
  const toggleMute = useViewerMutation(api.chats.toggleChatMute);
  const registerPush = useViewerMutation(api.push.registerPushSubscription);

  const handleStartDm = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const res = await startDm({
        recipientHandleOrId: dmTargetHandle,
        openerBody: dmOpener || undefined,
      });
      setNewDmOpen(false);
      setDmTargetHandle("");
      setDmOpener("");
      router.push(`/chats/${res.chatId}`);
    } catch (err: any) {
      setStatusMsg(err?.data?.message || err?.message || "Could not open DM.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const handles = groupInvites
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await createGroup({
        title: groupTitle,
        inviteHandles: handles,
      });
      setNewGroupOpen(false);
      setGroupTitle("");
      setGroupInvites("");
      router.push(`/chats/${res.chatId}`);
    } catch (err: any) {
      setStatusMsg(
        err?.data?.message || err?.message || "Could not create Group Chat."
      );
    }
  };

  const handleEnableWebPush = async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatusMsg(
        "Web Push requires an installed PWA or supported browser context (iOS Safari: Share → Add to Home Screen first)."
      );
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidKey) {
      setStatusMsg(
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY not configured — universal Tier-0 in-app Slide-Down Toasts remain active!"
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatusMsg("Notification permission was not granted.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      const json = sub.toJSON();
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await registerPush({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        });
        setStatusMsg("Privacy-safe VAPID Web Push enabled on this device!");
      }
    } catch (err: any) {
      setStatusMsg(err?.message || "Could not register Web Push.");
    }
  };

  return (
    <div data-testid="chats-inbox-view" className="space-y-3.5 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              Unified Campus Chats
            </h1>
            <p className="text-xs text-[#5E6675]">
              Direct Messages, Message Requests, Group Chats &amp; Marketplace
              Deal Chats · Intact across Campus switches.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {auth.status === "student" && pushInfo?.supportedInMode && (
              <button
                type="button"
                onClick={handleEnableWebPush}
                className="inline-flex items-center gap-1 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-2.5 py-1.5 text-xs font-bold text-[#111317]"
              >
                <Bell className="h-3.5 w-3.5 text-[#D99B00]" />
                <span>
                  {pushInfo.endpoints.length > 0
                    ? `Push Active (${pushInfo.endpoints.length}/3)`
                    : "Enable Web Push"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNewGroupOpen(false);
                setNewDmOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-1.5 text-xs font-extrabold text-[#111317]"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>+ DM</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewDmOpen(false);
                setNewGroupOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3 py-1.5 text-xs font-extrabold text-[#FDBB30]"
            >
              <Users className="h-3.5 w-3.5" />
              <span>+ Group Chat</span>
            </button>
          </div>
        </div>

        {/* Segment Tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["dm", "Direct Messages"],
              ["group", "Group Chats"],
              ["deal", "Deal Chats"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              data-testid={`chats-filter-${val}`}
              onClick={() => setTab(val)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                tab === val
                  ? "bg-[#111317] text-[#FDBB30]"
                  : "border border-[#E4E7EE] bg-[#F4F6FA] text-[#5E6675]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {statusMsg && (
          <p className="mt-2.5 rounded-xl bg-[#FFF6DC] px-3 py-2 text-xs font-bold text-[#855A00]">
            {statusMsg}
          </p>
        )}

        {newDmOpen && (
          <form
            onSubmit={handleStartDm}
            className="mt-3 space-y-2 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                value={dmTargetHandle}
                onChange={(e) => setDmTargetHandle(e.target.value)}
                placeholder="Classmate @handle (e.g. jordan_me)"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={dmOpener}
                onChange={(e) => setDmOpener(e.target.value)}
                placeholder="Optional opener message..."
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-3.5 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Open Direct Message
              </button>
            </div>
          </form>
        )}

        {newGroupOpen && (
          <form
            onSubmit={handleCreateGroup}
            className="mt-3 space-y-2 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Closed Group Chat Title (≤50 Students)"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={groupInvites}
                onChange={(e) => setGroupInvites(e.target.value)}
                placeholder="Invite @handles, comma-separated"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-3.5 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Create Custom Group Chat
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Thread Rows */}
      <div className="space-y-2">
        {(inbox ?? []).length === 0 ? (
          <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-center text-xs font-semibold text-[#5E6675]">
            No conversations in this filter yet.
          </div>
        ) : (
          inbox!.map((row) => (
            <div
              key={String(row.chatId)}
              data-testid={`inbox-row-${row.kind}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#E4E7EE] bg-white p-3.5 shadow-xs transition hover:border-[#D99B00]"
            >
              <Link
                href={`/chats/${row.chatId}`}
                className="min-w-0 flex-1 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-black text-[#111317]">
                    {row.title}
                  </span>
                  <span className="rounded-full bg-[#F4F6FA] px-2 py-0.5 text-[10px] font-extrabold uppercase text-[#5E6675]">
                    {row.kind.replace("_", " ")}
                  </span>
                  {row.isPendingIncomingRequest && (
                    <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-extrabold text-[#B45309]">
                      Message Request
                    </span>
                  )}
                  {row.handoffStatus && (
                    <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-extrabold text-[#15803D]">
                      Meetup: {row.handoffStatus}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[#5E6675]">
                  {row.lastSenderHandle ? `@${row.lastSenderHandle}: ` : ""}
                  {row.lastMessagePreview ?? "No messages yet"}
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-2">
                {row.unreadCount > 0 ? (
                  <span className="rounded-full bg-[#DC2626] px-2 py-0.5 text-[11px] font-black text-white">
                    {row.unreadCount}
                  </span>
                ) : row.hasDotUnread ? (
                  <span
                    title="Unread activity (dot mode)"
                    className="h-2.5 w-2.5 rounded-full bg-[#FDBB30]"
                  />
                ) : null}

                <button
                  type="button"
                  onClick={() => void toggleMute({ chatId: row.chatId })}
                  className="rounded-lg p-1.5 text-[#5E6675] hover:bg-[#F4F6FA]"
                  title={row.isMuted ? "Unmute" : "Mute notifications"}
                >
                  {row.isMuted ? (
                    <BellOff className="h-4 w-4 text-[#B45309]" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
