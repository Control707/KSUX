"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import { usePublicViewerQuery } from "@/lib/viewerClient";
import { useOnline } from "@/components/safety/useOnline";
import { AlertItemCard, NoAlertIsntSafe, displayOf, formatTime, OfficialPageLink, useServerNow } from "@/components/safety/officialAlertsUi";
import { KSU_SOURCES, OFFLINE_OFFICIAL } from "@/components/safety/safetyContent";

const linkClass = "inline-flex min-h-[var(--target)] items-center font-bold underline";

/**
 * /safety/alerts/<id>: one Official Alert, the push landing page (ADR-0007).
 * Read live; offline it says so instead of showing an old copy as current.
 */
export default function OfficialAlertPage() {
  const params = useParams<{ alertId: string }>();
  const alertId = typeof params?.alertId === "string" ? params.alertId : "";
  const { online } = useOnline();
  const data = usePublicViewerQuery(api.officialAlerts.getOfficialAlert, online && alertId ? { alertId } : "skip");
  const serverNow = useServerNow(data?.serverNow);
  const stale = data?.found ? displayOf(data.source, serverNow) === "stale" : false;

  return (
    <>
      <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Official Alert</h1>
      {!online ? (
        <p role="status" className="font-bold" data-testid="alert-detail-offline">{OFFLINE_OFFICIAL} Open KSU’s page when you’re back online.</p>
      ) : data === undefined ? (
        <p role="status">Loading the Alert…</p>
      ) : !data.found ? (
        <p data-testid="alert-detail-missing">
          OwlSide can’t show this Alert now. It may be older than 30 days, or OwlSide has switched its copy off. Read current
          notices on KSU’s own pages.
        </p>
      ) : (
        <>
          {stale && (
            <p className="font-bold" data-testid="alert-stale">
              OwlSide’s copy is out of date: last checked OK {data.source.lastSuccessAt ? formatTime(data.source.lastSuccessAt) : "never"}. Check KSU’s page for the current notice.
            </p>
          )}
          <AlertItemCard item={data.alert} source={data.source} linkToDetails={false} />
          <p className="text-[length:var(--fs-sm)]">
            OwlSide quotes up to 280 characters word for word, with no summary. KSU’s page is the record.
          </p>
        </>
      )}
      <ul className="space-y-[var(--sp-1)]">
        <li><OfficialPageLink source={{ href: KSU_SOURCES.timelyWarnings.href, sourceName: "KSU Police", pageTitle: "Timely Warnings page" }} /></li>
        <li><OfficialPageLink source={{ href: KSU_SOURCES.advisory.href, sourceName: "KSU Campus Security & Advisories", pageTitle: "Emergency Advisory page" }} /></li>
        <li><OfficialPageLink source={{ href: KSU_SOURCES.ksuAlert.href, sourceName: "KSU Office of Emergency Management", pageTitle: "KSU Alert (Rave)" }} /></li>
      </ul>
      <NoAlertIsntSafe />
      <Link href="/safety" className={linkClass}>Back to Safety</Link>
    </>
  );
}
