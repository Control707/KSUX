"use client";

import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";

const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const megabytes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const GATE_REASON = {
  no_measurement: "no valid measurement",
  stale_measurement: "measurement is stale",
  too_few_days: "fewer than 14 measured days",
  over_budget: "projected at or above 50% of 1 GB",
} as const;

export function V2LaunchOps() {
  const data = useViewerQuery(api.moderation.getV2LaunchOps, {});
  if (!data) return null;
  const { gate, io } = data;
  return (
    <section className="space-y-[var(--sp-3)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]" aria-labelledby="v2-launch-ops">
      <h2 id="v2-launch-ops" className="font-display text-xl font-bold">V2 launch readiness</h2>
      <p>Incident posting {gate.postingEnabled ? "enabled" : "disabled"}. {gate.moderatorCount} eligible appointed Moderators. Operations checklist {gate.opsChecklistDone ? "complete" : "pending"}. Production switch {gate.requested ? "on" : "off"}.</p>
      <p data-testid="leaderboard-gate">Leaderboard {data.leaderboard.open ? "open" : `showing "coming soon" (${GATE_REASON[data.leaderboard.reason]})`}.</p>
      <h3 className="text-lg font-bold">Projected monthly database I/O</h3>
      {!io ? <p>No valid usage measurement has been recorded.</p> : (
        <>
          <p role="status">
            {percent.format(io.projectedBytes / io.monthlyBudgetBytes)} of the 1 GB budget.
            {io.band === "over_70" ? " At or above 70%." : io.band === "over_50" ? " At or above 50%." : " Below 50%."}
            {io.stale && " Measurement is stale."}
          </p>
          <p>Based on {io.sampleDays} measured days ending {new Date(io.measuredAt).toISOString().slice(0, 10)}.</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-[var(--sp-2)] text-sm">
            {io.shapes.map((shape) => (
              <div key={shape.key} className="contents">
                <dt>{shape.label}</dt>
                <dd>{megabytes.format(shape.projectedBytes / 1_000_000)} MB</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
