import React, { Suspense } from "react";
import { SearchView } from "@/components/search/SearchView";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="p-[var(--sp-4)]">
          <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold">Search KSU</h1>
        </div>
      }
    >
      <SearchView />
    </Suspense>
  );
}
