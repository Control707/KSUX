import React, { Suspense } from "react";
import { ProfileView } from "@/components/profile/ProfileView";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-xs font-semibold text-[#5E6675]">
          Loading profile...
        </div>
      }
    >
      <ProfileView />
    </Suspense>
  );
}
