"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";

const button = "inline-flex min-h-[var(--target)] max-w-full items-center justify-center rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-[length:var(--fs-sm)] font-bold text-[var(--ink)] disabled:opacity-60";

/**
 * Judge Demo Mode only: add a fresh "Demo · not real" Timely Warning on demand,
 * so the app-wide banner, the Safety card and the Alert details page appear live.
 * It lives in this Demo session only and never sends a push.
 */
export function DemoAlertTrigger() {
  const { auth } = useViewerClient();
  const simulate = useViewerMutation(api.officialAlerts.simulateDemoAlert);
  const { announce } = useAnnouncer();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [alertId, setAlertId] = useState<string | null>(null);
  if (auth.status !== "demo") return null;
  return (
    <div className="space-y-[var(--sp-1)]" data-testid="demo-alert-trigger">
      <button type="button" className={button} disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const result = await simulate({});
          setAlertId(result.alertId);
          const text = "Sample Alert added to this Demo session. The banner appears across KSUX. No push was sent.";
          setMessage(text);
          announce(text);
        } catch (problem) {
          setMessage(problem instanceof Error ? problem.message.replace(/^.*?Uncaught ConvexError: /, "") : "Could not add a sample Alert.");
        } finally {
          setBusy(false);
        }
      }}>
        Simulate a new Official Alert (Demo)
      </button>
      <p role="status" className="text-[length:var(--fs-sm)]">{message}</p>
      {alertId && <Link className="inline-flex min-h-[var(--target)] items-center font-bold underline" href={`/safety/alerts/${alertId}`}>Open the sample Alert</Link>}
    </div>
  );
}
