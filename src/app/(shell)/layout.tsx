import React, { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EduOtpModal } from "@/components/auth/EduOtpModal";
import { OnboardingFlow } from "@/components/auth/OnboardingFlow";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      authModalSlot={<EduOtpModal />}
      onboardingSlot={<OnboardingFlow />}
    >
      <Suspense fallback={<div className="p-4 text-xs text-[#5E6675]">Loading...</div>}>
        {children}
      </Suspense>
    </AppShell>
  );
}
