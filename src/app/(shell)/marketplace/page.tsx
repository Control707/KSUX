import React, { Suspense } from "react";
import { MarketplaceView } from "@/components/marketplace/MarketplaceView";

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-[var(--sp-4)] text-sm text-[var(--muted)]">
          Loading Marketplace…
        </p>
      }
    >
      <MarketplaceView />
    </Suspense>
  );
}
