import React, { Suspense } from "react";
import { FeedView } from "@/components/feed/FeedView";

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-[var(--sp-2)] p-[var(--sp-4)]">
          <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold">
            Feed
          </h1>
          <p role="status" className="text-sm text-[var(--muted)]">Loading Posts…</p>
        </div>
      }
    >
      <FeedView />
    </Suspense>
  );
}
