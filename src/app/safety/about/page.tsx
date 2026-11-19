import React from "react";
import Link from "next/link";
import { INDEPENDENCE_STATEMENT, KSUX_NEVER_CLAIMS } from "@/components/safety/safetyContent";

/** About KSUX Safety (SPEC-v2 §5 story 41, #49 §D): what KSUX never claims. */
export default function AboutKsuxSafetyPage() {
  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">About KSUX Safety</h1>
      <p data-testid="independence-statement" className="font-bold">{INDEPENDENCE_STATEMENT}</p>
      <section
        aria-labelledby="never-claims"
        className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
      >
        <h2 id="never-claims" className="font-display text-[length:var(--fs-xl)] font-bold">
          What KSUX never claims
        </h2>
        <ul data-testid="never-claims" className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)]">
          {KSUX_NEVER_CLAIMS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="three-kinds"
        className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
      >
        <h2 id="three-kinds" className="font-display text-[length:var(--fs-xl)] font-bold">
          Three different things
        </h2>
        <dl className="space-y-[var(--sp-2)]">
          <div>
            <dt className="font-bold">Official resources and Alerts</dt>
            <dd>KSU’s own pages and contacts, always named by source. KSUX links to them and doesn’t change them.</dd>
          </div>
          <div>
            <dt className="font-bold">Community Incidents</dt>
            <dd>Reports from Students. Always “Community report · not verified”.</dd>
          </div>
          <div>
            <dt className="font-bold">Reports to KSUX moderators</dt>
            <dd>Flags sent to KSUX volunteer moderators. They don’t contact police or KSU.</dd>
          </div>
        </dl>
      </section>
      <Link href="/safety" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
        Back to Safety
      </Link>
    </>
  );
}
