import React, { Suspense } from "react";
import { ParkingView } from "@/components/parking/ParkingView";

export default function ParkingPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-[var(--sp-4)] text-sm text-[var(--muted)]">
          Loading Parking…
        </p>
      }
    >
      <ParkingView />
    </Suspense>
  );
}
