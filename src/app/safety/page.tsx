"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
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
import { IncidentRegion } from "@/components/safety/IncidentViews";

/**
 * /safety, P0 (SPEC-v2 §5, #78): Official Alerts as source-named KSU links,
 * the first-run intro, the Emergency Panel, report entry and the Incidents
 * region. Never cached by the service worker; offline it falls back to the
 * precached /emergency page, and a tab that loses its connection here says so.
 */
export default function SafetyPage() {
  const { auth } = useViewerClient();
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
      <ReportIncidentEntry scopeKey={JSON.stringify(auth)} signedOut={auth.status === "unauthenticated"} mode={mode} online={online} postingEnabled={gate?.postingEnabled} autoOpen={autoReport} />
      <IncidentRegion online={online} reconnectedAt={reconnectedAt} />
      <ModerationReportNote />
      <KsuContactsSection mode={mode} />
      <Link href="/safety/about" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
        About KSUX Safety
      </Link>
    </>
  );
}
