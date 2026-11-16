import React, { Suspense } from "react";
import { MarketplaceView } from "@/components/marketplace/MarketplaceView";

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs font-semibold text-[#5E6675]">
          Loading KSU Marketplace...
        </div>
      }
    >
      <MarketplaceView />
    </Suspense>
  );
}
