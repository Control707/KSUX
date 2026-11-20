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

    const tryFocus = () => {
      const container = document.getElementById(containerId);
      const heading = container?.querySelector<HTMLElement>("h1");
      if (heading) {
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.setAttribute("data-route-heading", "");
        // Next.js owns route/hash scrolling and history restoration. Focusing
        // again must not move the viewport after that navigation has settled.
        heading.focus({ preventScroll: true });
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    // Wait for data-driven headings without polling every frame or giving up
    // before a slow connection finishes. Stop watching on the next navigation.
    const observer = new MutationObserver(() => {
      if (tryFocus()) observer.disconnect();
    });
    observer.observe(document.getElementById(containerId) ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, containerId]);

  return null;
}
