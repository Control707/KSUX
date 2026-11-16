import React, { Suspense } from "react";
import { StudyView } from "@/components/study/StudyView";

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs font-semibold text-[#5E6675]">
          Loading KSU Study Rooms...
        </div>
      }
    >
      <StudyView />
    </Suspense>
  );
}
