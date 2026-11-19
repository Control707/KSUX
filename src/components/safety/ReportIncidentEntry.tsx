"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/a11y/Dialog";
import { EmergencyPanel, type EmergencyPanelMode } from "./EmergencyPanel";
import { OFFLINE_REPORT } from "./safetyContent";
import { IncidentForm } from "./IncidentForm";
import { useAnnouncer } from "@/components/a11y/Announcer";

type Step = "panel" | "offline" | "unavailable" | "form" | "connecting";

/**
 * "Report something you saw" (SPEC-v2 §5). Every start opens the Emergency
 * Panel first. Gated and offline starts cannot enter the form. The form's
 * draft lives only in this mounted tab and is discarded on close.
 */
export function ReportIncidentEntry({
  mode,
  online,
  postingEnabled,
  autoOpen = false,
  scopeKey = "",
  signedOut = false,
}: {
  mode: EmergencyPanelMode;
  online: boolean;
  postingEnabled: boolean | undefined;
  autoOpen?: boolean;
  scopeKey?: string;
  signedOut?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("panel");
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);
  const dirty = useRef(false);
  const busy = useRef(false);
  const previousScope = useRef(scopeKey);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { announce } = useAnnouncer();
  const onStep = useCallback((value: boolean) => { dirty.current = value; }, []);
  const onPosted = useCallback(() => { dirty.current = false; }, []);
  const onBusy = useCallback((value: boolean) => { busy.current = value; }, []);
  const close = () => {
    if (busy.current) { announce("Posting. Please wait for the result before closing."); return; }
    if (dirty.current && !online) { setConfirmDiscard(true); return; }
    const wasDraft = dirty.current || step !== "form";
    setOpen(false); dirty.current = false;
    if (wasDraft) announce("Report discarded. Nothing was posted.");
  };
  useEffect(() => {
    if (previousScope.current !== scopeKey) {
      previousScope.current = scopeKey;
      if (step === "form") { setStep("panel"); dirty.current = false; }
    }
  }, [scopeKey, step]);
  useEffect(() => {
    if (step === "connecting") {
      if (!online) setStep("offline");
      else if (signedOut) setStep("unavailable");
      else if (postingEnabled !== undefined) setStep(postingEnabled ? "form" : "unavailable");
    }
  }, [step, online, postingEnabled, signedOut]);

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
    dirty.current = false;
    setStep("panel");
    setOpen(true);
  };
  const next = () => {
    if (!online || (typeof navigator !== "undefined" && !navigator.onLine)) setStep("offline");
    else if (signedOut) setStep("unavailable");
    else setStep(postingEnabled === undefined ? "connecting" : postingEnabled ? "form" : "unavailable");
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
        onClose={close}
        title="Report an incident"
        hideTitle
        testId="report-incident-dialog"
        className="!h-[100dvh] !max-h-[100dvh] !w-screen !shrink-0 !max-w-3xl !rounded-none !p-[min(4vw,var(--sp-5))]"
      >
        {step === "connecting" && <p role="status">Connecting to check posting availability. Nothing has been sent or saved.</p>}
        {step === "form" && <IncidentForm key={scopeKey} mode={mode} online={online} onStep={onStep} onPosted={onPosted} onBusy={onBusy} onBackPanel={() => { setStep("panel"); dirty.current = false; }} />}
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
                ? "Demo is connecting. Nothing has been sent or saved. Close and try again."
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
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard this report?" role="alertdialog">
        <p>The report will be discarded. Nothing has been posted.</p>
        <button type="button" className={button} onClick={() => setConfirmDiscard(false)}>Keep writing</button>
        <button type="button" className={button} onClick={() => { setConfirmDiscard(false); setOpen(false); dirty.current = false; announce("Report discarded. Nothing was posted."); }}>Discard report</button>
      </Dialog>
    </section>
  );
}
