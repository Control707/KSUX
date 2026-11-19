/** Pure helpers for the Transit screen (no React). */

/** A bus is stale after 36 s with no Passio update (3 missed 12 s polls). */
export const BUS_STALE_MS = 36_000;
export const BROWSER_POLL_MS = 12_000;
export const YOUR_STOP_STORAGE_KEY = "ksux_your_stop";

export type StopReportKind = "stop_clear" | "long_line" | "bus_passed_full";

export const STOP_REPORTS: readonly { kind: StopReportKind; label: string; glyph: string }[] = [
  { kind: "stop_clear", label: "No line", glyph: "✓" },
  { kind: "long_line", label: "Long line", glyph: "⋯" },
  { kind: "bus_passed_full", label: "Passed full", glyph: "⊘" },
];

/** Rough headways (minutes) for the "~N min · schedule" estimate when GPS is stale. */
export const HEADWAY_MINUTES: Record<string, number> = {
  KM: 20, KL: 10, ML: 12, BS: 15, WC: 15, CP: 20, SS: 20, EC: 12, SH: 10, KS: 30, MS: 30,
};
export const headwayFor = (code: string) => HEADWAY_MINUTES[code] ?? 15;

export function readYourStop(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(YOUR_STOP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeYourStop(stopId: string) {
  try {
    window.localStorage.setItem(YOUR_STOP_STORAGE_KEY, stopId);
    window.dispatchEvent(new StorageEvent("storage", { key: YOUR_STOP_STORAGE_KEY, newValue: stopId }));
  } catch {
    // storage unavailable (private mode); the choice lasts for this view only
  }
}

export type Arrival =
  | { kind: "live"; minutes: number; text: string; sr: string }
  | { kind: "schedule"; minutes: number; text: string; sr: string }
  | { kind: "not-today"; text: string; sr: string }
  | { kind: "none"; text: string; sr: string };

/** Arrival text for one route at one stop, following the stale rule. */
export function arrivalFor(opts: {
  code: string;
  routeName: string;
  liveMinutes: number | null;
  stale: boolean;
  runsToday: boolean;
  runDaysLabel: string | null;
}): Arrival {
  const { code, routeName, liveMinutes, stale, runsToday, runDaysLabel } = opts;
  if (!runsToday && runDaysLabel) {
    return {
      kind: "not-today",
      text: `Not today · runs ${runDaysLabel}`,
      sr: `${code} ${routeName} does not run today. It runs ${runDaysLabel}.`,
    };
  }
  if (liveMinutes === null || stale) {
    const h = headwayFor(code);
    return {
      kind: "schedule",
      minutes: liveMinutes ?? h,
      text: `~${liveMinutes ?? h} min · schedule`,
      sr: `${code} ${routeName}: no live bus position. About ${liveMinutes ?? h} minutes by the schedule.`,
    };
  }
  if (liveMinutes <= 1) {
    return { kind: "live", minutes: liveMinutes, text: "Now · live", sr: `${code} ${routeName}: arriving now, live GPS.` };
  }
  return {
    kind: "live",
    minutes: liveMinutes,
    text: `${liveMinutes} min · live`,
    sr: `${code} ${routeName}: ${liveMinutes} minutes, live GPS.`,
  };
}

function meters(a: [number, number], b: [number, number]) {
  const R = 6371e3;
  const t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t;
  const dLng = (b[0] - a[0]) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Place a bus between two consecutive stops of a route (by stop sequence).
 * Returns the index of the stop the bus is heading to, or null when the bus is
 * not near the route's stop line.
 */
export function placeBusBetweenStops(
  stops: { latitude: number; longitude: number }[],
  bus: { latitude: number; longitude: number },
): number | null {
  if (stops.length < 2) return null;
  const p: [number, number] = [bus.longitude, bus.latitude];
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < stops.length; i++) {
    const a: [number, number] = [stops[i]!.longitude, stops[i]!.latitude];
    const b: [number, number] = [stops[(i + 1) % stops.length]!.longitude, stops[(i + 1) % stops.length]!.latitude];
    // Detour metric: how far off the straight segment the bus is.
    const detour = meters(a, p) + meters(p, b) - meters(a, b);
    if (!best || detour < best.distance) best = { index: (i + 1) % stops.length, distance: detour };
  }
  // A bus sitting exactly on a stop heads to the next one.
  for (let i = 0; i < stops.length; i++) {
    if (meters([stops[i]!.longitude, stops[i]!.latitude], p) < 25) return (i + 1) % stops.length;
  }
  return best && best.distance < 1500 ? best.index : null;
}

export function minutesAgo(ms: number, now: number) {
  return Math.max(1, Math.round((now - ms) / 60_000));
}

export function formatClock(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
