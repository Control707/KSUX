import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { easternDate } from "../lib/easternDate";
import { DEMO_INCIDENT_PHOTO } from "../lib/incidentPhotos";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const demoLabel = "Demo · not real" as const;

export async function seedV2DemoStates(
  ctx: MutationCtx,
  demoSessionId: Id<"demoSessions">,
  { mayaId, jordanId, alexId, samId, taylorId }: {
    mayaId: Id<"students">; jordanId: Id<"students">; alexId: Id<"students">; samId: Id<"students">; taylorId: Id<"students">;
  },
  now: number,
) {
  const workspaceKey = "demo:" + demoSessionId;
  const photoId = await ctx.db.insert("mediaAssets", {
    workspaceKey, demoSessionId, ownerStudentId: jordanId,
    fileKey: "local-inline:demo-incident-" + demoSessionId, url: DEMO_INCIDENT_PHOTO,
    purpose: "incident", byteSize: 0, width: 192, height: 192, status: "attached",
    reviewStatus: "held", holdExpiresAt: now + 2 * day, createdAt: now,
  });
  const incident = (text: string, observedAt: number, visibility: "visible" | "under_review" = "visible", photoAssetId?: typeof photoId) =>
    ctx.db.insert("incidents", {
      workspaceKey, demoLabel, authorId: jordanId, category: "hazard", campus: "Marietta",
      buildingId: "bldg-osm-225446898", observedAt, text, nameLevel: "hidden", photoAssetId, visibility,
      publishedAt: observedAt, lockedAt: observedAt + 5 * minute,
      lastActivityAt: observedAt, updateCount: 0, purgeAt: observedAt + 30 * day,
    });
  await incident("Exercise: temporary hallway obstruction.", now - 20 * minute);
  await incident("Exercise: an older building closure.", now - 2 * day);
  const held = await incident("Exercise: an identifying detail was reported.", now - hour, "under_review");
  const redacted = await incident("Exercise: [removed by moderators]", now - 2 * hour);
  const photoPending = await incident("Exercise: a photo is awaiting review.", now - 10 * minute, "visible", photoId);
  for (const report of [
    { incidentId: held, priority: 0, reason: "identifies_me", queueStatus: "quarantined" },
    { incidentId: photoPending, priority: 1, reason: "identifies_person", queueStatus: "open" },
    { incidentId: redacted, priority: 2, reason: "false_misleading", queueStatus: "open" },
  ] as const) {
    await ctx.db.insert("moderationReports", {
      workspaceKey, reporterId: mayaId, targetType: "incident", targetKey: "incident:" + report.incidentId,
      reason: report.reason, queueStatus: report.queueStatus, priority: report.priority, createdAt: now - minute,
      notes: demoLabel,
    });
  }
  await ctx.db.insert("incidentUpdates", {
    workspaceKey, incidentId: redacted, kind: "moderator_note", authorId: alexId,
    templateId: "redaction", createdAt: now - hour, purgeAt: now + 29 * day,
  });
  const appealedIncident = await incident("Exercise: an obstruction removed for review.", now - 2 * hour);
  await ctx.db.patch(appealedIncident, { visibility: "removed" });
  const decisionActionId = await ctx.db.insert("moderatorActions", {
    workspaceKey, actorId: alexId, subjectId: jordanId, targetType: "incident", targetKey: String(appealedIncident),
    action: "remove", reasonId: "not_incident", contentSnapshot: JSON.stringify({ text: "Exercise: an obstruction removed for review.", status: "visible" }),
    snapshotPurgeAt: now + 29 * day, createdAt: now - hour, purgeAt: now + 364 * day,
  });
  await ctx.db.insert("moderatorActions", {
    workspaceKey, actorId: alexId, targetType: "incident", targetKey: String(held),
    action: "quarantine", createdAt: now - 31 * day, purgeAt: now + 334 * day,
  });
  await ctx.db.insert("appeals", {
    workspaceKey, decisionActionId, appellantId: jordanId, status: "open",
    createdAt: now - minute, purgeAt: now + 29 * day,
  });
  await ctx.db.insert("moderationNotices", { workspaceKey, studentId: jordanId, actionId: decisionActionId,
    message: "Removed: Not a campus safety incident", canAppeal: true, createdAt: now - hour, purgeAt: now + 29 * day });

  const source = (sourceKey: string, lastResult: "ok" | "quiet" | "unavailable", age: number) =>
    ctx.db.insert("alertSources", {
      workspaceKey, sourceKey, adapterKind: "html_copy", lastResult, lastAttemptAt: now - minute,
      lastSuccessAt: lastResult === "unavailable" ? undefined : now - age,
      quietText: lastResult === "quiet" ? demoLabel + " · sample quiet source" : undefined,
      killSwitch: "off", purgeAt: now + day,
    });
  const freshSource = await source("demo_ksu_timely_warnings", "ok", minute);
  const staleSource = await source("demo_ksu_stale_advisory", "ok", 30 * minute);
  await source("demo_ksu_quiet_advisory", "quiet", minute);
  await source("demo_ksu_unavailable_advisory", "unavailable", 0);
  for (const [index, state] of (["issued", "updated", "all_clear", "no_longer_listed", "issued"] as const).entries()) {
    const firstObservedAt = now - (index + 1) * hour;
    await ctx.db.insert("alertItems", {
      workspaceKey, demoLabel, sourceId: index === 4 ? staleSource : freshSource,
      itemKey: "demo-alert-" + index, category: "timely_warning", headline: demoLabel,
      excerpt: "Exercise only. No real campus incident is described.",
      officialIssuedAt: firstObservedAt, firstObservedAt, lastSeenAt: now - minute, state,
      stateChangedAt: state === "updated" ? now - 10 * minute : firstObservedAt,
      noLongerListedAt: state === "no_longer_listed" ? now - 20 * minute : undefined,
      contentHash: "demo-" + index, confirmedFetches: 2, purgeAt: now + 29 * day,
    });
  }
  const dow = new Date(easternDate(now) + "T12:00:00Z").getUTCDay();
  const weekKey = easternDate(now, -((dow + 6) % 7));
  // Seeded weekly boards (SPEC-v2 §14). Maya keeps 5 so the judge's corroborated report lands on 10.
  const seededBoards = [
    ["Kennesaw", alexId, 15], ["Kennesaw", taylorId, 10], ["Kennesaw", mayaId, 5],
    ["Marietta", samId, 20], ["Marietta", jordanId, 5],
  ] as const;
  for (const [index, [campus, studentId, amount]] of seededBoards.entries()) {
    for (let paid = 0; paid < amount / 5; paid++) {
      await ctx.db.insert("cloutEvents", {
        workspaceKey, studentId, partnerId: studentId === alexId ? mayaId : alexId, kind: "earn", amount: 5, sourceType: "parking_report",
        sourceKey: `demo-report-${index}-${paid}`, targetKey: `demo-lot-${campus}-${paid}`,
        campus, weekKey, dayKeyET: easternDate(now), createdAt: now - (paid + 1) * minute, purgeAt: now + 30 * day,
      });
    }
    await ctx.db.patch(studentId, { lifetimeClout: amount, leaderboardHidden: false });
    await ctx.db.insert("cloutWeeklyTotals", {
      workspaceKey, studentId, campus, weekKey, countedTotal: amount, heldTotal: 0, hidden: false, purgeAt: now + 84 * day,
    });
  }
  for (const campus of ["Kennesaw", "Marietta"] as const) {
    await ctx.db.insert("cloutBoardCounts", {
      workspaceKey, campus, weekKey, visibleCount: seededBoards.filter(([c]) => c === campus).length, purgeAt: now + 84 * day,
    });
  }
}
