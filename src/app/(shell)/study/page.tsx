import React, { Suspense } from "react";
import { StudyView } from "@/components/study/StudyView";

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-[var(--sp-4)] text-sm text-[var(--muted)]">
          Loading Study Rooms…
        </p>
      }
    >
      <StudyView />
    </Suspense>
  );
}
