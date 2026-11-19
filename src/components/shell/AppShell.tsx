"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Compass, Copy, Home, MessageSquare, RotateCcw, Search, Shield, ShoppingBag } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { OfflineCommuterView } from "@/components/pwa/OfflineCommuterView";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { LargeTextMode, StatusChip, fullnessFromTier } from "@/components/a11y/controls";
import { MAIN_CONTENT_ID, RouteHeadingFocus, SkipLink } from "@/components/a11y/RouteFocus";
import { getCommuterScope, useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { LocationCampusSwitcher } from "./CampusSwitcher";
import { MODERATION_DESTINATION, RAIL_GROUPS, isActive, isFocusedComposerRoute } from "./navigation";
import { QuickSheet } from "./QuickSheet";
import { WelcomeGate } from "./WelcomeGate";
import { CloutPayoutToast } from "@/components/clout/CloutPayoutToast";
import { AgendaReminders } from "@/components/agenda/AgendaReminders";
import { ModerationNotices } from "@/components/moderation/ModerationNotices";
import { OfficialAlertBanner } from "@/components/safety/officialAlertsUi";

const DEMO_PERSONAS = [
  { handle: "maya_cs", label: "Maya Patel (@maya_cs)", role: "Kennesaw · Maintainer · report conflicts" },
  { handle: "jordan_me", label: "Jordan Brooks (@jordan_me)", role: "Marietta · Author · submit an Appeal" },
  { handle: "alex_owl", label: "Alex Rivera (@alex_owl)", role: "Kennesaw · Moderator" },
  { handle: "sam_cpe", label: "Sam (@sam_cpe)", role: "Marietta · Second Moderator · Appeals" },
] as const;

export function AppShell({
  children,
  authModalSlot,
  onboardingSlot,
  quickComposerSlot,
}: {
  children: React.ReactNode;
  authModalSlot?: React.ReactNode;
  onboardingSlot?: React.ReactNode;
  quickComposerSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { auth, openSignInModal, setOpenSignInModal, signOut, switchDemoPersona } = useViewerClient();
  const { toast } = useAnnouncer();

  const summary = useViewerQuery(api.shell.shellSummary, {});
  const showModerationSections = pathname.startsWith("/moderation") && summary?.viewer.isModerator === true;
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const lastSeenToastAtRef = useRef<number>(Date.now());
  const viewerKey =
    auth.status === "demo"
      ? `demo:${auth.demoShortCode}:${auth.demoPersonaHandle}`
      : auth.status === "student"
        ? `student:${auth.studentId ?? auth.sessionToken}`
        : auth.status;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!navigator.onLine);
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    lastSeenToastAtRef.current = Date.now();
    document.title = "KSUX";
  }, [viewerKey]);

  // Tab title and an announced toast for a new unread message.
  useEffect(() => {
    if (typeof document === "undefined" || !summary) return;
    const count = summary.unread.numericUnreadCount;
    document.title = count > 0 ? `(${count}) KSUX` : "KSUX";
    const ev = summary.unread.latestUnreadEvent;
    if (ev && ev.lastMessageAt > lastSeenToastAtRef.current && pathname !== `/chats/${ev.chatId}`) {
      lastSeenToastAtRef.current = ev.lastMessageAt;
      toast({
        message: `New message · ${ev.title}`,
        detail: ev.preview ? `${ev.senderHandle ? `@${ev.senderHandle}: ` : ""}${ev.preview}` : undefined,
        href: `/chats/${ev.chatId}`,
        actionLabel: "Open chat",
        testId: "slide-down-toast",
      });
    }
  }, [summary, pathname, toast]);

  if (auth.status === "booting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--ink)]">
        <p role="status" className="flex items-center gap-[var(--sp-3)] text-[length:var(--fs-body)] font-bold">
          <span aria-hidden="true">🦉</span>
          Loading KSUX…
        </p>
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <>
        <WelcomeGate onRequestEmailSignIn={() => setOpenSignInModal(true)} />
        {openSignInModal && authModalSlot}
      </>
    );
  }

  if (summary?.viewer.suspended) return <main id={MAIN_CONTENT_ID} className="mx-auto min-w-0 max-w-3xl p-4"><p role="status" className="font-bold">Your account is suspended. Only moderation notices and Appeals are available.</p><ModerationNotices />{auth.status === "demo" && <div className="flex flex-wrap gap-3"><button className="min-h-11 rounded border p-3" onClick={() => switchDemoPersona("maya_cs")}>Demo · switch to Maya (maintainer)</button><button className="min-h-11 rounded border p-3" onClick={() => switchDemoPersona("sam_cpe")}>Demo · switch to Sam (second Moderator)</button></div>}<button className="min-h-11 rounded border p-3" onClick={() => void signOut()}>Sign out</button></main>;

  if (auth.status === "offline" || isOffline) {
    return (
      <>
        <OfflineCommuterView key={viewerKey} scope={getCommuterScope(auth)} />
        {quickComposerSlot}
      </>
    );
  }

  const student = summary?.viewer.student;
  const unreadCount = summary?.unread.numericUnreadCount ?? 0;
  const hasDotUnread = summary?.unread.hasDotUnread ?? false;
  const focusedComposer = isFocusedComposerRoute(pathname);
  const onboarding = auth.status === "student" && student && student.onboardingCompleted === false && onboardingSlot;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--ink)]">
      <SkipLink />
      <RouteHeadingFocus />
      <CloutPayoutToast viewerKey={viewerKey} />
      <LargeTextMode />

      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--header)] px-[var(--sp-3)] py-[var(--sp-2)] pt-[calc(var(--sp-2)+env(safe-area-inset-top,0px))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-[var(--sp-2)]">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--sp-2)]">
            {focusedComposer ? (
              <button
                type="button"
                data-testid="shell-back-btn"
                onClick={() => (window.history.length > 1 ? router.back() : router.push(pathname.startsWith("/moderation") ? "/profile" : pathname === "/scrappy" ? "/" : "/chats"))}
                className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] px-[var(--sp-2)] font-bold hover:bg-[var(--surface-2)]"
              >
                <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                Back
              </button>
            ) : (
              <Link href="/" className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] font-display text-[length:var(--fs-xl)] font-bold">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent)] text-base">
                  🦉
                </span>
                KSUX<span className="sr-only">, home</span>
              </Link>
            )}

            <div className="ml-auto flex flex-wrap items-center justify-end gap-[var(--sp-2)]">
              <Link
                href="/search"
                data-testid="header-search-link"
                aria-current={pathname === "/search" ? "page" : undefined}
                className="inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold"
              >
                <Search aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Search</span>
              </Link>
              {summary?.viewer.isModerator && auth.status !== "demo" && (
                <Link
                  href={MODERATION_DESTINATION.href}
                  className="inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border border-[var(--line-strong)] px-[var(--sp-3)] text-sm font-bold"
                >
                  Moderation
                </Link>
              )}
              {auth.status === "demo" ? (
                <DemoMenu displayName={student?.displayName?.split(" ")[0] ?? auth.demoPersonaHandle} homeCampus={student?.homeCampus ?? "Kennesaw"} />
              ) : (
                <Link
                  href="/profile"
                  aria-current={pathname === "/profile" ? "page" : undefined}
                  className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold"
                >
                  <span>@{student?.handle ?? "student"}</span>
                  <span className="rounded-full bg-[var(--ok-bg)] px-[var(--sp-2)] text-[var(--ok-fg)]">
                    {student?.emailDomainBadge === "faculty_staff" ? "KSU Faculty · Staff" : "Verified Student"}
                  </span>
                  <span className="sr-only">, Profile</span>
                </Link>
              )}
            </div>
          </div>
          <LocationCampusSwitcher />
        </div>
      </header>

      {onboarding ? (
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-xl flex-1 bg-[var(--bg)] p-[var(--sp-4)] outline-none">
          {onboardingSlot}
        </main>
      ) : (
        <div className={`mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 ${pathname.startsWith("/moderation") ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)_19rem]"} lg:pb-0 ${focusedComposer ? "pb-0" : "pb-[var(--chrome-bottom)]"}`}>
          <nav aria-label="Destinations" data-testid="desktop-left-rail" className="hidden border-r border-[var(--line)] p-[var(--sp-3)] lg:block">
            {RAIL_GROUPS.map((group) => (
              <RailGroup key={group.label} label={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item);
                  const badge = item.href === "/chats" ? unreadCount : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-[var(--target)] items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-[length:var(--fs-sm)] font-bold ${
                          active ? "bg-[var(--ink)] text-[var(--bg)]" : "hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        <span className="flex items-center gap-[var(--sp-2)]">
                          <Icon aria-hidden="true" className="h-4 w-4" />
                          {item.label}
                        </span>
                        {badge > 0 ? (
                          <span className="rounded-full bg-[var(--bad-fg)] px-[var(--sp-2)] text-[length:var(--fs-xs)] text-[var(--bad-bg)]">
                            {badge}
                            <span className="sr-only"> unread</span>
                          </span>
                        ) : item.href === "/chats" && hasDotUnread ? (
                          <span className="text-[length:var(--fs-xs)]">
                            <span aria-hidden="true">●</span>
                            <span className="sr-only">New activity</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </RailGroup>
            ))}
            {auth.status === "demo" || summary?.viewer.isModerator ? (
              <RailGroup label="Moderation">
                <li>
                  <Link
                    href={MODERATION_DESTINATION.href}
                    aria-current={pathname.startsWith("/moderation") ? "page" : undefined}
                    className="flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-[length:var(--fs-sm)] font-bold hover:bg-[var(--surface-2)]"
                  >
                    <Shield aria-hidden="true" className="h-4 w-4" />
                    Moderation
                  </Link>
                </li>
                {showModerationSections && <React.Suspense fallback={null}><ModerationRailSections maintainer={summary?.viewer.isMaintainer === true} productionMaintainer={summary?.viewer.isMaintainer === true && auth.status === "student"} /></React.Suspense>}
              </RailGroup>
            ) : null}
            <button
              type="button"
              onClick={() => setQuickSheetOpen(true)}
              className="mt-[var(--sp-3)] min-h-[var(--target)] w-full rounded-[var(--r-pill)] bg-[var(--accent)] px-[var(--sp-3)] text-sm font-bold text-[var(--on-accent)]"
            >
              Ask Scrappy · Quick Sheet
            </button>
          </nav>

          <main id={MAIN_CONTENT_ID} key={viewerKey} tabIndex={-1} className="min-w-0 flex-1 bg-[var(--bg)] outline-none">
            <OfficialAlertBanner />
            <AgendaReminders />
            {children}
          </main>

          <aside aria-labelledby="campus-pulse-heading" data-testid="desktop-campus-pulse-rail" className={`hidden border-l border-[var(--line)] p-[var(--sp-3)] ${pathname.startsWith("/moderation") ? "" : "lg:block"}`}>
            <CampusPulse summary={summary} />
          </aside>
        </div>
      )}

      {!focusedComposer && (
        <nav
          aria-label="Main"
          data-testid="mobile-bottom-nav"
          className="fixed inset-x-[var(--sp-2)] bottom-[calc(var(--sp-2)+env(safe-area-inset-bottom,0px))] z-30 grid grid-cols-5 items-center rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] px-[var(--sp-1)] py-[var(--sp-1)] shadow-lg lg:hidden"
        >
          <BarLink href="/" label="Now" icon={<Home aria-hidden="true" className="h-5 w-5" />} active={pathname === "/"} />
          <BarLink href="/feed" label="Feed" icon={<Compass aria-hidden="true" className="h-5 w-5" />} active={pathname.startsWith("/feed")} />
          <button
            type="button"
            data-testid="center-quick-sheet-btn"
            aria-haspopup="dialog"
            onClick={() => setQuickSheetOpen(true)}
            className="mx-auto inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-pill)] bg-[var(--accent)] px-[var(--sp-2)] text-sm font-bold text-[var(--on-accent)]"
          >
            <span aria-hidden="true">🦉</span>
            <span className="lt-hide-label">Ask Scrappy</span>
          </button>
          <BarLink href="/marketplace" label="Market" labelSuffix="place" icon={<ShoppingBag aria-hidden="true" className="h-5 w-5" />} active={pathname.startsWith("/marketplace")} />
          <BarLink
            href="/chats"
            label="Chats"
            testId="mobile-chats-tab"
            icon={<MessageSquare aria-hidden="true" className="h-5 w-5" />}
            active={pathname.startsWith("/chats")}
            badge={
              unreadCount > 0 ? (
                <span data-testid="chats-unread-badge" className="absolute right-[0.4rem] top-0 rounded-full bg-[var(--bad-fg)] px-[0.35rem] text-[length:var(--fs-xs)] font-bold text-[var(--bad-bg)]">
                  {unreadCount}
                  <span className="sr-only"> unread</span>
                </span>
              ) : hasDotUnread ? (
                <span data-testid="chats-unread-dot" className="absolute right-[0.6rem] top-0 text-[length:var(--fs-xs)] text-[var(--accent-ink)]">
                  <span aria-hidden="true">●</span>
                  <span className="sr-only">, new activity</span>
                </span>
              ) : null
            }
          />
        </nav>
      )}

      <QuickSheet open={quickSheetOpen} onClose={() => setQuickSheetOpen(false)} />
      {quickComposerSlot}
      {openSignInModal && authModalSlot}
    </div>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="mb-[var(--sp-3)]">
      <h2 id={id} className="px-[var(--sp-3)] pb-[var(--sp-1)] text-[length:var(--fs-xs)] font-bold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </h2>
      <ul aria-labelledby={id} className="space-y-[2px]">
        {children}
      </ul>
    </div>
  );
}

function ModerationRailSections({ maintainer, productionMaintainer }: { maintainer: boolean; productionMaintainer: boolean }) {
  const params = useSearchParams();
  const queue = useViewerQuery(api.moderatorConsole.queue, {});
  const appeals = useViewerQuery(api.moderatorConsole.appeals, {});
  const sections = [["queue", `Queue (${queue?.items.length ?? 0})`], ["appeals", `Appeals (${appeals?.items.filter((a) => a.status === "open").length ?? 0})`], ["log", "Action log"], ...(maintainer ? [["clout", "Clout anomalies"]] : []), ...(productionMaintainer ? [["health", "Feed health"], ["roster", "Moderators"]] : [])];
  return <>{sections.map(([key, label]) => <li key={key}><Link href={`/moderation?section=${key}`} aria-current={(params.get("section") ?? "queue") === key ? "page" : undefined} className="flex min-h-11 items-center rounded-[var(--r-sm)] px-3 text-sm font-bold hover:bg-[var(--surface-2)]">{label}</Link></li>)}</>;
}

function BarLink({
  href,
  label,
  labelSuffix,
  icon,
  active,
  testId,
  badge,
}: {
  href: string;
  label: string;
  /** Screen-reader-only ending so the name contains the visible label (WCAG 2.5.3). */
  labelSuffix?: string;
  icon: React.ReactNode;
  active: boolean;
  testId?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[var(--target)] flex-col items-center justify-center rounded-[var(--r-md)] text-[length:var(--fs-xs)] font-bold ${
        active ? "bg-[var(--surface-2)] text-[var(--ink)]" : "text-[var(--muted)]"
      }`}
    >
      {icon}
      <span className="lt-hide-label">
        {label}
        {labelSuffix && <span className="sr-only">{labelSuffix}</span>}
      </span>
      {active && <span aria-hidden="true" className="mt-[2px] h-[3px] w-4 rounded-full bg-[var(--ink)]" />}
      {badge}
    </Link>
  );
}

function DemoMenu({ displayName, homeCampus }: { displayName: string; homeCampus: string }) {
  const { auth, switchDemoPersona, resetDemoState, exitDemoToSignIn } = useViewerClient();
  const demoInfo = useViewerQuery(api.demo.session.getDemoWorkspaceInfo, auth.status === "demo" ? {} : "skip");
  const { announce, toast } = useAnnouncer();
  const [open, setOpen] = useState(false);
  const [copiedCoTestUrl, setCopiedCoTestUrl] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (auth.status !== "demo") return null;
  const counterparty = demoInfo?.coTestCounterpartyHandle ?? "alex_owl";

  const copyCoTest = async () => {
    const url = `${window.location.origin}/?demo=${auth.demoShortCode}&persona=${counterparty}`;
    setCopiedCoTestUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      announce("Co-test link copied");
    } catch {
      announce("Co-test link shown below");
    }
  };

  const itemClass = "flex min-h-[var(--target)] w-full items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-left text-sm font-bold hover:bg-[var(--surface-2)] disabled:opacity-60";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="judge-demo-pill"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-pill)] border-2 border-[var(--accent-ink)] bg-[var(--accent-soft)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)]"
      >
        <span aria-hidden="true">⚡</span>
        {/* Collapses to the icon in large-text mode; the name stays. */}
        <span className="lt-hide-label">
          Demo · {displayName} ({homeCampus})
        </span>
        <span className="sr-only">, Judge Demo Mode menu</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          data-testid="judge-demo-menu"
          className="absolute right-0 z-40 mt-[var(--sp-2)] w-[20rem] max-w-[calc(100vw-1.5rem)] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--sp-3)] text-[var(--ink)] shadow-2xl"
        >
          <h2 className="flex items-center justify-between text-sm font-bold text-[var(--muted)]">
            <span>Switch persona (this tab)</span>
            <span className="font-mono">#{auth.demoShortCode}</span>
          </h2>
          <ul className="mt-[var(--sp-2)] space-y-[2px]">
            {DEMO_PERSONAS.map((p) => {
              const active = auth.demoPersonaHandle === p.handle;
              return (
                <li key={p.handle}>
                  <button
                    type="button"
                    data-testid={`persona-switch-${p.handle}`}
                    aria-pressed={active}
                    onClick={() => {
                      switchDemoPersona(p.handle);
                      setOpen(false);
                      announce(`Now viewing as ${p.label}`);
                    }}
                    className={`${itemClass} justify-between ${active ? "bg-[var(--accent-soft)]" : ""}`}
                  >
                    <span>
                      <span className="block">{p.label}</span>
                      <span className="block font-normal text-[var(--muted)]">{p.role}</span>
                    </span>
                    {active && <Check aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-[var(--sp-2)] space-y-[2px] border-t border-[var(--line)] pt-[var(--sp-2)]">
            <button type="button" data-testid="copy-cotest-link-btn" onClick={copyCoTest} className={itemClass}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy co-test link (@{counterparty})
            </button>
            {copiedCoTestUrl && (
              <p data-testid="cotest-link-preview" data-cotest-url={copiedCoTestUrl} className="break-all rounded-[var(--r-sm)] bg-[var(--surface-2)] p-[var(--sp-2)] font-mono text-sm">
                {copiedCoTestUrl}
              </p>
            )}
            <Link href="/moderation" data-testid="demo-moderation-link" onClick={() => setOpen(false)} className={itemClass}>
              <Shield aria-hidden="true" className="h-4 w-4" />
              Moderation queue (Demo)
            </Link>
            <button
              type="button"
              data-testid="reset-demo-state-btn"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await resetDemoState();
                  setOpen(false);
                  toast({ tone: "success", message: "Demo workspace reset" });
                } catch (error: any) {
                  toast({ tone: "error", message: "Couldn’t reset the demo", detail: error?.message });
                } finally {
                  setResetting(false);
                }
              }}
              className={itemClass}
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {resetting ? "Resetting demo workspace…" : "Reset demo state"}
            </button>
            <button
              type="button"
              data-testid="verify-edu-from-demo-btn"
              onClick={() => {
                setOpen(false);
                exitDemoToSignIn();
              }}
              className={itemClass}
            >
              Verify KSU .edu email
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ShellSummary = FunctionReturnType<typeof api.shell.shellSummary>;

function CampusPulse({ summary }: { summary: ShellSummary | undefined }) {
  const campus = summary?.viewer.activeCampusFilter ?? "Kennesaw";
  return (
    <div className="space-y-[var(--sp-3)]">
      <h2 id="campus-pulse-heading" className="font-display text-[length:var(--fs-lg)] font-bold">
        Campus Pulse · {campus}
      </h2>
      <section aria-labelledby="pulse-shuttle" className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)]">
        <div className="flex items-center justify-between">
          <h3 id="pulse-shuttle" className="text-sm font-bold">
            Big Owl Bus
          </h3>
          <Link href="/transit" className="inline-flex min-h-[var(--target)] items-center text-sm font-bold underline">
            Transit
          </Link>
        </div>
        <ul className="space-y-[var(--sp-1)] text-sm">
          {(summary?.campusPulse.shuttleRoutes ?? []).map((route) => (
            <li key={String(route._id)} className="flex items-center justify-between gap-[var(--sp-2)]">
              <span className="min-w-0 truncate font-bold">{route.name}</span>
              <span className="shrink-0">{route.nextEtaMinutes === null ? "No ETA" : `${route.nextEtaMinutes} min`}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pulse-parking" className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)]">
        <div className="flex items-center justify-between">
          <h3 id="pulse-parking" className="text-sm font-bold">
            Parking
          </h3>
          <Link href="/parking" className="inline-flex min-h-[var(--target)] items-center text-sm font-bold underline">
            All lots
          </Link>
        </div>
        <ul className="space-y-[var(--sp-2)] text-sm">
          {(summary?.campusPulse.parkingLots ?? []).map((lot) => (
            <li key={String(lot._id)} className="space-y-[2px]">
              <div className="flex items-center justify-between gap-[var(--sp-2)]">
                <span className="min-w-0 truncate font-bold">{lot.name}</span>
                <StatusChip status={fullnessFromTier(lot.effectiveTier as 0 | 1 | 2 | 3 | null)} />
              </div>
              <div className="text-[var(--muted)]">{lot.provenanceLabel}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
