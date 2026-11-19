"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Share, X } from "lucide-react";
import { useViewerClient } from "@/lib/viewerClient";

const INSTALL_DISMISSED_KEY = "ksux_install_banner_dismissed";

export function ServiceWorkerManager() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );

  const reloadOnActivation = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let mounted = true;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (!mounted) return;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing);
            }
          });
        });
      })
      .catch(() => {
        // Ignore SW registration errors on unsupported origins
      });

    const onControllerChange = () => {
      if (reloadOnActivation.current) {
        window.location.reload();
        return;
      }
      setWaitingWorker(null);
      // Prime the new worker with bundles loaded before it claimed this page,
      // without interrupting an in-progress editor or import.
      const loadedBundles = new Set(performance.getEntriesByType("resource").map(({ name }) => name));
      for (const name of loadedBundles) {
        const url = new URL(name);
        if (url.origin === window.location.origin && url.pathname.startsWith("/_next/static/")) {
          void fetch(url).catch(() => {});
        }
      }
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <button
      type="button"
      data-testid="sw-update-reload-pill"
      onClick={() => {
        reloadOnActivation.current = true;
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      }}
      className="fixed bottom-[calc(var(--chrome-bottom)+var(--sp-2))] right-[var(--sp-4)] z-50 inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-full border-2 border-[var(--accent)] bg-[var(--ink)] px-[var(--sp-4)] text-sm font-bold text-[var(--bg)] shadow-[var(--shadow)] lg:bottom-[var(--sp-5)]"
    >
      <RefreshCw aria-hidden="true" className="h-4 w-4" />
      <span>Update available · Reload</span>
    </button>
  );
}

export function InstallHomeScreenCard() {
  const { auth } = useViewerClient();
  const [deferredPrompt, setDeferredPrompt] = useState<any | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") {
      setDismissed(true);
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as any).standalone);
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent || "";
    const ios =
      /iPad|iPhone|iPod/.test(ua) &&
      /WebKit/.test(ua) &&
      !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIosSafari(ios);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // Hidden by default in Judge Demo Mode and when already standalone or dismissed!
  if (auth.status !== "student" || isStandalone || dismissed) {
    return null;
  }

  if (!deferredPrompt && !isIosSafari) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
      return;
    }
    if (isIosSafari) {
      setShowIosSteps((v) => !v);
    }
  };

  return (
    <section
      data-testid="install-pwa-card"
      aria-labelledby="install-pwa-title"
      className="rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--sp-3)] text-[var(--ink)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
        <div className="min-w-0">
          <h2 id="install-pwa-title" className="font-display text-lg font-bold">
            <span aria-hidden="true">📲 </span>Install KSUX on your Home Screen
          </h2>
          <p className="text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
            Open the campus map and your saved class schedule even when you are offline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-[var(--sp-1)]">
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            aria-expanded={isIosSafari ? showIosSteps : undefined}
            className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--accent)] px-[var(--sp-3)] text-sm font-bold text-[var(--on-accent)]"
          >
            {isIosSafari ? (
              <Share aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Download aria-hidden="true" className="h-4 w-4" />
            )}
            <span>Install KSUX to Home Screen</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss install suggestion"
            className="min-target inline-flex items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showIosSteps && (
        <p className="mt-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--surface-2)] p-[var(--sp-2)] text-sm font-semibold">
          On iPhone or iPad: 1. Tap the Safari <strong>Share</strong> button. 2. Tap{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      )}
    </section>
  );
}
