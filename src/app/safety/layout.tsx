import React from "react";
import Link from "next/link";
import { MAIN_CONTENT_ID, RouteHeadingFocus, SkipLink } from "@/components/a11y/RouteFocus";

/**
 * /safety is public: no sign-in, never cached by the service worker (the
 * precached /emergency page is its offline fallback), and outside the app
 * shell so the Emergency Panel never waits on a session.
 */
export default function SafetyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <SkipLink />
      <RouteHeadingFocus />
      <header className="border-b border-[var(--line)] px-[var(--sp-4)] py-[var(--sp-2)]">
        <nav aria-label="Safety" className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-[var(--sp-4)]">
          <Link href="/" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
            Back to KSUX
          </Link>
          <Link href="/safety" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
            Safety
          </Link>
        </nav>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto max-w-3xl space-y-[var(--sp-4)] p-[var(--sp-4)] outline-none">
        {children}
      </main>
    </div>
  );
}
