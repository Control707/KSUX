"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, MessageSquarePlus, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { SegmentedControl } from "@/components/a11y/controls";
import { BTN_ACCENT, BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL } from "@/components/marketplace/styles";

type Tab = "all" | "dm" | "group" | "deal";

const KIND_LABEL: Record<string, string> = {
  dm: "Direct Message",
  group: "Group Chat",
  custom_group: "Group Chat",
  study_session: "Study Session",
  deal: "Deal Chat",
};

export function ChatsInboxView() {
  const router = useRouter();
  const { auth } = useViewerClient();
  const { toast } = useAnnouncer();
  const ids = { dmHandle: useId(), dmOpener: useId(), groupTitle: useId(), groupInvites: useId() };
  const [tab, setTab] = useState<Tab>("all");
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [dmTargetHandle, setDmTargetHandle] = useState("");
  const [dmOpener, setDmOpener] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupInvites, setGroupInvites] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const inbox = useViewerQuery(api.chats.listInbox, { tabFilter: tab });
  const pushInfo = useViewerQuery(api.push.getMyPushSubscriptions, {});
  const startDm = useViewerMutation(api.chats.startOrOpenDirectMessage);
  const createGroup = useViewerMutation(api.chats.createCustomGroupChat);
  const toggleMute = useViewerMutation(api.chats.toggleChatMute);
  const registerPush = useViewerMutation(api.push.registerPushSubscription);

  const info = (message: string, tone: "info" | "success" | "error" = "info") => toast({ message, tone });

  const handleStartDm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await startDm({ recipientHandleOrId: dmTargetHandle, openerBody: dmOpener || undefined });
      setNewDmOpen(false);
      setDmTargetHandle("");
      setDmOpener("");
      router.push(`/chats/${res.chatId}`);
    } catch (err: any) {
      setFormError(err?.data?.message || err?.message || "Could not open the Direct Message.");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const handles = groupInvites.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await createGroup({ title: groupTitle, inviteHandles: handles });
      setNewGroupOpen(false);
      setGroupTitle("");
      setGroupInvites("");
      router.push(`/chats/${res.chatId}`);
    } catch (err: any) {
      setFormError(err?.data?.message || err?.message || "Could not create the Group Chat.");
    }
  };

  const handleEnableWebPush = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      info("Notifications need the installed app or a supported browser. On iPhone: Share, then Add to Home Screen.");
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidKey) {
      info("Push notifications are not set up here. In-app message alerts still work.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        info("Notification permission was not granted.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey });
      const json = sub.toJSON();
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await registerPush({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent });
        info("Notifications are on for this device.", "success");
      }
    } catch (err: any) {
      info(err?.message || "Could not turn on notifications.", "error");
    }
  };

  const formErrorEl = formError && (
    <p role="alert" className="rounded-[var(--r-sm)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--bad-fg)]">
      {formError}
    </p>
  );

  return (
    <div data-testid="chats-inbox-view" className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <section aria-labelledby="chats-heading" className="space-y-[var(--sp-3)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--sp-3)]">
          <div className="min-w-0 space-y-[var(--sp-1)]">
            <h1 id="chats-heading" data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold">
              Chats
            </h1>
            <p className="text-sm text-[var(--muted)]">Direct Messages, Group Chats and Deal Chats across KSU. They stay when you switch Campus.</p>
          </div>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {auth.status === "student" && pushInfo?.supportedInMode && (
              <button type="button" onClick={handleEnableWebPush} className={BTN_SECONDARY}>
                <Bell aria-hidden="true" className="h-4 w-4" />
                {pushInfo.endpoints.length > 0 ? `Notifications on (${pushInfo.endpoints.length} of 3 devices)` : "Turn on notifications"}
              </button>
            )}
            <button
              type="button"
              data-testid="new-dm-btn"
              onClick={() => {
                setFormError(null);
                setNewDmOpen(true);
              }}
              className={BTN_ACCENT}
            >
              <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />
              New message
            </button>
            <button
              type="button"
              data-testid="new-group-btn"
              onClick={() => {
                setFormError(null);
                setNewGroupOpen(true);
              }}
              className={BTN_PRIMARY}
            >
              <Users aria-hidden="true" className="h-4 w-4" />
              New group
            </button>
          </div>
        </div>

        <SegmentedControl
          label="Show chats"
          options={[
            { value: "all", label: "All" },
            { value: "dm", label: "Direct" },
            { value: "group", label: "Groups" },
            { value: "deal", label: "Deals" },
          ] as const}
          value={tab}
          onChange={setTab}
          testIdPrefix="chats-filter"
        />
      </section>

      <Dialog open={newDmOpen} onClose={() => setNewDmOpen(false)} title="New Direct Message" variant="sheet" testId="new-dm-dialog">
        <form onSubmit={handleStartDm} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={ids.dmHandle} className={LABEL}>
              Student @handle
            </label>
            <input id={ids.dmHandle} type="text" required value={dmTargetHandle} onChange={(e) => setDmTargetHandle(e.target.value)} placeholder="jordan_me" className={`${FIELD} mt-[var(--sp-1)]`} />
          </div>
          <div>
            <label htmlFor={ids.dmOpener} className={LABEL}>
              First message (optional)
            </label>
            <input id={ids.dmOpener} type="text" value={dmOpener} onChange={(e) => setDmOpener(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
            <p className="mt-[var(--sp-1)] text-sm text-[var(--muted)]">If you haven&apos;t chatted before, this is sent as a Message Request with one text-only opener.</p>
          </div>
          {formErrorEl}
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>
              Open Direct Message
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title="New Group Chat" variant="sheet" testId="new-group-dialog">
        <form onSubmit={handleCreateGroup} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={ids.groupTitle} className={LABEL}>
              Group name
            </label>
            <input id={ids.groupTitle} type="text" required value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
          </div>
          <div>
            <label htmlFor={ids.groupInvites} className={LABEL}>
              Invite @handles, separated by commas
            </label>
            <input id={ids.groupInvites} type="text" value={groupInvites} onChange={(e) => setGroupInvites(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
            <p className="mt-[var(--sp-1)] text-sm text-[var(--muted)]">Up to 50 students.</p>
          </div>
          {formErrorEl}
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY}>
              Create Group Chat
            </button>
          </div>
        </form>
      </Dialog>

      <section aria-labelledby="chats-list-heading">
        <h2 id="chats-list-heading" className="sr-only">
          Conversations
        </h2>
        {inbox === undefined ? (
          <p role="status" className="text-sm text-[var(--muted)]">
            Loading chats…
          </p>
        ) : inbox.length === 0 ? (
          <p data-testid="chats-empty" className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] text-body">
            No conversations here yet.
          </p>
        ) : (
          <ul data-testid="chats-inbox-list" className="space-y-[var(--sp-2)]">
            {inbox.map((row) => {
              const kind = KIND_LABEL[row.kind] ?? row.kind.replace("_", " ");
              return (
                <li
                  key={String(row.chatId)}
                  data-testid={`inbox-row-${row.kind}`}
                  className="flex min-w-0 items-center gap-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-2)] hover:border-[var(--line-strong)]"
                >
                  <Link href={`/chats/${row.chatId}`} className="flex min-h-[var(--target)] min-w-0 flex-1 flex-col justify-center gap-[var(--sp-1)] rounded-[var(--r-sm)] px-[var(--sp-2)] py-[var(--sp-1)]">
                    <span className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)]">
                      <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{row.title}</span>
                      <span className="rounded-full bg-[var(--surface-2)] px-[var(--sp-2)] text-sm text-[var(--muted)]">{kind}</span>
                      {row.isPendingIncomingRequest && (
                        <span className="rounded-full bg-[var(--warn-bg)] px-[var(--sp-2)] text-sm font-bold text-[var(--warn-fg)]">Message Request</span>
                      )}
                      {row.handoffStatus && (
                        <span className="rounded-full bg-[var(--ok-bg)] px-[var(--sp-2)] text-sm font-bold text-[var(--ok-fg)]">
                          Meetup {row.handoffStatus === "confirmed" ? "confirmed ✓" : row.handoffStatus}
                        </span>
                      )}
                      {row.unreadCount > 0 ? (
                        <span className="rounded-full bg-[var(--bad-fg)] px-[var(--sp-2)] text-sm font-bold text-[var(--bad-bg)]">
                          {row.unreadCount}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : row.hasDotUnread ? (
                        <span className="text-sm font-bold">
                          <span aria-hidden="true">●</span>
                          <span className="sr-only">New activity</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-sm text-[var(--muted)]">
                      {row.lastSenderHandle ? `@${row.lastSenderHandle}: ` : ""}
                      {row.lastMessagePreview ?? "No messages yet"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-pressed={row.isMuted}
                    aria-label={`Mute ${row.title}`}
                    onClick={() => void toggleMute({ chatId: row.chatId })}
                    className="min-target inline-flex shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    {row.isMuted ? <BellOff aria-hidden="true" className="h-5 w-5" /> : <Bell aria-hidden="true" className="h-5 w-5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
