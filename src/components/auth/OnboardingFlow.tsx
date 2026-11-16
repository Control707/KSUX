"use client";

import React, { useState } from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation } from "@/lib/viewerClient";
import { Id } from "@convex/_generated/dataModel";

export function OnboardingFlow() {
  const { uploadImage } = useViewerClient();
  const completeOnboarding = useViewerMutation(api.students.completeOnboarding);

  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [homeCampus, setHomeCampus] = useState<"Kennesaw" | "Marietta">(
    "Kennesaw"
  );
  const [major, setMajor] = useState("");
  const [classYear, setClassYear] = useState("2027");
  const [avatarAssetId, setAvatarAssetId] = useState<Id<"mediaAssets"> | null>(
    null
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        avatarAssetId:
          skipOptional || !avatarAssetId ? undefined : avatarAssetId,
      });
    } catch (err: any) {
      setError(
        err?.data?.message || err?.message || "Could not complete onboarding."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="student-onboarding-flow"
      className="rounded-3xl border border-[#E4E7EE] bg-white p-6 shadow-md"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-[11px] font-extrabold text-[#855A00]">
            Step {step} of 2 · &lt;30s Setup
          </span>
          <h1 className="mt-1.5 text-xl font-black text-[#111317]">
            {step === 1
              ? "Claim your KSUX @handle & Campus"
              : "Optional Profile & Avatar"}
          </h1>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#111317] text-lg font-black text-[#FDBB30]">
          {(displayName.trim()[0] || "🦉").toUpperCase()}
        </span>
      </div>

      {step === 1 ? (
        <div className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-[#111317]">
              Display Name *
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Maya Patel"
              className="mt-1 w-full rounded-xl border border-[#E4E7EE] px-3.5 py-2.5 text-sm font-medium focus:border-[#111317] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111317]">
              Unique @handle * (3–20 lowercase letters, numbers, or _)
            </label>
            <div className="mt-1 flex items-center rounded-xl border border-[#E4E7EE] px-3.5 py-2.5">
              <span className="font-bold text-[#5E6675]">@</span>
              <input
                type="text"
                required
                value={handle}
                onChange={(e) =>
                  setHandle(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                  )
                }
                placeholder="owl_commuter"
                maxLength={20}
                className="ml-1 w-full text-sm font-bold text-[#111317] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#111317]">
              Home Campus *
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["Kennesaw", "Marietta"] as const).map((camp) => (
                <button
                  key={camp}
                  type="button"
                  onClick={() => setHomeCampus(camp)}
                  className={`rounded-xl border py-2.5 text-xs font-extrabold transition ${
                    homeCampus === camp
                      ? "border-[#111317] bg-[#111317] text-[#FDBB30]"
                      : "border-[#E4E7EE] text-[#5E6675]"
                  }`}
                >
                  {camp} Campus
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={submitting || displayName.trim().length < 2 || handle.length < 3}
              onClick={() => void finishOnboarding(true)}
              className="rounded-xl border border-[#E4E7EE] px-3.5 py-2.5 text-xs font-bold text-[#5E6675] disabled:opacity-50"
            >
              Finish Now
            </button>
            <button
              type="button"
              disabled={displayName.trim().length < 2 || handle.length < 3}
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className="flex-1 rounded-xl bg-[#FDBB30] py-2.5 text-xs font-extrabold text-[#111317] disabled:opacity-50"
            >
              Next: Major &amp; Avatar →
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          <div className="flex items-center gap-3">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="h-14 w-14 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111317] text-lg font-black text-[#FDBB30]">
                {(displayName.trim()[0] || "K").toUpperCase()}
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-3 py-2 text-xs font-bold text-[#111317]">
              <Camera className="h-3.5 w-3.5" />
              <span>
                {uploadingAvatar
                  ? "Encoding EXIF-stripped WebP..."
                  : "Upload WebP Avatar"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-[#111317]">
                Major (Optional)
              </label>
              <input
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                placeholder="Computer Science"
                className="mt-1 w-full rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#111317]">
                Class Year (Optional)
              </label>
              <select
                value={classYear}
                onChange={(e) => setClassYear(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs"
              >
                {["2026", "2027", "2028", "2029", "2030", "Graduate"].map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-[#E4E7EE] px-3.5 py-2.5 text-xs font-bold text-[#5E6675]"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void finishOnboarding(true)}
              className="rounded-xl border border-[#E4E7EE] px-3.5 py-2.5 text-xs font-bold text-[#5E6675]"
            >
              Skip Step 2
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void finishOnboarding(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#111317] py-2.5 text-xs font-extrabold text-[#FDBB30]"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitting ? "Saving..." : "Enter KSUX"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
