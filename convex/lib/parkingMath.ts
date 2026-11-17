import { Doc } from "../_generated/dataModel";

export const FULLNESS_TIER_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: "Open (<60%)",
  1: "Filling (60–85%)",
  2: "Nearly Full (85–98%)",
  3: "Full (Circling)",
};

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getEasternDayAndHour(nowMs: number): {
  dayOfWeek: number;
  hourOfDay: number;
  minuteOfDay: number;
  dayName: string;
  hourLabel: string;
  priorIndex: number;
} {
  // Format in America/New_York
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(nowMs));

  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hrRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const minRaw = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const hourOfDay = hrRaw === 24 ? 0 : hrRaw;
  const dayIdx = Math.max(0, DAY_NAMES_SHORT.indexOf(wk));
  const priorIndex = dayIdx * 24 + hourOfDay;

  const ampm = hourOfDay >= 12 ? "PM" : "AM";
  const hr12 = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12;

  return {
    dayOfWeek: dayIdx,
    hourOfDay,
    minuteOfDay: hourOfDay * 60 + minRaw,
    dayName: DAY_NAMES_SHORT[dayIdx] ?? "Mon",
    hourLabel: `${hr12} ${ampm}`,
    priorIndex,
  };
}

export interface EvaluatedParkingStatus {
  effectiveTier: 0 | 1 | 2 | 3;
  tierLabel: string;
  provenanceKind: "verified_multi" | "blended_single" | "baseline_prior";
  provenanceLabel: string;
  activeReportCount: number;
  latestReportMinutesAgo?: number;
  latestDeckLevel?: string;
}

export function evaluateParkingLotFullness(
  lot: Pick<Doc<"parkingLots">, "hourlyBaselinePrior">,
  activeReports: Array<{
    authorId?: string;
    fullnessTier?: 0 | 1 | 2 | 3;
    deckLevel?: string;
    publishedAt: number;
    expiresAt: number;
    status: "active" | "cleared";
  }>,
  nowMs: number
): EvaluatedParkingStatus {
  const { dayName, hourLabel, priorIndex } = getEasternDayAndHour(nowMs);
  const priorRaw = lot.hourlyBaselinePrior[priorIndex] ?? 1;
  const priorTier = Math.max(0, Math.min(3, Math.round(priorRaw))) as
    | 0
    | 1
    | 2
    | 3;

  // Filter strictly active reports inside the 45m decay window
  const eligible = activeReports
    .filter(
      (r) =>
        r.status === "active" &&
        r.expiresAt > nowMs &&
        typeof r.fullnessTier === "number"
    )
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const seen = new Set<string>();
  const valid = eligible.filter((report) => {
    if (!report.authorId) return true;
    if (seen.has(report.authorId)) return false;
    seen.add(report.authorId);
    return true;
  });

  if (valid.length === 0) {
    return {
      effectiveTier: priorTier,
      tierLabel: FULLNESS_TIER_LABELS[priorTier],
      provenanceKind: "baseline_prior",
      provenanceLabel: `Estimated · Modeled ${dayName} ${hourLabel} baseline`,
      activeReportCount: 0,
    };
  }

  const latest = valid[0]!;
  const minsAgo = Math.max(
    1,
    Math.round((nowMs - latest.publishedAt) / 60_000)
  );

  if (valid.length === 1) {
    const blended = 0.7 * latest.fullnessTier! + 0.3 * priorTier;
    const effectiveTier = Math.max(0, Math.min(3, Math.round(blended))) as
      | 0
      | 1
      | 2
      | 3;
    return {
      effectiveTier,
      tierLabel: FULLNESS_TIER_LABELS[effectiveTier],
      provenanceKind: "blended_single",
      provenanceLabel: `Live · 1 Student report (${minsAgo}m ago)`,
      activeReportCount: 1,
      latestReportMinutesAgo: minsAgo,
      latestDeckLevel: latest.deckLevel,
    };
  }

  // >= 2 active reports: check >= 3 within 20m outlier trimming (>= 2 tiers from median)
  const recent20m = valid.filter((r) => nowMs - r.publishedAt <= 20 * 60_000);
  let working = valid;
  if (recent20m.length >= 3) {
    const sortedTiers = recent20m
      .map((r) => r.fullnessTier as number)
      .sort((a, b) => a - b);
    const mid = Math.floor(sortedTiers.length / 2);
    const median =
      sortedTiers.length % 2 === 1
        ? sortedTiers[mid]!
        : (sortedTiers[mid - 1]! + sortedTiers[mid]!) / 2;

    const outliers = recent20m.filter(
      (r) => Math.abs((r.fullnessTier as number) - median) >= 2
    );
    // Trim lone outlier(s) if a clear majority agrees
    if (outliers.length > 0 && outliers.length < recent20m.length / 2) {
      const outlierSet = new Set(outliers);
      working = valid.filter((r) => !outlierSet.has(r));
    }
  }

  // Recency-weighted average over 45m decay window
  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of working) {
    const ageMs = Math.max(0, nowMs - r.publishedAt);
    const weight = Math.max(0.2, 1 - ageMs / (45 * 60_000));
    weightedSum += (r.fullnessTier as number) * weight;
    weightTotal += weight;
  }

  const avg = weightTotal > 0 ? weightedSum / weightTotal : priorTier;
  const effectiveTier = Math.max(0, Math.min(3, Math.round(avg))) as
    | 0
    | 1
    | 2
    | 3;

  return {
    effectiveTier,
    tierLabel: FULLNESS_TIER_LABELS[effectiveTier],
    provenanceKind: "verified_multi",
    provenanceLabel: `Live · Student-verified (${minsAgo}m ago)`,
    activeReportCount: valid.length,
    latestReportMinutesAgo: minsAgo,
    latestDeckLevel: latest.deckLevel,
  };
}

export interface DiningOpenStatus {
  state: "open" | "closing_soon" | "closed" | "unknown";
  label: string;
}

export function evaluateDiningOpenStatus(
  hoursScheduleJson: string,
  nowMs: number
): DiningOpenStatus {
  const { dayOfWeek, minuteOfDay } = getEasternDayAndHour(nowMs);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  try {
    const parsed = JSON.parse(hoursScheduleJson) as {
      weekdayOpenMin?: number;
      weekdayCloseMin?: number;
      weekendOpenMin?: number | null;
      weekendCloseMin?: number | null;
      byDay?: Record<number, { openMin: number; closeMin: number } | null>;
      closedDates?: Array<{ start: string; end: string }>;
    };
    const day = easternDate(nowMs);
    if (parsed.closedDates?.some(({ start, end }) => start <= day && day <= end)) {
      return { state: "closed", label: "Closed Today" };
    }
    const published = parsed.byDay?.[dayOfWeek];
    if (published === null) return { state: "closed", label: "Closed Today" };
    const openMin = parsed.byDay ? published?.openMin
      : isWeekend ? parsed.weekendOpenMin : parsed.weekdayOpenMin;
    const closeMin = parsed.byDay ? published?.closeMin
      : isWeekend ? parsed.weekendCloseMin : parsed.weekdayCloseMin;
    if (openMin === null && closeMin === null) {
      return { state: "closed", label: "Closed Today" };
    }
    if (typeof openMin !== "number" || typeof closeMin !== "number" ||
        !Number.isInteger(openMin) || !Number.isInteger(closeMin) ||
        openMin < 0 || closeMin > 1440 || closeMin <= openMin) {
      return { state: "unknown", label: "Hours unavailable" };
    }
    if (minuteOfDay < openMin || minuteOfDay >= closeMin) {
      const openHr = Math.floor(openMin / 60);
      const openM = openMin % 60;
      const ampm = openHr >= 12 ? "PM" : "AM";
      const hr12 = openHr % 12 === 0 ? 12 : openHr % 12;
      const minStr = openM > 0 ? `:${String(openM).padStart(2, "0")}` : "";
      return {
        state: "closed",
        label:
          minuteOfDay < openMin
            ? `Closed · Opens ${hr12}${minStr} ${ampm}`
            : "Closed for Evening",
      };
    }
    const minsLeft = closeMin - minuteOfDay;
    if (minsLeft <= 45) {
      return {
        state: "closing_soon",
        label: `Closing in ${minsLeft}m`,
      };
    }
    return {
      state: "open",
      label: "Open Now",
    };
  } catch {
    return { state: "unknown", label: "Hours unavailable" };
  }
}
import { easternDate } from "./easternDate";
