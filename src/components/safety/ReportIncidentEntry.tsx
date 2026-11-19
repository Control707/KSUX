"use client";

import React, { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/a11y/Dialog";
import { EmergencyPanel, type EmergencyPanelMode } from "./EmergencyPanel";
import { OFFLINE_REPORT } from "./safetyContent";

type Step = "panel" | "offline" | "unavailable";

/**
 * "Report something you saw" (SPEC-v2 §5). Every start opens the Emergency
 * Panel first. The text-only report flow itself lands with #79; until then,
 * and whenever posting is gated or offline, continuing explains that nothing
 * was sent or saved. Nothing here stores report text anywhere.
 */
export function ReportIncidentEntry({
  mode,
  online,
  postingEnabled,
  autoOpen = false,
}: {
  mode: EmergencyPanelMode;
  online: boolean;
  postingEnabled: boolean | undefined;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("panel");
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true;
      setStep("panel");
      setOpen(true);
    }
  }, [autoOpen]);

  useEffect(() => {
    if (open && step !== "panel") stepHeading.current?.focus();
  }, [open, step]);

  const start = () => {
    setStep("panel");
    setOpen(true);
  };
  const next = () => {
    if (!online || (typeof navigator !== "undefined" && !navigator.onLine)) setStep("offline");
    else setStep("unavailable");
  };

  const button =
    "min-h-[var(--target)] rounded-[var(--r-md)] border border-[var(--line-strong)] px-[var(--sp-4)] font-bold hover:bg-[var(--surface-2)]";

  return (
    <section
      aria-labelledby="report-something"
      data-testid="report-something"
      className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
    >
      <h2 id="report-something" tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold outline-none">
        Report something you saw
      </h2>
      <p>Post a community report for other Students. It doesn’t contact police or KSU.</p>
      {postingEnabled === false && mode !== "demo" && (
        <p role="status">Community Incident posting is unavailable.</p>
      )}
      <button type="button" onClick={start} data-testid="report-incident-btn" className={button}>
        Report an incident
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report an incident"
        hideTitle
        testId="report-incident-dialog"
        className="sm:max-w-xl"
      >
        {step === "panel" && (
          <EmergencyPanel mode={mode} headingLevel={2} compact onContinue={next} testId="report-emergency-panel" />
        )}
        {step === "offline" && (
          <div className="space-y-[var(--sp-3)]" data-testid="report-offline">
            <h2 ref={stepHeading} tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold outline-none">
              Can’t post offline
            </h2>
            <p role="status">{OFFLINE_REPORT}</p>
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              <button type="button" className={button} onClick={next}>
                Retry connection
              </button>
              <button type="button" className={button} onClick={() => setStep("panel")}>
                Back to emergency contacts
              </button>
              <button type="button" className={button} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
        {step === "unavailable" && (
          <div className="space-y-[var(--sp-3)]" data-testid="report-unavailable">
            <h2 ref={stepHeading} tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold outline-none">
              Community reports aren’t open yet
            </h2>
            <p role="status">
              {mode === "demo"
                ? "Demo · not real. The community report form arrives in a later update. Nothing has been sent or saved."
                : "KSUX can’t take community reports yet. Nothing has been sent or saved."}
            </p>
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              <button type="button" className={button} onClick={() => setStep("panel")}>
                Back to emergency contacts
              </button>
              <button type="button" className={button} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
