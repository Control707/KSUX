import React, { Suspense } from "react";
import { FeedView } from "@/components/feed/FeedView";

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs font-semibold text-[#5E6675]">
          Loading Campus Feed...
        </div>
      }
    >
      <FeedView />
    </Suspense>
  );
}
