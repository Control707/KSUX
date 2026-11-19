"use client";

import React, { useId, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Dialog } from "@/components/a11y/Dialog";
import { useViewerClient } from "@/lib/viewerClient";

const CODE_LENGTH = 6;

/** Keep only digits and cap at six, so pasting "123 456" or "Code: 123456" works. */
export function normaliseOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * KSU .edu email sign-in (SPEC-v2 §2): a `Dialog` with a labelled email field,
 * then a labelled one-time-code field. Errors use role=alert; "code sent" is
 * a role=status message.
 */
export function EduOtpModal() {
  const { setOpenSignInModal, establishStudentSession } = useViewerClient();
  const ids = useId();
  const emailId = `${ids}-email`;
  const emailHelpId = `${ids}-email-help`;
  const codeId = `${ids}-code`;
  const codeHelpId = `${ids}-code-help`;
  const errorId = `${ids}-error`;

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => setOpenSignInModal(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ operation: "request", email }),
      });
      const res = await response.json().catch(() => null);
      if (!response.ok || !res?.ok) throw new Error(res?.error ?? res?.message ?? "Could not send a verification code.");
      setDevPreviewCode(res.devCodePreview ? String(res.devCodePreview) : null);
      setCode("");
      setStep("code");
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not send a verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await establishStudentSession(email, code);
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    "mt-[var(--sp-1)] min-h-[var(--target)] w-full rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]";
  const primaryButton =
    "flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--accent)] px-[var(--sp-4)] text-body font-bold text-[var(--on-accent)] disabled:opacity-60";

  const errorBox = error && (
    <p
      id={errorId}
      role="alert"
      data-testid="edu-otp-error"
      className="rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-semibold text-[var(--bad-fg)] [overflow-wrap:anywhere]"
    >
      <span aria-hidden="true">⚠ </span>
      {error}
    </p>
  );

  return (
    <Dialog
      open
      onClose={close}
      title="Sign in with your KSU .edu email"
      description="We email you a 6-digit code. There is no link to click."
      closeLabel="Close sign-in"
      testId="edu-otp-modal"
    >
      {step === "email" ? (
        <form onSubmit={handleRequestOtp} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={emailId} className="block text-sm font-bold">
              KSU email address
            </label>
            <input
              id={emailId}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owl@students.kennesaw.edu"
              aria-describedby={error ? `${emailHelpId} ${errorId}` : emailHelpId}
              aria-invalid={error ? true : undefined}
              data-testid="edu-otp-email-input"
              className={fieldClass}
            />
            <p id={emailHelpId} className="mt-[var(--sp-1)] flex items-start gap-[var(--sp-1)] text-sm text-[var(--muted)]">
              <ShieldCheck aria-hidden="true" className="mt-[0.1rem] h-4 w-4 shrink-0" />
              <span>Use @students.kennesaw.edu or @kennesaw.edu. Your email and NetID are never shown publicly.</span>
            </p>
          </div>

          {errorBox}

          <button type="submit" disabled={loading} data-testid="edu-otp-send-btn" className={`${primaryButton} w-full`}>
            <Mail aria-hidden="true" className="h-5 w-5" />
            <span>{loading ? "Sending code…" : "Send 6-digit code"}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-[var(--sp-3)]">
          <p role="status" data-testid="edu-otp-sent-status" className="text-sm [overflow-wrap:anywhere]">
            <span aria-hidden="true">✓ </span>
            Code sent to <strong>{email}</strong>. It works for 10 minutes.
          </p>

          {devPreviewCode && (
            <p className="rounded-[var(--r-sm)] border border-[var(--warn-fg)] bg-[var(--warn-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm text-[var(--warn-fg)]">
              Local dev code preview: <strong className="font-mono text-body">{devPreviewCode}</strong>
            </p>
          )}

          <div>
            <label htmlFor={codeId} className="block text-sm font-bold">
              6-digit code
            </label>
            <input
              id={codeId}
              type="text"
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(e) => setCode(normaliseOtpInput(e.target.value))}
              onPaste={(e) => {
                const pasted = normaliseOtpInput(e.clipboardData.getData("text"));
                if (pasted) {
                  e.preventDefault();
                  setCode(pasted);
                }
              }}
              aria-describedby={error ? `${codeHelpId} ${errorId}` : codeHelpId}
              aria-invalid={error ? true : undefined}
              data-testid="edu-otp-code-input"
              className={`${fieldClass} text-center font-mono text-2xl font-bold tracking-[0.3em]`}
            />
            <p id={codeHelpId} className="mt-[var(--sp-1)] text-sm text-[var(--muted)]">
              Type or paste the six numbers from the email.
            </p>
          </div>

          {errorBox}

          <div className="flex flex-wrap gap-[var(--sp-2)]">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="min-h-[var(--target)] rounded-[var(--r-sm)] border border-[var(--line-strong)] px-[var(--sp-4)] text-body font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]"
            >
              Use a different email
            </button>
            <button
              type="submit"
              disabled={loading || code.length !== CODE_LENGTH}
              data-testid="edu-otp-verify-btn"
              className={`${primaryButton} flex-1`}
            >
              {loading ? "Checking…" : "Verify and sign in"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
