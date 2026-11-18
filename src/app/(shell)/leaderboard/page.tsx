"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/a11y/controls";

type LeaderboardCampus = "kennesaw" | "marietta";

/** Stub for /leaderboard: its own Campus control with ?campus=; "coming soon" until gate 2(a). */
export default function LeaderboardPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const campus: LeaderboardCampus = params.get("campus") === "marietta" ? "marietta" : "kennesaw";

  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Leaderboard</h1>
      <SegmentedControl
        label="Leaderboard Campus"
        hideLabel={false}
        options={[{ value: "kennesaw", label: "Kennesaw" }, { value: "marietta", label: "Marietta" }] as const}
        value={campus}
        testIdPrefix="leaderboard-campus"
        onChange={(next) => router.replace(`${pathname}?campus=${next}`, { scroll: false })}
      />
      <section aria-labelledby="leaderboard-soon" className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
        <h2 id="leaderboard-soon" className="font-display text-[length:var(--fs-xl)] font-bold">Coming soon</h2>
        <p>The {campus === "marietta" ? "Marietta" : "Kennesaw"} Leaderboard opens later. Clout is a thank-you for helpful reports, not a measure of trust.</p>
      </section>
    </div>
  );
}
