import React, { Suspense } from "react";
import { ParkingView } from "@/components/parking/ParkingView";

export default function ParkingPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs font-semibold text-[#5E6675]">
          Loading KSU Parking Lots &amp; Campus Map...
        </div>
      }
    >
      <ParkingView />
    </Suspense>
  );
}
