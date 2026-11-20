"use client";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { useViewerClient } from "@/lib/viewerClient";

// HTTP requests fail when disconnected; unlike the reactive mutation client,
// they never persist a write for automatic replay on reconnect.
const client = () => {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210", {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) }),
  });
};
type AuthKeys = "sessionToken" | "demoShortCode" | "demoPersonaHandle";
export function useIncidentMutation<M extends FunctionReference<"mutation", "public">>(ref: M) {
  const { authArgs } = useViewerClient();
  const functionName = getFunctionName(ref);
  return useCallback(async (args: Omit<FunctionArgs<M>, AuthKeys>): Promise<FunctionReturnType<M>> => {
    if (!navigator.onLine) throw new Error("Not posted — reconnect to submit");
    if (!authArgs) throw new Error("Sign in to contribute an Incident.");
    const result = await client().mutation(makeFunctionReference<"mutation">(functionName) as M, { ...args, ...authArgs } as FunctionArgs<M>);
    window.dispatchEvent(new Event("owlside-incidents-changed"));
    return result;
  }, [functionName, authArgs]);
}

/** Network-only: each mounted view starts empty. Offline unmounts it. Every
 * reconnect mounts a fresh view, so an old subscription value cannot flash. */
export function useIncidentRead<Q extends FunctionReference<"query", "public">>(ref: Q, args: Omit<FunctionArgs<Q>, AuthKeys>) {
  const { authArgs } = useViewerClient();
  const functionName = getFunctionName(ref);
  const key = JSON.stringify({ ...args, ...authArgs });
  const [state, setState] = useState<{ key: string; data?: FunctionReturnType<Q>; error?: string }>({ key });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!authArgs || !navigator.onLine) return;
    const version = ++generation.current;
    try {
      const data = await client().query(makeFunctionReference<"query">(functionName) as Q, JSON.parse(key));
      if (generation.current === version) setState({ key, data });
    } catch {
      if (generation.current === version) setState({ key, error: "Can’t load current Incidents. Retry connection." });
    }
  }, [key, functionName, authArgs]);
  useEffect(() => {
    void refresh();
    const tick = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    const changed = () => { void refresh(); };
    window.addEventListener("owlside-incidents-changed", changed);
    window.addEventListener("focus", changed);
    return () => { ++generation.current; clearInterval(tick); window.removeEventListener("owlside-incidents-changed", changed); window.removeEventListener("focus", changed); };
  }, [refresh]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, refresh };
}

export function incidentError(error: unknown) {
  const data = (error as { data?: { message?: string } })?.data;
  return data?.message ?? (error instanceof Error ? error.message : "Couldn’t send. Please try again.");
}
