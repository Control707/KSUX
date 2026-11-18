"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/** Stub for /safety/<incidentId> (URL contract, SPEC-v2 §3). Details land in Phase 1B. */
export default function IncidentDetailsPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Community report</h1>
      <p>Community report details aren’t available yet{incidentId ? ` (reference ${decodeURIComponent(incidentId)})` : ""}.</p>
      <p>Community report · not verified.</p>
      <Link href="/safety" className="inline-flex min-h-[var(--target)] items-center font-bold underline">Back to Safety</Link>
    </>
  );
}
