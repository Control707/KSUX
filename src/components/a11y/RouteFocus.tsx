"use client";

import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export const MAIN_CONTENT_ID = "main-content";

export function SkipLink({ targetId = MAIN_CONTENT_ID }: { targetId?: string }) {
  return (
    <a href={`#${targetId}`} className="skip-link" data-testid="skip-to-content">
      Skip to main content
    </a>
  );
}

/**
 * Moves focus to the screen's single h1 after a client-side route change
 * (SPEC-v2 §2), so screen-reader and keyboard users land on the new screen.
 * The first load is left alone; the browser already starts at the top.
 */
export function RouteHeadingFocus({ containerId = MAIN_CONTENT_ID }: { containerId?: string }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const isFirst = previous.current === null;
    const changed = previous.current !== pathname;
    previous.current = pathname;
    if (isFirst || !changed) return;

    let attempts = 0;
    let frame = 0;
    const tryFocus = () => {
      const container = document.getElementById(containerId);
      const heading = container?.querySelector<HTMLElement>("h1");
      if (heading) {
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.setAttribute("data-route-heading", "");
        heading.focus({ preventScroll: false });
        return;
      }
      // Screens render their heading after data arrives; keep looking briefly.
      if (attempts++ < 120) frame = requestAnimationFrame(tryFocus);
      else container?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [pathname, containerId]);

  return null;
}
