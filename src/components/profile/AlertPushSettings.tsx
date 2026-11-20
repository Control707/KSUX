"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { Dialog } from "@/components/a11y/Dialog";
import { errorMessage, ui } from "@/components/communities/campusLifeUi";
import { KSU_SOURCES } from "@/components/safety/safetyContent";
import { pushDeviceState, type PushDeviceState } from "@/lib/pushDevice";

const PHONE_COPY: Record<PushDeviceState, { symbol: string; word: string; text: string }> = {
  demo: { symbol: "■", word: "Demo", text: "Demo Mode: no push. OwlSide never asks for permission in Demo; in-app toasts still show." },
  unsupported: { symbol: "✕", word: "Unsupported", text: "This browser can’t get push. In-app toasts still work. Chrome, Edge and Firefox on a computer or Android, and the iPhone Home Screen app (iOS 16.4 or later), support push." },
  ios_tab: { symbol: "!", word: "Home Screen needed", text: "On iPhone, push only works from the Home Screen." },
  ios_old: { symbol: "✕", word: "Update needed", text: "Push needs iOS 16.4 or later. Update in Settings › General › Software Update." },
  not_configured: { symbol: "✕", word: "Not set up", text: "Push isn’t set up on this OwlSide server. In-app toasts still work." },
  blocked: { symbol: "✕", word: "Blocked", text: "Notifications are blocked for OwlSide." },
  not_asked: { symbol: "○", word: "Off", text: "Push is off on this phone." },
  on: { symbol: "✓", word: "On", text: "Push is on for this phone. Only what you switch on below is pushed." },
};

function vapidKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** "This phone" status plus the endpoint OwlSide knows it by. */
function usePushDevice(demo: boolean) {
  const [state, setState] = useState<PushDeviceState | null>(null);
  const [endpoint, setEndpoint] = useState<string | undefined>();
  const check = useCallback(async () => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const subscription = await currentSubscription().catch(() => null);
    setEndpoint(subscription?.endpoint);
    setState(pushDeviceState({
      userAgent: navigator.userAgent,
      standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
      hasServiceWorker: "serviceWorker" in navigator, hasPushManager: "PushManager" in window, hasNotification: "Notification" in window,
      permission: "Notification" in window ? Notification.permission : "unsupported",
      subscribed: Boolean(subscription), vapidConfigured: Boolean(vapidKey()), demo,
    }, /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
  }, [demo]);
  useEffect(() => { void check(); }, [check]);
  return { state, endpoint, check };
}

/**
 * /profile/notifications "This phone" and "Official Alerts" (SPEC-v2 §10,
 * ADR-0007). The Alert switch is per device, off by default, and turns on only
 * after a confirm alertdialog. It is never available in Judge Demo Mode.
 */
export function AlertPushSettings() {
  const { auth } = useViewerClient();
  const demo = auth.status === "demo" || (auth.status === "offline" && auth.scope.mode === "demo");
  const student = auth.status === "student";
  const { state, endpoint, check } = usePushDevice(demo);
  const pref = useViewerQuery(api.officialAlerts.getAlertPushPreference, student ? { endpoint } : "skip");
  const devices = useViewerQuery(api.push.getMyPushSubscriptions, student ? {} : "skip");
  const register = useViewerMutation(api.push.registerPushSubscription);
  const unregister = useViewerMutation(api.push.unregisterPushSubscription);
  const setAlert = useViewerMutation(api.officialAlerts.setAlertPushPreference);
  const { toast, announce } = useAnnouncer();
  const [explainOpen, setExplainOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phoneHeading = useRef<HTMLHeadingElement>(null);
  const alertsHeading = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const focus = () => {
      if (window.location.hash === "#alerts") alertsHeading.current?.focus();
      if (window.location.hash === "#this-phone") phoneHeading.current?.focus();
    };
    const frame = requestAnimationFrame(focus);
    window.addEventListener("hashchange", focus);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", focus); };
  }, []);

  const turnOnPhone = async (): Promise<string | null> => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await check();
      statusRef.current?.focus();
      announce("Notifications are blocked for OwlSide.");
      return null;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("This browser returned an incomplete push subscription.");
    await register({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, userAgent: navigator.userAgent });
    await check();
    toast({ message: "Push is on for this phone" });
    return json.endpoint;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); } catch (problem) { setError(errorMessage(problem, "Could not change notification settings.")); } finally { setBusy(false); }
  };

  const enableAlerts = () => run(async () => {
    setConfirmOpen(false);
    const target = state === "on" && endpoint ? endpoint : await turnOnPhone();
    if (!target) return;
    await setAlert({ endpoint: target, optIn: true, confirmed: true });
    announce("Official Alert push on for this phone.");
  });

  const disableAlerts = () => run(async () => {
    if (!endpoint) return;
    await setAlert({ endpoint, optIn: false });
    announce("Official Alert push off for this phone.");
  });

  const phoneCopy = state ? PHONE_COPY[state] : null;
  const atDeviceLimit = state !== "on" && (devices?.endpoints.length ?? 0) >= 3;
  const available = pref?.available === true && pref.phase !== "not_available";
  const canSwitch = student && available && !demo && (state === "on" || state === "not_asked") && !busy;
  const optedIn = pref?.available === true && pref.optedIn;
  const disabledReason = demo ? "Demo Mode: no push."
    : !student ? "Sign in with your KSU .edu email to use push."
      : !available ? "Not available yet."
        : state && state !== "on" && state !== "not_asked" ? phoneCopy?.text
          : atDeviceLimit ? "3 of 3 devices are used. Remove one on another device first." : undefined;

  return (
    <>
      <section id="this-phone" aria-labelledby="notif-phone" className={`${ui.card} space-y-[var(--sp-3)] scroll-mt-[var(--chrome-top)]`}>
        <h2 ref={phoneHeading} tabIndex={-1} id="notif-phone" className={ui.h2}>This phone</h2>
        {!phoneCopy ? <p role="status">Checking this phone…</p> : (
          <p ref={statusRef} tabIndex={-1} data-testid="push-phone-state" data-state={state ?? ""} className="font-bold">
            <span aria-hidden="true">{phoneCopy.symbol} </span>{phoneCopy.word}: {phoneCopy.text}
          </p>
        )}
        {state === "ios_tab" && (
          <ol className="list-decimal space-y-[var(--sp-1)] pl-[var(--sp-5)]" data-testid="ios-home-screen-steps">
            <li>Open OwlSide in Safari.</li>
            <li>Tap Share (the square with an arrow).</li>
            <li>Choose Add to Home Screen, then Add.</li>
            <li>Open OwlSide from the new Home Screen icon and come back here.</li>
          </ol>
        )}
        {state === "blocked" && (
          <ul className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)] text-sm">
            <li>Chrome or Edge: select the icon left of the address, then Notifications › Allow.</li>
            <li>iPhone Home Screen app: Settings › Notifications › OwlSide › Allow Notifications.</li>
            <li>Android: Settings › Apps › your browser or OwlSide › Notifications.</li>
          </ul>
        )}
        {(state === "blocked" || state === "ios_tab") && (
          <button type="button" className={ui.secondary} onClick={() => void check()}>
            {state === "blocked" ? "I changed it · check again" : "I opened it from the Home Screen"}
          </button>
        )}
        {student && state === "not_asked" && (
          <button type="button" className={ui.secondary} disabled={busy || atDeviceLimit} onClick={() => setExplainOpen(true)}>Turn on push for this phone</button>
        )}
        {student && state === "on" && endpoint && (
          <button type="button" className={ui.secondary} disabled={busy} onClick={() => run(async () => {
            const sub = await currentSubscription();
            await unregister({ endpoint });
            await sub?.unsubscribe().catch(() => false);
            await check();
            announce("Push is off on this phone.");
          })}>Turn off push on this phone</button>
        )}
        {student && devices && <p className={ui.muted} data-testid="push-device-count">{devices.endpoints.length} of 3 devices used{state === "on" ? " · this one included" : ""}.</p>}
      </section>

      <section id="alerts" aria-labelledby="notif-alerts" className={`${ui.card} space-y-[var(--sp-3)] scroll-mt-[var(--chrome-top)]`}>
        <h2 ref={alertsHeading} tabIndex={-1} id="notif-alerts" className={ui.h2}>Official Alerts</h2>
        <button
          type="button" role="switch" aria-checked={optedIn} aria-disabled={!canSwitch || (atDeviceLimit && !optedIn)}
          aria-describedby="alert-push-description alert-push-reason" data-testid="alert-push-switch"
          className={`${ui.secondary} flex w-full justify-between gap-[var(--sp-3)] text-left`}
          onClick={() => {
            if (!canSwitch || (atDeviceLimit && !optedIn)) return;
            if (optedIn) void disableAlerts(); else setConfirmOpen(true);
          }}>
          <span>Official Alert push</span><span aria-hidden="true">{optedIn ? "✓ On" : "○ Off"}</span>
        </button>
        <p id="alert-push-description">
          Off by default. When KSU Police or KSU’s Emergency Advisory page posts a new notice or an all clear, OwlSide can push a
          message naming only the source, like “KSU Police posted a new Timely Warning”. No details, at most {pref?.available ? pref.dailyCap : 3} a day for everyone.
        </p>
        <p id="alert-push-reason" data-testid="alert-push-reason" className="font-bold">
          {pref?.available && pref.phase === "paused" ? "Paused: OwlSide’s copy of a KSU page is out of date. Your setting is kept."
            : pref?.available && pref.phase === "switched_off" ? "Switched off by OwlSide while its copy of a KSU page is checked. Your setting is kept."
              : disabledReason ?? ""}
        </p>
        {pref?.available && (pref.phase === "paused" || pref.phase === "switched_off") && (
          <Link href="/safety#official-alerts" className={ui.link}>See Official Alerts</Link>
        )}
        <div className="rounded-[var(--r-md)] border-2 border-[var(--line-strong)] p-[var(--sp-3)]" data-testid="alert-push-callout">
          <p className="font-bold">OwlSide push is not an emergency channel.</p>
          <p>
            It can be late or never arrive, and phones don’t treat it as a critical alert. KSU’s official emergency channel is
            KSU Alert (Rave), which sends texts, calls and email. In an emergency, call 911.
          </p>
          <a className={ui.link} href={KSU_SOURCES.ksuAlert.href} target="_blank" rel="noopener noreferrer">KSU Alert (Rave): keep your cell number current in OwlExpress</a>
        </div>
        {error && <p role="alert">{error}</p>}
      </section>

      <Dialog open={explainOpen} onClose={() => setExplainOpen(false)} role="alertdialog" title="Turn on push for this phone?"
        description="Your browser will ask next. If you choose Block, OwlSide can’t ask again; you’d have to change it in your browser settings.">
        <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
          <button type="button" className={ui.secondary} onClick={() => setExplainOpen(false)}>Not now</button>
          <button type="button" className={ui.primary} onClick={() => { setExplainOpen(false); void run(async () => { await turnOnPhone(); }); }}>Continue</button>
        </div>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} role="alertdialog" title="Turn on Official Alert push?" testId="alert-push-confirm">
        <ul className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)]">
          <li>OwlSide checks KSU’s pages every 5 minutes and pushes only after it sees a notice twice, so a push can be 10 minutes or more behind KSU.</li>
          <li>A push may arrive late or never. OwlSide can’t confirm delivery.</li>
          <li>At most 3 Official Alert pushes a day for everyone; later notices that day are only in the app.</li>
          <li>The message names the source, not what happened. Open it to read KSU’s words.</li>
          <li>For emergencies, KSU Alert (Rave) is the official channel, and 911 is always first.</li>
        </ul>
        {state !== "on" && <p>Your browser will then ask to allow notifications.</p>}
        <div className="mt-[var(--sp-3)] flex flex-wrap justify-end gap-[var(--sp-2)]">
          <button type="button" className={ui.secondary} onClick={() => setConfirmOpen(false)}>Not now</button>
          <button type="button" className={ui.primary} onClick={() => void enableAlerts()}>Turn on Official Alert push</button>
        </div>
      </Dialog>
    </>
  );
}
