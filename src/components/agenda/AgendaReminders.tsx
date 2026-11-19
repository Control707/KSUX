"use client";

import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { agendaTime } from "@/lib/agenda";

/** Mounted once in the signed-in shell. Never requests push permission or schedules server jobs. */
export function AgendaReminders() {
  const settings = useViewerQuery(api.agenda.getReminderSettings, {});
  const claim = useViewerMutation(api.agenda.claimDueReminders);
  const { authArgs } = useViewerClient();
  const { toast, dismissToast } = useAnnouncer();
  const enabled = settings && Object.values(settings).some(Boolean);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, running = false;
    const toastIds = new Set<number>();
    const check = async () => {
      if (running || document.visibilityState !== "visible" || !navigator.onLine) return;
      running = true;
      try {
        const items = await claim({});
        if (!stopped && items.length) toastIds.add(toast({
          message: items.length === 1 ? `Agenda reminder: ${items[0]!.title}` : `${items.length} agenda reminders`,
          detail: items.length === 1 ? agendaTime(items[0]!.startsAt) : "Open your private agenda to review upcoming items.",
          href: "/agenda", actionLabel: "Open private agenda", durationMs: 15_000, testId: "agenda-reminder-toast",
        }));
      } catch { /* Retry on the next visible, online check; server claims are idempotent. */ }
      finally { running = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 60_000);
    const onReturn = () => void check();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      stopped = true; clearInterval(timer);
      // The announcer lives above the viewer boundary; clear private toasts on
      // sign-out, persona changes and disabling reminders.
      for (const id of toastIds) dismissToast(id);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [enabled, authArgs, claim, toast, dismissToast]);
  return null;
}
