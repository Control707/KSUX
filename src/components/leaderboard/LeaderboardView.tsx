"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { SegmentedControl } from "@/components/a11y/controls";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useViewerClient, useViewerMutation } from "@/lib/viewerClient";
import { CLOUT_PAYOUT_EVENT } from "@/components/clout/CloutPayoutToast";

type Campus = "Kennesaw" | "Marietta";
type Board = FunctionReturnType<typeof api.leaderboard.getLeaderboard>;
const PULL_THRESHOLD_PX = 70;

const card = "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]";
const button = "inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border-2 border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)] disabled:opacity-60";

function fromParam(value: string | null): Campus | undefined {
  return value === "kennesaw" ? "Kennesaw" : value === "marietta" ? "Marietta" : undefined;
}

/**
 * /leaderboard (SPEC-v2 §12). A one-shot read on visit, on pull-to-refresh (or
 * the Refresh button) and when the payout toast links here, never a live
 * subscription. "Coming soon" until gate 2(a).
 */
export function LeaderboardView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const convex = useConvex();
  const { authArgs } = useViewerClient();
  const { announce, toast } = useAnnouncer();
  const setHidden = useViewerMutation(api.clout.setLeaderboardHidden);
  const requested = fromParam(params.get("campus"));

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  // The default-Campus redirect writes ?campus= for a board we already hold.
  const alreadyLoaded = useRef<Campus | null>(null);

  const load = useCallback(async (reason: "visit" | "refresh") => {
    if (!authArgs) return;
    if (reason === "visit" && requested && alreadyLoaded.current === requested) {
      alreadyLoaded.current = null;
      return;
    }
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await convex.query(api.leaderboard.getLeaderboard, { ...authArgs, campus: requested });
      if (id !== request.current) return;
      setBoard(next);
      if (!requested) {
        alreadyLoaded.current = next.campus;
        router.replace(`${pathname}?campus=${next.campus.toLowerCase()}`, { scroll: false });
      }
      if (reason === "refresh") announce(`${next.campus} Leaderboard refreshed`);
    } catch (problem: any) {
      if (id === request.current) setError(problem?.data?.message || "Couldn't load the Leaderboard.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [authArgs, convex, requested, router, pathname, announce]);

  // Visit (and Campus change, which is a new board).
  useEffect(() => { void load("visit"); }, [load]);
  useEffect(() => {
    const onPayout = () => void load("refresh");
    window.addEventListener(CLOUT_PAYOUT_EVENT, onPayout);
    return () => window.removeEventListener(CLOUT_PAYOUT_EVENT, onPayout);
  }, [load]);

  // Pull-to-refresh on touch, from the top of the page.
  const pullStart = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    pullStart.current = window.scrollY <= 0 ? event.touches[0]!.clientY : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = pullStart.current;
    pullStart.current = null;
    if (start !== null && event.changedTouches[0]!.clientY - start > PULL_THRESHOLD_PX && !loading) void load("refresh");
  };

  const campus: Campus = requested ?? board?.campus ?? "Kennesaw";
  const showMe = async () => {
    try {
      await setHidden({ hidden: false });
      toast({ message: "You're shown on leaderboards", tone: "success" });
      await load("refresh");
    } catch (problem: any) {
      toast({ message: problem?.data?.message || "Couldn't change leaderboard visibility.", tone: "error" });
    }
  };

  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]" data-testid="leaderboard-view" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--sp-2)]">
        <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Leaderboard</h1>
        {board?.isDemo && <p className="text-sm font-bold" data-testid="leaderboard-demo-label">Demo · not real</p>}
      </div>
      <SegmentedControl
        label="Leaderboard Campus"
        hideLabel={false}
        options={[{ value: "kennesaw", label: "Kennesaw" }, { value: "marietta", label: "Marietta" }] as const}
        value={campus === "Marietta" ? "marietta" : "kennesaw"}
        testIdPrefix="leaderboard-campus"
        onChange={(next) => router.replace(`${pathname}?campus=${next}`, { scroll: false })}
      />

      {error && <p role="alert">{error}</p>}
      {!board ? (
        !error && <p role="status">Loading the {campus} Leaderboard…</p>
      ) : board.status === "coming_soon" ? (
        <section aria-labelledby="leaderboard-soon" className={card} data-testid="leaderboard-coming-soon">
          <h2 id="leaderboard-soon" className="font-display text-[length:var(--fs-xl)] font-bold">Coming soon</h2>
          <p>The {campus} Leaderboard opens later. You still earn Clout for corroborated reports in the meantime; see it on your Profile.</p>
        </section>
      ) : (
        <>
          <MeLine board={board} onShowMe={() => void showMe()} />
          <section aria-labelledby="leaderboard-top" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
              <h2 id="leaderboard-top" className="font-display text-[length:var(--fs-xl)] font-bold">
                {board.campus} · Top 25 this week
              </h2>
              <button type="button" className={button} disabled={loading} onClick={() => void load("refresh")} data-testid="leaderboard-refresh">
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="text-sm text-[var(--muted)]">Weekly board. Resets Mondays 00:00 ET.</p>
            {board.boardEmpty ? (
              <p className="mt-[var(--sp-2)]" data-testid="leaderboard-empty">
                {board.afterReset ? "New week. Board resets Mondays 00:00 ET." : "No one is on this board yet this week."}
              </p>
            ) : (
              <ol className="mt-[var(--sp-2)] divide-y divide-[var(--line)]" data-testid="leaderboard-list">
                {board.top.map((row) => (
                  <li key={row.handle} className={`flex min-w-0 flex-wrap items-center justify-between gap-[var(--sp-2)] py-[var(--sp-2)] ${row.isViewer ? "font-bold" : ""}`}>
                    <span className="min-w-0">
                      <span className="inline-block min-w-[3ch]">#{row.rank}</span> @{row.handle}
                      {row.isViewer && <span> (you)</span>}
                    </span>
                    <span>{row.total} Clout</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <p className="text-sm text-[var(--muted)]" data-testid="leaderboard-footer">
        Clout counts helpful logistics reports, not reliability.{" "}
        <Link href="/profile" className="font-bold text-[var(--ink)] underline">Your Clout</Link>
      </p>
    </div>
  );
}

function MeLine({ board, onShowMe }: { board: Extract<Board, { status: "open" }>; onShowMe: () => void }) {
  const { me } = board;
  if (me.state === "suspended") return null;
  return (
    <section aria-label="Your rank" className={card} data-testid="leaderboard-me">
      {me.state === "hidden" ? (
        <p className="flex flex-wrap items-center gap-[var(--sp-2)]">
          <span>You're hidden from leaderboards ·</span>
          <button type="button" className={button} onClick={onShowMe} data-testid="leaderboard-show-me">Show me</button>
        </p>
      ) : me.state === "nothing_earned" ? (
        <p>No Clout yet this week. Corroborated Parking Reports, Line Checks and Study vibes earn it.</p>
      ) : (
        <p className="font-bold">#{me.rank} of {me.of} this week · {me.total} Clout</p>
      )}
    </section>
  );
}
