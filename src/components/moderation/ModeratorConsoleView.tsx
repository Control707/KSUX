"use client";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { INCIDENT_CATEGORIES, INCIDENT_REASONS } from "@convex/lib/incidentPolicy";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { V2LaunchOps } from "./V2LaunchOps";
import { AlertSourceOps } from "./AlertSourceOps";
import { CloutAnomalies } from "./CloutAnomalies";
import { ModerationReview } from "./ModerationReview";
import { AppealsPanel, ActionLog, FeedHealth, ModeratorRoster, OfficerClaims } from "./ModerationSections";
import { modButton, modCard, modAge, actionLabels, type ModerationAction } from "./consoleUi";

export function ModeratorConsoleView() {
  const { authArgs } = useViewerClient();
  return <Console key={JSON.stringify(authArgs)} />;
}
function Console() {
  const { auth } = useViewerClient();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const isModerator = summary?.viewer.isModerator === true;
  const queue = useViewerQuery(api.moderatorConsole.queue, isModerator ? {} : "skip");
  const appeals = useViewerQuery(api.moderatorConsole.appeals, isModerator ? {} : "skip");
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get("section") ?? "queue";
  const selectedKey = params.get("item");
  const selected = queue?.items.find((i) => i.key === selectedKey);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  const { announce, toast } = useAnnouncer();
  const maintainer = summary?.viewer.isMaintainer === true;
  const showFeedHealth = maintainer && auth.status === "student";
  const navigate = (nextSection: string, key?: string, replace = false) => {
    const url = `/moderation?section=${nextSection}${key ? `&item=${encodeURIComponent(key)}` : ""}`;
    if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  };
  const previousKey = useRef<string | null>(null);
  useEffect(() => {
    if (selectedKey) heading.current?.focus();
    else if (previousKey.current) rowRefs.current.get(previousKey.current)?.focus();
    previousKey.current = selectedKey;
  }, [selectedKey, selected?.key]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedKey && !document.querySelector('[role="alertdialog"]')) { e.preventDefault(); navigate("queue"); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });
  function done(action: ModerationAction) {
    const next = queue?.items.find((i) => i.key !== selectedKey);
    if (action !== "note") {
      navigate("queue", window.matchMedia("(min-width: 1024px)").matches ? next?.key : undefined, true);
      setTimeout(() => rowRefs.current.get(next?.key ?? "")?.focus(), 200);
    }
    toast({ message: `${actionLabels[action]} complete. Logged. ${action === "note" ? "Item stays in the queue." : next ? `Next: ${next.kind}, ${next.title}.` : "No more items in your queue."}` });
  }
  if (!summary) return <div className="p-4"><h1 className="text-2xl font-bold">Moderator console</h1><p role="status">Checking Moderator access…</p></div>;
  if (!isModerator) return <div className="p-4"><h1 className="text-2xl font-bold">Moderator access required</h1><p>Appointed Student Moderators and maintainers can open this console. Try it in Judge Demo Mode.</p><Link href="/profile/moderation" className={modButton}>Your moderation notices and Appeals</Link></div>;
  return <div data-testid="moderation-queue-view" className="min-w-0 space-y-4 p-4 [overflow-wrap:anywhere]">
    <header className={modCard}><Link href="/profile" className={modButton}>Back to Profile</Link><h1 className="font-display text-2xl font-bold">Moderator console</h1>
      {auth.status === "demo" && <p className="font-bold">Demo · not real</p>}<p>Volunteer Moderators aren’t on call. No review time is promised. Every decision is confirmed and logged.</p></header>
    <nav aria-label="Moderation sections" className="flex flex-wrap gap-2 lg:hidden">
      {[["queue", `Queue (${queue?.items.length ?? 0})`], ["appeals", `Appeals (${appeals?.items.filter((a) => a.status === "open").length ?? 0})`], ["log", "Action log"], ...(maintainer ? [["clout", "Clout anomalies"]] : []), ...(showFeedHealth ? [["health", "Feed health"], ["roster", "Moderators"]] : [])].map(([key, label]) =>
        <Link key={key} href={`/moderation?section=${key}`} aria-current={section === key ? "page" : undefined} className={`${modButton} ${section === key ? "ring-2 ring-[var(--ink)]" : ""}`}>{label}</Link>)}
    </nav>
    {queue?.isCsa && <p role="note">You can’t see Incident items or Incident Appeals. You told the maintainers you are a campus security authority (CSA).</p>}
    {!!queue?.conflicts && <p role="note">{queue.conflicts} items not shown: they involve you, your reports or your claims. Another Moderator handles them.</p>}
    {section === "queue" && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section aria-label="Priority queue" className={`${selectedKey ? "hidden lg:block" : ""} min-w-0`}>
        <h2 className="mb-3 text-xl font-bold">Queue</h2>
        {!queue ? <p role="status">Loading queue…</p> : !queue.items.length ? <p>No pending items available to you.</p> : <ol className="space-y-3">{queue.items.map((item) => <li key={item.key}>
          <button ref={(el) => { if (el) rowRefs.current.set(item.key, el); else rowRefs.current.delete(item.key); }} type="button" data-testid="moderation-row" aria-current={item.key === selectedKey ? "true" : undefined}
            onClick={() => navigate("queue", item.key)} className={`${modCard} w-full text-left hover:bg-[var(--surface-2)]`}>
            <span className={`inline-flex rounded-full border border-[var(--line-strong)] px-2 py-1 text-sm font-bold ${item.priority === 0 ? "bg-[var(--warn-bg)] text-[var(--warn-fg)]" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`}>{item.kind}</span><span className="block font-bold">{item.title}</span>
            <span className="block">{[item.category ? INCIDENT_CATEGORIES[item.category].label : undefined, item.campus, item.status === "under_review" ? "Under review" : "Visible"].filter(Boolean).join(" · ")}</span>
            <span className="block text-sm">{item.reasons.map(([reason, count]) => `${INCIDENT_REASONS[reason as keyof typeof INCIDENT_REASONS] ?? reason.replaceAll("_", " ")} (${count})`).join(" · ")}</span>
            <span className="block text-sm">{item.reporterCount} verified reporter{item.reporterCount === 1 ? "" : "s"} · waiting {modAge(item.waitingSince, queue.now)}</span>
          </button></li>)}</ol>}
      </section>
      <section aria-label="Review pane" className={`${selectedKey ? "" : "hidden lg:block"} min-w-0`}>
        {selected ? <><button className={modButton} onClick={() => { navigate("queue"); announce("Back to queue."); }}>Back to queue</button>
          <h2 ref={heading} tabIndex={-1} className="my-3 text-xl font-bold outline-none">Review {selected.kind}: {selected.title}</h2>
          <ModerationReview key={selected.key} item={selected} maintainer={maintainer} onDone={done} />
        </> : selectedKey ? <p role="status">This item left the queue or is no longer available to you. <button className={modButton} onClick={() => navigate("queue")}>Back to queue</button></p> : <div className={modCard}><h2 className="text-xl font-bold">How this works</h2><p>Identifies-me claims → held photos → other Incident reports → Posts and Listings. Oldest first in each group.</p><p>Choose an item to review. Every action lists its effects, notices and log entry before you confirm.</p></div>}
      </section>
    </div>}
    {section === "appeals" && <AppealsPanel />}
    {section === "log" && <ActionLog />}
    {section === "health" && showFeedHealth && <><FeedHealth /><V2LaunchOps /><AlertSourceOps /></>}
    {section === "clout" && maintainer && <CloutAnomalies />}
    {section === "roster" && showFeedHealth && <><ModeratorRoster /><OfficerClaims /></>}
  </div>;
}
