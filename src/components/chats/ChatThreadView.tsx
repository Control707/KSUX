"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Edit3,
  ImagePlus,
  Lock,
  Reply,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";

const QUICK_REACTIONS = ["🦉", "👍", "❤️", "😂", "🔥"] as const;

export function ChatThreadView({
  chatId,
  dealHandoffSlot,
}: {
  chatId: string;
  dealHandoffSlot?: (thread: any) => React.ReactNode;
}) {
  const { uploadImage } = useViewerClient();
  const thread = useViewerQuery(api.chats.getChatThread, {
    chatId: chatId as Id<"chats">,
  });

  const markRead = useViewerMutation(api.chats.markChatRead);
  const sendMessage = useViewerMutation(api.chats.sendMessage);
  const respondRequest = useViewerMutation(api.chats.respondToMessageRequest);
  const toggleReaction = useViewerMutation(api.chats.toggleMessageReaction);
  const editMessage = useViewerMutation(api.chats.editChatMessage);
  const deleteMessage = useViewerMutation(api.chats.deleteChatMessage);
  const convertStudyGroup = useViewerMutation(
    api.chats.convertStudyChatToClosedGroup
  );
  const inviteToCustomGroup = useViewerMutation(api.chats.inviteToCustomGroup);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const [body, setBody] = useState("");
  const [replyToId, setReplyToId] = useState<Id<"chatMessages"> | null>(null);
  const [mediaItem, setMediaItem] = useState<{
    mediaAssetId: Id<"mediaAssets">;
    url: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<Id<"chatMessages"> | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [revealedBlockedIds, setRevealedBlockedIds] = useState<
    Record<string, boolean>
  >({});
  const [inviteHandle, setInviteHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const latestSeq = thread?.chat.messageSeq ?? 0;
  useEffect(() => {
    if (thread && latestSeq > 0) {
      void markRead({ chatId: thread.chat._id }).catch(() => {});
    }
  }, [thread?.chat._id, latestSeq, markRead, thread]);

  if (thread === undefined) {
    return (
      <div className="p-4 text-xs font-semibold text-[#5E6675]">
        Loading conversation...
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-sm font-bold">
          Conversation not found in this workspace.
        </div>
      </div>
    );
  }

  const { chat, messages, participants } = thread;
  const isIncomingRequest =
    chat.requestStatus === "pending_request" &&
    chat.requestInitiatorId &&
    participants.some(
      (p: any) =>
        p.student._id === chat.requestInitiatorId && !p.student.isRemoved
    );
  const initiatorParticipant = participants.find(
    (p: any) => p.student._id === chat.requestInitiatorId
  );

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
      setError(err?.data?.message || err?.message || "Message failed.");
    }
  };

  const handleAttachWebP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "chat");
      setMediaItem({ mediaAssetId: uploaded.mediaAssetId, url: uploaded.url });
    } catch (err: any) {
      setError(err?.message || "Image upload failed.");
    }
  };

  return (
    <div
      data-testid="chat-thread-view"
      className="flex min-h-[calc(100vh-140px)] flex-col p-3.5"
    >
      {/* Thread Header */}
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Link
              href="/chats"
              className="rounded-xl border border-[#E4E7EE] p-1.5 text-[#111317] hover:bg-[#F4F6FA]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-sm font-black text-[#111317]">
                {chat.title ||
                  participants
                    .map((p: any) => `@${p.student.handle}`)
                    .join(" · ")}
              </h1>
              <p className="text-[11px] text-[#5E6675]">
                {chat.kind.replace("_", " ").toUpperCase()} ·{" "}
                {participants.length} participant
                {participants.length === 1 ? "" : "s"} · Scrappy AI Strictly
                Excluded
              </p>
            </div>
          </div>

          {chat.kind === "custom_group" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!inviteHandle.trim()) return;
                try {
                  await inviteToCustomGroup({
                    chatId: chat._id,
                    inviteHandle,
                  });
                  setInviteHandle("");
                } catch (err: any) {
                  setError(err?.data?.message || err?.message);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value)}
                placeholder="+ @handle"
                className="w-28 rounded-xl border border-[#E4E7EE] px-2.5 py-1 text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-2.5 py-1 text-[11px] font-extrabold text-[#FDBB30]"
              >
                <UserPlus className="h-3 w-3" />
                <span>Invite</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Deal Chat Pinned Handoff Card & Seller/Buyer Lifecycle Slot (#24) */}
      {chat.kind === "deal" && dealHandoffSlot && (
        <div className="mt-3">{dealHandoffSlot(thread)}</div>
      )}

      {/* Cold Message Request Controls */}
      {chat.requestStatus === "pending_request" && (
        <div
          data-testid="message-request-banner"
          className="mt-3 rounded-2xl border border-[#FDBB30] bg-[#FFF6DC] p-3.5 text-xs text-[#111317]"
        >
          <div className="font-extrabold">
            Cold 1:1 Message Request (1 text-only opener · images locked until
            accepted)
          </div>
          {isIncomingRequest && initiatorParticipant && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="accept-request-btn"
                onClick={() =>
                  void respondRequest({ chatId: chat._id, decision: "accept" })
                }
                className="inline-flex items-center gap-1 rounded-xl bg-[#15803D] px-3 py-1.5 font-extrabold text-white"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                data-testid="decline-request-btn"
                onClick={() =>
                  void respondRequest({ chatId: chat._id, decision: "decline" })
                }
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-1.5 font-bold text-[#5E6675]"
              >
                Decline (30d Cooldown)
              </button>
              <button
                type="button"
                onClick={() =>
                  void toggleBlock({
                    targetStudentId: initiatorParticipant.student._id,
                  })
                }
                className="inline-flex items-center gap-1 rounded-xl bg-[#FEE2E2] px-3 py-1.5 font-bold text-[#B91C1C]"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Block</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Study Session 24h Post-Session Grace Lock + 1-Tap Upgrade */}
      {chat.isStudyGraceLocked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E4E7EE] bg-white p-3.5 text-xs">
          <span className="flex items-center gap-1.5 font-bold text-[#5E6675]">
            <Lock className="h-4 w-4" />
            <span>
              Study Session 24-hour grace window ended — chat locked read-only.
            </span>
          </span>
          <button
            type="button"
            onClick={() => void convertStudyGroup({ chatId: chat._id })}
            className="rounded-xl bg-[#111317] px-3 py-1.5 font-extrabold text-[#FDBB30]"
          >
            Convert to Closed Group Chat
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div className="my-3 flex-1 space-y-2.5">
        {messages.map((msg: any) => {
          const isCollapsed =
            msg.collapsedBlocked && !revealedBlockedIds[String(msg._id)];

          if (isCollapsed) {
            return (
              <div
                key={String(msg._id)}
                data-testid="collapsed-blocked-message"
                className="flex items-center justify-between rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs text-[#5E6675]"
              >
                <span>Message from a Blocked Student hidden</span>
                <button
                  type="button"
                  onClick={() =>
                    setRevealedBlockedIds((prev) => ({
                      ...prev,
                      [String(msg._id)]: true,
                    }))
                  }
                  className="font-bold text-[#111317] underline"
                >
                  Tap to reveal
                </button>
              </div>
            );
          }

          return (
            <div
              key={String(msg._id)}
              data-testid="chat-message-bubble"
              className={`rounded-2xl border p-3 text-xs ${
                msg.messageType !== "user"
                  ? "border-[#FDBB30] bg-[#FFFDF7]"
                  : msg.isOwnMessage
                    ? "border-[#111317]/15 bg-white"
                    : "border-[#E4E7EE] bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-extrabold text-[#111317]">
                  {msg.sender ? (
                    <>
                      {msg.sender.displayName}{" "}
                      <span className="font-normal text-[#5E6675]">
                        @{msg.sender.handle}
                      </span>
                    </>
                  ) : (
                    "KSUX System"
                  )}
                  {msg.editedAt && (
                    <span className="ml-1.5 text-[10px] italic font-normal text-[#5E6675]">
                      · Edited
                    </span>
                  )}
                </div>

                {!msg.isDeleted && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setReplyToId(msg._id)}
                      className="rounded p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
                      title="Quote Reply"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {msg.isOwnMessage ? (
                      <>
                        {Date.now() - msg.publishedAt <= 5 * 60_000 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(msg._id);
                              setEditingBody(msg.body);
                            }}
                            className="rounded p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void deleteMessage({ messageId: msg._id })
                          }
                          className="rounded p-1 text-[#5E6675] hover:text-[#B91C1C]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <ReportTrigger
                        targetType="chat_message"
                        targetId={String(msg._id)}
                        onSubmitReport={async (p) => {
                          await submitReport(p);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              {msg.replyPreview && (
                <div className="mt-1.5 rounded-lg border-l-2 border-[#FDBB30] bg-[#F4F6FA] px-2.5 py-1 text-[11px] text-[#5E6675]">
                  <strong>@{msg.replyPreview.senderHandle}:</strong>{" "}
                  {msg.replyPreview.body}
                </div>
              )}

              {editingId === msg._id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    className="flex-1 rounded-lg border border-[#111317] px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await editMessage({
                        messageId: msg._id,
                        body: editingBody,
                      });
                      setEditingId(null);
                    }}
                    className="rounded-lg bg-[#111317] px-2.5 py-1 font-extrabold text-[#FDBB30]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1B1F27]">
                  {msg.body}
                </p>
              )}

              {msg.mediaUrl && (
                <img
                  src={msg.mediaUrl}
                  alt="Chat attachment"
                  className="mt-2 max-h-56 rounded-xl object-cover"
                />
              )}

              {msg.linkEmbed && (
                <Link
                  href={msg.linkEmbed.href}
                  className="mt-2 inline-block rounded-lg border border-[#E4E7EE] bg-[#F9FAFC] px-2.5 py-1 text-[11px] font-bold text-[#1E3A8A] underline"
                >
                  {msg.linkEmbed.label}
                </Link>
              )}

              {msg.scamWarningTriggered && (
                <div
                  data-testid="deal-scam-warning-banner"
                  className="mt-2 flex items-start gap-2 rounded-xl border border-[#B45309] bg-[#FEF3C7] p-2.5 text-[11.5px] font-bold text-[#92400E]"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Safety Reminder: Never send upfront Zelle, CashApp, Venmo,
                    or wire deposits. Always inspect items in person at a
                    well-lit KSU Meetup Spot before paying!
                  </span>
                </div>
              )}

              {!msg.isDeleted && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {QUICK_REACTIONS.map((emoji) => {
                    const existing = msg.reactions.find(
                      (r: any) => r.emoji === emoji
                    );
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() =>
                          void toggleReaction({
                            messageId: msg._id,
                            emoji,
                          })
                        }
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          existing?.reactedByViewer
                            ? "border-[#111317] bg-[#FFF6DC] font-extrabold"
                            : "border-[#E4E7EE] bg-[#F9FAFC]"
                        }`}
                      >
                        {emoji} {existing ? existing.count : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {!chat.isReadOnlyLocked && (
        <form
          onSubmit={handleSend}
          className="space-y-2 rounded-2xl border border-[#E4E7EE] bg-white p-3 shadow-xs"
        >
          {replyToId && (
            <div className="flex items-center justify-between rounded-lg bg-[#F4F6FA] px-2.5 py-1 text-[11px] font-bold text-[#5E6675]">
              <span>Replying to message</span>
              <button type="button" onClick={() => setReplyToId(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {mediaItem && (
            <div className="flex items-center gap-2">
              <img
                src={mediaItem.url}
                alt="Preview"
                className="h-12 w-12 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => setMediaItem(null)}
                className="text-xs font-bold text-[#B91C1C]"
              >
                Remove
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs font-semibold text-[#B91C1C]">{error}</p>
          )}

          <div className="flex items-center gap-2">
            {chat.requestStatus !== "pending_request" && (
              <label className="cursor-pointer rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] p-2 text-[#111317]">
                <ImagePlus className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAttachWebP}
                  className="hidden"
                />
              </label>
            )}

            <input
              type="text"
              data-testid="chat-message-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              placeholder="Write a message..."
              className="flex-1 rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs focus:border-[#111317] focus:outline-none"
            />

            <button
              type="submit"
              data-testid="chat-send-btn"
              disabled={!body.trim() && !mediaItem}
              className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3.5 py-2 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
