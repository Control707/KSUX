"use client";

import React, { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileEdit, Plus, Send, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { CitationPill } from "@/components/shared/CampusEntityCard";
import { BTN_ACCENT, BTN_PRIMARY, BTN_SECONDARY, FIELD } from "@/components/marketplace/styles";

const STARTERS = [
  "Where should I park on Kennesaw right now and when is the next Big Owl Bus?",
  "What are my enrolled Course Hubs and upcoming deadlines?",
  "Draft a Listing to sell my CS 3305 textbook for $40",
];

type DraftCard = {
  draftKind: "post" | "listing" | "parking_report" | "study_session";
  title: string;
  summary: string;
  payloadJson: string;
};

export function ScrappyView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth, setPendingDraftCard } = useViewerClient();
  const inputId = useId();

  const [selectedThreadId, setSelectedThreadId] = useState<Id<"scrappyThreads"> | "new" | null>(null);
  // The Quick Sheet's Ask field hands its question over as ?q=.
  const [prompt, setPrompt] = useState(() => searchParams.get("q")?.slice(0, 1000) ?? "");
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<any[]>([]);
  const [streamingDraft, setStreamingDraft] = useState<any | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerAnnouncement, setAnswerAnnouncement] = useState("");

  const threads = useViewerQuery(api.scrappy.threads.listMyThreads, {});
  const activeThreadId = selectedThreadId === "new" ? null : selectedThreadId ?? threads?.[0]?._id ?? null;
  const threadData = useViewerQuery(
    api.scrappy.threads.getThreadMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  const handleOpenDraftComposer = (draftCard: DraftCard) => {
    setPendingDraftCard(draftCard);
    if (draftCard.draftKind === "post") router.push("/feed?compose=1");
    else if (draftCard.draftKind === "listing") router.push("/marketplace?create=1");
    else if (draftCard.draftKind === "parking_report") router.push("/parking?report=1");
    else router.push("/study?host=1");
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
          threadId: activeThreadId ?? undefined,
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
      let answer = "";
      let draftTitle: string | null = null;
      let citationCount = 0;
      let streamError: string | null = null;

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
            answer += String(payload.text);
            setStreamingText(answer);
          } else if (eventName === "citations") {
            citationCount = (payload.citations ?? []).length;
            setStreamingCitations(payload.citations ?? []);
          } else if (eventName === "draft") {
            draftTitle = payload.draftCard?.title ?? null;
            setStreamingDraft(payload.draftCard ?? null);
          } else if (eventName === "error") {
            streamError = payload.message || "Scrappy couldn't answer.";
            setError(streamError);
          }
        }
      }
      setPrompt("");
      if (!streamError) {
        // Announce the finished answer once, never token by token.
        const extras = [
          citationCount > 0 ? `${citationCount} ${citationCount === 1 ? "source" : "sources"}` : null,
          draftTitle ? `Draft ready to review: ${draftTitle}` : null,
        ].filter(Boolean);
        setAnswerAnnouncement("");
        requestAnimationFrame(() =>
          setAnswerAnnouncement(`Scrappy answered: ${answer.trim() || "(no text)"}${extras.length ? `. ${extras.join(". ")}.` : ""}`)
        );
      }
    } catch (err: any) {
      setError(err?.message || "Scrappy couldn't answer. Try again.");
    } finally {
      setStreaming(false);
    }
  };

  const messages = threadData?.messages ?? [];

  return (
    <div data-testid="ask-scrappy-view" className="flex min-h-[calc(100dvh-var(--chrome-top))] flex-col">
      <div className="flex-1 space-y-[var(--sp-4)] p-[var(--sp-4)]">
        <section aria-labelledby="scrappy-heading" className="space-y-[var(--sp-3)]">
          <div className="flex flex-wrap items-end justify-between gap-[var(--sp-3)]">
            <div className="min-w-0 space-y-[var(--sp-1)]">
              <h1 id="scrappy-heading" data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold">
                <span aria-hidden="true">🦉 </span>Ask Scrappy
              </h1>
              <p className="flex items-start gap-[var(--sp-1)] text-sm text-[var(--muted)]">
                <ShieldCheck aria-hidden="true" className="mt-[var(--sp-1)] h-4 w-4 shrink-0" />
                <span>
                  An AI helper for campus info. It can&apos;t read your chats, can only look things up, and makes Drafts you review
                  before anything is posted. Check important answers yourself.
                </span>
              </p>
            </div>
            <button
              type="button"
              data-testid="scrappy-new-thread-btn"
              disabled={streaming}
              onClick={() => {
                setSelectedThreadId("new");
                setPrompt("");
                setStreamingText("");
                setStreamingDraft(null);
                setStreamingCitations([]);
                setError(null);
              }}
              className={BTN_ACCENT}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              New conversation
            </button>
          </div>

          {(threads?.length ?? 0) > 0 && (
            <nav aria-label="Past conversations">
              <ul className="flex flex-wrap gap-[var(--sp-2)]">
                {threads!.map((th) => {
                  const active = activeThreadId === th._id;
                  return (
                    <li key={String(th._id)} className="min-w-0">
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        disabled={streaming}
                        onClick={() => setSelectedThreadId(th._id)}
                        className={`${active ? BTN_PRIMARY : BTN_SECONDARY} max-w-full [overflow-wrap:anywhere]`}
                      >
                        {active && <span aria-hidden="true">✓</span>}
                        {th.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </section>

        {messages.length === 0 && !streaming && (
          <section aria-labelledby="scrappy-starters-heading" className="space-y-[var(--sp-2)]">
            <h2 id="scrappy-starters-heading" className="font-display text-lg font-bold">
              Try asking
            </h2>
            <ul className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-2)] md:grid-cols-3">
              {STARTERS.map((q) => (
                <li key={q} className="min-w-0">
                  <button
                    type="button"
                    disabled={streaming}
                    onClick={() => void submitPromptOverSse(q)}
                    className="flex min-h-[var(--target)] w-full items-start gap-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)] text-left text-sm font-bold hover:border-[var(--line-strong)] [overflow-wrap:anywhere]"
                  >
                    <Sparkles aria-hidden="true" className="mt-[var(--sp-1)] h-4 w-4 shrink-0" />
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="scrappy-conversation-heading">
          <h2 id="scrappy-conversation-heading" className="sr-only">
            Conversation
          </h2>
          <ol className="space-y-[var(--sp-3)]">
            {messages.map((msg) => (
              <li
                key={String(msg._id)}
                data-testid={`scrappy-message-${msg.role}`}
                className={`rounded-[var(--r-lg)] border p-[var(--sp-4)] ${
                  msg.role === "assistant" ? "mr-[var(--sp-5)] border-[var(--accent)] bg-[var(--surface)]" : "ml-[var(--sp-5)] border-[var(--line)] bg-[var(--surface-2)]"
                }`}
              >
                <p className="text-sm font-bold">{msg.role === "assistant" ? "Scrappy" : "You"}</p>
                <p className="mt-[var(--sp-1)] whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{msg.content}</p>
                {msg.citations.length > 0 && (
                  <ul aria-label="Sources" className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-2)]">
                    {msg.citations.map((c, idx) => (
                      <li key={idx} className="min-w-0">
                        <CitationPill label={c.label} href={c.href} campus={c.campus} />
                      </li>
                    ))}
                  </ul>
                )}
                {msg.draftCard && (
                  <div
                    data-testid="scrappy-draft-card"
                    className="mt-[var(--sp-3)] flex flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-md)] border-2 border-[var(--ink)] bg-[var(--accent-soft)] p-[var(--sp-3)]"
                  >
                    <div className="min-w-0">
                      <p className="font-bold [overflow-wrap:anywhere]">
                        <span aria-hidden="true">📝 </span>Draft: {msg.draftCard.title}
                      </p>
                      <p className="text-sm [overflow-wrap:anywhere]">{msg.draftCard.summary} Nothing is posted until you review it and tap Publish.</p>
                    </div>
                    <button
                      type="button"
                      data-testid="review-draft-card-btn"
                      onClick={() => handleOpenDraftComposer(msg.draftCard!)}
                      className={BTN_PRIMARY}
                    >
                      <FileEdit aria-hidden="true" className="h-4 w-4" />
                      Review draft<span className="sr-only">: {msg.draftCard.title}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}

            {streaming && (
              <li
                data-testid="scrappy-sse-streaming-bubble"
                aria-busy="true"
                className="mr-[var(--sp-5)] rounded-[var(--r-lg)] border border-[var(--accent)] bg-[var(--surface)] p-[var(--sp-4)]"
              >
                <p className="text-sm font-bold">Scrappy is answering…</p>
                <p className="mt-[var(--sp-1)] whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{streamingText || "Checking campus info…"}</p>
                {streamingCitations.length > 0 && (
                  <ul aria-label="Sources" className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-2)]">
                    {streamingCitations.map((c, idx) => (
                      <li key={idx} className="min-w-0">
                        <CitationPill label={c.label} href={c.href} campus={c.campus} />
                      </li>
                    ))}
                  </ul>
                )}
                {streamingDraft && <p className="mt-[var(--sp-2)] text-sm font-bold">Preparing a Draft: {streamingDraft.title}</p>}
              </li>
            )}
          </ol>
        </section>

        {error && (
          <p role="alert" className="rounded-[var(--r-sm)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--bad-fg)]">
            {error}
          </p>
        )}
      </div>

      {/* Completed answers are announced once, here, not token by token. */}
      <div role="status" aria-live="polite" className="sr-only" data-testid="scrappy-answer-status">
        {answerAnnouncement}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitPromptOverSse(prompt);
        }}
        aria-label="Ask Scrappy"
        data-testid="scrappy-composer"
        className="sticky bottom-0 z-20 flex items-center gap-[var(--sp-2)] border-t border-[var(--line)] bg-[var(--bg)] p-[var(--sp-3)] pb-[calc(var(--sp-3)+env(safe-area-inset-bottom,0px))]"
      >
        <label htmlFor={inputId} className="sr-only">
          Ask Scrappy a question
        </label>
        <input
          id={inputId}
          type="text"
          data-testid="ask-scrappy-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={1500}
          placeholder="Ask about parking, study rooms, courses, events…"
          className={`${FIELD} flex-1`}
        />
        <button type="submit" data-testid="ask-scrappy-send-btn" disabled={streaming || !prompt.trim()} className={`${BTN_PRIMARY} shrink-0 px-[var(--sp-3)]`}>
          <Send aria-hidden="true" className="h-4 w-4" />
          <span className="lt-hide-label">{streaming ? "Answering…" : "Ask"}</span>
          {streaming && <span className="sr-only">Scrappy is answering</span>}
        </button>
      </form>
    </div>
  );
}
