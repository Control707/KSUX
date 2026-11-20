"use client";

import React, { useState } from "react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { errorMessage, ui } from "@/components/communities/campusLifeUi";

const span = (ms: number) => ms >= 24 * 3_600_000 ? `${Math.round(ms / 86_400_000)} days` : `${Math.round(ms / 360_000) / 10} hours`;

const when = (ms: number | null) => ms === null ? "never" : new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short",
}).format(ms);

/** Maintainer-only: the Official Alert copy's shadow poll, kill switch and push budget (ADR-0007, #80). */
export function AlertSourceOps() {
  const ops = useViewerQuery(api.officialAlerts.getAlertOps, {});
  const kill = useViewerMutation(api.officialAlerts.setAlertKillSwitch);
  const signOff = useViewerMutation(api.officialAlerts.signOffAlertShadow);
  const restart = useViewerMutation(api.officialAlerts.restartAlertShadow);
  const { announce } = useAnnouncer();
  const [error, setError] = useState("");
  if (!ops) return null;
  const act = async (label: string, work: () => Promise<unknown>) => {
    setError("");
    try { await work(); announce(label); } catch (problem) { setError(errorMessage(problem, "Could not update the Alert source.")); }
  };
  return (
    <section className={`${ui.card} space-y-[var(--sp-3)]`} aria-labelledby="alert-source-ops">
      <h2 id="alert-source-ops" className={ui.h2}>Official Alert copy</h2>
      <p>
        Mode <strong>{ops.mode}</strong> (OWLSIDE_ALERT_COPY_MODE). Push switch {ops.pushRequested ? "on" : "off"} (OWLSIDE_ALERT_PUSH).
        {" "}{ops.sentToday} of {ops.dailyCap} Alert pushes sent today.
      </p>
      <p data-testid="alert-shadow-window">
        Required shadow window: {span(ops.shadowWindowMs)}
        {ops.shadowWindowMs < ops.fullShadowMs ? ` (shortened from ${span(ops.fullShadowMs)} by OWLSIDE_ALERT_SHADOW_HOURS; record this deviation from SPEC-v2 §13).` : "."}
      </p>
      {ops.sources.length === 0 && <p>No source rows yet. Run the seed, then set the mode to shadow.</p>}
      {ops.sources.map((s) => (
        <div key={s.sourceKey} className={`${ui.subCard} space-y-[var(--sp-2)]`}>
          <h3 className={ui.h3}>{s.sourceName}</h3>
          <p>
            Last result {s.lastResult}{s.stale ? " (stale)" : ""}. Last success {when(s.lastSuccessAt)}; last attempt {when(s.lastAttemptAt)}.
            {s.backoffUntil ? ` Backing off until ${when(s.backoffUntil)}.` : ""}{s.lastError ? ` Last error: ${s.lastError}.` : ""}
          </p>
          <p>
            Kill switch <strong>{s.killSwitch}</strong>{s.killReason ? ` (${s.killReason})` : ""}.
          </p>
          <p>
            Shadow poll from {when(s.shadowStartedAt)}: {s.shadowChangeCount} page changes, {s.shadowUnrecognizedCount} unrecognized.
            {s.gatePassed ? ` Signed off ${when(s.shadowSignedOffAt)} after a ${span(s.signedOffWindowMs ?? ops.fullShadowMs)} window.` : s.readyForSignOff ? " Ready for sign-off." : " Not ready for sign-off."}
          </p>
          <div className={ui.row}>
            <button type="button" className={s.killSwitch === "off" ? ui.danger : ui.secondary}
              onClick={() => act(s.killSwitch === "off" ? "Copy switched off" : "Copy switched on",
                () => kill({ sourceKey: s.sourceKey, on: s.killSwitch === "off" }))}>
              {s.killSwitch === "off" ? "Switch copy off" : "Switch copy back on"}
            </button>
            {s.readyForSignOff && !s.gatePassed && (
              <button type="button" className={ui.primary} onClick={() => act("Shadow poll signed off", () => signOff({ sourceKey: s.sourceKey }))}>
                Sign off the shadow poll
              </button>
            )}
            <button type="button" className={ui.secondary} onClick={() => act("Shadow poll restarted", () => restart({ sourceKey: s.sourceKey }))}>
              Restart shadow poll
            </button>
          </div>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
