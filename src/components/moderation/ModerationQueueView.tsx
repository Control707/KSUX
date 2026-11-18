"use client";

import React, { useState } from "react";
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

function syncTime(timestamp: number | null) {
  if (timestamp === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(timestamp) + " ET";
}

export function ModerationQueueView() {
  const { auth } = useViewerClient();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const isModerator = summary?.viewer.isModerator ?? false;

  const queue = useViewerQuery(
    api.moderation.getModerationQueue,
    isModerator ? {} : "skip"
  );
  const showFeedHealth = isModerator && auth.status !== "demo";
  const feedHealth = useViewerQuery(api.moderation.getCampusFeedHealth, showFeedHealth ? {} : "skip");
  const blockedList = useViewerQuery(api.moderation.listBlockedStudents, {});
  const reviewTarget = useViewerMutation(api.moderation.reviewModerationTarget);
  const reviewOfficer = useViewerMutation(api.moderation.reviewOfficerClaim);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);

  const [banner, setBanner] = useState<string | null>(null);

  if (summary && !isModerator) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-[#FEE2E2] bg-white p-6">
          <div className="flex items-center gap-2 text-sm font-black text-[#B91C1C]">
            <ShieldAlert className="h-5 w-5" />
            <span>Maintainer Moderation Access Required</span>
          </div>
          <p className="mt-2 text-xs text-[#5E6675]">
            In production, the Moderation Queue is restricted to canonical{" "}
            <code>.edu</code> addresses configured in{" "}
            <code>KSUX_MAINTAINER_EMAILS</code>. Hackathon evaluators can test
            moderation safely inside <strong>Judge Demo Mode</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="moderation-queue-view" className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E4E7EE] bg-white px-4 py-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#111317] text-[#FDBB30]">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-black text-[#111317]">
              {auth.status === "demo"
                ? "Moderation Queue (Demo)"
                : "Maintainer Moderation Queue"}
            </h1>
            <p className="text-xs text-[#5E6675]">
              Scoped strictly to workspace{" "}
              <code className="font-mono font-bold text-[#111317]">
                {queue?.workspaceKey ?? summary?.viewer.workspaceKey}
              </code>{" "}
              · 3 distinct reports auto-quarantine to Under Review.
            </p>
          </div>
        </div>
      </div>

      {showFeedHealth && (
        <section aria-labelledby="campus-feed-health" className="rounded-2xl border border-[#E4E7EE] bg-white p-4">
          <h2 id="campus-feed-health" className="text-sm font-black">Campus feed health</h2>
          {feedHealth === undefined ? <p role="status">Loading campus feed health…</p> : (
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {feedHealth.map((source) => (
                <li key={source.key} className="rounded-lg border border-[#E4E7EE] p-3 text-xs">
                  <h3 className="text-sm font-bold">{source.name}</h3>
                  <p>{outcomeLabels[source.result]} · {freshnessLabels[source.freshness]}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-1">
                    <dt>Last attempt</dt><dd>{syncTime(source.lastAttemptAt)}</dd>
                    <dt>Last successful fetch</dt><dd>{syncTime(source.lastSuccessAt)}</dd>
                    <dt>Accepted records</dt><dd>{source.acceptedCount ?? "—"}</dd>
                    {source.retryAfter !== null && <><dt>Retry after</dt><dd>{syncTime(source.retryAfter)}</dd></>}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <KsuPoliceEmergencyCallout />

      {banner && (
        <div className="rounded-xl bg-[#DCFCE7] px-4 py-2.5 text-xs font-extrabold text-[#15803D]">
          {banner}
        </div>
      )}

      {/* Reported & Quarantined Items */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
          Reported &amp; Under Review Items ({queue?.items.length ?? 0})
        </h2>

        {!queue ? (
          <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 text-xs text-[#5E6675]">
            Loading moderation queue...
          </div>
        ) : queue.items.length === 0 ? (
          <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 text-xs font-semibold text-[#15803D]">
            All clear — zero open or quarantined reports in this workspace.
          </div>
        ) : (
          queue.items.map((item) => (
            <div
              key={item.targetKey}
              data-testid={`moderation-item-${item.targetType}`}
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-extrabold uppercase ${
                      item.queueStatus === "quarantined"
                        ? "bg-[#FEF3C7] text-[#B45309]"
                        : "bg-[#FEE2E2] text-[#B91C1C]"
                    }`}
                  >
                    {item.queueStatus === "quarantined"
                      ? "Under Review (Quarantined)"
                      : "Open Report"}
                  </span>
                  <span className="font-bold text-[#111317]">
                    {item.targetType.replace("_", " ").toUpperCase()}
                  </span>
                  <span className="text-[#5E6675]">
                    · {item.reporterCount} distinct reporter
                    {item.reporterCount === 1 ? "" : "s"} (
                    {item.reasons.join(", ")})
                  </span>
                </div>

                {item.author && (
                  <span className="text-xs font-bold text-[#5E6675]">
                    Author: @{item.author.handle}
                  </span>
                )}
              </div>

              <p className="mt-2.5 rounded-xl bg-[#F4F6FA] p-3 text-xs font-medium text-[#111317]">
                {item.previewText || "[Content unavailable]"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="moderation-restore-btn"
                  onClick={async () => {
                    await reviewTarget({
                      targetType: item.targetType,
                      targetId: item.targetId,
                      decision: "restore",
                    });
                    setBanner("Item restored to public visibility.");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#DCFCE7] px-3 py-2 text-xs font-extrabold text-[#15803D] hover:brightness-95"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Restore False Positive</span>
                </button>

                <button
                  type="button"
                  data-testid="moderation-remove-btn"
                  onClick={async () => {
                    await reviewTarget({
                      targetType: item.targetType,
                      targetId: item.targetId,
                      decision: "remove",
                    });
                    setBanner("Violation permanently removed.");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#FEE2E2] px-3 py-2 text-xs font-extrabold text-[#B91C1C] hover:brightness-95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove Content</span>
                </button>

                {item.author && !item.author.isRemoved && (
                  <button
                    type="button"
                    data-testid="moderation-suspend-btn"
                    onClick={async () => {
                      await reviewTarget({
                        targetType: item.targetType,
                        targetId: item.targetId,
                        decision: "suspend_student",
                      });
                      setBanner(
                        `Suspended @${item.author?.handle} and locked handle/email.`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-2 text-xs font-extrabold text-[#FDBB30]"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Suspend @{item.author.handle}</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Pending Club Officer Claims */}
      {queue && queue.officerClaims.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Pending Club Officer Claims ({queue.officerClaims.length})
          </h2>
          {queue.officerClaims.map((claim) => (
            <div
              key={String(claim.membershipId)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4E7EE] bg-white p-4"
            >
              <div className="text-xs">
                <div className="font-extrabold text-[#111317]">
                  @{claim.student.handle} ({claim.student.displayName}) →{" "}
                  {claim.club.name}
                </div>
                <div className="text-[#5E6675]">
                  {claim.club.campus} Campus · Requested manual officer review
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void reviewOfficer({
                      membershipId: claim.membershipId,
                      approve: true,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-xl bg-[#DCFCE7] px-3 py-1.5 text-xs font-extrabold text-[#15803D]"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Approve Officer</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void reviewOfficer({
                      membershipId: claim.membershipId,
                      approve: false,
                    })
                  }
                  className="rounded-xl border border-[#E4E7EE] px-3 py-1.5 text-xs font-bold text-[#5E6675]"
                >
                  Keep as Member
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Personal Blocked Students */}
      {blockedList && blockedList.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Your Blocked Students ({blockedList.length})
          </h2>
          <div className="rounded-2xl border border-[#E4E7EE] bg-white p-3">
            {blockedList.map((b) => (
              <div
                key={String(b.blockId)}
                className="flex items-center justify-between py-1.5 text-xs"
              >
                <span className="flex items-center gap-1.5 font-bold text-[#111317]">
                  <Ban className="h-3.5 w-3.5 text-[#B91C1C]" />@
                  {b.student.handle}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void toggleBlock({ targetStudentId: b.student._id })
                  }
                  className="rounded-lg border border-[#E4E7EE] px-2.5 py-1 text-[11px] font-bold text-[#5E6675]"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
