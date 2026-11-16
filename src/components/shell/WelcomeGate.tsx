"use client";

import React, { useState } from "react";
import { Mail, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useViewerClient } from "@/lib/viewerClient";

export function WelcomeGate({
  onRequestEmailSignIn,
}: {
  onRequestEmailSignIn?: () => void;
}) {
  const { enterJudgeDemo, setOpenSignInModal } = useViewerClient();
  const [launchingDemo, setLaunchingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunchDemo = async () => {
    setLaunchingDemo(true);
    setError(null);
    try {
      await enterJudgeDemo({ persona: "maya_cs" });
    } catch (err: any) {
      setError(err?.message || "Failed to initialize Judge Demo Mode.");
      setLaunchingDemo(false);
    }
  };

  return (
    <div
      data-testid="dual-path-welcome"
      className="flex min-h-screen flex-col items-center justify-center bg-[#111317] px-4 py-10 text-white"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#2B3242] bg-[#181C25] p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDBB30] text-2xl font-black text-[#111317]">
            🦉
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">
                KSUX
              </h1>
              <span className="rounded-full border border-[#FDBB30]/40 bg-[#FDBB30]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#FDBB30]">
                Kennesaw + Marietta
              </span>
            </div>
            <p className="text-xs text-[#9CA3AF]">
              Kennesaw State Campus Social Network &amp; Daily-Life Companion
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-[#D1D5DB]">
          One home for KSU <strong>Students</strong> across{" "}
          <strong>Kennesaw</strong> and <strong>Marietta</strong>{" "}
          <strong>Campuses</strong>: live <strong>Parking Reports</strong>, Big
          Owl Bus <strong>Shuttle Routes</strong>, Sturgis &amp; Johnson{" "}
          <strong>Study Rooms</strong>, <strong>Course Hubs</strong>,{" "}
          <strong>Clubs</strong>, <strong>Marketplace</strong>{" "}
          <strong>Deal Chats</strong>, and chat-isolated{" "}
          <strong>Scrappy</strong> AI.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            data-testid="welcome-edu-signin-btn"
            onClick={() => {
              if (onRequestEmailSignIn) {
                onRequestEmailSignIn();
              } else {
                setOpenSignInModal(true);
              }
            }}
            className="flex w-full items-center justify-between rounded-2xl bg-[#FDBB30] px-4 py-3.5 text-left font-extrabold text-[#111317] transition hover:bg-[#e8a81c]"
          >
            <span className="flex items-center gap-2.5 text-sm">
              <Mail className="h-4 w-4" />
              <span>Sign in with KSU .edu Email</span>
            </span>
            <span className="rounded-full bg-[#111317]/10 px-2.5 py-0.5 text-[11px] font-bold">
              6-digit OTP
            </span>
          </button>

          <button
            type="button"
            data-testid="welcome-enter-demo-btn"
            disabled={launchingDemo}
            onClick={handleLaunchDemo}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-[#FDBB30] bg-[#FDBB30]/12 px-4 py-3.5 text-left font-extrabold text-[#FDBB30] transition hover:bg-[#FDBB30]/20 disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5 text-sm">
              <Zap className="h-4 w-4" />
              <span>
                {launchingDemo
                  ? "Provisioning Isolated Demo Workspace..."
                  : "⚡ Enter Judge Demo Mode"}
              </span>
            </span>
            <span className="rounded-full border border-[#FDBB30]/40 px-2.5 py-0.5 text-[11px] font-bold">
              0-click · Isolated
            </span>
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-[#B91C1C]/20 px-3 py-2 text-xs font-semibold text-[#FCA5A5]">
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5 border-t border-[#2B3242] pt-4 text-[11.5px] text-[#9CA3AF]">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FDBB30]" />
            <span>
              Verified <code className="text-white">@students.kennesaw.edu</code>{" "}
              &amp; <code className="text-white">@kennesaw.edu</code> privacy
              wall
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#60A5FA]" />
            <span>
              3-persona Judge Demo Mode with live 2-tab WebSocket co-testing
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
