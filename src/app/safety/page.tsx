"use client";

import React from "react";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";
import { EmergencyPanel } from "@/components/safety/EmergencyPanel";
import { useSafetyMode } from "@/components/safety/useSafetyMode";

const linkClass = "inline-flex min-h-[var(--target)] items-center font-bold underline";

export default function SafetyPage() {
  const gate = useViewerQuery(api.moderation.getIncidentLaunchStatus, {});
  const mode = useSafetyMode();

  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Safety</h1>
      <section className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]" aria-labelledby="official-alerts">
        <h2 id="official-alerts" className="font-display text-[length:var(--fs-xl)] font-bold">Official Alerts</h2>
        <p>Check KSU’s official sources for notices and emergency communications.</p>
        <ul className="space-y-[var(--sp-1)]">
          <li><a className={linkClass} href="https://campus.kennesaw.edu/offices-services/public-safety-police/">KSU Police · Emergency Notifications, Timely Warnings and LiveSafe</a></li>
          <li><a className={linkClass} href="https://www.kennesaw.edu/emergency/">KSU Emergency Advisory page</a></li>
          <li><a className={linkClass} href="https://campus.kennesaw.edu/offices-services/uits/technology-guides/it-communications.php">KSU Alert and Rave notification information</a></li>
        </ul>
      </section>
      <EmergencyPanel mode={mode} />
      <section className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]" aria-labelledby="community-incidents">
        <h2 id="community-incidents" className="font-display text-[length:var(--fs-xl)] font-bold">Community Incidents</h2>
        <p>Community reports and their map arrive in a later phase. Community reports are never verified and never replace the contacts above.</p>
        {gate?.postingEnabled === false && <p role="status">Community Incident posting is unavailable.</p>}
      </section>
    </>
  );
}
