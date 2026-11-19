"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import {
  CAMPUS_CONTACTS,
  KSU_SOURCES,
  NO_ALERT_ISNT_SAFE,
  OFFICIAL_ALERT_LINKS,
  OFFLINE_OFFICIAL,
  POLICE_NON_EMERGENCY,
  RESOURCES_CHECKED_ON,
  sourceOf,
  type KsuSourceKey,
} from "./safetyContent";
import type { EmergencyPanelMode } from "./EmergencyPanel";

const card = "space-y-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]";
const linkClass = "inline-flex min-h-[var(--target)] max-w-full items-center gap-[var(--sp-1)] font-bold underline";
const sourceTag = "inline-block rounded-[var(--r-sm)] border border-[var(--line-strong)] px-[var(--sp-2)] text-[length:var(--fs-sm)] font-bold";

function checkedOnLabel() {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(RESOURCES_CHECKED_ON + "T12:00:00Z")
  );
}

/** An official KSU page, named by its source and opening outside KSUX. */
export function OfficialLink({ sourceKey, testId }: { sourceKey: KsuSourceKey; testId?: string }) {
  const s = KSU_SOURCES[sourceKey];
  return (
    <a className={linkClass} href={s.href} target="_blank" rel="noopener noreferrer" data-testid={testId}>
      {s.source} · {s.title}
      <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only">, opens KSU’s page in a new tab</span>
    </a>
  );
}

/**
 * Official Alerts, P0 (SPEC-v2 §5, §9 P0): links to KSU's own pages and KSU
 * Alert guidance. KSUX shows no live Alert status at P0, so nothing here can
 * go stale or be served from a cache as current.
 */
export function OfficialAlertsSection({ mode, online }: { mode: EmergencyPanelMode; online: boolean }) {
  return (
    <section className={card} aria-labelledby="official-alerts" data-testid="official-alerts">
      <h2 id="official-alerts" className="font-display text-[length:var(--fs-xl)] font-bold">
        Official Alerts
      </h2>
      <p>
        KSUX doesn’t copy official notices yet. Open KSU’s own pages for current Alerts. Each link names its source.
      </p>
      {!online && (
        <p role="status" data-testid="offline-official" className="font-bold">
          {OFFLINE_OFFICIAL}
        </p>
      )}
      {mode === "demo" && (
        <div data-testid="demo-alert-fixture" className="rounded-[var(--r-md)] border-2 border-dashed border-[var(--line-strong)] p-[var(--sp-3)]">
          <p className="font-bold">
            <span className="rounded-[var(--r-sm)] bg-[var(--warn-bg)] px-[var(--sp-2)] text-[var(--warn-fg)]">Demo · not real</span>{" "}
            Sample Timely Warning
          </p>
          <p className="text-[length:var(--fs-sm)]">
            Source: KSU Police (sample) · issued time unknown. Exercise only; no real campus incident is described. Real
            Alerts are shown only from KSU’s pages.
          </p>
        </div>
      )}
      <ul className="space-y-[var(--sp-2)]">
        {OFFICIAL_ALERT_LINKS.map((key) => {
          const s = sourceOf(key);
          return (
            <li key={key}>
              <OfficialLink sourceKey={key} testId={`official-link-${key}`} />
              <p className="text-[length:var(--fs-sm)] text-[var(--muted)]">{s.detail}</p>
            </li>
          );
        })}
      </ul>
      <p className="font-bold" data-testid="no-alert-isnt-safe">{NO_ALERT_ISNT_SAFE}</p>
    </section>
  );
}

/**
 * Other official contacts and Campus-specific contacts. Static, so the
 * precached /emergency page shows them offline (#60).
 */
export function KsuContactsSection({ mode, headingLevel = 2 }: { mode: EmergencyPanelMode; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as "h2" | "h3";
  const Sub = `h${headingLevel + 1}` as "h3" | "h4";
  const demo = mode === "demo";
  return (
    <section className={card} aria-labelledby="ksu-contacts" data-testid="ksu-contacts">
      <H id="ksu-contacts" className="font-display text-[length:var(--fs-xl)] font-bold">
        Other KSU contacts
      </H>
      <p>
        <span className={sourceTag}>Official · KSU Police</span>{" "}
        <span className="text-[length:var(--fs-sm)]">Not for emergencies. Use the panel above for those.</span>
      </p>
      <ul className="space-y-[var(--sp-2)]">
        {POLICE_NON_EMERGENCY.map((line) => (
          <li key={line.label}>
            <span className="block font-bold">{line.label}</span>
            {line.number && line.tel && (
              demo ? (
                <span className="block" data-testid="demo-contact-number">{line.number} <span className="text-[length:var(--fs-sm)]">(Demo · not dialled)</span></span>
              ) : (
                <a className={linkClass} href={line.tel}>{line.number}</a>
              )
            )}
            {line.email && (
              demo ? (
                <span className="block" data-testid="demo-contact-email">{line.email} <span className="text-[length:var(--fs-sm)]">(Demo · not emailed)</span></span>
              ) : (
                <a className={linkClass} href={`mailto:${line.email}`}>{line.email}</a>
              )
            )}
            {line.note && <span className="block text-[length:var(--fs-sm)] text-[var(--muted)]">{line.note}</span>}
          </li>
        ))}
      </ul>

      <Sub className="pt-[var(--sp-2)] text-[length:var(--fs-lg)] font-bold">Campus contacts</Sub>
      <ul className="space-y-[var(--sp-2)]" data-testid="campus-contacts">
        {CAMPUS_CONTACTS.map((c) => (
          <li key={c.campus}>
            <span className="block font-bold">{c.campus} Campus</span>
            <ul className="list-disc pl-[var(--sp-5)] text-[length:var(--fs-sm)]">
              {c.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </li>
        ))}
      </ul>

      <Sub className="pt-[var(--sp-2)] text-[length:var(--fs-lg)] font-bold">LiveSafe</Sub>
      <p className="text-[length:var(--fs-sm)]">{KSU_SOURCES.liveSafe.detail}</p>
      <OfficialLink sourceKey="liveSafe" testId="official-link-liveSafe" />

      <p className="text-[length:var(--fs-sm)] text-[var(--muted)]">
        Source: <OfficialLink sourceKey="policeContact" /> and{" "}
        <OfficialLink sourceKey="advisory" />. Checked by KSUX on{" "}
        <time dateTime={RESOURCES_CHECKED_ON}>{checkedOnLabel()}</time>. This is when KSUX last checked the contacts, not an
        Alert time.
      </p>
    </section>
  );
}

/**
 * How an in-app Moderation Report differs from contacting KSU (#49 §D).
 */
export function ModerationReportNote() {
  return (
    <section className={card} aria-labelledby="ksux-moderators" data-testid="moderation-report-note">
      <h2 id="ksux-moderators" className="font-display text-[length:var(--fs-xl)] font-bold">
        Report to KSUX moderators
      </h2>
      <p>
        <span className={sourceTag}>In-app · KSUX volunteers</span>
      </p>
      <p>
        Use <strong>Report</strong> on a post, listing or message to send it to KSUX volunteer moderators. It doesn’t
        contact police or KSU, and moderators may not see it for hours.
      </p>
    </section>
  );
}
