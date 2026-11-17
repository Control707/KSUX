"use client";

import React, { useState } from "react";
import { Mail, ShieldCheck, X } from "lucide-react";
import { useViewerClient } from "@/lib/viewerClient";

export function EduOtpModal() {
  const { setOpenSignInModal, establishStudentSession } = useViewerClient();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!response.ok || !res?.ok) throw new Error(res?.error ?? "Could not send verification code.");
      if (res.devCodePreview) {
        setDevPreviewCode(String(res.devCodePreview));
      } else {
        setDevPreviewCode(null);
      }
      setStep("code");
    } catch (err: any) {
      setError(
        err?.data?.message ||
          err?.message ||
          "Could not send verification code."
      );
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
      setError(
        err?.data?.message || err?.message || "Verification failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="edu-otp-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#2B3242] bg-[#181C25] p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FDBB30] text-lg font-black text-[#111317]">
              🦉
            </span>
            <div>
              <h2 className="text-base font-black text-white">
                Verify KSU .edu Email
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Safe-Links-proof 6-digit numeric OTP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenSignInModal(false)}
            className="rounded-lg p-1 text-[#9CA3AF] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "email" ? (
          <form onSubmit={handleRequestOtp} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#D1D5DB]">
                KSU Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owl@students.kennesaw.edu"
                className="mt-1 w-full rounded-xl border border-[#374151] bg-[#0F1218] px-3.5 py-2.5 text-sm text-white placeholder-[#6B7280] focus:border-[#FDBB30] focus:outline-none"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#9CA3AF]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#FDBB30]" />
                <span>
                  Your raw email &amp; NetID are never shown publicly.
                </span>
              </p>
            </div>

            {error && (
              <p className="rounded-xl bg-[#B91C1C]/20 px-3 py-2 text-xs font-semibold text-[#FCA5A5]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FDBB30] py-2.5 text-sm font-extrabold text-[#111317] hover:bg-[#e7a820] disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              <span>{loading ? "Sending Code..." : "Send 6-Digit Code"}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-4 space-y-3">
            <p className="text-xs text-[#D1D5DB]">
              Enter the 6-digit code sent to{" "}
              <span className="font-bold text-[#FDBB30]">{email}</span> (valid
              for 10 minutes).
            </p>

            {devPreviewCode && (
              <div className="rounded-xl border border-[#FDBB30]/40 bg-[#FDBB30]/15 px-3 py-2 text-xs text-[#FDE68A]">
                Local Dev OTP Preview:{" "}
                <strong className="font-mono text-sm">{devPreviewCode}</strong>
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full rounded-xl border border-[#374151] bg-[#0F1218] px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.4em] text-[#FDBB30] focus:border-[#FDBB30] focus:outline-none"
            />

            {error && (
              <p className="rounded-xl bg-[#B91C1C]/20 px-3 py-2 text-xs font-semibold text-[#FCA5A5]">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                className="rounded-xl border border-[#374151] px-3.5 py-2.5 text-xs font-bold text-[#9CA3AF]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="flex-1 rounded-xl bg-[#FDBB30] py-2.5 text-sm font-extrabold text-[#111317] disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
