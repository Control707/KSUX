"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";

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

export function CampusEntityCard({
  entityType,
  title,
  subtitle,
  campus,
  href,
}: CampusEntityEmbedProps) {
  const badgeLabel = ENTITY_LABELS[entityType] ?? "KSUX Campus";
  const isMarietta = campus === "Marietta";

  return (
    <Link
      href={href}
      className="group mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2.5 transition hover:border-[#D99B00] hover:bg-[#FFFDF7]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#5E6675]">
          <span>{badgeLabel}</span>
          {campus && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold normal-case ${
                isMarietta
                  ? "bg-[#DBEAFE] text-[#1E3A8A]"
                  : "bg-[#FFF6DC] text-[#855A00]"
              }`}
            >
              <MapPin className="h-2.5 w-2.5" />
              {campus}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[13px] font-bold text-[#111317] group-hover:underline">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[11.5px] text-[#5E6675]">{subtitle}</p>
        )}
      </div>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#111317] text-[#FDBB30]">
        <ArrowUpRight className="h-4 w-4" />
      </span>
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
      className="inline-flex items-center gap-1 rounded-full border border-[#FDBB30] bg-[#FFF6DC] px-2.5 py-0.5 text-[11px] font-bold text-[#111317] transition hover:bg-[#FDBB30]"
    >
      <span>🦉</span>
      <span>{label}</span>
      {campus && (
        <span className="text-[10px] font-semibold text-[#5E6675]">
          · {campus}
        </span>
      )}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}
