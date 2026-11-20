"use client";

import React, { useState } from "react";
import { Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useViewerClient } from "@/lib/viewerClient";

/**
 * Signed-out Welcome (SPEC-v2 Direction C): one h1, two 44 px paths — KSU
 * .edu email sign-in or the isolated Judge Demo — in light and dark.
 */
export function WelcomeGate({
  onRequestEmailSignIn,
}: {
  onRequestEmailSignIn?: () => void;
}) {
  const { enterJudgeDemo, setOpenSignInModal } = useViewerClient();
  const [launchingDemo, setLaunchingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunchDemo = async () => {
    setLaunchingDemo(true);
    setError(null);
    try {
      await enterJudgeDemo({ persona: "maya_cs" });
    } catch (err: any) {
      setError(err?.message || "Couldn’t start Judge Demo Mode. Try again.");
      setLaunchingDemo(false);
    }
  };

  const pathButton =
    "flex min-h-[var(--target)] w-full flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-md)] px-[var(--sp-4)] py-[var(--sp-3)] text-left text-body font-bold";

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-testid="dual-path-welcome"
      className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-[var(--sp-4)] py-[var(--sp-6)] text-[var(--ink)] outline-none"
    >
      <div className="w-full min-w-0 max-w-lg rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-5)] shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-[var(--sp-3)]">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent)] text-2xl"
          >
            🦉
          </span>
          <div className="min-w-0">
            <h1
              data-route-heading=""
              tabIndex={-1}
              className="font-display text-3xl font-bold leading-tight"
            >
              OwlSide
            </h1>
            <p className="text-sm text-[var(--muted)]">
              A Student-run campus app for Kennesaw and Marietta
            </p>
          </div>
        </div>

        <p className="mt-[var(--sp-4)] text-body leading-relaxed [overflow-wrap:anywhere]">
          One home for KSU Students across the Kennesaw and Marietta Campuses: Parking Reports, Big Owl Bus
          routes, Study Rooms, Course Hubs, Clubs, the Marketplace with Deal Chats, and Scrappy, the AI helper.
        </p>

        <div className="mt-[var(--sp-5)] space-y-[var(--sp-3)]">
          <button
            type="button"
            data-testid="welcome-edu-signin-btn"
            onClick={() => {
              if (onRequestEmailSignIn) onRequestEmailSignIn();
              else setOpenSignInModal(true);
            }}
            className={`${pathButton} bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-95`}
          >
            <span className="flex min-w-0 items-center gap-[var(--sp-2)]">
              <Mail aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>Sign in with your KSU .edu email</span>
            </span>
            <span className="text-sm font-semibold">6-digit code</span>
          </button>

          <button
            type="button"
            data-testid="welcome-enter-demo-btn"
            disabled={launchingDemo}
            aria-busy={launchingDemo || undefined}
            onClick={handleLaunchDemo}
            className={`${pathButton} border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-70`}
          >
            <span className="flex min-w-0 items-center gap-[var(--sp-2)]">
              <Zap aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>{launchingDemo ? "Starting Judge Demo Mode…" : "Enter Judge Demo Mode"}</span>
            </span>
            <span className="text-sm font-semibold text-[var(--muted)]">Sample data · no sign-in</span>
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-[var(--sp-3)] rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-semibold text-[var(--bad-fg)]"
          >
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}

        <ul className="lt-grid-1 mt-[var(--sp-5)] grid grid-cols-1 gap-[var(--sp-3)] border-t border-[var(--line)] pt-[var(--sp-4)] text-sm text-[var(--muted)] sm:grid-cols-2">
          <li className="flex min-w-0 items-start gap-[var(--sp-2)]">
            <ShieldCheck aria-hidden="true" className="mt-[0.1rem] h-4 w-4 shrink-0 text-[var(--accent-ink)]" />
            <span className="[overflow-wrap:anywhere]">
              Only <code>@students.kennesaw.edu</code> and <code>@kennesaw.edu</code> addresses can sign in. Your
              email is never shown publicly.
            </span>
          </li>
          <li className="flex min-w-0 items-start gap-[var(--sp-2)]">
            <Sparkles aria-hidden="true" className="mt-[0.1rem] h-4 w-4 shrink-0 text-[var(--accent-ink)]" />
            <span className="[overflow-wrap:anywhere]">
              Judge Demo Mode uses three sample personas in a private, resettable workspace.
            </span>
          </li>
        </ul>
      </div>
    </main>
  );
}
