"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerQuery,
} from "@/lib/viewerClient";
import { CitationPill } from "@/components/shared/CampusEntityCard";

export function ScrappyView() {
  const router = useRouter();
  const { auth, setPendingDraftCard } = useViewerClient();

  const [selectedThreadId, setSelectedThreadId] =
    useState<Id<"scrappyThreads"> | null>(null);
  const [prompt, setPrompt] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<any[]>([]);
  const [streamingDraft, setStreamingDraft] = useState<any | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threads = useViewerQuery(api.scrappy.threads.listMyThreads, {});
  const activeThreadId = selectedThreadId ?? threads?.[0]?._id ?? null;
  const threadData = useViewerQuery(
    api.scrappy.threads.getThreadMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  const handleOpenDraftComposer = (draftCard: {
    draftKind: "post" | "listing" | "parking_report" | "study_session";
    title: string;
    summary: string;
    payloadJson: string;
  }) => {
    setPendingDraftCard(draftCard);
    if (draftCard.draftKind === "post") {
      router.push("/feed?compose=1");
    } else if (draftCard.draftKind === "listing") {
      router.push("/marketplace?create=1");
    } else if (draftCard.draftKind === "parking_report") {
      router.push("/parking?report=1");
    } else {
      router.push("/study?host=1");
    }
  };

  const submitPromptOverSse = async (promptText: string) => {
    if (!promptText.trim() || streaming) return;
    setStreaming(true);
    setStreamingText("");
    setStreamingCitations([]);
    setStreamingDraft(null);
    setError(null);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth.status === "demo") {
      headers["x-ksux-demo-session"] = auth.demoShortCode;
      headers["x-ksux-demo-persona"] = auth.demoPersonaHandle;
    }

    try {
      const resp = await fetch("/api/scrappy/stream", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({
          threadId: selectedThreadId ?? undefined,
          prompt: promptText.trim(),
        }),
      });

      if (!resp.ok || !resp.body) {
        const json = await resp.json().catch(() => ({}));
        throw new Error(json.error || "Ask Scrappy SSE stream failed.");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const eventLine = block
            .split("\n")
            .find((l) => l.startsWith("event: "));
          const dataLine = block
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const eventName = eventLine.slice(7).trim();
          const payload = JSON.parse(dataLine.slice(6));

          if (eventName === "meta" && payload.threadId) {
            setSelectedThreadId(payload.threadId as Id<"scrappyThreads">);
          } else if (eventName === "delta" && payload.text) {
            setStreamingText((prev) => prev + String(payload.text));
          } else if (eventName === "citations") {
            setStreamingCitations(payload.citations ?? []);
          } else if (eventName === "draft") {
            setStreamingDraft(payload.draftCard ?? null);
          } else if (eventName === "error") {
            setError(payload.message || "Ask Scrappy error.");
          }
        }
      }
      setPrompt("");
    } catch (err: any) {
      setError(err?.message || "Failed to stream Scrappy answer.");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div data-testid="ask-scrappy-view" className="space-y-4 p-4">
      {/* Header & Isolation Guarantee */}
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111317] text-lg font-black text-[#FDBB30]">
              🦉
            </span>
            <div>
              <h1 className="text-base font-black text-[#111317]">
                Ask Scrappy · Campus Owl AI
              </h1>
              <p className="flex items-center gap-1 text-xs text-[#5E6675]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#15803D]" />
                <span>
                  Chat-isolated (zero access to DMs, Group Chats, or Deal Chats)
                  · Read-only tools + Draft Cards
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedThreadId(null);
              setStreamingText("");
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-1.5 text-xs font-extrabold text-[#111317]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Thread</span>
          </button>
        </div>

        {/* Thread Selector Pills */}
        {(threads?.length ?? 0) > 0 && (
          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto border-t border-[#E4E7EE] pt-2.5">
            {threads!.map((th) => {
              const active = activeThreadId === th._id;
              return (
                <button
                  key={String(th._id)}
                  type="button"
                  onClick={() => setSelectedThreadId(th._id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    active
                      ? "bg-[#111317] text-[#FDBB30]"
                      : "border border-[#E4E7EE] bg-[#F4F6FA] text-[#5E6675]"
                  }`}
                >
                  {th.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Starter Prompts */}
      <div className="flex flex-wrap gap-2">
        {[
          "Where should I park on Kennesaw right now and when is the next Big Owl Bus?",
          "What are my enrolled Course Hubs and upcoming deadlines?",
          "Draft a Listing to sell my CS 3305 textbook for $40",
        ].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => void submitPromptOverSse(q)}
            className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-left text-xs font-bold text-[#111317] hover:border-[#D99B00] hover:bg-[#FFFDF7]"
          >
            <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#D99B00]" />
            {q}
          </button>
        ))}
      </div>

      {/* Conversation History */}
      <div className="space-y-3">
        {(threadData?.messages ?? []).map((msg) => (
          <div
            key={String(msg._id)}
            data-testid={`scrappy-message-${msg.role}`}
            className={`rounded-2xl border p-4 text-xs ${
              msg.role === "assistant"
                ? "border-[#FDBB30] bg-white shadow-xs"
                : "border-[#E4E7EE] bg-[#F9FAFC]"
            }`}
          >
            <div className="font-extrabold text-[#111317]">
              {msg.role === "assistant" ? "🦉 Scrappy" : "You"}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1B1F27]">
              {msg.content}
            </p>

            {msg.citations.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {msg.citations.map((c, idx) => (
                  <CitationPill
                    key={idx}
                    label={c.label}
                    href={c.href}
                    campus={c.campus}
                  />
                ))}
              </div>
            )}

            {msg.draftCard && (
              <div
                data-testid="scrappy-draft-card"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#111317] bg-[#FFF6DC] p-3"
              >
                <div>
                  <div className="text-xs font-black text-[#111317]">
                    📝 Pre-Filled Draft Card: {msg.draftCard.title}
                  </div>
                  <div className="text-[11px] text-[#374151]">
                    {msg.draftCard.summary} (Zero DB write until you review &amp;
                    tap Publish)
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="review-draft-card-btn"
                  onClick={() => handleOpenDraftComposer(msg.draftCard!)}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3.5 py-2 text-xs font-extrabold text-[#FDBB30]"
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  <span>Review &amp; Publish</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Live SSE Streaming Bubble */}
        {streaming && (
          <div
            data-testid="scrappy-sse-streaming-bubble"
            className="rounded-2xl border border-[#FDBB30] bg-white p-4 text-xs shadow-xs"
          >
            <div className="font-extrabold text-[#111317]">
              🦉 Scrappy (Streaming SSE...)
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-[#1B1F27]">
              {streamingText || "Checking KSU campus modules..."}
            </p>
            {streamingCitations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {streamingCitations.map((c, idx) => (
                  <CitationPill
                    key={idx}
                    label={c.label}
                    href={c.href}
                    campus={c.campus}
                  />
                ))}
              </div>
            )}
            {streamingDraft && (
              <div className="mt-2 text-[11px] font-bold text-[#855A00]">
                Prepared Pre-Filled Draft Card: {streamingDraft.title}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {error}
        </p>
      )}

      {/* Ask Scrappy Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitPromptOverSse(prompt);
        }}
        className="flex gap-2 rounded-2xl border border-[#E4E7EE] bg-white p-3 shadow-xs"
      >
        <input
          type="text"
          data-testid="ask-scrappy-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={1500}
          placeholder="Ask Scrappy about Kennesaw/Marietta Parking, Study Rooms, Courses, Events, or draft a Post..."
          className="flex-1 rounded-xl border border-[#E4E7EE] px-3.5 py-2 text-xs font-medium focus:border-[#111317] focus:outline-none"
        />
        <button
          type="submit"
          data-testid="ask-scrappy-send-btn"
          disabled={streaming || !prompt.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{streaming ? "Streaming..." : "Ask"}</span>
        </button>
      </form>
    </div>
  );
}
