import React, { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EduOtpModal } from "@/components/auth/EduOtpModal";
import { OnboardingFlow } from "@/components/auth/OnboardingFlow";
import { ServiceWorkerManager } from "@/components/pwa/PwaSupport";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      authModalSlot={<EduOtpModal />}
      onboardingSlot={<OnboardingFlow />}
      quickComposerSlot={<ServiceWorkerManager />}
    >
      <Suspense
        fallback={
          <div className="p-[var(--sp-4)] text-sm text-[var(--muted)]" role="status">Loading…</div>
        }
      >
        {children}
      </Suspense>
    </AppShell>
  );
}
