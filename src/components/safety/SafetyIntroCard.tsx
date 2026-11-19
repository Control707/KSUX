"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

/** Only a dismissal flag; never Incident or report content (#60 §12). */
export const SAFETY_INTRO_KEY = "ksux_safety_intro_dismissed";

/**
 * First-run Safety intro (SPEC-v2 §5, #49 §D): what KSUX is and isn't. Read
 * and dismiss, no consent checkbox. Shown until dismissed on this device.
 */
export function SafetyIntroCard() {
  // Server and first paint show the card, so a Student without storage still sees it.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(SAFETY_INTRO_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(SAFETY_INTRO_KEY, "1");
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setDismissed(true);
    document.getElementById("report-something")?.focus();
  };

  return (
    <section
      aria-labelledby="safety-intro"
      data-testid="safety-intro"
      className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border-2 border-[var(--line-strong)] bg-[var(--surface-2)] p-[var(--sp-4)]"
    >
      <h2 id="safety-intro" className="font-display text-[length:var(--fs-xl)] font-bold">
        What KSUX Safety is and isn’t
      </h2>
      <ul className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)]">
        <li>KSUX isn’t 911 and doesn’t contact police.</li>
        <li>KSUX isn’t monitored 24/7. Moderators are volunteers.</li>
        <li>KSUX isn’t official KSU. Official links name their source.</li>
        <li>Community reports aren’t verified.</li>
        <li>Clout isn’t a measure of trust.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-[var(--sp-3)]">
        <button
          type="button"
          onClick={dismiss}
          data-testid="safety-intro-dismiss"
          className="min-h-[var(--target)] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-4)] font-bold"
        >
          Got it
        </button>
        <Link href="/safety/about" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
          About KSUX Safety
        </Link>
      </div>
    </section>
  );
}
