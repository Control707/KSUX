"use client";

import React from "react";
import Link from "next/link";
import { AgendaReminderSettings } from "@/components/agenda/AgendaReminderSettings";
import { AlertPushSettings } from "@/components/profile/AlertPushSettings";

const card = "scroll-mt-[var(--chrome-top)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]";

/** Notifications (SPEC-v2 §10): this phone, Official Alert push, messages, agenda reminders and what never pushes. */
export default function NotificationPreferencesPage() {
  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Notifications</h1>
      <p>Push is extra. OwlSide always shows new things inside the app; push only reaches you when OwlSide is closed.</p>
      <AlertPushSettings />
      <section id="messages" aria-labelledby="notif-messages" className={card}>
        <h2 id="notif-messages" className="font-display text-[length:var(--fs-xl)] font-bold">Messages</h2>
        <p>Message notification settings are on your Profile for now.</p>
        <Link href="/profile" className="inline-flex min-h-[var(--target)] items-center font-bold underline">Open Profile</Link>
      </section>
      <AgendaReminderSettings />
      <section id="never-pushed" aria-labelledby="notif-never" className={card}>
        <h2 id="notif-never" className="font-display text-[length:var(--fs-xl)] font-bold">Never pushed</h2>
        <ul className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)]">
          <li>Group Chats: too many people at once.</li>
          <li>Spot Openings: they change too fast to be useful by push.</li>
          <li>Incidents: community reports aren’t verified, so OwlSide doesn’t push them.</li>
          <li>Clout: it’s a score, not news.</li>
        </ul>
      </section>
    </div>
  );
}
