"use client";

import { useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useViewerQuery } from "@/lib/viewerClient";

export const CLOUT_PAYOUT_EVENT = "ksux:clout-payout";

const SOURCE_PHRASE: Record<string, string> = {
  parking_report: "report was confirmed",
  spot_opening: "Spot Opening was taken",
  line_check: "Line Check was confirmed",
  study_vibe: "Study vibe was confirmed",
  handoff: "handoff was completed",
};

/**
 * In-app payout toast (SPEC-v2 §12): "+5 Clout · your Lot P40 report was
 * confirmed" with "See leaderboard". Clout never pushes; this only reacts to the
 * viewer's own ledger while the app is open, and never toasts history.
 */
export function CloutPayoutToast({ viewerKey }: { viewerKey: string }) {
  const clout = useViewerQuery(api.clout.getMyClout, {});
  const { toast } = useAnnouncer();
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!clout) return;
    if (!seen.current || seen.current.key !== viewerKey) {
      seen.current = { key: viewerKey, ids: new Set(clout.payouts.map((p) => p.id)) };
      return;
    }
    const ids = seen.current.ids;
    const fresh = clout.payouts.filter((p) => !ids.has(p.id));
    for (const payout of fresh) ids.add(payout.id);
    if (fresh.some((p) => p.kind === "earn" || p.kind === "release")) {
      // An open /leaderboard re-reads once (SPEC-v2 §14: one-shot on the payout toast).
      window.dispatchEvent(new Event(CLOUT_PAYOUT_EVENT));
    }
    for (const payout of [...fresh].reverse()) {
      if (payout.kind !== "earn" && payout.kind !== "release") continue;
      const phrase = SOURCE_PHRASE[payout.sourceType] ?? "report was confirmed";
      const place = payout.place ? `${payout.place} ` : "";
      toast({
        tone: "success",
        message: `+${payout.amount} Clout · your ${place}${phrase}`,
        detail: clout.isDemo ? "Demo · not real" : undefined,
        href: "/leaderboard",
        actionLabel: "See leaderboard",
        testId: "clout-payout-toast",
      });
    }
  }, [clout, viewerKey, toast]);

  return null;
}
