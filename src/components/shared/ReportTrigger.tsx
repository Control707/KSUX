"use client";

import React, { useId, useState } from "react";
import { Flag, ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";

export type ReportReason =
  | "harassment"
  | "scam_spam"
  | "prohibited_item"
  | "impersonation"
  | "campus_safety";

export interface ReportTriggerProps {
  targetType: "post" | "listing" | "study_session" | "student" | "chat_message";
  targetId: string;
  targetLabel?: string;
  onSubmitReport?: (params: {
    targetType:
      | "post"
      | "listing"
      | "study_session"
      | "student"
      | "chat_message";
    targetId: string;
    reason: ReportReason;
    notes?: string;
  }) => Promise<void>;
}

const REPORT_REASONS: Array<{
  value: ReportReason;
  label: string;
  helper: string;
}> = [
  {
    value: "harassment",
    label: "Harassment",
    helper: "Targeted bullying, hate speech, or personal threats",
  },
  {
    value: "scam_spam",
    label: "Scam / Spam",
    helper: "Phishing link, deposit scam, or repetitive spam",
  },
  {
    value: "prohibited_item",
    label: "Prohibited Item",
    helper: "Weapons, alcohol/vapes, academic dishonesty, or parking permits",
  },
  {
    value: "impersonation",
    label: "Impersonation",
    helper: "Pretending to be another Student, faculty member, or KSU office",
  },
  {
    value: "campus_safety",
    label: "Campus Safety",
    helper: "A physical safety concern on Kennesaw or Marietta Campus",
  },
];

export const REPORT_MENU_LABEL = "Report to KSUX moderators";
export const REPORT_SENT_MESSAGE = "Sent to KSUX moderators";

/**
 * "Report to KSUX moderators" trigger and form dialog (SPEC-v2 §2). The props
 * API is shared by every screen that lets a Student report content.
 */
export function ReportTrigger({
  targetType,
  targetId,
  targetLabel,
  onSubmitReport,
}: ReportTriggerProps) {
  const { toast } = useAnnouncer();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("scam_spam");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = targetLabel ?? targetType.replace("_", " ");

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (onSubmitReport) {
        await onSubmitReport({
          targetType,
          targetId,
          reason,
          notes: notes.trim() || undefined,
        });
      }
      setSubmitted(true);
      // Screens often hide the reported item at once, which unmounts this
      // dialog, so the toast carries the emergency reminder for Campus Safety.
      toast({
        tone: "success",
        message: REPORT_SENT_MESSAGE,
        detail:
          reason === "campus_safety"
            ? "Emergency? Call 911 or KSU Public Safety at 470-578-6666."
            : "Hidden from your view while moderators review it.",
        durationMs: reason === "campus_safety" ? 15000 : undefined,
        testId: "report-sent-toast",
      });
      // Campus Safety keeps the dialog open so the emergency contacts stay visible.
      if (reason !== "campus_safety") setOpen(false);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const secondaryButton =
    "min-h-[var(--target)] rounded-[var(--r-sm)] border border-[var(--line-strong)] px-[var(--sp-4)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]";

  return (
    <>
      <button
        type="button"
        data-testid="report-trigger-btn"
        onClick={() => {
          setOpen(true);
          setSubmitted(false);
          setError(null);
        }}
        className="inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-sm)] px-[var(--sp-2)] text-sm font-semibold text-[var(--muted)] hover:bg-[var(--bad-bg)] hover:text-[var(--bad-fg)]"
      >
        <Flag aria-hidden="true" className="h-4 w-4" />
        <span>Report</span>
        <span className="sr-only"> to KSUX moderators</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={REPORT_MENU_LABEL}
        description={`Reporting ${subject}. KSUX is a Student-run community app; moderators are Students and staff volunteers, not KSU police.`}
        testId="report-dialog"
      >
        {submitted ? (
          <div className="space-y-[var(--sp-3)]">
            <p
              role="status"
              className="rounded-[var(--r-sm)] border border-[var(--ok-fg)] bg-[var(--ok-bg)] p-[var(--sp-3)] text-sm font-semibold text-[var(--ok-fg)]"
            >
              <span aria-hidden="true">✓ </span>
              {REPORT_SENT_MESSAGE}. It is hidden from your view while they review it.
            </p>
            {reason === "campus_safety" && <KsuPoliceEmergencyCallout />}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-[var(--target)] w-full rounded-[var(--r-sm)] bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="space-y-[var(--sp-3)]">
            <fieldset className="min-w-0 space-y-[var(--sp-2)]">
              <legend className="mb-[var(--sp-2)] text-sm font-bold">Why are you reporting this?</legend>
              {REPORT_REASONS.map((opt) => {
                const helperId = `${formId}-${opt.value}-help`;
                return (
                  <label
                    key={opt.value}
                    className={`flex min-h-[var(--target)] cursor-pointer items-start gap-[var(--sp-3)] rounded-[var(--r-sm)] border p-[var(--sp-3)] ${
                      reason === opt.value
                        ? "border-[var(--ink)] bg-[var(--accent-soft)]"
                        : "border-[var(--line)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${formId}-reason`}
                      value={opt.value}
                      checked={reason === opt.value}
                      onChange={() => setReason(opt.value)}
                      aria-describedby={helperId}
                      className="mt-[0.15rem] h-5 w-5 shrink-0 accent-[var(--ink)]"
                      data-target-exempt=""
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-sm font-bold">{opt.label}</span>
                      <span id={helperId} className="block text-sm text-[var(--muted)]">
                        {opt.helper}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {reason === "campus_safety" && <KsuPoliceEmergencyCallout />}

            <div>
              <label htmlFor={`${formId}-notes`} className="block text-sm font-bold">
                Notes for moderators (optional)
              </label>
              <textarea
                id={`${formId}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={300}
                className="mt-[var(--sp-1)] w-full rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] py-[var(--sp-2)] text-body text-[var(--ink)]"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--bad-bg)] p-[var(--sp-2)] text-sm font-semibold text-[var(--bad-fg)]">
                <span aria-hidden="true">⚠ </span>
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-[var(--sp-2)] pt-[var(--sp-1)]">
              <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="report-submit-btn"
                className="min-h-[var(--target)] rounded-[var(--r-sm)] bg-[var(--bad-fg)] px-[var(--sp-4)] text-sm font-bold text-[var(--bad-bg)] disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function KsuPoliceEmergencyCallout() {
  return (
    <div
      data-testid="ksu-police-callout"
      className="rounded-[var(--r-sm)] border-2 border-[var(--bad-fg)] bg-[var(--bad-bg)] p-[var(--sp-3)] text-[var(--bad-fg)]"
    >
      <p className="flex items-start gap-[var(--sp-2)] text-sm font-bold">
        <ShieldAlert aria-hidden="true" className="mt-[0.1rem] h-4 w-4 shrink-0" />
        <span>Emergency? KSUX reports do not reach police or EMS.</span>
      </p>
      <p className="mt-[var(--sp-1)] text-sm leading-snug [overflow-wrap:anywhere]">
        Call <strong>911</strong>, or contact the KSU Department of Public Safety at{" "}
        <a href="tel:4705786666" className="inline font-bold underline">
          470-578-6666
        </a>
        .
      </p>
    </div>
  );
}
