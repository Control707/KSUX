"use client";

import { useEffect, useState } from "react";

/**
 * True when this tab is in Judge Demo Mode, read from the tab's own storage
 * so it works with no sign-in, backend or network.
 */
export function useDemoTab(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    try {
      setDemo(
        !!window.sessionStorage.getItem("ksux_demo_short_code") ||
          new URLSearchParams(window.location.search).has("demo")
      );
    } catch {
      setDemo(false);
    }
  }, []);
  return demo;
}
