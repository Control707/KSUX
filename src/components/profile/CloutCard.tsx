"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge } from "@/components/a11y/controls";

const SOURCE_LABELS: Record<string, string> = {
  parking_report: "Parking Report confirmed",
  spot_opening: "Spot Opening confirmed",
  line_check: "Line Check confirmed",
  study_vibe: "Study vibe confirmed",
  handoff: "Marketplace handoff",
};

const KIND_LABELS: Record<string, string> = {
  earn: "Earned",
  hold: "On hold",
  release: "Released",
  reverse: "Reversed",
};

function payoutTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms) + " ET";
}

/**
 * Private "Your Clout" card (SPEC-v2 §12). Only the signed-in Student sees it,
 * on their own Profile. Clout is cosmetic and never shown as a trust signal.
 */
export function CloutCard() {
  const clout = useViewerQuery(api.clout.getMyClout, {});
  const setHidden = useViewerMutation(api.clout.setLeaderboardHidden);
  const { toast } = useAnnouncer();
  const [saving, setSaving] = useState(false);

  const weekTotal = clout ? clout.thisWeek.reduce((sum, row) => sum + row.counted, 0) : 0;
  const nothingThisWeek = clout ? clout.thisWeek.every((row) => row.counted === 0 && row.held === 0) : true;

  const toggleHidden = async () => {
    if (!clout || saving) return;
    const next = !clout.hidden;
    setSaving(true);
    try {
      await setHidden({ hidden: next });
      toast({
        message: next ? "You're hidden from leaderboards" : "You're shown on leaderboards",
        tone: "success",
      });
    } catch (err: any) {
      toast({ message: err?.data?.message || err?.message || "Couldn't change leaderboard visibility.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="your-clout-heading"
      data-testid="clout-card"
      className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--sp-2)]">
        <h2 id="your-clout-heading" className="font-display text-xl font-bold">
          Your Clout
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Only you can see this card.
          {clout?.isDemo && <span className="font-bold"> · Demo · not real</span>}
        </p>
      </div>

      {clout === undefined ? (
        <p role="status" className="mt-[var(--sp-2)] text-sm text-[var(--muted)]">
          Loading your Clout…
        </p>
      ) : (
        <>
          <h3 className="mt-[var(--sp-3)] text-sm font-bold text-[var(--muted)]">This week</h3>
          {nothingThisWeek ? (
            <p data-testid="clout-empty" className="mt-[var(--sp-1)]">
              No Clout yet this week. Corroborated Parking Reports, Line Checks and Study vibes earn it.
            </p>
          ) : (
            <ul className="lt-grid-1 mt-[var(--sp-1)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
              {clout.thisWeek.map((row) => (
                <li
                  key={row.campus}
                  data-testid={`clout-week-${row.campus.toLowerCase()}`}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-3)]"
                >
                  <CampusBadge campus={row.campus} />
                  <span>
                    <span className="font-display text-2xl font-bold">{row.counted}</span>{" "}
                    <span className="text-sm text-[var(--muted)]">Clout</span>
                    {row.held > 0 && (
                      <span className="block text-sm text-[var(--muted)]">{row.held} pending corroboration</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-[var(--sp-3)] flex flex-wrap gap-x-[var(--sp-5)] gap-y-[var(--sp-1)]">
            <div>
              <dt className="text-sm text-[var(--muted)]">This week, both Campuses</dt>
              <dd className="font-display text-xl font-bold" data-testid="clout-week-total">{weekTotal}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--muted)]">Lifetime</dt>
              <dd className="font-display text-xl font-bold" data-testid="clout-lifetime">{clout.lifetime}</dd>
            </div>
          </dl>

          <h3 className="mt-[var(--sp-3)] text-sm font-bold text-[var(--muted)]">Last 30 days</h3>
          {clout.payouts.length === 0 ? (
            <p className="mt-[var(--sp-1)] text-sm">No payouts in the last 30 days.</p>
          ) : (
            <ul data-testid="clout-payout-log" className="mt-[var(--sp-1)] divide-y divide-[var(--line)]">
              {clout.payouts.map((payout) => (
                <li key={payout.id} className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--sp-2)] py-[var(--sp-2)] text-sm">
                  <span className="min-w-0">
                    <span className="font-bold">
                      {payout.kind === "reverse" ? "−" : "+"}
                      {payout.amount} Clout
                    </span>{" "}
                    · {SOURCE_LABELS[payout.sourceType] ?? "Logistics report"} · {payout.campus}
                    {payout.kind !== "earn" && <> · {KIND_LABELS[payout.kind]}</>}
                  </span>
                  <span className="text-[var(--muted)]">{payoutTime(payout.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-[var(--sp-3)] flex flex-wrap items-center justify-between gap-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]">
            <span id="clout-hide-label" className="font-bold">
              Hide me from leaderboards
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={clout.hidden}
              aria-labelledby="clout-hide-label"
              data-testid="clout-hide-toggle"
              disabled={saving}
              onClick={() => void toggleHidden()}
              className={`inline-flex min-h-[var(--target)] min-w-[calc(var(--target)*2)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border-2 px-[var(--sp-3)] text-sm font-bold disabled:opacity-60 ${
                clout.hidden
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]"
                  : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]"
              }`}
            >
              <span aria-hidden="true">{clout.hidden ? "●" : "○"}</span>
              <span>{clout.hidden ? "On" : "Off"}</span>
            </button>
          </div>
          {clout.hidden && (
            <p className="mt-[var(--sp-1)] text-sm text-[var(--muted)]">You're hidden from leaderboards.</p>
          )}
        </>
      )}

      <p className="mt-[var(--sp-3)] text-sm text-[var(--muted)]">
        Clout counts helpful logistics reports, not reliability.{" "}
        <Link href="/leaderboard" className="font-bold text-[var(--ink)] underline">
          See leaderboard
        </Link>
      </p>
    </section>
  );
}
