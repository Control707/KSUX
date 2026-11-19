import React from "react";
import Link from "next/link";
import { ACCESSIBILITY_STATEMENT } from "@/components/profile/accessibilityStatement";

function formatTestedDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}

function listSentence(items: readonly string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** About KSUX: the public accessibility statement (SPEC-v2 §15). */
export default function AboutPage() {
  const s = ACCESSIBILITY_STATEMENT;
  return (
    <div data-testid="about-view" className="mx-auto max-w-3xl space-y-[var(--sp-4)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
      <h1 className="font-display text-2xl font-bold">About KSUX</h1>

      <section
        aria-labelledby="a11y-statement-heading"
        data-testid="accessibility-statement"
        className="space-y-[var(--sp-3)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
      >
        <h2 id="a11y-statement-heading" className="font-display text-xl font-bold">
          Accessibility
        </h2>
        <p>
          KSUX is built to {s.standard}.{" "}
          {s.lastTested ? (
            <>
              Last tested <time dateTime={s.lastTested}>{formatTestedDate(s.lastTested)}</time> with{" "}
              {listSentence(s.assistiveTech)}.
            </>
          ) : (
            <>
              The first full manual test with {listSentence(s.assistiveTech)} hasn't been logged yet.
            </>
          )}
        </p>
        <h3 className="text-lg font-bold">Known issues</h3>
        {s.knownIssues.length === 0 ? (
          <p>No known issues are open right now.</p>
        ) : (
          <ul className="list-disc space-y-[var(--sp-1)] pl-[var(--sp-5)]">
            {s.knownIssues.map((item) => (
              <li key={item.issue}>
                {item.issue} <span className="text-[var(--muted)]">(target: {item.target})</span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <a
            href={s.feedback.href}
            className="inline-flex min-h-[var(--target)] items-center font-bold underline"
            data-testid="accessibility-feedback-link"
          >
            {s.feedback.label}
          </a>
        </p>
      </section>

      <section
        aria-labelledby="about-safety-heading"
        className="space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
      >
        <h2 id="about-safety-heading" className="font-display text-xl font-bold">
          Safety
        </h2>
        <p>KSUX isn't 911, isn't monitored around the clock, and community reports aren't verified.</p>
        <ul className="flex flex-wrap gap-x-[var(--sp-4)]">
          <li>
            <Link href="/safety/about" data-testid="about-ksux-safety-link" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
              About KSUX Safety
            </Link>
          </li>
          <li>
            <Link href="/safety" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
              Open Safety
            </Link>
          </li>
        </ul>
      </section>

      <Link href="/profile" className="inline-flex min-h-[var(--target)] items-center font-bold underline">
        Back to Profile
      </Link>
    </div>
  );
}
