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
      className="fixed bottom-20 right-4 z-50 inline-flex items-center gap-2 rounded-full border-2 border-[#FDBB30] bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30] shadow-xl lg:bottom-5"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      <span>Update available · Tap to reload</span>
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
    <div
      data-testid="install-pwa-card"
      className="rounded-2xl border border-[#FDBB30] bg-[#FFFDF7] p-3.5 text-xs shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-extrabold text-[#111317]">
            📲 Install KSUX to Home Screen
          </div>
          <p className="text-[11px] text-[#5E6675]">
            Instant parking-deck offline campus map &amp; saved class schedule.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            className="inline-flex items-center gap-1 rounded-xl bg-[#111317] px-3 py-1.5 font-extrabold text-[#FDBB30]"
          >
            {isIosSafari ? (
              <Share className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>Install KSUX to Home Screen</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showIosSteps && (
        <div className="mt-2.5 rounded-xl bg-white p-2.5 text-[11.5px] font-semibold text-[#111317]">
          iOS Safari 2-Step Install: <strong>1.</strong> Tap the browser{" "}
          <strong>Share</strong> button · <strong>2.</strong> Tap{" "}
          <strong>Add to Home Screen</strong>.
        </div>
      )}
    </div>
  );
}
