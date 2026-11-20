"use client";
import React, { useEffect, useState } from "react";
import { useViewerClient } from "@/lib/viewerClient";
import { useOnline } from "./useOnline";

/** Bytes live only in the mounted view. POST responses bypass HTTP/SW caches;
 * object URLs are revoked on hide, identity change or disconnect. */
export function IncidentPhoto({ incidentId, review = false, blurred = false }: { incidentId: string; review?: boolean; blurred?: boolean }) {
  const { authArgs } = useViewerClient();
  const { online, reconnectedAt } = useOnline();
  const key = JSON.stringify({ ...authArgs, incidentId, review, blurred, reconnectedAt });
  const [state, setState] = useState<{ key: string; url?: string; error?: boolean }>({ key });
  useEffect(() => {
    if (!authArgs || !online) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authArgs.demoShortCode) {
      headers["x-owlside-demo-session"] = authArgs.demoShortCode;
      headers["x-owlside-demo-persona"] = authArgs.demoPersonaHandle!;
    }
    void fetch("/api/incident-photo", { method: "POST", headers, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ incidentId, review }), signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Unavailable"); return response.blob(); })
      .then((blob) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setState({ key, url: objectUrl }); } })
      .catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, authArgs, online, incidentId, review]);
  if (!online) return null;
  return state.key === key && state.url
    ? <figure><img src={state.url} alt={review ? "Held Incident photo for Moderator review" : "Moderator-approved Incident photo"} className="max-h-80 max-w-full rounded-[var(--r-md)]" />{blurred && <figcaption>Whole-photo blur applied</figcaption>}</figure>
    : <p role="status">{state.key === key && state.error ? "Photo unavailable. Refresh to retry." : "Loading photo…"}</p>;
}
