"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { INCIDENT_CATEGORIES, INCIDENT_REASONS, incidentTextError } from "@convex/lib/incidentPolicy";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { CampusSwitcher } from "@/components/shell/CampusSwitcher";
import { CampusGeoMap } from "@/components/map/CampusGeoMap";
import type { MapListItem } from "@/components/map/mapFeatures";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { EmergencyPanel } from "./EmergencyPanel";
import { useSafetyMode } from "./useSafetyMode";
import { useOnline } from "./useOnline";
import { OFFLINE_INCIDENTS } from "./safetyContent";
import { incidentError, useIncidentMutation, useIncidentRead } from "./incidentClient";
import { incidentButton, incidentField } from "./IncidentForm";
import { IncidentPhoto } from "./IncidentPhoto";

type Incident = FunctionReturnType<typeof api.incidents.activeIncidents>[number];
const date = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(ms) + " Eastern";

function IncidentCard({ incident, details = false }: { incident: Incident; details?: boolean }) {
  const cat = INCIDENT_CATEGORIES[incident.category];
  return <article className="space-y-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)]" data-testid="incident-card" data-incident-id={incident._id}>
    <p className="font-bold">{cat.shape} {cat.label} · {incident.campus} · {incident.state}</p>
    <h3 className="font-display text-[length:var(--fs-lg)] font-bold">{incident.buildingName}</h3>
    {incident.areaDetail && <p>{incident.areaDetail}</p>}
    <p>Seen {date(incident.observedAt)} (claimed)</p>
    <p className="whitespace-pre-wrap">{incident.text}</p>
    {incident.photo && <IncidentPhoto incidentId={incident._id} blurred={incident.photo.blurred} />}
    {incident.updates.length > 0 && <ol className="space-y-[var(--sp-2)] border-l-2 border-[var(--line-strong)] pl-[var(--sp-3)]" aria-label="Incident Updates">
      {incident.updates.map((update) => <li key={update._id}><p className="font-bold">{update.kind === "author_update" ? "Author Update" : "Moderator note"} · {date(update.createdAt)}</p><p>{update.text} {update.href && <Link href={update.href}>View linked source</Link>}</p></li>)}
    </ol>}
    <p className="text-[length:var(--fs-sm)]">Community report · not verified · {incident.authorLabel}</p>
    <p className="text-[length:var(--fs-sm)]">Posted {date(incident.publishedAt)} · Updated {date(incident.lastActivityAt)}</p>
    {incident.demoLabel && <p className="font-bold">{incident.demoLabel}</p>}
    {!details && <Link className={incidentButton + " inline-flex items-center"} href={`/safety/${incident._id}`}>Details</Link>}
    <IncidentActions incident={incident} details={details} />
  </article>;
}

function IncidentActions({ incident, details }: { incident: Incident; details: boolean }) {
  const mode = useSafetyMode();
  const { toast } = useAnnouncer();
  const report = useIncidentMutation(api.incidents.report);
  const edit = useIncidentMutation(api.incidents.edit);
  const addUpdate = useIncidentMutation(api.incidents.addUpdate);
  const deleteOwn = useIncidentMutation(api.incidents.deleteOwn);
  const [action, setAction] = useState<"report" | "edit" | "update" | "delete" | null>(null);
  const [reason, setReason] = useState<keyof typeof INCIDENT_REASONS | "">("");
  const [panel, setPanel] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reportContent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (action !== "report") return;
    const target = reportContent.current?.querySelector<HTMLElement>(panel ? "h2" : "select");
    if (panel) target?.setAttribute("tabindex", "-1");
    target?.focus();
  }, [action, panel]);
  async function send() {
    if (busy) return;
    const problem = action === "edit" || action === "update" ? incidentTextError(text) : null;
    if (problem) { setError(problem); return; }
    if (action === "report" && (!reason || (reason === "campus_safety" && !acknowledged))) { setError("Choose a reason and read the Emergency Panel for Campus Safety."); return; }
    setBusy(true);
    try {
      if (action === "report") await report({ incidentId: incident._id, reason: reason as keyof typeof INCIDENT_REASONS, emergencyPanelAcknowledged: acknowledged });
      if (action === "edit") await edit({ incidentId: incident._id, text });
      if (action === "update") await addUpdate({ incidentId: incident._id, text });
      if (action === "delete") await deleteOwn({ incidentId: incident._id });
      toast({ message: action === "report" ? "Sent to OwlSide moderators. This did not contact police." : action === "delete" ? "Deleted by author" : "Incident updated" });
      setAction(null); setText("");
    } catch (e) { setError(incidentError(e)); } finally { setBusy(false); }
  }
  function open(next: typeof action) { setAction(next); setError(""); setReason(""); setAcknowledged(false); setText(next === "edit" ? incident.text : ""); }
  return <>
    <div className="flex flex-wrap gap-[var(--sp-2)]">
      {!incident.isAuthor && <button type="button" className={incidentButton} onClick={() => open("report")}>Report to OwlSide moderators</button>}
      {!incident.isAuthor && details && <button type="button" className={incidentButton} onClick={() => { open("report"); setReason("identifies_me"); }}>This post identifies me</button>}
      {incident.isAuthor && details && <>
        {incident.canEdit && <button type="button" className={incidentButton} onClick={() => open("edit")}>Edit original (5-minute window)</button>}
        <button type="button" className={incidentButton} disabled={incident.updateCount >= 5} onClick={() => open("update")}>Add an update ({incident.updateCount}/5)</button>
        <button type="button" className={incidentButton} onClick={() => open("delete")}>Delete my post</button>
        <p>Original locks at {date(incident.lockedAt)}. Corrections after that are dated Incident Updates.</p>
      </>}
    </div>
    <Dialog open={action !== null} onClose={() => { if (!busy) { if (panel) { setPanel(false); setReason(""); } else setAction(null); } }} role={action === "delete" ? "alertdialog" : "dialog"}
      title={panel ? "Campus Safety Moderation Report" : action === "report" ? "Report to OwlSide moderators" : action === "edit" ? "Edit original" : action === "delete" ? "Delete my post?" : "Add an Incident Update"} hideTitle={panel}>
      <div ref={reportContent} className="space-y-[var(--sp-3)]">
        {panel ? <EmergencyPanel mode={mode} headingLevel={2} onContinue={() => { setPanel(false); setAcknowledged(true); }} /> : <>
        {action === "report" && <>
          <p>This reports the post to OwlSide volunteer moderators. It does not contact police. Moderators aren’t on call.</p>
          <label className="block">Reason<select aria-label="Reason" className={incidentField} value={reason} onChange={(e) => {
            const value = e.target.value as typeof reason; setReason(value); setAcknowledged(false);
            if (value === "campus_safety") setPanel(true);
          }}><option value="">Choose reason</option>{Object.entries(INCIDENT_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </>}
        {(action === "edit" || action === "update") && <label className="block">Text<textarea aria-label="Text" rows={5} className={incidentField} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} />{text.length}/280</label>}
        {action === "delete" && <p>Your text, location, photo and Updates will be deleted now. A “Deleted by author” link remains.</p>}
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-[var(--sp-2)]">
          <button type="button" className={incidentButton} disabled={busy} onClick={() => setAction(null)}>Cancel</button>
          <button type="button" className={incidentButton} disabled={busy || (reason === "campus_safety" && !acknowledged)} onClick={() => void send()}>{busy ? "Sending…" : action === "report" ? "Send to OwlSide moderators" : action === "delete" ? "Delete now" : "Save"}</button>
        </div>
        </>}
      </div>
    </Dialog>
  </>;
}

export function IncidentRegion({ online, reconnectedAt }: { online: boolean; reconnectedAt: number | null }) {
  const { auth, authArgs } = useViewerClient();
  return <section aria-labelledby="community-incidents" className="space-y-[var(--sp-3)]">
    <h2 id="community-incidents" className="font-display text-[length:var(--fs-xl)] font-bold">Community Incidents</h2>
    {!online ? <div data-testid="offline-incidents"><p className="font-bold">{OFFLINE_INCIDENTS}</p><p>Reconnect to see current reports. Saved schedules and campus maps may still be available elsewhere in OwlSide.</p></div>
      : authArgs ? <IncidentList key={JSON.stringify(authArgs) + reconnectedAt} />
        : <p>{auth.status === "booting" ? "Connecting…" : "Sign in or enter Judge Demo Mode from OwlSide to read community Incidents. Emergency contacts remain available above."}</p>}
  </section>;
}

function IncidentList() {
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const campus = summary?.viewer.activeCampusFilter === "Marietta" ? "Marietta" : "Kennesaw";
  return <><CampusSwitcher label="Incident Campus" /><CampusIncidents key={campus} campus={campus} /></>;
}
function CampusIncidents({ campus }: { campus: "Kennesaw" | "Marietta" }) {
  const { data, error, refresh } = useIncidentRead(api.incidents.activeIncidents, { campus });
  const [selected, setSelected] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const pins = useMemo<MapListItem[]>(() => (data ?? []).filter((r) => r.latitude !== undefined && r.longitude !== undefined)
    .slice().sort((a, b) => Number(b._id === selected) - Number(a._id === selected)).map((r) => {
      const lng = r.longitude!, lat = r.latitude!, size = 0.00013;
      const cat = INCIDENT_CATEGORIES[r.category];
      const points = r.category === "fire" ? [[lng, lat + size], [lng + size, lat - size], [lng - size, lat - size], [lng, lat + size]]
        : r.category === "hazard" ? [[lng, lat + size], [lng + size, lat], [lng, lat - size], [lng - size, lat], [lng, lat + size]]
          : [[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]];
      return { id: "incident:" + r._id, key: r._id, kind: "incident", name: r.buildingName, campus: r.campus,
        code: cat.shape, detail: cat.label + (Date.now() - r.lastActivityAt > 2 * 3600_000 ? " · dashed edge · updated over 2 hours ago" : " · solid edge · updated within 2 hours"),
        stale: Date.now() - r.lastActivityAt > 2 * 3600_000, center: [lng, lat], bbox: [lng - size, lat - size, lng + size, lat + size],
        geometry: { type: "Polygon", coordinates: [points] } };
    }), [data, selected]);
  return <div className="space-y-[var(--sp-3)]">
    <p role="status">{error ?? (data ? "Updated just now" : "Back online · checking for updates…")}</p>
    <button type="button" className={incidentButton} onClick={() => void refresh()}>Retry connection / Refresh Incidents</button>
    {data && <>
      <p>Community report · not verified. Active means posted within 24 hours. Solid edge: updated within 2 hours; dashed: older update.</p>
      {data.length === 0 ? <p>No community reports to display for this Campus. This doesn’t tell you whether campus is safe.</p> :
        <CampusGeoMap campusFilter={campus} title={`${campus} community Incidents · not verified`} showPlaceSearch={false}
          incidentItems={pins} selectedItemId={selected ? "incident:" + selected : null} onSelectIncidentId={setSelected}
          renderIncidentCard={(id) => { const row = data.find((r) => r._id === id); return row ? <IncidentCard incident={row} /> : null; }} />}
      <button type="button" aria-expanded={older} className={incidentButton} onClick={() => setOlder(!older)}>Older Incidents</button>
      {older && <OlderIncidents campus={campus} />}
    </>}
  </div>;
}
function OlderIncidents({ campus }: { campus: "Kennesaw" | "Marietta" }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1]!;
  const { data, error, refresh } = useIncidentRead(api.incidents.olderIncidents, { campus, paginationOpts: { numItems: 20, cursor } });
  return <div className="space-y-[var(--sp-3)]">
    <p>Removed from the map after 24 h. That is its age, not a resolution. Hidden from Students after 7 days.</p>
    {error && <p role="alert">{error}<button className={incidentButton} onClick={() => void refresh()}>Retry</button></p>}
    {data?.page.map((incident) => <IncidentCard key={incident._id} incident={incident} />)}
    {data?.page.length === 0 && <p>No Older Incidents to display.</p>}
    <div className="flex flex-wrap gap-[var(--sp-2)]">
      {cursors.length > 1 && <button className={incidentButton} onClick={() => setCursors(cursors.slice(0, -1))}>Previous 20</button>}
      {data && !data.isDone && <button className={incidentButton} onClick={() => setCursors([...cursors, data.continueCursor])}>Next 20</button>}
    </div>
  </div>;
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const { online, reconnectedAt } = useOnline();
  const { authArgs } = useViewerClient();
  return <>
    <h1 className="font-display text-[length:var(--fs-2xl)] font-bold">Community Incident</h1>
    {!online ? <p role="status" data-testid="offline-incidents">{OFFLINE_INCIDENTS} Reconnect to load current reports.</p>
      : authArgs ? <NetworkDetail key={JSON.stringify(authArgs) + reconnectedAt + incidentId} incidentId={incidentId} />
        : <p>Sign in or enter Judge Demo Mode from OwlSide to read this Incident.</p>}
    <Link className={incidentButton + " inline-flex items-center"} href="/safety">Back to Safety</Link>
  </>;
}
function NetworkDetail({ incidentId }: { incidentId: string }) {
  const { data, error, refresh } = useIncidentRead(api.incidents.incidentDetail, { incidentId });
  const { announce } = useAnnouncer();
  const state = data?.state;
  React.useEffect(() => {
    if (state) announce(state === "visible" ? "Incident updated from the server" : state === "under_review" ? "Under review. Community text hidden." : state === "deleted" ? "Deleted by author" : state === "removed" ? "Removed by OwlSide moderators" : "Incident no longer available");
  }, [state, announce]);
  return <div className="space-y-[var(--sp-3)]">
    <p role="status">{error ?? (data ? "Updated just now" : "Back online · checking for updates…")}</p>
    <button className={incidentButton} onClick={() => void refresh()}>Retry connection / Refresh Incident</button>
    {data?.state === "visible" && <IncidentCard incident={data.incident} details />}
    {data && data.state !== "visible" && <p className="font-bold" data-testid="incident-tombstone">{data.state === "under_review" ? "Under review" : data.state === "removed" ? "Removed by OwlSide moderators" : data.state === "deleted" ? "Deleted by author" : "Incident no longer available"}</p>}
    {data?.state === "removed" && data.reason && <p>Reason: {data.reason}</p>}
  </div>;
}
