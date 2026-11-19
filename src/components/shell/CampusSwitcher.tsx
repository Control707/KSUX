"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { api } from "@convex/_generated/api";
import { SegmentedControl } from "@/components/a11y/controls";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";

/**
 * Location screens (ADR-0008, SPEC-v2 §3). Only these show the Campus
 * switcher; every other screen is KSU-wide. `/safety` uses the switcher for
 * its Incidents section only and renders it itself.
 */
export const LOCATION_ROUTE_PREFIXES = ["/parking", "/transit", "/study", "/dining", "/events"] as const;

export function isLocationRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/study/")) return false; // A joined Session's detail is private and KSU-wide.
  return LOCATION_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const CAMPUSES = [
  { value: "Kennesaw", label: "Kennesaw" },
  { value: "Marietta", label: "Marietta" },
] as const;

export function CampusSwitcher({ label = "Campus" }: { label?: string }) {
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const setCampusFilter = useViewerMutation(api.shell.setCampusFilter);
  const { announce, toast } = useAnnouncer();
  const active = summary?.viewer.activeCampusFilter;

  return (
    <div data-testid="campus-switcher">
      <SegmentedControl
        label={label}
        options={CAMPUSES}
        value={(active === "Kennesaw" || active === "Marietta" ? active : "") as "Kennesaw" | "Marietta"}
        testIdPrefix="campus-switch"
        onChange={(campus) => {
          void setCampusFilter({ campusFilter: campus })
            .then(() => announce(`Showing ${campus}`))
            .catch((error: Error) => toast({ tone: "error", message: "Couldn’t change Campus", detail: error.message }));
        }}
      />
    </div>
  );
}

/** Renders the switcher only on location screens. */
export function LocationCampusSwitcher() {
  const pathname = usePathname();
  if (!isLocationRoute(pathname)) return null;
  return <CampusSwitcher />;
}
