"use client";

import React from "react";
import Link from "next/link";
import { AgendaReminderSettings } from "@/components/agenda/AgendaReminderSettings";

/** Notifications: message and Alert handoffs, with private agenda reminder settings. */
export default function NotificationPreferencesPage() {
  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Notifications</h1>
      <AgendaReminderSettings />
      <section id="messages" aria-labelledby="notif-messages" className="scroll-mt-[var(--chrome-top)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
        <h2 id="notif-messages" className="font-display text-[length:var(--fs-xl)] font-bold">Messages</h2>
        <p>Message notification settings are on your Profile for now.</p>
        <Link href="/profile" className="inline-flex min-h-[var(--target)] items-center font-bold underline">Open Profile</Link>
      </section>
      <section id="alerts" aria-labelledby="notif-alerts" className="scroll-mt-[var(--chrome-top)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
        <h2 id="notif-alerts" className="font-display text-[length:var(--fs-xl)] font-bold">Official Alerts</h2>
        <p>KSUX doesn’t send Official Alert notifications yet. Sign up for KSU Alert to get KSU’s own notices.</p>
        <a href="https://campus.kennesaw.edu/offices-services/uits/technology-guides/it-communications.php" className="inline-flex min-h-[var(--target)] items-center font-bold underline">KSU Alert and Rave sign-up information</a>
      </section>
    </div>
  );
}
