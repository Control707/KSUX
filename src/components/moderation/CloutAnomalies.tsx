"use client";

import React, { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { useViewerClient } from "@/lib/viewerClient";

type Anomalies = FunctionReturnType<typeof api.leaderboard.getCloutAnomalies>;

/** Maintainer-only Clout anomaly view (SPEC-v2 §12): top weekly gainers and most-reversed accounts. One-shot read. */
export function CloutAnomalies() {
  const convex = useConvex();
  const { authArgs } = useViewerClient();
  const [data, setData] = useState<Anomalies | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = React.useCallback(async () => {
    if (!authArgs) return;
    setLoading(true);
    try { setData(await convex.query(api.leaderboard.getCloutAnomalies, authArgs)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [authArgs, convex]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return null;
  return (
    <section data-testid="clout-anomalies" aria-labelledby="clout-anomalies-heading" className="space-y-[var(--sp-3)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
        <h2 id="clout-anomalies-heading" className="font-display text-xl font-bold">Clout anomalies{data.isDemo && " · Demo · not real"}</h2>
        <button type="button" disabled={loading} onClick={() => void load()}
          className="inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border-2 border-[var(--line-strong)] px-[var(--sp-3)] text-sm font-bold disabled:opacity-60">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">Maintainers only. Week of {data.weekKey}. Includes hidden and held totals.</p>
      <h3 className="text-lg font-bold">Top weekly gainers</h3>
      {data.gainers.length === 0 ? <p>No Clout earned this week.</p> : (
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.gainers.map((row) => (
            <li key={row.campus + row.handle} className="py-[var(--sp-1)]">
              {row.campus} · @{row.handle} · {row.counted} counted{row.held > 0 && `, ${row.held} held`}{row.hidden && " · hidden"}
            </li>
          ))}
        </ul>
      )}
      <h3 className="text-lg font-bold">Most-reversed accounts (7 days)</h3>
      {data.mostReversed.length === 0 ? <p>No reversals in the last 7 days.</p> : (
        <ul className="divide-y divide-[var(--line)] text-sm">
          {data.mostReversed.map((row) => (
            <li key={row.handle} className="py-[var(--sp-1)]">
              @{row.handle} · {row.reversals} reversed ({row.reversedAmount} Clout){row.holds > 0 && ` · ${row.holds} holds`}
            </li>
          ))}
        </ul>
      )}
      {data.limited && <p role="status" className="text-sm">Reached the 2,000-event scan limit; counts may be partial.</p>}
    </section>
  );
}
