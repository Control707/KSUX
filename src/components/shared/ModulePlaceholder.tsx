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
    <div className="space-y-3 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-black text-[#111317]">{title}</h1>
          <span className="rounded-full bg-[#FFF6DC] px-2.5 py-0.5 text-xs font-bold text-[#855A00]">
            {preserveAcrossCampus ? "All Campuses Preserved" : `Scope: ${campus}`}
          </span>
        </div>
        <p className="mt-2 text-xs text-[#5E6675]">{description}</p>
        <div className="mt-4">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-[#111317] px-3.5 py-2 text-xs font-extrabold text-[#FDBB30]"
          >
            ← Back to Now HUD
          </Link>
        </div>
      </div>
    </div>
  );
}
