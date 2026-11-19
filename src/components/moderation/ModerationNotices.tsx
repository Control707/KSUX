"use client";
import React, { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useIncidentMutation, incidentError } from "@/components/safety/incidentClient";
import { modButton, modCard, modField, modDate } from "./consoleUi";

export function ModerationNotices() {
  const { authArgs } = useViewerClient();
  return <Notices key={JSON.stringify(authArgs)} />;
}
function Notices() {
  const rows = useViewerQuery(api.moderatorConsole.myNotices, {});
  const appeal = useIncidentMutation(api.moderatorConsole.submitAppeal);
  const [decision, setDecision] = useState<Id<"moderatorActions"> | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  const { toast, announce } = useAnnouncer();
  return <div className="space-y-4 p-4 [overflow-wrap:anywhere]">
    <h1 className="font-display text-2xl font-bold">Moderation notices and Appeals</h1><p>These notices are private and in-app only. One Appeal per decision, reviewed by a different Moderator. No push is sent.</p>
    {!rows ? <p role="status">Loading notices…</p> : !rows.length ? <p>No moderation notices.</p> : <ul className="space-y-3">{rows.map((n) => <li key={n._id} className={modCard}><p className="font-bold">{n.message}</p><p>{modDate(n.createdAt)}</p>
      {n.targetType === "incident" && <Link className={modButton} href={`/safety/${n.targetKey}`}>Incident details</Link>}
      {n.appealStatus && <p>Appeal: {n.appealStatus === "open" ? "Open" : n.appealStatus === "upheld" ? "Decision upheld" : "Decision reversed"}</p>}
      {n.canAppeal && <button className={modButton} onClick={() => { setDecision(n.actionId); setText(""); setError(""); }}>Appeal decision</button>}
    </li>)}</ul>}
    <Dialog open={decision !== null} role="alertdialog" title="Submit your one Appeal?" initialFocusRef={cancel} onClose={() => { if (!busy) { setDecision(null); announce("Cancelled. Nothing changed."); } }}>
      <div className="space-y-3"><p>A different Moderator will review this decision. Their answer is final. Available until the decision’s 30-day snapshot purge; no review time is promised.</p>
        <label className="block">Appeal message<textarea className={modField} rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></label><p>{text.length}/1000</p>
        {!text.trim() && <p id="appeal-missing">Explain why you want the decision reviewed.</p>}{error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2"><button ref={cancel} className={modButton} aria-disabled={busy} onClick={() => { if (!busy) { setDecision(null); announce("Cancelled. Nothing changed."); } }}>Cancel</button><button className={modButton} aria-disabled={!text.trim() || busy} aria-describedby={!text.trim() ? "appeal-missing" : undefined} onClick={async () => { if (!decision || !text.trim() || busy) return; setBusy(true); try { await appeal({ decisionActionId: decision, text }); setDecision(null); toast({ message: "Appeal submitted. A different Moderator reviews it." }); } catch (e) { setError(incidentError(e)); } finally { setBusy(false); } }}>Submit Appeal</button></div>
      </div>
    </Dialog>
  </div>;
}
