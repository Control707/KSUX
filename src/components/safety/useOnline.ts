"use client";

import { useEffect, useState } from "react";

/**
 * The browser's connection state. Starts as online so server and first client
 * render agree, then follows `online`/`offline` events. `reconnectedAt` is set
 * when the tab comes back online, for a polite "Back online" announcement.
 */
export function useOnline(): { online: boolean; reconnectedAt: number | null } {
  const [online, setOnline] = useState(true);
  const [reconnectedAt, setReconnectedAt] = useState<number | null>(null);
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOffline = () => {
      setOnline(false);
      setReconnectedAt(null);
    };
    const goOnline = () => {
      setOnline(true);
      setReconnectedAt(Date.now());
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  return { online, reconnectedAt };
}
