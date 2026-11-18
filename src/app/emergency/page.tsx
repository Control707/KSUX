"use client";

import React from "react";
import Link from "next/link";
import { EmergencyPanel } from "@/components/safety/EmergencyPanel";
import { useDemoTab } from "@/components/safety/useDemoTab";

/**
 * Standalone Emergency Panel. Statically rendered and precached by the
 * service worker, so it opens with no sign-in, GPS or network. It is also
 * the offline fallback for /safety navigations.
 */
export default function EmergencyPage() {
  const demo = useDemoTab();
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl [overflow-wrap:anywhere] space-y-[var(--sp-4)] p-[var(--sp-4)] outline-none">
        <Link href="/" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
          Back to KSUX
        </Link>
        <EmergencyPanel mode={demo ? "demo" : "live"} headingLevel={1} />
        <p className="text-sm text-[var(--muted)]">
          This page works offline. Community Incidents and official notices need a connection.
        </p>
      </main>
    </div>
  );
}
