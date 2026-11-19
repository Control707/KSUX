"use client";

import React from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";

export function ModulePlaceholder({
  title,
  description,
  preserveAcrossCampus = false,
}: {
  title: string;
  description: string;
  preserveAcrossCampus?: boolean;
}) {
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const campus = summary?.viewer.activeCampusFilter ?? "Kennesaw";

  return (
    <div className="space-y-[var(--sp-3)] p-[var(--sp-4)]">
      <section className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-5)] text-[var(--ink)]">
        <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
          <h1 data-route-heading="" tabIndex={-1} className="font-display text-2xl font-bold [overflow-wrap:anywhere]">
            {title}
          </h1>
          <span className="rounded-full bg-[var(--accent-soft)] px-[var(--sp-2)] text-sm font-bold text-[var(--accent-ink)]">
            {preserveAcrossCampus ? "All campuses" : `Campus: ${campus}`}
          </span>
        </div>
        <p className="mt-[var(--sp-2)] text-body text-[var(--muted)]">{description}</p>
        <div className="mt-[var(--sp-4)]">
          <Link
            href="/"
            className="inline-flex min-h-[var(--target)] items-center rounded-[var(--r-sm)] bg-[var(--accent)] px-[var(--sp-4)] text-sm font-bold text-[var(--on-accent)]"
          >
            Back to Now
          </Link>
        </div>
      </section>
    </div>
  );
}
