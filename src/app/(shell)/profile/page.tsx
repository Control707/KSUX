import React, { Suspense } from "react";
import { ProfileView } from "@/components/profile/ProfileView";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-[var(--sp-4)] text-sm text-[var(--muted)]">
          Loading profile…
        </p>
      }
    >
      <ProfileView />
    </Suspense>
  );
}
