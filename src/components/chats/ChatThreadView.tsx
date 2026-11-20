"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, Check, Edit3, ImagePlus, Lock, Reply, Send, Trash2, UserPlus, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL } from "@/components/marketplace/styles";

const QUICK_REACTIONS = [
  { emoji: "🦉", name: "owl" },
  { emoji: "👍", name: "thumbs up" },
  { emoji: "❤️", name: "heart" },
  { emoji: "😂", name: "laughing" },
  { emoji: "🔥", name: "fire" },
] as const;

const KIND_LABEL: Record<string, string> = {
  dm: "Direct Message",
  group: "Group Chat",
  custom_group: "Group Chat",
  study_session: "Study Session chat",
  deal: "Deal Chat",
};

const ICON_BTN =
  "min-target inline-flex shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]";

/**
 * Announces messages from other people that arrive while the thread is open.
 * The first render sets the baseline so history is never read out.
 */
function useIncomingAnnouncements(messages: any[] | undefined) {
  const { announce } = useAnnouncer();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!messages) return;
    if (seen.current === null) {
      seen.current = new Set(messages.map((m) => String(m._id)));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(String(m._id)));
    for (const m of fresh) seen.current.add(String(m._id));
    const incoming = fresh.filter((m) => !m.isOwnMessage && !m.isDeleted && !m.collapsedBlocked);
    if (incoming.length === 0) return;
    const last = incoming[incoming.length - 1];
    const who = last.sender ? `@${last.sender.handle}` : "OwlSide";
    const text = last.body ? `: ${String(last.body).slice(0, 140)}` : last.mediaUrl ? " sent a photo" : "";
    announce(incoming.length > 1 ? `${incoming.length} new messages. Latest from ${who}${text}` : `New message from ${who}${text}`);
  }, [messages, announce]);
}

export function ChatThreadView({
  chatId,
  dealHandoffSlot,
}: {
  chatId: string;
  dealHandoffSlot?: (thread: any) => React.ReactNode;
}) {
  const { uploadImage } = useViewerClient();
  const { toast } = useAnnouncer();
  const ids = { input: useId(), invite: useId(), attach: useId(), error: useId() };
  const thread = useViewerQuery(api.chats.getChatThread, { chatId: chatId as Id<"chats"> });

  const markRead = useViewerMutation(api.chats.markChatRead);
  const sendMessage = useViewerMutation(api.chats.sendMessage);
  const respondRequest = useViewerMutation(api.chats.respondToMessageRequest);
  const toggleReaction = useViewerMutation(api.chats.toggleMessageReaction);
  const editMessage = useViewerMutation(api.chats.editChatMessage);
  const deleteMessage = useViewerMutation(api.chats.deleteChatMessage);
  const convertStudyGroup = useViewerMutation(api.chats.convertStudyChatToClosedGroup);
  const inviteToCustomGroup = useViewerMutation(api.chats.inviteToCustomGroup);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const [body, setBody] = useState("");
  const [replyToId, setReplyToId] = useState<Id<"chatMessages"> | null>(null);
  const [mediaItem, setMediaItem] = useState<{ mediaAssetId: Id<"mediaAssets">; url: string } | null>(null);
  const [editingId, setEditingId] = useState<Id<"chatMessages"> | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [revealedBlockedIds, setRevealedBlockedIds] = useState<Record<string, boolean>>({});
  const [inviteHandle, setInviteHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useIncomingAnnouncements(thread?.messages);

  const latestSeq = thread?.chat.messageSeq ?? 0;
  useEffect(() => {
    if (thread && latestSeq > 0) {
      void markRead({ chatId: thread.chat._id }).catch(() => {});
    }
  }, [thread?.chat._id, latestSeq, markRead, thread]);

  if (thread === undefined) {
    return (
      <div className="p-[var(--sp-4)]">
        <h1 data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold">
          Chat
        </h1>
        <p role="status" className="mt-[var(--sp-2)] text-sm text-[var(--muted)]">
          Loading conversation…
        </p>
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="space-y-[var(--sp-3)] p-[var(--sp-4)]">
        <h1 data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold">
          Conversation not found
        </h1>
        <p className="text-body">This chat isn&apos;t available to you.</p>
        <Link href="/chats" className={BTN_SECONDARY}>
          Back to Chats
        </Link>
      </div>
    );
  }

  const { chat, messages, participants } = thread;
  const isIncomingRequest =
    chat.requestStatus === "pending_request" &&
    chat.requestInitiatorId &&
    participants.some((p: any) => p.student._id === chat.requestInitiatorId && !p.student.isRemoved);
  const initiatorParticipant = participants.find((p: any) => p.student._id === chat.requestInitiatorId);
  const chatTitle = chat.title || participants.map((p: any) => `@${p.student.handle}`).join(" · ");
  const replyTarget = replyToId ? messages.find((m: any) => m._id === replyToId) : null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await sendMessage({
        chatId: chat._id,
        body,
        mediaAssetId: mediaItem?.mediaAssetId,
        replyToMessageId: replyToId ?? undefined,
      });
      setBody("");
      setReplyToId(null);
      setMediaItem(null);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Message failed to send.");
    }
  };

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "chat");
      setMediaItem({ mediaAssetId: uploaded.mediaAssetId, url: uploaded.url });
    } catch (err: any) {
      setError(err?.message || "Photo upload failed.");
    }
  };

  return (
    <div data-testid="chat-thread-view" className="flex min-h-[calc(100dvh-var(--chrome-top))] flex-col">
      <div className="flex-1 space-y-[var(--sp-3)] p-[var(--sp-4)]">
        <section aria-labelledby="chat-thread-heading" className="flex flex-wrap items-end justify-between gap-[var(--sp-3)]">
          <div className="min-w-0 space-y-[var(--sp-1)]">
            <h1 id="chat-thread-heading" data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold">
              {chatTitle}
            </h1>
            <p className="text-sm text-[var(--muted)]">
              {KIND_LABEL[chat.kind] ?? chat.kind} · {participants.length} {participants.length === 1 ? "person" : "people"} · Scrappy can&apos;t read chats
            </p>
          </div>
          {chat.kind === "custom_group" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!inviteHandle.trim()) return;
                try {
                  await inviteToCustomGroup({ chatId: chat._id, inviteHandle });
                  setInviteHandle("");
                  toast({ message: "Invite sent", tone: "success" });
                } catch (err: any) {
                  setError(err?.data?.message || err?.message || "Could not invite.");
                }
              }}
              className="flex flex-wrap items-end gap-[var(--sp-2)]"
            >
              <div className="min-w-0">
                <label htmlFor={ids.invite} className={LABEL}>
                  Invite by @handle
                </label>
                <input id={ids.invite} type="text" value={inviteHandle} onChange={(e) => setInviteHandle(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`} />
              </div>
              <button type="submit" className={BTN_PRIMARY}>
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                Invite
              </button>
            </form>
          )}
        </section>

        {chat.kind === "deal" && dealHandoffSlot && dealHandoffSlot(thread)}

        {chat.requestStatus === "pending_request" && (
          <section
            aria-label="Message Request"
            data-testid="message-request-banner"
            className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--warn-bg)] p-[var(--sp-4)] text-[var(--warn-fg)]"
          >
            <p className="font-bold">Message Request: one text-only opener. Photos unlock after it&apos;s accepted.</p>
            {isIncomingRequest && initiatorParticipant && (
              <div className="flex flex-wrap gap-[var(--sp-2)]">
                <button type="button" data-testid="accept-request-btn" onClick={() => void respondRequest({ chatId: chat._id, decision: "accept" })} className={BTN_PRIMARY}>
                  <Check aria-hidden="true" className="h-4 w-4" />
                  Accept
                </button>
                <button type="button" data-testid="decline-request-btn" onClick={() => void respondRequest({ chatId: chat._id, decision: "decline" })} className={BTN_SECONDARY}>
                  Decline (30-day cooldown)
                </button>
                <button
                  type="button"
                  onClick={() => void toggleBlock({ targetStudentId: initiatorParticipant.student._id })}
                  className={`${BTN_SECONDARY} text-[var(--bad-fg)]`}
                >
                  <Ban aria-hidden="true" className="h-4 w-4" />
                  Block @{initiatorParticipant.student.handle}
                </button>
              </div>
            )}
          </section>
        )}

        {chat.isStudyGraceLocked && (
          <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
            <p className="flex min-w-0 items-center gap-[var(--sp-2)] text-sm font-bold text-[var(--muted)]">
              <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
              The Study Session ended more than 24 hours ago, so this chat is read-only.
            </p>
            <button type="button" onClick={() => void convertStudyGroup({ chatId: chat._id })} className={BTN_PRIMARY}>
              Convert to a Group Chat
            </button>
          </div>
        )}

        <section aria-labelledby="chat-messages-heading">
          <h2 id="chat-messages-heading" className="sr-only">
            Messages
          </h2>
          {messages.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No messages yet. Say hi.</p>
          ) : (
            <ol data-testid="chat-message-list" className="space-y-[var(--sp-2)]">
              {messages.map((msg: any) => {
                const isCollapsed = msg.collapsedBlocked && !revealedBlockedIds[String(msg._id)];
                if (isCollapsed) {
                  return (
                    <li
                      key={String(msg._id)}
                      data-testid="collapsed-blocked-message"
                      className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--sp-3)] py-[var(--sp-1)] text-sm text-[var(--muted)]"
                    >
                      <span>Message from a blocked student hidden</span>
                      <button
                        type="button"
                        onClick={() => setRevealedBlockedIds((prev) => ({ ...prev, [String(msg._id)]: true }))}
                        className="inline-flex min-h-[var(--target)] items-center font-bold text-[var(--ink)] underline"
                      >
                        Show message
                      </button>
                    </li>
                  );
                }
                const senderName = msg.sender ? `@${msg.sender.handle}` : "OwlSide";
                return (
                  <li
                    key={String(msg._id)}
                    data-testid="chat-message-bubble"
                    className={`rounded-[var(--r-md)] border p-[var(--sp-3)] ${
                      msg.messageType !== "user"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : msg.isOwnMessage
                          ? "ml-[var(--sp-5)] border-[var(--line-strong)] bg-[var(--surface-2)]"
                          : "mr-[var(--sp-5)] border-[var(--line)] bg-[var(--surface)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[var(--sp-1)]">
                      <p className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">
                        {msg.sender ? (
                          <>
                            {msg.isOwnMessage ? "You" : msg.sender.displayName}{" "}
                            <span className="font-normal text-[var(--muted)]">@{msg.sender.handle}</span>
                          </>
                        ) : (
                          "OwlSide system message"
                        )}
                        {msg.editedAt && <span className="font-normal text-[var(--muted)]"> · Edited</span>}
                      </p>
                      {!msg.isDeleted && (
                        <div className="flex flex-wrap items-center">
                          <button
                            type="button"
                            aria-label={`Reply to ${senderName}`}
                            onClick={() => {
                              setReplyToId(msg._id);
                              inputRef.current?.focus();
                            }}
                            className={ICON_BTN}
                          >
                            <Reply aria-hidden="true" className="h-4 w-4" />
                          </button>
                          {msg.isOwnMessage ? (
                            <>
                              {Date.now() - msg.publishedAt <= 5 * 60_000 && (
                                <button
                                  type="button"
                                  aria-label="Edit your message"
                                  onClick={() => {
                                    setEditingId(msg._id);
                                    setEditingBody(msg.body);
                                  }}
                                  className={ICON_BTN}
                                >
                                  <Edit3 aria-hidden="true" className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                data-testid="chat-delete-message-btn"
                                aria-label="Delete your message"
                                onClick={async () => {
                                  await deleteMessage({ messageId: msg._id });
                                  toast({ message: "Message deleted", tone: "success" });
                                }}
                                className={`${ICON_BTN} hover:text-[var(--bad-fg)]`}
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <ReportTrigger
                              targetType="chat_message"
                              targetId={String(msg._id)}
                              targetLabel={`message from ${senderName}`}
                              onSubmitReport={async (p) => {
                                await submitReport(p);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {msg.replyPreview && (
                      <p className="mt-[var(--sp-1)] border-l-4 border-[var(--accent)] bg-[var(--surface-2)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
                        <span className="sr-only">Replying to </span>
                        <strong>@{msg.replyPreview.senderHandle}:</strong> {msg.replyPreview.body}
                      </p>
                    )}

                    {editingId === msg._id ? (
                      <form
                        className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-2)]"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await editMessage({ messageId: msg._id, body: editingBody });
                          setEditingId(null);
                        }}
                      >
                        <input
                          type="text"
                          aria-label="Edit message"
                          autoFocus
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          className={`${FIELD} flex-1 basis-48`}
                        />
                        <button type="submit" className={BTN_PRIMARY}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className={BTN_SECONDARY}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <p className="mt-[var(--sp-1)] whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{msg.body}</p>
                    )}

                    {msg.mediaUrl && <img src={msg.mediaUrl} alt={`Photo from ${senderName}`} className="mt-[var(--sp-2)] max-h-56 max-w-full rounded-[var(--r-md)] object-cover" />}

                    {msg.linkEmbed && (
                      <Link href={msg.linkEmbed.href} className={`${BTN_SECONDARY} mt-[var(--sp-2)]`}>
                        {msg.linkEmbed.label}
                      </Link>
                    )}

                    {msg.scamWarningTriggered && (
                      <p
                        data-testid="deal-scam-warning-banner"
                        className="mt-[var(--sp-2)] flex items-start gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--warn-fg)] bg-[var(--warn-bg)] p-[var(--sp-2)] text-sm font-bold text-[var(--warn-fg)]"
                      >
                        <AlertTriangle aria-hidden="true" className="mt-[var(--sp-1)] h-4 w-4 shrink-0" />
                        <span>
                          Safety reminder: never send a deposit by Zelle, Cash App, Venmo or wire. Inspect the item in person at a
                          public KSU Meetup Spot before you pay.
                        </span>
                      </p>
                    )}

                    {!msg.isDeleted && (
                      <div role="group" aria-label={`Reactions to message from ${senderName}`} className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-1)]">
                        {QUICK_REACTIONS.map(({ emoji, name }) => {
                          const existing = msg.reactions.find((r: any) => r.emoji === emoji);
                          const count = existing?.count ?? 0;
                          return (
                            <button
                              key={emoji}
                              type="button"
                              aria-pressed={Boolean(existing?.reactedByViewer)}
                              aria-label={`React ${name}${count ? `, ${count}` : ""}`}
                              onClick={() => void toggleReaction({ messageId: msg._id, emoji })}
                              className={`inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-full border px-[var(--sp-2)] text-sm ${
                                existing?.reactedByViewer ? "border-[var(--ink)] bg-[var(--accent-soft)] font-bold" : "border-[var(--line)] bg-[var(--surface)]"
                              }`}
                            >
                              <span aria-hidden="true">{emoji}</span>
                              {count > 0 && <span aria-hidden="true">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {!chat.isReadOnlyLocked && (
        <form
          onSubmit={handleSend}
          aria-label="Send a message"
          data-testid="chat-composer"
          className="sticky bottom-0 z-20 space-y-[var(--sp-2)] border-t border-[var(--line)] bg-[var(--bg)] p-[var(--sp-3)] pb-[calc(var(--sp-3)+env(safe-area-inset-bottom,0px))]"
        >
          {replyToId && (
            <div className="flex items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--surface-2)] pl-[var(--sp-3)] text-sm font-bold text-[var(--muted)]">
              <span className="min-w-0 truncate">Replying to {replyTarget?.sender ? `@${replyTarget.sender.handle}` : "message"}</span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyToId(null)} className={ICON_BTN}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
          {mediaItem && (
            <div className="flex items-center gap-[var(--sp-2)]">
              <img src={mediaItem.url} alt="Photo to send" className="h-12 w-12 rounded-[var(--r-sm)] object-cover" />
              <button type="button" onClick={() => setMediaItem(null)} className={BTN_SECONDARY}>
                Remove photo
              </button>
            </div>
          )}
          {error && (
            <p id={ids.error} role="alert" className="text-sm font-bold text-[var(--bad-fg)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-[var(--sp-2)]">
            {chat.requestStatus !== "pending_request" && (
              <label
                htmlFor={ids.attach}
                className="min-target inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] focus-within:outline focus-within:outline-[length:var(--focus-w)] focus-within:outline-[var(--focus)]"
              >
                <ImagePlus aria-hidden="true" className="h-5 w-5" />
                <span className="sr-only">Attach a photo</span>
                <input id={ids.attach} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAttach} className="sr-only" />
              </label>
            )}
            <label htmlFor={ids.input} className="sr-only">
              Message {chatTitle}
            </label>
            <input
              id={ids.input}
              ref={inputRef}
              type="text"
              data-testid="chat-message-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              placeholder="Write a message…"
              aria-describedby={error ? ids.error : undefined}
              className={`${FIELD} flex-1`}
            />
            <button type="submit" data-testid="chat-send-btn" disabled={!body.trim() && !mediaItem} className={`${BTN_PRIMARY} shrink-0 px-[var(--sp-3)]`}>
              <Send aria-hidden="true" className="h-4 w-4" />
              <span className="lt-hide-label">Send</span>
              <span className="sr-only">message</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
