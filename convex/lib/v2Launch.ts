import type { GenericDatabaseReader } from "convex/server";
import type { GenericId } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema";

const monthlyBudgetBytes = 1_000_000_000;
const sampleFreshnessMs = 7 * 24 * 60 * 60_000;
export const v2IoShapes = [
  { key: "alertSourceStatus", label: "Alert source status" },
  { key: "activeIncidents", label: "Active Incidents (list and map)" },
  { key: "olderIncidents", label: "Older Incidents" },
  { key: "incidentDetail", label: "Incident detail and Updates" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "other", label: "Other v2 reads and writes" },
] as const;

export function projectMonthlyV2Io(raw: string | undefined, now = Date.now()) {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const sample = value as { days?: number; measuredAt?: string; bytes?: Record<string, unknown> };
  if (typeof sample.days !== "number" || !Number.isFinite(sample.days) || sample.days < 1 || sample.days > 31
    || typeof sample.measuredAt !== "string" || !sample.bytes || typeof sample.bytes !== "object") return null;
  const measuredAt = Date.parse(sample.measuredAt);
  if (!Number.isFinite(measuredAt) || measuredAt > now) return null;
  const shapes = [];
  for (const { key, label } of v2IoShapes) {
    const bytes = sample.bytes[key];
    if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) return null;
    shapes.push({ key, label, projectedBytes: Math.round(bytes * 30 / sample.days) });
  }
  const projectedBytes = shapes.reduce((sum, row) => sum + row.projectedBytes, 0);
  const ratio = projectedBytes / monthlyBudgetBytes;
  return {
    measuredAt, sampleDays: sample.days, projectedBytes, monthlyBudgetBytes, shapes,
    stale: now - measuredAt > sampleFreshnessMs,
    band: ratio >= 0.7 ? "over_70" as const : ratio >= 0.5 ? "over_50" as const : "under_50" as const,
  };
}

type AppointmentDb = GenericDatabaseReader<{
  moderators: {
    document: {
      _id: GenericId<"moderators">; _creationTime: number; workspaceKey: "prod";
      studentId: GenericId<"students">; isCsa: boolean; csaStatement: string;
      appointedAt: number; revokedAt?: number; purgeAt?: number;
    };
    fieldPaths: "_id" | "_creationTime" | "workspaceKey" | "studentId" | "isCsa" | "csaStatement" | "appointedAt" | "revokedAt" | "purgeAt";
    indexes: { by_revoked: ["workspaceKey", "revokedAt", "_creationTime"] };
    searchIndexes: Record<never, never>;
    vectorIndexes: Record<never, never>;
  };
}>;

async function appointedModerators(db: QueryCtx["db"]) {
  // #84 introduces this table on a separate branch. Until deployed, the gate is closed.
  if (!Object.hasOwn(schema.tables, "moderators")) return 0;
  const roster = (db as unknown as AppointmentDb)
    .query("moderators").withIndex("by_revoked", (q) => q.eq("workspaceKey", "prod").eq("revokedAt", undefined));
  const now = Date.now();
  const qualified = new Set();
  // Stream the indexed roster: an arbitrary first-N cutoff can hide eligible appointees.
  for await (const row of roster) {
    if (row.isCsa !== false || typeof row.csaStatement !== "string" || !row.csaStatement.trim()
      || !Number.isFinite(row.appointedAt) || row.appointedAt > now
      || (row.purgeAt !== undefined && row.purgeAt <= now)) continue;
    const studentId = db.normalizeId("students", row.studentId);
    const student = studentId ? await db.get(studentId) : null;
    // §8 excludes Faculty · Staff and unverified profiles, even with a roster row.
    if (student?.workspaceKey === "prod" && student.accountStatus === "active"
      && student.emailDomainBadge === "verified_student"
      && student.canonicalEmail?.endsWith("@students.kennesaw.edu")) qualified.add(student._id);
  }
  return qualified.size;
}

export function incidentPostingIsReady(requested: boolean, opsChecklistDone: boolean, moderatorCount: number) {
  return requested && opsChecklistDone && moderatorCount >= 2;
}

export async function getIncidentLaunchGate(db: QueryCtx["db"], mode: "student" | "demo") {
  if (mode === "demo") return { postingEnabled: true };
  const moderatorCount = await appointedModerators(db);
  const opsChecklistDone = process.env.KSUX_V2_MODERATOR_OPS_COMPLETE === "true";
  const requested = process.env.KSUX_V2_INCIDENT_POSTING === "true";
  return { postingEnabled: incidentPostingIsReady(requested, opsChecklistDone, moderatorCount), moderatorCount, opsChecklistDone, requested };
}

/** SPEC-v2 §13 gate 2(a): at least 14 measured days of P0 and a projection under 50 % of 1 GB. */
export const LEADERBOARD_MIN_SAMPLE_DAYS = 14;

export type LeaderboardGate =
  | { open: true }
  | { open: false; reason: "no_measurement" | "stale_measurement" | "too_few_days" | "over_budget" };

export function leaderboardGateFromSample(raw: string | undefined, now = Date.now()): LeaderboardGate {
  const io = projectMonthlyV2Io(raw, now);
  if (!io) return { open: false, reason: "no_measurement" };
  if (io.stale) return { open: false, reason: "stale_measurement" };
  if (io.sampleDays < LEADERBOARD_MIN_SAMPLE_DAYS) return { open: false, reason: "too_few_days" };
  if (io.band !== "under_50") return { open: false, reason: "over_budget" };
  return { open: true };
}

/** Demo always shows its seeded boards; prod follows the measured I/O gate. */
export function getLeaderboardGate(mode: "student" | "demo", now = Date.now()): LeaderboardGate {
  if (mode === "demo") return { open: true };
  return leaderboardGateFromSample(process.env.KSUX_V2_DB_IO_SAMPLE, now);
}
