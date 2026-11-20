"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { errorMessage, ui } from "@/components/communities/campusLifeUi";
import { agendaLabels } from "@/lib/agenda";

export function AgendaReminderSettings() {
  const settings = useViewerQuery(api.agenda.getReminderSettings, {});
  const save = useViewerMutation(api.agenda.setReminderSettings);
  const { toast } = useAnnouncer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const ready = settings !== undefined;
  useEffect(() => {
    if (!ready) return;
    const focusSection = () => { if (window.location.hash === "#agenda") heading.current?.focus(); };
    const frame = requestAnimationFrame(focusSection);
    window.addEventListener("hashchange", focusSection);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", focusSection); };
  }, [ready]);
  return <section id="agenda" aria-labelledby="agenda-reminders-heading" className={`${ui.card} space-y-[var(--sp-3)] scroll-mt-[var(--chrome-top)]`}>
    <h2 ref={heading} tabIndex={-1} id="agenda-reminders-heading" className={ui.h2}>Agenda reminders</h2>
    <p>Off by default. Choose an in-app reminder for each type, up to 15 minutes before it starts or is due. OwlSide must be open, visible and online; it checks once a minute and when you return. No OS push or background delivery.</p>
    {!settings ? <p role="status">Loading reminder settings…</p> : <div className="space-y-[var(--sp-2)]">
      {(Object.keys(agendaLabels) as Array<keyof typeof agendaLabels>).map((kind) => <button
        key={kind} type="button" role="switch" aria-checked={settings[kind]} disabled={busy}
        className={`${ui.secondary} flex w-full justify-between gap-[var(--sp-3)] text-left`}
        onClick={async () => {
          setBusy(true); setError("");
          try {
            await save({ settings: { ...settings, [kind]: !settings[kind] } });
            toast({ message: `${agendaLabels[kind]} reminders ${settings[kind] ? "off" : "on"}` });
          } catch (problem) { setError(errorMessage(problem, "Could not save reminder settings.")); }
          finally { setBusy(false); }
        }} aria-label={`${agendaLabels[kind]} reminders`}>
        <span>{agendaLabels[kind]} reminders</span><span aria-hidden="true">{settings[kind] ? "✓ On" : "○ Off"}</span>
      </button>)}
    </div>}
    {error && <p role="alert">{error}</p>}
    <p className={ui.muted}>Cancellations, leaving a Study Session and removing an RSVP stop pending reminders. A changed start or due time can trigger a new reminder; title and location edits do not repeat one. A reminder is claimed once across tabs and devices. If the app closes after a claim, that reminder may not be seen. Missed reminders are not replayed after the start time.</p>
    <Link href="/agenda" className={ui.link}>Open private agenda</Link>
  </section>;
}
