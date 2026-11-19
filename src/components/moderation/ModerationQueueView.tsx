"use client";

import React from "react";
import {
  Ban,
  CheckCircle2,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { KsuPoliceEmergencyCallout } from "@/components/shared/ReportTrigger";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge } from "@/components/a11y/controls";

import { V2LaunchOps } from "./V2LaunchOps";
import { AlertSourceOps } from "./AlertSourceOps";

const outcomeLabels = {
  pending: "Awaiting first sync",
  accepted: "Accepted",
  empty: "Valid empty response",
  partial: "Partial response",
  failed: "Failed or invalid response",
};

const freshnessLabels = {
  within_window: "Within freshness window",
  stale: "Stale · last accepted data",
  unavailable: "No accepted data",
};

const card =
  "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]";
const buttonBase =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-sm font-bold";
const secondaryButton = `${buttonBase} border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]`;

function syncTime(timestamp: number | null) {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(timestamp) + " ET";
}

function errorMessage(err: any, fallback: string) {
  return err?.data?.message || err?.message || fallback;
}

export function ModerationQueueView() {
  const { auth } = useViewerClient();
  const { toast } = useAnnouncer();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const isModerator = summary?.viewer.isModerator ?? false;

  const queue = useViewerQuery(
    api.moderation.getModerationQueue,
    isModerator ? {} : "skip"
  );
  const showFeedHealth = summary?.viewer.isMaintainer === true && auth.status === "student";
  const feedHealth = useViewerQuery(api.moderation.getCampusFeedHealth, showFeedHealth ? {} : "skip");
  const blockedList = useViewerQuery(api.moderation.listBlockedStudents, {});
  const reviewTarget = useViewerMutation(api.moderation.reviewModerationTarget);
  const reviewOfficer = useViewerMutation(api.moderation.reviewOfficerClaim);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    try {
      await action();
      toast({ message: success, tone: "success" });
    } catch (err: any) {
      toast({ message: errorMessage(err, failure), tone: "error" });
    }
  };

  if (summary && !isModerator) {
    return (
      <div className="space-y-[var(--sp-4)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
        <section className={`${card} border-[var(--bad-fg)]`}>
          <h1 className="flex items-center gap-[var(--sp-2)] font-display text-2xl font-bold text-[var(--bad-fg)]">
            <ShieldAlert aria-hidden="true" className="h-6 w-6 shrink-0" />
            Moderator access required
          </h1>
          <p className="mt-[var(--sp-2)]">
            In production, the Moderation Queue is restricted to appointed KSUX moderators and the addresses in{" "}
            <code>KSUX_MAINTAINER_EMAILS</code>. Hackathon evaluators can try moderation safely in{" "}
            <strong>Judge Demo Mode</strong>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div data-testid="moderation-queue-view" className="space-y-[var(--sp-4)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
      <header className={`${card} flex flex-wrap items-start gap-[var(--sp-3)]`}>
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
        >
          <Shield className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">
            {auth.status === "demo" ? "Moderation Queue (Demo)" : "Moderation Queue"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Workspace <code className="font-bold text-[var(--ink)]">{queue?.workspaceKey ?? summary?.viewer.workspaceKey}</code>
            {" "}· 3 distinct reports move an item to Under Review.
          </p>
        </div>
      </header>

      {isModerator && auth.status === "student" && <V2LaunchOps />}
      {isModerator && auth.status === "student" && <AlertSourceOps />}
      {showFeedHealth && (
        <section aria-labelledby="campus-feed-health" className={card}>
          <h2 id="campus-feed-health" className="font-display text-xl font-bold">Campus feed health</h2>
          {feedHealth === undefined ? (
            <p role="status" className="mt-[var(--sp-2)] text-sm">Loading campus feed health…</p>
          ) : (
            <ul className="lt-grid-1 mt-[var(--sp-2)] grid gap-[var(--sp-2)] md:grid-cols-2">
              {feedHealth.map((source) => (
                <li key={source.key} className="min-w-0 rounded-[var(--r-sm)] border border-[var(--line)] p-[var(--sp-3)] text-sm">
                  <h3 className="text-body font-bold">{source.name}</h3>
                  <p>{outcomeLabels[source.result]} · {freshnessLabels[source.freshness]}</p>
                  <dl className="mt-[var(--sp-2)] grid grid-cols-1 gap-x-[var(--sp-3)] gap-y-[var(--sp-1)] sm:grid-cols-2">
                    <dt className="text-[var(--muted)]">Last attempt</dt><dd>{syncTime(source.lastAttemptAt)}</dd>
                    <dt className="text-[var(--muted)]">Last successful fetch</dt><dd>{syncTime(source.lastSuccessAt)}</dd>
                    <dt className="text-[var(--muted)]">Accepted records</dt><dd>{source.acceptedCount ?? "—"}</dd>
                    {source.retryAfter !== null && <><dt className="text-[var(--muted)]">Retry after</dt><dd>{syncTime(source.retryAfter)}</dd></>}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <KsuPoliceEmergencyCallout />

      <section aria-labelledby="mod-items-heading" className="space-y-[var(--sp-2)]">
        <h2 id="mod-items-heading" className="font-display text-xl font-bold">
          Reported and Under Review ({queue?.items.length ?? 0})
        </h2>

        {!queue ? (
          <p role="status" className={`${card} text-sm text-[var(--muted)]`}>
            Loading moderation queue…
          </p>
        ) : queue.items.length === 0 ? (
          <p role="status" className={`${card} font-bold text-[var(--ok-fg)]`}>
            <span aria-hidden="true">✓ </span>All clear — no open or Under Review reports in this workspace.
          </p>
        ) : (
          <ul className="space-y-[var(--sp-2)]">
            {queue.items.map((item) => {
              const label = item.targetType.replace(/_/g, " ");
              const quarantined = item.queueStatus === "quarantined";
              return (
                <li
                  key={item.targetKey}
                  data-testid={`moderation-item-${item.targetType}`}
                  className={card}
                >
                  <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
                    <div className="flex min-w-0 flex-wrap items-center gap-[var(--sp-2)] text-sm">
                      <span
                        className={`inline-flex items-center gap-[var(--sp-1)] rounded-full border px-[var(--sp-2)] font-bold ${
                          quarantined
                            ? "border-[var(--warn-fg)] bg-[var(--warn-bg)] text-[var(--warn-fg)]"
                            : "border-dashed border-[var(--bad-fg)] bg-[var(--bad-bg)] text-[var(--bad-fg)]"
                        }`}
                      >
                        <span aria-hidden="true">{quarantined ? "◐" : "!"}</span>
                        {quarantined ? "Under Review (hidden)" : "Open report"}
                      </span>
                      <h3 className="text-body font-bold capitalize">{label}</h3>
                      <span className="text-[var(--muted)]">
                        {item.reporterCount} distinct reporter{item.reporterCount === 1 ? "" : "s"} ({item.reasons.join(", ")})
                      </span>
                    </div>
                    {item.author && (
                      <span className="text-sm text-[var(--muted)]">Author: @{item.author.handle}</span>
                    )}
                  </div>

                  <p className="mt-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--surface-2)] p-[var(--sp-3)] text-sm">
                    {item.previewText || "[Content unavailable]"}
                  </p>

                  <div className="mt-[var(--sp-3)] flex flex-wrap gap-[var(--sp-2)]">
                    <button
                      type="button"
                      data-testid="moderation-restore-btn"
                      onClick={() =>
                        void run(
                          () => reviewTarget({ targetType: item.targetType, targetId: item.targetId, decision: "restore" }),
                          "Item restored to public visibility",
                          "Couldn't restore."
                        )
                      }
                      className={`${buttonBase} border border-[var(--ok-fg)] bg-[var(--ok-bg)] text-[var(--ok-fg)]`}
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      Restore false positive
                      <span className="sr-only"> · {label}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="moderation-remove-btn"
                      onClick={() =>
                        void run(
                          () => reviewTarget({ targetType: item.targetType, targetId: item.targetId, decision: "remove" }),
                          "Content removed",
                          "Couldn't remove."
                        )
                      }
                      className={`${buttonBase} border border-[var(--bad-fg)] bg-[var(--bad-bg)] text-[var(--bad-fg)]`}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Remove content
                      <span className="sr-only"> · {label}</span>
                    </button>

                    {item.author && !item.author.isRemoved && (
                      <button
                        type="button"
                        data-testid="moderation-suspend-btn"
                        onClick={() =>
                          void run(
                            () => reviewTarget({ targetType: item.targetType, targetId: item.targetId, decision: "suspend_student" }),
                            `Suspended @${item.author?.handle} and locked their handle and email`,
                            "Couldn't suspend."
                          )
                        }
                        className={`${buttonBase} bg-[var(--ink)] text-[var(--bg)]`}
                      >
                        <UserX aria-hidden="true" className="h-4 w-4" />
                        Suspend @{item.author.handle}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {queue && queue.officerClaims.length > 0 && (
        <section aria-labelledby="mod-officer-heading" className="space-y-[var(--sp-2)]">
          <h2 id="mod-officer-heading" className="font-display text-xl font-bold">
            Pending club officer claims ({queue.officerClaims.length})
          </h2>
          <ul className="space-y-[var(--sp-2)]">
            {queue.officerClaims.map((claim) => (
              <li
                key={String(claim.membershipId)}
                className={`${card} flex flex-wrap items-center justify-between gap-[var(--sp-3)]`}
              >
                <div className="min-w-0 text-sm">
                  <h3 className="text-body font-bold">
                    @{claim.student.handle} ({claim.student.displayName}) → {claim.club.name}
                  </h3>
                  <p className="flex flex-wrap items-center gap-[var(--sp-1)] text-[var(--muted)]">
                    <CampusBadge campus={claim.club.campus} /> Requested manual officer review
                  </p>
                </div>
                <div className="flex flex-wrap gap-[var(--sp-2)]">
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => reviewOfficer({ membershipId: claim.membershipId, approve: true }),
                        `Approved @${claim.student.handle} as officer`,
                        "Couldn't approve."
                      )
                    }
                    className={`${buttonBase} border border-[var(--ok-fg)] bg-[var(--ok-bg)] text-[var(--ok-fg)]`}
                  >
                    <UserCheck aria-hidden="true" className="h-4 w-4" />
                    Approve officer
                    <span className="sr-only"> @{claim.student.handle}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => reviewOfficer({ membershipId: claim.membershipId, approve: false }),
                        `Kept @${claim.student.handle} as member`,
                        "Couldn't update the claim."
                      )
                    }
                    className={secondaryButton}
                  >
                    Keep as member
                    <span className="sr-only"> @{claim.student.handle}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {blockedList && blockedList.length > 0 && (
        <section aria-labelledby="mod-blocked-heading" className="space-y-[var(--sp-2)]">
          <h2 id="mod-blocked-heading" className="font-display text-xl font-bold">
            Your blocked Students ({blockedList.length})
          </h2>
          <ul className={`${card} divide-y divide-[var(--line)] py-[var(--sp-1)]`}>
            {blockedList.map((b) => (
              <li
                key={String(b.blockId)}
                className="flex flex-wrap items-center justify-between gap-[var(--sp-2)] py-[var(--sp-2)] text-sm"
              >
                <span className="flex min-w-0 items-center gap-[var(--sp-1)] font-bold">
                  <Ban aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--bad-fg)]" />@{b.student.handle}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => toggleBlock({ targetStudentId: b.student._id }),
                      `Unblocked @${b.student.handle}`,
                      "Couldn't unblock."
                    )
                  }
                  className={secondaryButton}
                >
                  Unblock<span className="sr-only"> @{b.student.handle}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
