"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, TriangleAlert, X } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { usePublicViewerQuery } from "@/lib/viewerClient";
import { NO_ALERT_ISNT_SAFE } from "./safetyContent";

export type AlertStatus = FunctionReturnType<typeof api.officialAlerts.alertSourceStatus>;
export type AlertSourceWithItems = AlertStatus["sources"][number];
export type AlertSource = Omit<AlertSourceWithItems, "items">;
export type AlertItem = AlertSourceWithItems["items"][number];

const STALE_MS = 20 * 60_000;
const FRESH_BANNER_MS = 24 * 60 * 60_000;

/**
 * Official Alert status, public like /safety. Only Judge Demo credentials are
 * sent; they switch the read to the session's fixtures. `offset` corrects the
 * device clock against the server's, so stale is judged on server time.
 */
export function useOfficialAlertStatus(online = true) {
  // Booting is skipped inside the hook so a demo tab never flashes the live copy first.
  const status = usePublicViewerQuery(api.officialAlerts.alertSourceStatus, online ? {} : "skip");
  return { status: online ? status : undefined, serverNow: useServerNow(status?.serverNow) };
}

/** Device time corrected to server time, ticking every 30 s so stale appears without a reload. */
export function useServerNow(serverNow: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const offset = useMemo(() => (serverNow === undefined ? 0 : serverNow - Date.now()), [serverNow]);
  return now + offset;
}

/** Stale is computed on read, again on the client, so an open tab never keeps showing old copy as current. */
export function displayOf(source: AlertSource, serverNow: number): AlertSource["display"] {
  if (source.display === "links_only" || source.display === "unavailable") return source.display;
  if (source.lastSuccessAt === undefined || serverNow - source.lastSuccessAt > STALE_MS) return "stale";
  return source.display;
}

export function formatTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(ms);
}

const STATE_WORDS: Record<AlertItem["state"], string> = {
  issued: "Issued", updated: "Updated", all_clear: "All clear (quoted from the source)", no_longer_listed: "No longer listed",
};

const CATEGORY_WORDS: Record<AlertItem["category"], string> = {
  timely_warning: "Timely Warning", emergency_advisory: "Emergency advisory",
};

const linkClass = "inline-flex min-h-[var(--target)] max-w-full items-center gap-[var(--sp-1)] font-bold underline";

export function OfficialPageLink({ source, label }: { source: Pick<AlertSource, "href" | "sourceName" | "pageTitle">; label?: string }) {
  return (
    <a className={linkClass} href={source.href} target="_blank" rel="noopener noreferrer">
      {label ?? `${source.sourceName} · ${source.pageTitle}`}
      <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only">, opens KSU’s page in a new tab</span>
    </a>
  );
}

/** The time lines every Alert carries: official issued time only when stated, plus KSUX's own observation and check times. */
export function AlertTimes({ item, source }: { item: AlertItem; source: AlertSource }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[var(--sp-2)] text-[length:var(--fs-sm)]">
      <dt className="font-bold">Issued (official)</dt>
      <dd>{item.officialIssuedText ? `“${item.officialIssuedText}” (as stated by ${source.sourceName})` : "Unknown: the source doesn’t state a time"}</dd>
      <dt className="font-bold">First seen by KSUX</dt>
      <dd><time dateTime={new Date(item.firstObservedAt).toISOString()}>{formatTime(item.firstObservedAt)}</time></dd>
      {item.state === "updated" && <><dt className="font-bold">Change seen</dt><dd>{formatTime(item.stateChangedAt)}</dd></>}
      {source.lastSuccessAt !== undefined && <><dt className="font-bold">Last checked OK</dt><dd>{formatTime(source.lastSuccessAt)}</dd></>}
      {source.lastAttemptAt !== undefined && <><dt className="font-bold">Last attempt</dt><dd>{formatTime(source.lastAttemptAt)}{source.latestAttemptFailed ? " (KSU’s page didn’t load)" : ""}</dd></>}
    </dl>
  );
}

export function AlertItemCard({ item, source, linkToDetails = true }: { item: AlertItem; source: AlertSource; linkToDetails?: boolean }) {
  // Issued or updated notices get the full red treatment; all-clear and no-longer-listed stay calm.
  const active = item.state === "issued" || item.state === "updated";
  return (
    <article
      className={`overflow-hidden rounded-[var(--r-md)] [overflow-wrap:anywhere] ${active ? "border-2 border-[var(--alert-bg)] shadow-md" : "border border-[var(--line-strong)]"}`}
      data-testid="official-alert-item" data-active={active} aria-labelledby={`alert-${item._id}`}>
      <p className={`flex flex-wrap items-center gap-x-[var(--sp-2)] gap-y-[var(--sp-1)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--fs-sm)] font-bold ${active ? "bg-[var(--alert-bg)] text-[var(--alert-fg)]" : "bg-[var(--surface-2)]"}`}>
        {active && <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />}
        {item.demoLabel && <span className="rounded-[var(--r-sm)] bg-[var(--warn-bg)] px-[var(--sp-2)] text-[var(--warn-fg)]">{item.demoLabel}</span>}
        <span>Official · {source.sourceName} · {CATEGORY_WORDS[item.category]} · {STATE_WORDS[item.state]}</span>
      </p>
      <div className={`space-y-[var(--sp-2)] p-[var(--sp-3)] ${active ? "bg-[var(--alert-soft)]" : ""}`}>
        <h3 id={`alert-${item._id}`} className="font-display text-[length:var(--fs-xl)] font-bold leading-tight">{item.headline}</h3>
        {item.state === "no_longer_listed" && item.noLongerListedAt !== null ? (
          <p>No longer listed on {source.sourceName}’s {source.pageTitle} as of {formatTime(item.noLongerListedAt)}. KSUX can’t say whether it’s over.</p>
        ) : (
          <blockquote className={`border-l-4 pl-[var(--sp-3)] ${active ? "border-[var(--alert-bg)]" : "border-[var(--line-strong)]"}`}>
            <p className="text-[length:var(--fs-lg)]">“{item.excerpt}”</p>
            <footer className="text-[length:var(--fs-sm)]">Quoted from {source.sourceName}</footer>
          </blockquote>
        )}
        <p className="text-[length:var(--fs-sm)]">{item.campus ? `Campus named by the source: ${item.campus}` : "Campus not specified"}</p>
        <AlertTimes item={item} source={source} />
        <div className="flex flex-wrap gap-x-[var(--sp-4)]">
          {linkToDetails && <Link className={linkClass} href={`/safety/alerts/${item._id}`}>Alert details</Link>}
          <OfficialPageLink source={source} label="Read the full notice on KSU’s page" />
        </div>
      </div>
    </article>
  );
}

/** One source's block on /safety: quiet, stale, unavailable or links-only are each said plainly. */
export function AlertSourceBlock({ source, serverNow }: { source: AlertSourceWithItems; serverNow: number }) {
  const display = displayOf(source, serverNow);
  return (
    <div className="space-y-[var(--sp-2)]" data-testid={`alert-source-${source.sourceKey}`} data-display={display}>
      <h3 className="text-[length:var(--fs-lg)] font-bold">{source.sourceName} · {source.pageTitle}</h3>
      {display === "quiet" && (
        <p data-testid="alert-quiet">
          {source.sourceKey.includes("advisor")
            ? <>No notice found on KSU’s advisory page at last check.</>
            : <>{source.sourceName} page: “{source.quietText}”</>}{" "}
          Checked {source.lastSuccessAt !== undefined ? formatTime(source.lastSuccessAt) : "—"}.
        </p>
      )}
      {display === "stale" && (
        <p className="font-bold" data-testid="alert-stale">
          KSUX’s copy is out of date: last checked OK {source.lastSuccessAt !== undefined ? formatTime(source.lastSuccessAt) : "never"}. It may not show current notices. Open KSU’s page.
        </p>
      )}
      {display === "unavailable" && (
        <p data-testid="alert-unavailable">KSUX couldn’t read this page yet. Open KSU’s page for current notices.</p>
      )}
      {display === "links_only" && source.reason !== "not_enabled" && (
        <p data-testid="alert-switched-off">KSUX has switched off its copy of this page for now. Open KSU’s page for current notices.</p>
      )}
      {(display === "ok" || display === "stale") && source.items.map((item) => <AlertItemCard key={item._id} item={item} source={source} />)}
      {display === "ok" && source.items.length === 0 && (
        <p>No current notice on this page at last check ({source.lastSuccessAt !== undefined ? formatTime(source.lastSuccessAt) : "—"}).</p>
      )}
      <OfficialPageLink source={source} />
    </div>
  );
}

export function NoAlertIsntSafe() {
  return <p className="font-bold" data-testid="no-alert-isnt-safe">{NO_ALERT_ISNT_SAFE}</p>;
}

const DISMISS_KEY = "ksux.dismissedAlertBanners";

function readDismissed(): string[] {
  try { return JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]"); } catch { return []; }
}

/**
 * Thin app-wide banner for a fresh issued or updated Alert only (SPEC-v2 §9).
 * Source-named, linking to /safety, dismissible per Alert and change. Never
 * shown for quiet, stale, unavailable or switched-off sources, or offline.
 */
export function OfficialAlertBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const { status, serverNow } = useOfficialAlertStatus(online);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);
  if (!status) return null;
  const fresh = status.sources.flatMap((source) => displayOf(source, serverNow) !== "ok" ? [] : source.items
    .filter((item) => (item.state === "issued" || item.state === "updated") && serverNow - item.stateChangedAt < FRESH_BANNER_MS)
    .map((item) => ({ item, source, key: `${item._id}:${item.stateChangedAt}` })))
    .filter(({ key }) => !dismissed.includes(key))
    .sort((a, b) => b.item.stateChangedAt - a.item.stateChangedAt);
  const top = fresh[0];
  if (!top) return null;
  const dismiss = () => {
    const next = [...readDismissed(), top.key].slice(-50);
    try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    setDismissed(next);
  };
  const verb = top.item.state === "updated" ? "updated" : "posted";
  const more = fresh.length - 1;
  return (
    <div role="region" aria-label="Official Alert" data-testid="official-alert-banner" data-alert-id={top.item._id}
      className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)] border-b-4 border-[var(--ink)] bg-[var(--alert-bg)] px-[var(--sp-3)] py-[var(--sp-1)] text-[var(--alert-fg)] shadow-lg [overflow-wrap:anywhere]">
      <span aria-hidden="true" className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--alert-fg)] text-[var(--alert-bg)]">
        <TriangleAlert className="h-5 w-5" />
        <span className="ksux-alert-pulse absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--alert-bg)] bg-[var(--accent)]" />
      </span>
      <Link href="/safety#official-alerts" className="inline-flex min-h-[var(--target)] min-w-0 flex-[1_1_10rem] items-center gap-[var(--sp-1)] font-bold">
        <span className="min-w-0">
          <span className="block text-[length:var(--fs-sm)] uppercase tracking-wide [overflow-wrap:anywhere]">
            Official Alert{top.item.demoLabel ? ` · ${top.item.demoLabel}` : ""}{more > 0 ? ` · ${more} more` : ""}
          </span>
          <span className="block text-[length:var(--fs-lg)] leading-tight underline">
            {top.source.sourceName} {verb} a {CATEGORY_WORDS[top.item.category]}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="ml-auto h-5 w-5 shrink-0" />
      </Link>
      <button type="button" onClick={dismiss}
        className="inline-flex min-h-[var(--target)] min-w-[var(--target)] shrink-0 items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--alert-fg)]"
        aria-label={`Dismiss the ${top.source.sourceName} Alert banner`}>
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );
}
