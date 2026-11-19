"use client";

import React, { useId, useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation } from "@/lib/viewerClient";
import { Id } from "@convex/_generated/dataModel";

const CLASS_YEARS = ["2026", "2027", "2028", "2029", "2030", "Graduate"];

/**
 * First-run setup for a verified .edu Student (SPEC-v2 Direction C): every
 * field is labelled, Home Campus is a radio group in a fieldset, and errors
 * are announced with role=alert.
 */
export function OnboardingFlow() {
  const { uploadImage } = useViewerClient();
  const completeOnboarding = useViewerMutation(api.students.completeOnboarding);
  const ids = useId();
  const field = (name: string) => `${ids}-${name}`;

  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [homeCampus, setHomeCampus] = useState<"Kennesaw" | "Marietta">("Kennesaw");
  const [major, setMajor] = useState("");
  const [classYear, setClassYear] = useState("2027");
  const [avatarAssetId, setAvatarAssetId] = useState<Id<"mediaAssets"> | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step1Ready = displayName.trim().length >= 2 && handle.length >= 3;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, "avatar");
      setAvatarAssetId(uploaded.mediaAssetId);
      setAvatarPreview(uploaded.url);
    } catch (err: any) {
      setError(err?.message || "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const finishOnboarding = async (skipOptional = false) => {
    setSubmitting(true);
    setError(null);
    try {
      await completeOnboarding({
        displayName,
        handle,
        homeCampus,
        major: skipOptional ? undefined : major || undefined,
        classYear: skipOptional ? undefined : classYear || undefined,
        avatarAssetId: skipOptional || !avatarAssetId ? undefined : avatarAssetId,
      });
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not complete onboarding.");
    } finally {
      setSubmitting(false);
    }
  };

  const labelClass = "block text-sm font-bold";
  const helpClass = "mt-[var(--sp-1)] block text-sm text-[var(--muted)]";
  const inputClass =
    "mt-[var(--sp-1)] min-h-[var(--target)] w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]";
  const secondaryButton =
    "min-h-[var(--target)] rounded-[var(--r-sm)] border border-[var(--line-strong)] px-[var(--sp-4)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-60";
  const primaryButton =
    "flex min-h-[var(--target)] flex-1 items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--accent)] px-[var(--sp-4)] text-sm font-bold text-[var(--on-accent)] disabled:opacity-60";

  const errorBox = error && (
    <p
      id={field("error")}
      role="alert"
      data-testid="onboarding-error"
      className="rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-semibold text-[var(--bad-fg)] [overflow-wrap:anywhere]"
    >
      <span aria-hidden="true">⚠ </span>
      {error}
    </p>
  );
  const describe = (...extra: string[]) => [...extra, error ? field("error") : ""].filter(Boolean).join(" ") || undefined;

  return (
    <section
      data-testid="student-onboarding-flow"
      aria-labelledby={field("title")}
      className="min-w-0 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-5)] text-[var(--ink)] shadow-[var(--shadow)]"
    >
      <div className="flex items-start justify-between gap-[var(--sp-3)]">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--accent-ink)]">Step {step} of 2</p>
          <h1
            id={field("title")}
            data-route-heading=""
            tabIndex={-1}
            className="mt-[var(--sp-1)] font-display text-2xl font-bold leading-tight [overflow-wrap:anywhere]"
          >
            {step === 1 ? "Choose your @handle and Home Campus" : "Optional profile and avatar"}
          </h1>
        </div>
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent)] text-lg font-bold text-[var(--on-accent)]"
        >
          {(displayName.trim()[0] || "🦉").toUpperCase()}
        </span>
      </div>

      {step === 1 ? (
        <form
          className="mt-[var(--sp-4)] space-y-[var(--sp-4)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!step1Ready) return;
            setError(null);
            setStep(2);
          }}
        >
          <div>
            <label htmlFor={field("name")} className={labelClass}>
              Display name (required)
            </label>
            <input
              id={field("name")}
              type="text"
              required
              autoComplete="name"
              minLength={2}
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-describedby={describe()}
              data-testid="onboarding-display-name-input"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={field("handle")} className={labelClass}>
              @handle (required)
            </label>
            <div className="mt-[var(--sp-1)] flex min-w-0 items-center gap-[var(--sp-1)]">
              <span aria-hidden="true" className="text-body font-bold text-[var(--muted)]">
                @
              </span>
              <input
                id={field("handle")}
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={20}
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                aria-describedby={describe(field("handle-help"))}
                data-testid="onboarding-handle-input"
                className={`${inputClass} mt-0`}
              />
            </div>
            <span id={field("handle-help")} className={helpClass}>
              3 to 20 lowercase letters, numbers or underscores.
            </span>
          </div>

          <fieldset className="min-w-0">
            <legend className={labelClass}>Home Campus (required)</legend>
            <div className="lt-grid-1 mt-[var(--sp-1)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
              {(["Kennesaw", "Marietta"] as const).map((camp) => (
                <label
                  key={camp}
                  className={`flex min-h-[var(--target)] cursor-pointer items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] border px-[var(--sp-3)] text-sm font-bold ${
                    homeCampus === camp
                      ? "border-[var(--ink)] bg-[var(--accent-soft)]"
                      : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={field("campus")}
                    value={camp}
                    checked={homeCampus === camp}
                    onChange={() => setHomeCampus(camp)}
                    data-target-exempt=""
                    className="h-5 w-5 shrink-0 accent-[var(--ink)]"
                  />
                  {camp} Campus
                </label>
              ))}
            </div>
          </fieldset>

          {errorBox}

          <div className="flex flex-wrap gap-[var(--sp-2)] pt-[var(--sp-1)]">
            <button
              type="button"
              disabled={submitting || !step1Ready}
              onClick={() => void finishOnboarding(true)}
              className={secondaryButton}
            >
              {submitting ? "Saving…" : "Finish now"}
            </button>
            <button type="submit" disabled={!step1Ready} className={primaryButton}>
              Next: major and avatar
            </button>
          </div>
        </form>
      ) : (
        <form
          className="mt-[var(--sp-4)] space-y-[var(--sp-4)]"
          onSubmit={(e) => {
            e.preventDefault();
            void finishOnboarding(false);
          }}
        >
          <div className="flex flex-wrap items-center gap-[var(--sp-3)]">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Your avatar preview" className="h-14 w-14 rounded-[var(--r-md)] object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent)] text-lg font-bold text-[var(--on-accent)]"
              >
                {(displayName.trim()[0] || "K").toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <label
                htmlFor={field("avatar")}
                className="inline-flex min-h-[var(--target)] cursor-pointer items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-[var(--sp-3)] text-sm font-bold focus-within:outline focus-within:outline-[length:var(--focus-w)] focus-within:outline-[var(--focus)]"
              >
                <Camera aria-hidden="true" className="h-4 w-4" />
                <span>{uploadingAvatar ? "Uploading avatar…" : "Upload avatar (optional)"}</span>
              </label>
              <input
                id={field("avatar")}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                aria-describedby={field("avatar-help")}
                className="sr-only"
              />
              <span id={field("avatar-help")} className={helpClass}>
                JPEG, PNG or WebP. Location data is removed.
              </span>
              <span role="status" className="sr-only">
                {uploadingAvatar ? "Uploading avatar" : avatarPreview ? "Avatar uploaded" : ""}
              </span>
            </div>
          </div>

          <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={field("major")} className={labelClass}>
                Major (optional)
              </label>
              <input
                id={field("major")}
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={field("year")} className={labelClass}>
                Class year (optional)
              </label>
              <select
                id={field("year")}
                value={classYear}
                onChange={(e) => setClassYear(e.target.value)}
                className={inputClass}
              >
                {CLASS_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorBox}

          <div className="flex flex-wrap gap-[var(--sp-2)] pt-[var(--sp-1)]">
            <button type="button" onClick={() => setStep(1)} className={secondaryButton}>
              Back
            </button>
            <button type="button" disabled={submitting} onClick={() => void finishOnboarding(true)} className={secondaryButton}>
              Skip this step
            </button>
            <button type="submit" disabled={submitting} className={primaryButton}>
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              <span>{submitting ? "Saving…" : "Enter KSUX"}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
