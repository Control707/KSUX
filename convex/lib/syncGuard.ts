import { sha256Hex } from "./crypto";

export interface SyncStateSnapshot {
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  consecutiveFailures: number;
  backoffUntil?: number;
  refreshInFlightUntil?: number;
  lastPayloadHash?: string;
  activeRecordCount: number;
  lastError?: string;
}

export function computeCircuitBackoffMs(consecutiveFailures: number): number | undefined {
  if (consecutiveFailures < 3) return undefined;
  if (consecutiveFailures === 3) return 15 * 60 * 1000; // 15m
  if (consecutiveFailures === 4) return 30 * 60 * 1000; // 30m
  return 60 * 60 * 1000; // capped at 60m
}

export function evaluateFailureStatePatch(
  prev: SyncStateSnapshot,
  nowMs: number,
  errorMessage: string
): Partial<SyncStateSnapshot> {
  const nextFailures = prev.consecutiveFailures + 1;
  const backoffDelta = computeCircuitBackoffMs(nextFailures);
  return {
    lastAttemptAt: nowMs,
    consecutiveFailures: nextFailures,
    backoffUntil: backoffDelta ? nowMs + backoffDelta : undefined,
    refreshInFlightUntil: undefined,
    lastError: errorMessage.slice(0, 300),
  };
}

export function isSuddenDropOrEmpty(
  previousActiveCount: number,
  incomingCount: number
): boolean {
  if (incomingCount <= 0) return true;
  if (previousActiveCount >= 5 && incomingCount < previousActiveCount * 0.2) {
    return true;
  }
  return false;
}

export async function computePayloadHash(payload: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(payload));
}

export function formatStalenessBadge(
  lastSuccessAt: number | undefined,
  nowMs: number,
  thresholdMs: number
): { isStale: boolean; label: string | null } {
  if (!lastSuccessAt) {
    return { isStale: true, label: "Cached · Sync pending" };
  }
  const ageMs = Math.max(0, nowMs - lastSuccessAt);
  if (ageMs <= thresholdMs) {
    return { isStale: false, label: null };
  }
  const mins = Math.max(1, Math.round(ageMs / 60_000));
  if (mins >= 120) {
    const hrs = Math.round(mins / 60);
    return { isStale: true, label: `Cached · Last synced ${hrs}h ago` };
  }
  return { isStale: true, label: `Cached · Last synced ${mins}m ago` };
}

export type UpstreamFetchFn = (
  url: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}>;

export async function fetchUpstreamWithRetry(
  url: string,
  init: RequestInit = {},
  fetchImpl: UpstreamFetchFn = fetch as unknown as UpstreamFetchFn,
  timeoutMs = 8000
): Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${url}`);
      }
      return resp;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Upstream fetch failed for ${url}`);
}
