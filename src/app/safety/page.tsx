"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";
import { EmergencyPanel } from "@/components/safety/EmergencyPanel";
import { useSafetyMode } from "@/components/safety/useSafetyMode";
import { useOnline } from "@/components/safety/useOnline";
import { SafetyIntroCard } from "@/components/safety/SafetyIntroCard";
import { ReportIncidentEntry } from "@/components/safety/ReportIncidentEntry";
import {
  KsuContactsSection,
  ModerationReportNote,
  OfficialAlertsSection,
} from "@/components/safety/SafetyResources";
import { OFFLINE_INCIDENTS } from "@/components/safety/safetyContent";

/**
 * /safety, P0 (SPEC-v2 §5, #78): Official Alerts as source-named KSU links,
 * the first-run intro, the Emergency Panel, report entry and the Incidents
 * region. Never cached by the service worker; offline it falls back to the
 * precached /emergency page, and a tab that loses its connection here says so.
 */
export default function SafetyPage() {
  const gate = useViewerQuery(api.moderation.getIncidentLaunchStatus, {});
  const mode = useSafetyMode();
  const { online, reconnectedAt } = useOnline();
  const [autoReport, setAutoReport] = useState(false);

  useEffect(() => {
    try {
      setAutoReport(new URLSearchParams(window.location.search).get("report") === "1");
    } catch {
      setAutoReport(false);
    }
  }, []);

  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Safety</h1>
      <p role="status" data-testid="safety-connection" className="min-h-[1.5em] text-[length:var(--fs-sm)] font-bold">
        {online ? (reconnectedAt ? "Back online. KSU’s pages can be opened again." : "") : "You’re offline. Emergency contacts below still work."}
      </p>
      {mode === "demo" && (
        <p data-testid="safety-demo-banner" className="rounded-[var(--r-sm)] bg-[var(--warn-bg)] px-[var(--sp-3)] py-[var(--sp-2)] font-bold text-[var(--warn-fg)]">
          Demo · not real. Calls and texts are blocked, and sample notices are fixtures.
        </p>
      )}
      <OfficialAlertsSection mode={mode} online={online} />
      <SafetyIntroCard />
      <EmergencyPanel mode={mode} />
      <ReportIncidentEntry mode={mode} online={online} postingEnabled={gate?.postingEnabled} autoOpen={autoReport} />
      <section
        className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
        aria-labelledby="community-incidents"
      >
        <h2 id="community-incidents" className="font-display text-[length:var(--fs-xl)] font-bold">
          Community Incidents
        </h2>
        {online ? (
          <p>
            Community reports and their map arrive in a later update. Community reports are never verified and never
            replace the contacts above.
          </p>
        ) : (
          <div data-testid="offline-incidents">
            <p className="font-bold">{OFFLINE_INCIDENTS}</p>
            <p>Reconnect to see current reports. Saved schedules and campus maps may still be available elsewhere in KSUX.</p>
          </div>
        )}
      </section>
      <ModerationReportNote />
      <KsuContactsSection mode={mode} />
      <Link href="/safety/about" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
        About KSUX Safety
      </Link>
    </>
  );
}
