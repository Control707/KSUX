"use client";

import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { KsuPoliceEmergencyCallout } from "@/components/shared/ReportTrigger";

export default function SafetyPage() {
  const { auth } = useViewerClient();
  const gate = useViewerQuery(api.moderation.getIncidentLaunchStatus, {});
  const demo = auth.status === "demo";

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold">Safety</h1>
      <section className="space-y-2 rounded-xl border p-4" aria-labelledby="official-alerts">
        <h2 id="official-alerts" className="font-bold">Official Alerts</h2>
        <p>Check KSU’s official sources for notices and emergency communications.</p>
        <ul className="space-y-1">
          <li><a className="underline" href="https://campus.kennesaw.edu/offices-services/public-safety-police/">KSU Police · Emergency Notifications, Timely Warnings and LiveSafe</a></li>
          <li><a className="underline" href="https://www.kennesaw.edu/emergency/">KSU Emergency Advisory page</a></li>
          <li><a className="underline" href="https://campus.kennesaw.edu/offices-services/uits/technology-guides/it-communications.php">KSU Alert and Rave notification information</a></li>
        </ul>
      </section>
      <section className="space-y-2 rounded-xl border p-4" aria-labelledby="emergency-panel">
        <h2 id="emergency-panel" className="font-bold">Is anyone in danger right now?</h2>
        <p>KSUX can’t send help and doesn’t contact police.</p>
        {demo ? (
          <p>Demo · not real. Emergency calling and texting are disabled in this exercise.</p>
        ) : auth.status === "booting" ? (
          <p>Emergency numbers · 911 and KSU Police at 470-578-6666.</p>
        ) : (
          <>
            <KsuPoliceEmergencyCallout />
            <p><a className="underline" href="tel:911">Call 911</a> for an emergency.</p>
            <p><a className="underline" href="sms:7703563866">Text KSU Police at 770-356-3866</a> if you are deaf, hard of hearing, have a speech disability, or cannot safely make a voice call.</p>
          </>
        )}
      </section>
      {!gate?.postingEnabled && <p role="status">Community Incident posting is unavailable.</p>}
    </main>
  );
}
