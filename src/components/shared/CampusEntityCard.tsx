"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export interface CampusEntityEmbedProps {
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string;
  campus?: "Kennesaw" | "Marietta" | "Both" | string;
  href: string;
}

const ENTITY_LABELS: Record<string, string> = {
  listing: "Marketplace Listing",
  event: "Campus Event",
  study_session: "Study Session",
  parking_lot: "Parking Lot",
  course_hub: "Course Hub",
  club: "Student Club",
  study_room: "Study Room",
  dining_venue: "Dining Venue",
  shuttle_route: "Shuttle Route",
};

function campusColors(campus: string) {
  if (campus === "Marietta") return "bg-[var(--mar-bg)] text-[var(--mar-fg)]";
  if (campus === "Kennesaw") return "bg-[var(--ken-bg)] text-[var(--ken-fg)]";
  return "bg-[var(--surface-2)] text-[var(--ink)]";
}

export function CampusEntityCard({
  entityType,
  title,
  subtitle,
  campus,
  href,
}: CampusEntityEmbedProps) {
  const badgeLabel = ENTITY_LABELS[entityType] ?? "OwlSide Campus";

  return (
    <Link
      href={href}
      className="group mt-[var(--sp-2)] flex min-h-[var(--target)] items-center justify-between gap-[var(--sp-3)] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-[var(--sp-3)] py-[var(--sp-2)] hover:border-[var(--line-strong)]"
    >
      <span className="block min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-[var(--sp-1)] text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          <span>{badgeLabel}</span>
          {campus && (
            <span className={`inline-flex items-center rounded-full px-[var(--sp-2)] text-xs font-bold normal-case ${campusColors(campus)}`}>
              {campus === "Both" ? "Both campuses" : `${campus} Campus`}
            </span>
          )}
        </span>
        <span className="mt-[var(--sp-1)] block text-sm font-bold text-[var(--ink)] [overflow-wrap:anywhere] group-hover:underline">
          {title}
        </span>
        {subtitle && (
          <span className="block text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{subtitle}</span>
        )}
      </span>
      <ArrowUpRight aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--accent-ink)]" />
    </Link>
  );
}

export function CitationPill({
  label,
  href,
  campus,
}: {
  label: string;
  href: string;
  campus?: string;
}) {
  return (
    <Link
      href={href}
      data-testid="scrappy-citation-pill"
      className="inline-flex min-h-[var(--target)] max-w-full items-center gap-[var(--sp-1)] rounded-full border border-[var(--line-strong)] bg-[var(--accent-soft)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]"
    >
      <span aria-hidden="true">🦉</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {campus && (
        <span className="text-sm font-semibold text-[var(--muted)]">· {campus}</span>
      )}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" />
    </Link>
  );
}
