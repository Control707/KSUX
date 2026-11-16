"use client";

import React, { useState } from "react";
import { Flag, PhoneCall, ShieldAlert, X } from "lucide-react";

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
    helper: "Urgent physical safety concern on Kennesaw or Marietta Campus",
  },
];

export function ReportTrigger({
  targetType,
  targetId,
  targetLabel,
  onSubmitReport,
}: ReportTriggerProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("scam_spam");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
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
    } catch (err: any) {
      setError(err?.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setSubmitted(false);
          setError(null);
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#5E6675] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
        title="Report content"
      >
        <Flag className="h-3 w-3" />
        <span>Report</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#111317]">
                Report {targetLabel ?? targetType.replace("_", " ")}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-[#DCFCE7] p-3 text-xs font-semibold text-[#15803D]">
                  Report received. This item has been immediately hidden from
                  your view and queued for review.
                </div>
                {reason === "campus_safety" && <KsuPoliceEmergencyCallout />}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl bg-[#111317] py-2.5 text-xs font-bold text-[#FDBB30]"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                        reason === opt.value
                          ? "border-[#111317] bg-[#FFF6DC]/60"
                          : "border-[#E4E7EE] hover:bg-[#F4F6FA]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        checked={reason === opt.value}
                        onChange={() => setReason(opt.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-xs font-bold text-[#111317]">
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-[#5E6675]">
                          {opt.helper}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {reason === "campus_safety" && <KsuPoliceEmergencyCallout />}

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="Optional context for moderators..."
                  className="w-full rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs text-[#111317] focus:border-[#111317] focus:outline-none"
                />

                {error && (
                  <p className="text-xs font-semibold text-[#B91C1C]">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[#E4E7EE] px-3.5 py-2 text-xs font-bold text-[#5E6675]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirm}
                    className="rounded-xl bg-[#B91C1C] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Submit & Hide Item"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function KsuPoliceEmergencyCallout() {
  return (
    <div
      data-testid="ksu-police-callout"
      className="rounded-xl border-2 border-[#B91C1C] bg-[#FEE2E2] p-3 text-[#7F1D1D]"
    >
      <div className="flex items-center gap-1.5 text-xs font-extrabold">
        <ShieldAlert className="h-4 w-4 shrink-0 text-[#B91C1C]" />
        <span>Emergency? KSUX reports do NOT dispatch police or EMS.</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug">
        Contact <strong>KSU Department of Public Safety</strong> immediately at{" "}
        <a
          href="tel:470-578-6666"
          className="inline-flex items-center gap-0.5 font-extrabold underline"
        >
          <PhoneCall className="h-3 w-3" />
          470-578-6666
        </a>
        , dial <strong>911</strong>, or use the official <strong>LiveSafe</strong>{" "}
        campus app.
      </p>
    </div>
  );
}
