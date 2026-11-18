"use client";

import React from "react";
import Link from "next/link";

/** Stub for /safety/alerts/<alertId> (URL contract, SPEC-v2 §3). Official Alert copy lands in Phase 2(b). */
export default function OfficialAlertPage() {
  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Official Alert</h1>
      <p>KSUX doesn’t show the text of official notices yet. Read them on KSU’s own pages.</p>
      <ul className="space-y-[var(--sp-1)]">
        <li><a className="inline-flex min-h-[var(--target)] items-center font-bold underline" href="https://www.kennesaw.edu/emergency/">KSU Emergency Advisory page</a></li>
        <li><a className="inline-flex min-h-[var(--target)] items-center font-bold underline" href="https://campus.kennesaw.edu/offices-services/public-safety-police/">KSU Police · Timely Warnings</a></li>
      </ul>
      <Link href="/safety" className="inline-flex min-h-[var(--target)] items-center font-bold underline">Back to Safety</Link>
    </>
  );
}
