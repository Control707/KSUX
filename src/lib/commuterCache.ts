import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export const COMMUTER_CACHE_STORAGE_KEY = "ksux_commuter_cache";

export type CommuterScope =
  | { mode: "student"; studentId: string; expiresAt: number }
  | { mode: "demo"; shortCode: string; persona: string };

type Hud = FunctionReturnType<typeof api.shell.getNowHud>;
type Snapshot = Pick<Hud, "campusFilter" | "schedule"> & { savedAt: number };
type StoredSnapshot = { scope: CommuterScope; snapshot: Snapshot };

function storageKey(scope: CommuterScope) {
  return scope.mode === "student"
    ? COMMUTER_CACHE_STORAGE_KEY
    : `${COMMUTER_CACHE_STORAGE_KEY}:demo:${scope.shortCode}:${scope.persona}`;
}

function readRecord(storage: Storage, key: string): StoredSnapshot | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "null") as StoredSnapshot | null;
    const snapshot = value?.snapshot;
    if (!value?.scope || !snapshot || !Number.isFinite(snapshot.savedAt) ||
        !["Kennesaw", "Marietta", "All KSU"].includes(snapshot.campusFilter) ||
        !Array.isArray(snapshot.schedule?.enrolledCourses) ||
        !Array.isArray(snapshot.schedule?.personalDeadlines)) return null;
    return {
      ...value,
      snapshot: {
        ...snapshot,
        schedule: {
          ...snapshot.schedule,
          privateClasses: Array.isArray(snapshot.schedule.privateClasses) ? snapshot.schedule.privateClasses : [],
        },
      },
    };
  } catch {
    return null;
  }
}

export function readCachedStudentScope(): CommuterScope | null {
  try {
    const value = readRecord(window.localStorage, COMMUTER_CACHE_STORAGE_KEY);
    if (value?.scope.mode === "student" && typeof value.scope.studentId === "string" &&
        Number.isFinite(value.scope.expiresAt) && value.scope.expiresAt > Date.now()) {
      return value.scope;
    }
  } catch {
    // Storage may be disabled.
  }
  return null;
}

export function readCommuterSnapshot(scope: CommuterScope): Snapshot | null {
  try {
    const storage = scope.mode === "student" ? window.localStorage : window.sessionStorage;
    const value = readRecord(storage, storageKey(scope));
    if (scope.mode === "student" && value?.scope.mode === "student" &&
        scope.studentId === value.scope.studentId && value.scope.expiresAt > Date.now()) {
      return value.snapshot;
    }
    if (scope.mode === "demo" && value?.scope.mode === "demo" &&
        scope.shortCode === value.scope.shortCode && scope.persona === value.scope.persona) {
      return value.snapshot;
    }
  } catch {
    // Storage may be disabled.
  }
  return null;
}

export function saveCommuterSnapshot(scope: CommuterScope, hud: Pick<Hud, "campusFilter" | "schedule">): void {
  const snapshot = { savedAt: Date.now(), campusFilter: hud.campusFilter, schedule: hud.schedule };
  try {
    const storage = scope.mode === "student" ? window.localStorage : window.sessionStorage;
    storage.setItem(storageKey(scope), JSON.stringify({ scope, snapshot }));
  } catch {
    // The home view remains usable when storage is unavailable.
  }
}

export function clearCommuterCache(mode: "student" | "demo" | "all" = "all"): void {
  if (mode !== "demo") {
    try {
      window.localStorage.removeItem(COMMUTER_CACHE_STORAGE_KEY);
    } catch {
      // Storage may be disabled.
    }
  }
  if (mode !== "student") {
    try {
      const storage = window.sessionStorage;
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (key?.startsWith(`${COMMUTER_CACHE_STORAGE_KEY}:demo:`)) storage.removeItem(key);
      }
    } catch {
      // Storage may be disabled.
    }
  }
}
