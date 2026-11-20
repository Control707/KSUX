"use client";

import React from "react";
import Link from "next/link";
import { EmergencyPanel } from "@/components/safety/EmergencyPanel";
import { useDemoTab } from "@/components/safety/useDemoTab";
import { KsuContactsSection, OfficialLink } from "@/components/safety/SafetyResources";
import {
  NO_ALERT_ISNT_SAFE,
  OFFICIAL_ALERT_LINKS,
  OFFLINE_INCIDENTS,
  OFFLINE_OFFICIAL,
} from "@/components/safety/safetyContent";

/**
 * Standalone Emergency Panel. Statically rendered and precached by the
 * service worker, so it opens with no sign-in, GPS or network. It is also
 * the offline fallback for /safety navigations, so it carries only static
 * contacts and never any Alert status or Incident content (#60).
 */
export default function EmergencyPage() {
  const demo = useDemoTab();
  const mode = demo ? "demo" : "live";
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl [overflow-wrap:anywhere] space-y-[var(--sp-4)] p-[var(--sp-4)] outline-none">
        <Link href="/" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
          Back to OwlSide
        </Link>
        <EmergencyPanel mode={mode} headingLevel={1} />
        <section
          aria-labelledby="emergency-offline-note"
          data-testid="emergency-offline-note"
          className="space-y-[var(--sp-1)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
        >
          <h2 id="emergency-offline-note" className="font-display text-[length:var(--fs-xl)] font-bold">
            If you’re offline
          </h2>
          <p className="font-bold">{OFFLINE_OFFICIAL}</p>
          <p className="font-bold">{OFFLINE_INCIDENTS}</p>
          <p>This page works offline. Reconnect to open KSU’s pages and see community reports.</p>
          <p>{NO_ALERT_ISNT_SAFE}</p>
          <ul className="space-y-[var(--sp-1)]">
            {OFFICIAL_ALERT_LINKS.map((key) => (
              <li key={key}>
                <OfficialLink sourceKey={key} />
              </li>
            ))}
          </ul>
        </section>
        <KsuContactsSection mode={mode} />
      </main>
    </div>
  );
}
