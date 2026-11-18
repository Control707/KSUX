"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Bus,
  Calendar,
  Car,
  Check,
  ChevronDown,
  Copy,
  Compass,
  GraduationCap,
  Home,
  MessageSquare,
  PlusCircle,
  RotateCcw,
  Shield,
  ShoppingBag,
  Sparkles,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { OfflineCommuterView } from "@/components/pwa/OfflineCommuterView";
import {
  getCommuterScope,
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { WelcomeGate } from "./WelcomeGate";

const TEN_CAPABILITY_MODULES = [
  { href: "/", label: "Now HUD", icon: Home },
  { href: "/parking", label: "Parking", icon: Car },
  { href: "/study", label: "Study Rooms", icon: BookOpen },
  { href: "/transit", label: "Shuttle Bus", icon: Bus },
  { href: "/dining", label: "Dining", icon: Utensils },
  { href: "/events", label: "Events", icon: Calendar },
  { href: "/clubs", label: "Clubs", icon: Users },
  { href: "/courses/CS%203305", label: "Course Hubs", icon: GraduationCap },
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/scrappy", label: "Ask Scrappy", icon: Sparkles },
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
  const {
    auth,
    switchDemoPersona,
    resetDemoState,
    exitDemoToSignIn,
    setQuickComposerKind,
    openSignInModal,
    setOpenSignInModal,
  } = useViewerClient();

  const summary = useViewerQuery(api.shell.shellSummary, {});
  const demoInfo = useViewerQuery(
    api.demo.session.getDemoWorkspaceInfo,
    auth.status === "demo" ? {} : "skip"
  );
  const setCampusFilter = useViewerMutation(api.shell.setCampusFilter);

  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [copiedCoTestUrl, setCopiedCoTestUrl] = useState<string | null>(null);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [slideToast, setSlideToast] = useState<{
    viewerKey: string;
    chatId: string;
    title: string;
    preview?: string;
    senderHandle?: string;
  } | null>(null);
  const lastSeenToastAtRef = useRef<number>(Date.now());
  const viewerKey = auth.status === "demo"
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
    setSlideToast(null);
    document.title = "KSUX";
  }, [viewerKey]);

  useEffect(() => {
    if (!slideToast) return;
    const timer = setTimeout(() => setSlideToast(null), 5000);
    return () => clearTimeout(timer);
  }, [slideToast]);

  // Update browser tab title and show a toast for a new unread event.
  useEffect(() => {
    if (typeof document === "undefined" || !summary) return;
    const count = summary.unread.numericUnreadCount;
    document.title = count > 0 ? `(${count}) KSUX` : "KSUX";

    const ev = summary.unread.latestUnreadEvent;
    if (
      ev &&
      ev.lastMessageAt > lastSeenToastAtRef.current &&
      pathname !== `/chats/${ev.chatId}`
    ) {
      lastSeenToastAtRef.current = ev.lastMessageAt;
      setSlideToast({
        viewerKey,
        chatId: String(ev.chatId),
        title: ev.title,
        preview: ev.preview,
        senderHandle: ev.senderHandle,
      });
    }
  }, [summary, pathname, viewerKey]);

  if (auth.status === "booting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111317] text-white">
        <div className="flex items-center gap-3 text-sm font-bold text-[#FDBB30]">
          <span className="text-xl">🦉</span>
          <span>Loading KSUX Campus Workspace...</span>
        </div>
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

  if (auth.status === "offline" || isOffline) {
    return (
      <>
        <OfflineCommuterView key={viewerKey} scope={getCommuterScope(auth)} />
        {quickComposerSlot}
      </>
    );
  }

  const activeCampus = summary?.viewer.activeCampusFilter ?? "Kennesaw";
  const student = summary?.viewer.student;
  const unreadCount = summary?.unread.numericUnreadCount ?? 0;
  const hasDotUnread = summary?.unread.hasDotUnread ?? false;

  const handleCopyCoTestLink = async () => {
    if (typeof window === "undefined" || auth.status !== "demo") return;
    const counterparty = demoInfo?.coTestCounterpartyHandle ?? "alex_owl";
    const coUrl = `${window.location.origin}/?demo=${auth.demoShortCode}&persona=${counterparty}`;
    setCopiedCoTestUrl(coUrl);
    try {
      await navigator.clipboard.writeText(coUrl);
    } catch {
      // Clipboard API may be restricted in headless contexts; URL is also exposed on data-co-test-url
    }
  };

  const handleResetDemo = async () => {
    setResettingDemo(true);
    try {
      await resetDemoState();
      setDemoMenuOpen(false);
    } finally {
      setResettingDemo(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6FA] text-[#1B1F27]">
      {/* Universal Tier-0 Slide-Down Toast */}
      {slideToast?.viewerKey === viewerKey && (
        <div
          data-testid="slide-down-toast"
          className="fixed left-1/2 top-3 z-50 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-[#FDBB30] bg-[#111317] px-4 py-3 text-white shadow-2xl"
        >
          <Link
            href={`/chats/${slideToast.chatId}`}
            onClick={() => setSlideToast(null)}
            className="min-w-0 flex-1"
          >
            <div className="text-xs font-extrabold text-[#FDBB30]">
              New message · {slideToast.title}
            </div>
            {slideToast.preview && (
              <div className="truncate text-xs text-[#E5E7EB]">
                {slideToast.senderHandle ? `@${slideToast.senderHandle}: ` : ""}
                {slideToast.preview}
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setSlideToast(null)}
            className="rounded-lg p-1 text-[#9CA3AF] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#232936] bg-[#111317] px-3.5 py-2.5 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 font-black tracking-tight text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FDBB30] text-sm font-black text-[#111317]">
                🦉
              </span>
              <span className="text-base">KSUX</span>
            </Link>

            {/* Right Identity / Judge Demo Mode Pill */}
            {auth.status === "demo" ? (
              <div className="relative">
                <button
                  type="button"
                  data-testid="judge-demo-pill"
                  onClick={() => setDemoMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#FDBB30] bg-[#FDBB30]/18 px-3 py-1 text-[11.5px] font-extrabold text-[#FDBB30] transition hover:bg-[#FDBB30]/25"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>
                    ⚡ JUDGE DEMO ·{" "}
                    {student?.displayName?.split(" ")[0] ??
                      auth.demoPersonaHandle}{" "}
                    ({student?.homeCampus ?? "Kennesaw"})
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {demoMenuOpen && (
                  <div
                    data-testid="judge-demo-menu"
                    className="absolute right-0 mt-2 w-80 rounded-2xl border border-[#2B3242] bg-[#181C25] p-3 text-white shadow-2xl"
                  >
                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                      <span>Switch Isolated Persona (This Tab)</span>
                      <span className="font-mono text-[#FDBB30]">
                        #{auth.demoShortCode}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {[
                        {
                          handle: "maya_cs",
                          label: "Maya Patel (@maya_cs)",
                          role: "Kennesaw · CS '27 Commuter",
                        },
                        {
                          handle: "jordan_me",
                          label: "Jordan Brooks (@jordan_me)",
                          role: "Marietta · MechE '26",
                        },
                        {
                          handle: "alex_owl",
                          label: "Alex Rivera (@alex_owl)",
                          role: "Kennesaw · Club Officer & Seller",
                        },
                      ].map((p) => {
                        const active = auth.demoPersonaHandle === p.handle;
                        return (
                          <button
                            key={p.handle}
                            type="button"
                            data-testid={`persona-switch-${p.handle}`}
                            onClick={() => {
                              switchDemoPersona(p.handle);
                              setDemoMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                              active
                                ? "bg-[#FDBB30] font-extrabold text-[#111317]"
                                : "hover:bg-[#232938]"
                            }`}
                          >
                            <div>
                              <div className="font-bold">{p.label}</div>
                              <div
                                className={`text-[10.5px] ${
                                  active ? "text-[#111317]/80" : "text-[#9CA3AF]"
                                }`}
                              >
                                {p.role}
                              </div>
                            </div>
                            {active && <Check className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 space-y-1.5 border-t border-[#2B3242] pt-2.5">
                      <button
                        type="button"
                        data-testid="copy-cotest-link-btn"
                        onClick={handleCopyCoTestLink}
                        className="flex w-full items-center justify-between rounded-xl bg-[#232938] px-3 py-2 text-xs font-bold text-[#93C5FD] hover:bg-[#2D3548]"
                      >
                        <span className="flex items-center gap-2">
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Co-Test Link (Tab 2)</span>
                        </span>
                        <span className="text-[10px] text-[#9CA3AF]">
                          @{demoInfo?.coTestCounterpartyHandle ?? "alex_owl"}
                        </span>
                      </button>

                      {copiedCoTestUrl && (
                        <div
                          data-testid="cotest-link-preview"
                          data-cotest-url={copiedCoTestUrl}
                          className="break-all rounded-lg bg-[#0F1218] p-2 font-mono text-[10.5px] text-[#FDE68A]"
                        >
                          Copied: {copiedCoTestUrl}
                        </div>
                      )}

                      <Link
                        href="/moderation"
                        data-testid="demo-moderation-link"
                        onClick={() => setDemoMenuOpen(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white hover:bg-[#232938]"
                      >
                        <Shield className="h-3.5 w-3.5 text-[#FDBB30]" />
                        <span>Moderation Queue (Demo)</span>
                      </Link>

                      <button
                        type="button"
                        data-testid="reset-demo-state-btn"
                        disabled={resettingDemo}
                        onClick={handleResetDemo}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#FCD34D] hover:bg-[#232938] disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>
                          {resettingDemo
                            ? "Resetting Demo Workspace..."
                            : "Reset Demo State"}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid="verify-edu-from-demo-btn"
                        onClick={() => {
                          setDemoMenuOpen(false);
                          exitDemoToSignIn();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl border border-[#374151] px-3 py-2 text-xs font-bold text-[#E5E7EB] hover:bg-[#232938]"
                      >
                        <span>Verify KSU .edu Email</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {summary?.viewer.isModerator && (
                  <Link
                    href="/moderation"
                    className="rounded-full border border-[#FDBB30]/50 bg-[#FDBB30]/15 px-2.5 py-1 text-[11px] font-bold text-[#FDBB30]"
                  >
                    Moderation
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#374151] bg-[#1F2430] px-3 py-1 text-xs font-bold text-white"
                >
                  <span>@{student?.handle ?? "student"}</span>
                  <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0.2 text-[10px] font-extrabold text-[#15803D]">
                    {student?.emailDomainBadge === "faculty_staff"
                      ? "KSU Faculty · Staff"
                      : "Verified Student"}
                  </span>
                </Link>
              </div>
            )}
          </div>

          {/* Sticky 3-Way Campus Switcher */}
          <div
            data-testid="campus-switcher"
            className="grid grid-cols-3 gap-1 rounded-xl bg-[#1E232E] p-1"
          >
            {(["Kennesaw", "Marietta", "All KSU"] as const).map((campus) => {
              const isActive = activeCampus === campus;
              const activeClass =
                isActive && campus === "Marietta"
                  ? "bg-[#60A5FA] text-[#0B132B]"
                  : isActive
                    ? "bg-[#FDBB30] text-[#111317]"
                    : "text-[#9CA3AF] hover:text-white";
              return (
                <button
                  key={campus}
                  type="button"
                  data-testid={`campus-switch-${campus.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => void setCampusFilter({ campusFilter: campus })}
                  className={`rounded-lg py-1.5 text-xs font-extrabold transition ${activeClass}`}
                >
                  {campus}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Onboarding Gate for newly verified .edu Students */}
      {auth.status === "student" &&
      student &&
      student.onboardingCompleted === false &&
      onboardingSlot ? (
        <main className="mx-auto w-full max-w-xl flex-1 p-4">
          {onboardingSlot}
        </main>
      ) : (
        /* 3-Column Desktop Workspace (>=1024px) / Mobile Active Pane */
        <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 pb-20 lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:pb-0">
          {/* Left Navigation Rail (Desktop >=1024px) */}
          <aside
            data-testid="desktop-left-rail"
            className="hidden border-r border-[#E4E7EE] bg-white p-3 lg:flex lg:flex-col lg:gap-1"
          >
            {[
              { href: "/", label: "Now", icon: Home },
              { href: "/feed", label: "Feed", icon: Compass },
              {
                href: "/courses/CS%203305",
                label: "Course Hubs",
                icon: GraduationCap,
              },
              { href: "/clubs", label: "Clubs & Events", icon: Users },
              { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
              {
                href: "/chats",
                label: "Chats",
                icon: MessageSquare,
                badge: unreadCount,
                dot: hasDotUnread,
              },
              { href: "/scrappy", label: "Ask Scrappy", icon: Sparkles },
              { href: "/parking", label: "Parking Lots", icon: Car },
              { href: "/study", label: "Study Rooms", icon: BookOpen },
              { href: "/transit", label: "Shuttle Routes", icon: Bus },
              { href: "/dining", label: "Dining Venues", icon: Utensils },
              { href: "/profile", label: "Profile", icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href.split("%")[0]!);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-bold transition ${
                    active
                      ? "bg-[#111317] text-[#FDBB30]"
                      : "text-[#5E6675] hover:bg-[#F4F6FA] hover:text-[#111317]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span className="rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                      {item.badge}
                    </span>
                  ) : item.dot ? (
                    <span className="h-2 w-2 rounded-full bg-[#FDBB30]" />
                  ) : null}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setQuickSheetOpen(true)}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#FDBB30] px-3 py-2.5 text-xs font-extrabold text-[#111317] shadow-sm hover:bg-[#e7a920]"
            >
              <PlusCircle className="h-4 w-4" />
              <span>⚡ Quick Sheet</span>
            </button>
          </aside>

          {/* Center Active Module Pane */}
          <main key={viewerKey} className="min-w-0 flex-1">{children}</main>

          {/* Right Always-Visible Campus Pulse Rail (Desktop >=1024px) */}
          <aside
            data-testid="desktop-campus-pulse-rail"
            className="hidden border-l border-[#E4E7EE] bg-[#F4F6FA] p-3.5 lg:flex lg:flex-col lg:gap-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
                Campus Pulse · {activeCampus}
              </h2>
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
                Live
              </span>
            </div>

            {/* Live Big Owl Bus Shuttle Routes */}
            <div className="rounded-2xl border border-[#E4E7EE] bg-white p-3 shadow-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#111317]">
                  🚌 Big Owl Bus ETAs
                </span>
                <Link
                  href="/transit"
                  className="text-[11px] font-bold text-[#1E3A8A] hover:underline"
                >
                  Live Map →
                </Link>
              </div>
              <div className="space-y-2">
                {(summary?.campusPulse.shuttleRoutes ?? []).map((route) => (
                  <div
                    key={String(route._id)}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-[#111317]">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: route.colorHex }}
                        />
                        <span className="truncate">{route.name}</span>
                      </div>
                      <div className="text-[10.5px] text-[#5E6675]">
                        {route.campusScope === "Both"
                          ? "Intercampus"
                          : route.campusScope}{" "}
                        {route.loadLabel ? `· ${route.loadLabel}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-[#111317] px-2 py-0.5 text-[11px] font-extrabold text-[#FDBB30]">
                      {route.nextEtaMinutes === null ? "No ETA" : `${route.nextEtaMinutes}m`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Parking Lots */}
            <div className="rounded-2xl border border-[#E4E7EE] bg-white p-3 shadow-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#111317]">
                  🅿️ Parking Lot Fullness
                </span>
                <Link
                  href="/parking"
                  className="text-[11px] font-bold text-[#1E3A8A] hover:underline"
                >
                  All 72 Lots →
                </Link>
              </div>
              <div className="space-y-2">
                {(summary?.campusPulse.parkingLots ?? []).map((lot) => {
                  const tierBadge =
                    lot.effectiveTier === null ? "bg-[#E4E7EE] text-[#5E6675]" : lot.effectiveTier === 0
                      ? "bg-[#DCFCE7] text-[#15803D]"
                      : lot.effectiveTier === 1
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#FEE2E2] text-[#B91C1C]";
                  return (
                    <div
                      key={String(lot._id)}
                      className="rounded-xl border border-[#E4E7EE] p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-bold text-[#111317]">
                          {lot.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tierBadge}`}
                        >
                          {lot.tierLabel.split(" ")[0]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-[#5E6675]">
                        <span>{lot.provenanceLabel}</span>
                        {lot.spotOpeningCount > 0 && (
                          <span className="font-bold text-[#15803D]">
                            ⚡ Spot opening{" "}
                            {lot.spotOpeningLevel
                              ? `(${lot.spotOpeningLevel})`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* 5-Slot Mobile Bottom Navigation Bar (<1024px) */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#E4E7EE] bg-white px-1 pb-2.5 pt-1.5 lg:hidden"
      >
        <Link
          href="/"
          className={`flex flex-col items-center gap-0.5 text-[10.5px] font-bold ${
            pathname === "/" ? "text-[#111317]" : "text-[#5E6675]"
          }`}
        >
          <Home className="h-4.5 w-4.5" />
          <span>Now</span>
          {pathname === "/" && (
            <span className="h-0.5 w-4 rounded-full bg-[#FDBB30]" />
          )}
        </Link>

        <Link
          href="/feed"
          className={`flex flex-col items-center gap-0.5 text-[10.5px] font-bold ${
            pathname.startsWith("/feed") ? "text-[#111317]" : "text-[#5E6675]"
          }`}
        >
          <Compass className="h-4.5 w-4.5" />
          <span>Feed</span>
          {pathname.startsWith("/feed") && (
            <span className="h-0.5 w-4 rounded-full bg-[#FDBB30]" />
          )}
        </Link>

        <button
          type="button"
          data-testid="center-quick-sheet-btn"
          onClick={() => setQuickSheetOpen(true)}
          className="flex flex-col items-center gap-0.5 text-[10.5px] font-extrabold text-[#111317]"
        >
          <span className="-mt-3.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#FDBB30] bg-[#111317] text-base text-[#FDBB30] shadow-md">
            🦉
          </span>
          <span>Scrappy</span>
        </button>

        <Link
          href="/marketplace"
          className={`flex flex-col items-center gap-0.5 text-[10.5px] font-bold ${
            pathname.startsWith("/marketplace")
              ? "text-[#111317]"
              : "text-[#5E6675]"
          }`}
        >
          <ShoppingBag className="h-4.5 w-4.5" />
          <span>Market</span>
          {pathname.startsWith("/marketplace") && (
            <span className="h-0.5 w-4 rounded-full bg-[#FDBB30]" />
          )}
        </Link>

        <Link
          href="/chats"
          data-testid="mobile-chats-tab"
          className={`relative flex flex-col items-center gap-0.5 text-[10.5px] font-bold ${
            pathname.startsWith("/chats") ? "text-[#111317]" : "text-[#5E6675]"
          }`}
        >
          <MessageSquare className="h-4.5 w-4.5" />
          <span>Chats</span>
          {unreadCount > 0 ? (
            <span
              data-testid="chats-unread-badge"
              className="absolute right-3 top-0 rounded-full bg-[#DC2626] px-1.5 text-[9px] font-extrabold text-white"
            >
              {unreadCount}
            </span>
          ) : hasDotUnread ? (
            <span
              data-testid="chats-unread-dot"
              className="absolute right-4 top-0.5 h-2 w-2 rounded-full bg-[#FDBB30]"
            />
          ) : null}
          {pathname.startsWith("/chats") && (
            <span className="h-0.5 w-4 rounded-full bg-[#FDBB30]" />
          )}
        </Link>
      </nav>

      {/* Center Hero Quick Sheet Overlay (Ask Scrappy + 1-Tap Composers + 2x5 Module Grid) */}
      {quickSheetOpen && (
        <div
          data-testid="quick-sheet-overlay"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/55"
          onClick={() => setQuickSheetOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-t-3xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#111317] text-base text-[#FDBB30]">
                  🦉
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111317]">
                    Scrappy &amp; Campus Quick Sheet
                  </h3>
                  <p className="text-[11px] text-[#5E6675]">
                    Jump anywhere in 1 tap · Chat-isolated AI
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickSheetOpen(false)}
                className="rounded-lg p-1.5 text-[#5E6675] hover:bg-[#F4F6FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setQuickSheetOpen(false);
                router.push("/scrappy");
              }}
              className="mt-3 flex w-full items-center justify-between rounded-2xl bg-[#111317] px-4 py-3 text-left text-xs font-extrabold text-[#FDBB30]"
            >
              <span>🦉 Ask Scrappy anything about Kennesaw or Marietta...</span>
              <span className="rounded-full bg-[#FDBB30]/20 px-2 py-0.5 text-[10px]">
                Open SSE →
              </span>
            </button>

            {/* 1-Tap Creation Actions */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: "+ Post",
                  action: () => {
                    setQuickSheetOpen(false);
                    setQuickComposerKind("post");
                    router.push("/feed?compose=1");
                  },
                },
                {
                  label: "+ Parking Report",
                  action: () => {
                    setQuickSheetOpen(false);
                    setQuickComposerKind("parking_report");
                    router.push("/parking?report=1");
                  },
                },
                {
                  label: "+ Listing",
                  action: () => {
                    setQuickSheetOpen(false);
                    setQuickComposerKind("listing");
                    router.push("/marketplace?create=1");
                  },
                },
                {
                  label: "+ Study Session",
                  action: () => {
                    setQuickSheetOpen(false);
                    setQuickComposerKind("study_session");
                    router.push("/study?host=1");
                  },
                },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={btn.action}
                  className="rounded-xl border border-[#D99B00] bg-[#FFF6DC] px-2.5 py-2 text-xs font-extrabold text-[#111317] hover:bg-[#FDBB30]"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* 2x5 Jump Grid to All 10 KSUX Capabilities */}
            <div className="mt-3 grid grid-cols-5 gap-2">
              {TEN_CAPABILITY_MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <Link
                    key={mod.label}
                    href={mod.href}
                    onClick={() => setQuickSheetOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-1.5 py-2.5 text-center text-[10.5px] font-bold text-[#111317] hover:border-[#D99B00] hover:bg-[#FFF6DC]"
                  >
                    <Icon className="h-4 w-4 text-[#111317]" />
                    <span className="leading-tight">{mod.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {quickComposerSlot}
      {openSignInModal && authModalSlot}
    </div>
  );
}
