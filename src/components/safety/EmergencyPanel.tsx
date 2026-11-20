"use client";

import React, { useId, useState } from "react";
import { MessageSquareText, Phone, ExternalLink } from "lucide-react";

export const EMERGENCY_CONTACTS = {
  emergency: { label: "Call 911", number: "911", href: "tel:911" },
  police: { label: "Call KSU Police", number: "470-578-6666", href: "tel:4705786666" },
  policeText: { label: "Text KSU Police", number: "770-356-3866", href: "sms:7703563866" },
} as const;

export const LIVESAFE_URL = "https://campus.kennesaw.edu/offices-services/livesafe/";
export const HANDOFF_COPY = "Opening your phone app… OwlSide can’t confirm the call or a police response.";
export const DEMO_HANDOFF_COPY = "Demo Mode: nothing dialled. In a real emergency, call 911.";

/**
 * The event the root-layout interceptor dispatches when a Demo tab taps a
 * tel:/sms:/mailto: link before React knows it is a Demo session.
 */
export const DEMO_CALL_EVENT = "owlside:demo-call-intercepted";

/**
 * Runs inline in <head> before any bundle loads, so Judge Demo Mode never
 * dials or opens an email to real KSU Police even before hydration or offline. Checks the tab's demo state at
 * click time; real Students are never blocked.
 */
export const DEMO_CALL_INTERCEPT_SCRIPT = `(function(){try{document.addEventListener("click",function(e){var t=e.target;var a=t&&t.closest?t.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'):null;if(!a)return;var demo=false;try{demo=!!sessionStorage.getItem("owlside_demo_short_code")||new URLSearchParams(location.search).has("demo")}catch(_){}if(!demo)return;e.preventDefault();e.stopPropagation();var p=a.closest("[data-emergency-panel]");var s=p&&p.querySelector("[data-emergency-status]");if(s)s.textContent=${JSON.stringify(DEMO_HANDOFF_COPY)};document.dispatchEvent(new CustomEvent(${JSON.stringify(DEMO_CALL_EVENT)}));},true);}catch(_){}})();`;

export type EmergencyPanelMode = "live" | "demo";

/**
 * Emergency Panel (SPEC-v2 §5). Needs no sign-in, GPS or network; never
 * auto-dials or plays audio. In Demo the handoffs are buttons that dial
 * nothing. Shown on /safety, the offline view, /emergency, and before every
 * Incident report or Campus Safety Moderation Report (Phase 1B).
 */
export function EmergencyPanel({
  mode,
  headingLevel = 2,
  onContinue,
  continueLabel = "Not an emergency · post to the community",
  compact = false,
  testId = "emergency-panel",
}: {
  mode: EmergencyPanelMode;
  headingLevel?: 1 | 2 | 3;
  onContinue?: () => void;
  continueLabel?: string;
  compact?: boolean;
  testId?: string;
}) {
  const headingId = useId();
  const [status, setStatus] = useState("");
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  const demo = mode === "demo";

  const rows: { key: keyof typeof EMERGENCY_CONTACTS; icon: React.ReactNode; detail: React.ReactNode; primary?: boolean }[] = [
    {
      key: "emergency",
      icon: <Phone aria-hidden="true" className="h-5 w-5" />,
      detail: "Fire, medical emergency or a crime in progress",
      primary: true,
    },
    {
      key: "police",
      icon: <Phone aria-hidden="true" className="h-5 w-5" />,
      detail: "470-578-6666 · answered 24/7",
    },
    {
      key: "policeText",
      icon: <MessageSquareText aria-hidden="true" className="h-5 w-5" />,
      detail:
        "770-356-3866 · for people who are deaf, hard of hearing or have a speech disability, or when a voice call is dangerous or impossible",
    },
  ];

  const rowClass = (primary?: boolean) =>
    `flex min-h-[var(--target)] w-full items-center gap-[var(--sp-3)] rounded-[var(--r-md)] border-2 px-[var(--sp-4)] py-[var(--sp-3)] text-left ${
      primary
        ? "border-[var(--bad-fg)] bg-[var(--bad-bg)] text-[var(--bad-fg)]"
        : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]"
    }`;

  return (
    <section
      data-emergency-panel=""
      data-testid={testId}
      data-mode={mode}
      aria-labelledby={headingId}
      className={`rounded-[var(--r-lg)] border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] ${compact ? "p-[var(--sp-4)]" : "p-[var(--sp-5)]"}`}
    >
      <Heading id={headingId} className="font-display text-[length:var(--fs-xl)] font-bold leading-tight">
        Is anyone in danger right now?
      </Heading>
      <p className="mt-[var(--sp-1)] text-[length:var(--fs-body)]">
        OwlSide can’t send help and doesn’t contact police.
      </p>
      {demo && (
        <p className="mt-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--warn-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--warn-fg)]">
          Demo · not real. These buttons dial and text nothing.
        </p>
      )}

      <ul className="mt-[var(--sp-4)] space-y-[var(--sp-2)]">
        {rows.map((row) => {
          const contact = EMERGENCY_CONTACTS[row.key];
          const content = (
            <>
              {row.icon}
              <span className="min-w-0">
                <span className="block text-[length:var(--fs-lg)] font-bold">{contact.label}</span>
                <span className="block text-sm">{row.detail}</span>
              </span>
            </>
          );
          return (
            <li key={row.key}>
              {demo ? (
                <button
                  type="button"
                  data-testid={`emergency-${row.key}`}
                  onClick={() => setStatus(DEMO_HANDOFF_COPY)}
                  className={rowClass(row.primary)}
                >
                  {content}
                </button>
              ) : (
                <a
                  href={contact.href}
                  data-testid={`emergency-${row.key}`}
                  onClick={() => setStatus(HANDOFF_COPY)}
                  className={rowClass(row.primary)}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <p data-emergency-status="" role="status" className="mt-[var(--sp-2)] min-h-[1.5em] text-sm font-bold">
        {status}
      </p>
      <p className="text-sm text-[var(--muted)]">
        Calls and texts open your phone app. OwlSide can’t confirm the call or a police response.
      </p>

      <p className="mt-[var(--sp-3)] text-sm">
        Want to report to KSU without OwlSide?{" "}
        <a
          href={LIVESAFE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-1)] font-bold underline"
        >
          KSU LiveSafe (outside OwlSide)
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">, opens in a new tab</span>
        </a>
      </p>

      {onContinue && (
        <button
          type="button"
          data-testid="emergency-continue"
          onClick={onContinue}
          className="mt-[var(--sp-3)] min-h-[var(--target)] w-full rounded-[var(--r-md)] border border-[var(--line-strong)] px-[var(--sp-4)] text-[length:var(--fs-body)] font-bold hover:bg-[var(--surface-2)]"
        >
          {continueLabel}
        </button>
      )}
    </section>
  );
}
