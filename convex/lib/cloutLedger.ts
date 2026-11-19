import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { easternDate } from "./easternDate";

/**
 * The Clout ledger (SPEC-v2 §12, ADR-0010). `cloutEvents` is append-only:
 * earn · hold · release · reverse. Caps are derived from the Student's own
 * ledger rows for today; `cloutWeeklyTotals`, `cloutBoardCounts` and
 * `students.lifetimeClout` are read models kept in step with every event.
 *
 * Safety content (Incidents, Moderation Reports, the Emergency Panel) and
 * stop reports have no source type here, so they can never earn.
 */

export type CloutSourceType = Doc<"cloutEvents">["sourceType"];
type Campus = Doc<"cloutEvents">["campus"];

export const CLOUT_REPORT_POINTS = 5;
export const CLOUT_HANDOFF_POINTS = 10;
export const CLOUT_DAILY_CAP = 50;
export const CLOUT_PER_TARGET_DAILY = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_PURGE_MS = 30 * DAY_MS;
const TOTALS_PURGE_MS = 84 * DAY_MS;

/** Monday (ET) of the week containing `now`, as YYYY-MM-DD. */
export function weekKeyET(now: number): string {
  const dow = new Date(easternDate(now) + "T12:00:00Z").getUTCDay();
  return easternDate(now, -((dow + 6) % 7));
}

/** Only active, verified Students earn. Demo personas earn inside their isolated workspace. */
export function canEarnClout(student: Doc<"students"> | null | undefined, workspaceKey: string) {
  if (!student || student.workspaceKey !== workspaceKey || student.accountStatus !== "active") return false;
  return workspaceKey.startsWith("demo:") || !!student.canonicalEmail;
}

async function applyToTotals(
  ctx: MutationCtx, workspaceKey: string, student: Doc<"students">,
  campus: Campus, weekKey: string, dCounted: number, dHeld: number, now: number,
) {
  const row = await ctx.db.query("cloutWeeklyTotals").withIndex("by_student_week_campus", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("studentId", student._id).eq("weekKey", weekKey).eq("campus", campus)).unique();
  const hidden = row?.hidden ?? student.leaderboardHidden === true;
  const before = row?.countedTotal ?? 0;
  const counted = Math.max(0, before + dCounted);
  const held = Math.max(0, (row?.heldTotal ?? 0) + dHeld);
  if (row) {
    await ctx.db.patch(row._id, { countedTotal: counted, heldTotal: held });
  } else {
    await ctx.db.insert("cloutWeeklyTotals", {
      workspaceKey, studentId: student._id, campus, weekKey,
      countedTotal: counted, heldTotal: held, hidden, purgeAt: now + TOTALS_PURGE_MS,
    });
  }
  const visibleDelta = hidden ? 0 : (counted > 0 ? 1 : 0) - (before > 0 ? 1 : 0);
  if (visibleDelta === 0) return;
  const board = await ctx.db.query("cloutBoardCounts").withIndex("by_campus_week", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("campus", campus).eq("weekKey", weekKey)).unique();
  if (board) {
    await ctx.db.patch(board._id, { visibleCount: Math.max(0, board.visibleCount + visibleDelta) });
  } else if (visibleDelta > 0) {
    await ctx.db.insert("cloutBoardCounts", { workspaceKey, campus, weekKey, visibleCount: 1, purgeAt: now + TOTALS_PURGE_MS });
  }
}

async function appendEvent(
  ctx: MutationCtx, student: Doc<"students">,
  event: Omit<Doc<"cloutEvents">, "_id" | "_creationTime" | "studentId" | "purgeAt">,
) {
  await ctx.db.insert("cloutEvents", { ...event, studentId: student._id, purgeAt: event.createdAt + EVENT_PURGE_MS });
  const counted = { earn: event.amount, hold: -event.amount, release: event.amount, reverse: 0 }[event.kind];
  const held = { earn: 0, hold: event.amount, release: -event.amount, reverse: 0 }[event.kind];
  await applyToTotals(ctx, event.workspaceKey, student, event.campus, event.weekKey, counted, held, event.createdAt);
  if (event.kind === "earn" || event.kind === "release") {
    await ctx.db.patch(student._id, { lifetimeClout: (student.lifetimeClout ?? 0) + event.amount });
  } else if (event.kind === "hold") {
    await ctx.db.patch(student._id, { lifetimeClout: Math.max(0, (student.lifetimeClout ?? 0) - event.amount) });
  }
}

export type AwardResult = { paid: true } | { paid: false; reason: "ineligible" | "already_paid" | "daily_cap" | "target_cap" | "pair_cap" };

/**
 * Pays one source once (idempotent on sourceType + sourceKey + student). The
 * 50/day cap, 2 paid reports per target per day and the pair-once-per-day rule
 * are all read from today's ledger rows for this Student.
 */
export async function awardClout(ctx: MutationCtx, args: {
  workspaceKey: string; studentId: Id<"students">; partnerId?: Id<"students">;
  sourceType: CloutSourceType; sourceKey: string; targetKey: string;
  campus: Campus; amount: number; now: number; holdImmediately?: boolean;
}): Promise<AwardResult> {
  const student = await ctx.db.get(args.studentId);
  if (!canEarnClout(student, args.workspaceKey) || !student) return { paid: false, reason: "ineligible" };
  const existing = await ctx.db.query("cloutEvents").withIndex("by_source", (q) =>
    q.eq("workspaceKey", args.workspaceKey).eq("sourceType", args.sourceType).eq("sourceKey", args.sourceKey)
      .eq("studentId", student._id).eq("kind", "earn")).first();
  if (existing) return { paid: false, reason: "already_paid" };

  const dayKeyET = easternDate(args.now);
  const today = (await ctx.db.query("cloutEvents").withIndex("by_student_day", (q) =>
    q.eq("workspaceKey", args.workspaceKey).eq("studentId", student._id).eq("dayKeyET", dayKeyET)).take(200))
    .filter((row) => row.kind === "earn");
  const earnedToday = today.reduce((sum, row) => sum + row.amount, 0);
  if (earnedToday + args.amount > CLOUT_DAILY_CAP) return { paid: false, reason: "daily_cap" };
  const onTarget = today.filter((row) => row.targetKey === args.targetKey);
  if (onTarget.length >= CLOUT_PER_TARGET_DAILY) return { paid: false, reason: "target_cap" };
  if (args.partnerId && onTarget.some((row) => row.partnerId === args.partnerId)) return { paid: false, reason: "pair_cap" };

  const base = {
    workspaceKey: args.workspaceKey, amount: args.amount, sourceType: args.sourceType, sourceKey: args.sourceKey,
    targetKey: args.targetKey, partnerId: args.partnerId, campus: args.campus,
    weekKey: weekKeyET(args.now), dayKeyET, createdAt: args.now,
  };
  await appendEvent(ctx, student, { ...base, kind: "earn" });
  if (args.holdImmediately) {
    await appendEvent(ctx, (await ctx.db.get(student._id))!, { ...base, kind: "hold" });
  }
  return { paid: true };
}

type SourceState = { earn: Doc<"cloutEvents">; held: boolean; reversed: boolean };

async function sourceStates(ctx: MutationCtx, workspaceKey: string, sourceType: CloutSourceType, sourceKey: string, studentId: Id<"students">) {
  const rows = await ctx.db.query("cloutEvents").withIndex("by_source", (q) =>
    q.eq("workspaceKey", workspaceKey).eq("sourceType", sourceType).eq("sourceKey", sourceKey).eq("studentId", studentId)).take(50);
  const earn = rows.find((row) => row.kind === "earn");
  if (!earn) return null;
  const count = (kind: Doc<"cloutEvents">["kind"]) => rows.filter((row) => row.kind === kind).length;
  return { earn, held: count("hold") > count("release"), reversed: count("reverse") > 0 } satisfies SourceState;
}

/**
 * Moves one Student's payout for one source between counted, held and
 * reversed. Each transition is a new ledger row; repeats are no-ops.
 */
export async function transitionClout(ctx: MutationCtx, args: {
  workspaceKey: string; studentId: Id<"students">; sourceType: CloutSourceType; sourceKey: string;
  to: "hold" | "release" | "reverse"; now: number;
}) {
  const state = await sourceStates(ctx, args.workspaceKey, args.sourceType, args.sourceKey, args.studentId);
  if (!state || state.reversed) return false;
  if (args.to === "hold" && state.held) return false;
  if (args.to === "release" && !state.held) return false;
  const student = await ctx.db.get(args.studentId);
  if (!student || student.workspaceKey !== args.workspaceKey) return false;
  const { earn } = state;
  const base = {
    workspaceKey: args.workspaceKey, amount: earn.amount, sourceType: earn.sourceType, sourceKey: earn.sourceKey,
    targetKey: earn.targetKey, partnerId: earn.partnerId, campus: earn.campus,
    weekKey: earn.weekKey, dayKeyET: earn.dayKeyET, createdAt: args.now,
  };
  if (args.to === "reverse") {
    await ctx.db.insert("cloutEvents", { ...base, kind: "reverse", studentId: student._id, purgeAt: args.now + EVENT_PURGE_MS });
    await applyToTotals(ctx, args.workspaceKey, student, earn.campus, earn.weekKey,
      state.held ? 0 : -earn.amount, state.held ? -earn.amount : 0, args.now);
    if (!state.held) await ctx.db.patch(student._id, { lifetimeClout: Math.max(0, (student.lifetimeClout ?? 0) - earn.amount) });
    return true;
  }
  await appendEvent(ctx, student, { ...base, kind: args.to });
  return true;
}

/**
 * A Listing under review holds its seller's handoff Clout; restore or dismiss
 * releases it; removal reverses it. The buyer is the partner and keeps their
 * own payout (their content isn't the one under review).
 */
export async function moveListingHandoffClout(
  ctx: MutationCtx, listing: Doc<"listings">, to: "hold" | "release" | "reverse", now: number,
) {
  if (!listing.soldDealChatId) return;
  await transitionClout(ctx, {
    workspaceKey: listing.workspaceKey, studentId: listing.sellerId, sourceType: "handoff",
    sourceKey: String(listing.soldDealChatId), to, now,
  });
}

const ORDERED_TIERS: Record<string, readonly string[]> = {
  dining_venue: ["no_wait", "short_wait", "packed"],
  study_room: ["quiet", "moderate", "packed"],
};

/** Same or adjacent level for Line Checks and Study Room vibes. */
export function pulseLevelsAgree(targetType: "dining_venue" | "study_room", a: string, b: string) {
  const order = ORDERED_TIERS[targetType]!;
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return ia >= 0 && ib >= 0 && Math.abs(ia - ib) <= 1;
}

/**
 * Corroborates a just-filed Line Check or Study Room vibe against another
 * Student's live one on the same target in the window, and pays both.
 */
export async function corroboratePulse(ctx: MutationCtx, args: {
  workspaceKey: string; pulseId: Id<"campusPulses">; targetType: "dining_venue" | "study_room";
  targetKey: string; authorId: Id<"students">; tierValue: string; campus: Campus;
  windowMs: number; now: number; blocked: ReadonlySet<Id<"students">>;
}) {
  const candidates = await ctx.db.query("campusPulses").withIndex("by_target_active", (q) =>
    q.eq("workspaceKey", args.workspaceKey).eq("targetType", args.targetType).eq("targetKey", args.targetKey).gt("expiresAt", args.now))
    .order("desc").take(50);
  const sourceType = args.targetType === "dining_venue" ? "line_check" : "study_vibe";
  const matches = candidates.filter((pulse) => pulse._id !== args.pulseId && pulse.authorId !== args.authorId &&
    !args.blocked.has(pulse.authorId) && pulse.publishedAt >= args.now - args.windowMs && pulse.publishedAt <= args.now &&
    pulseLevelsAgree(args.targetType, pulse.tierValue, args.tierValue));
  return payBothSides(ctx, {
    workspaceKey: args.workspaceKey, sourceType, targetKey: `${args.targetType}:${args.targetKey}`, campus: args.campus,
    mine: { sourceKey: String(args.pulseId), authorId: args.authorId },
    others: matches.map((pulse) => ({ sourceKey: String(pulse._id), authorId: pulse.authorId })),
    now: args.now,
  });
}

/**
 * Pays the new report and one matching report. An unpaid match is preferred so
 * each report pays at most once; the pair rule is checked on both sides.
 */
export async function payBothSides(ctx: MutationCtx, args: {
  workspaceKey: string; sourceType: CloutSourceType; targetKey: string; campus: Campus;
  mine: { sourceKey: string; authorId: Id<"students"> };
  others: { sourceKey: string; authorId: Id<"students"> }[]; now: number;
}) {
  if (args.others.length === 0) return { corroborated: false, paidMine: false };
  const isPaid = async (other: { sourceKey: string; authorId: Id<"students"> }) => !!(await ctx.db.query("cloutEvents")
    .withIndex("by_source", (q) => q.eq("workspaceKey", args.workspaceKey).eq("sourceType", args.sourceType)
      .eq("sourceKey", other.sourceKey).eq("studentId", other.authorId).eq("kind", "earn")).first());
  let partner = args.others[0]!;
  for (const other of args.others) {
    if (!(await isPaid(other))) { partner = other; break; }
  }
  const common = { workspaceKey: args.workspaceKey, sourceType: args.sourceType, targetKey: args.targetKey,
    campus: args.campus, amount: CLOUT_REPORT_POINTS, now: args.now };
  const mine = await awardClout(ctx, { ...common, studentId: args.mine.authorId, partnerId: partner.authorId, sourceKey: args.mine.sourceKey });
  await awardClout(ctx, { ...common, studentId: partner.authorId, partnerId: args.mine.authorId, sourceKey: partner.sourceKey });
  return { corroborated: true, paidMine: mine.paid };
}
