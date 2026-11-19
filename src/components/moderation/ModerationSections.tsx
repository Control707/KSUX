"use client";
import React, { useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useIncidentMutation, incidentError } from "@/components/safety/incidentClient";
import { modButton, modCard, modField, modDate, modAge } from "./consoleUi";

export function ActionLog() {
  const rows = useViewerQuery(api.moderatorConsole.actionLog, {});
  return <section className="min-w-0 space-y-3"><h2 className="text-xl font-bold">Action log</h2><p>Every Moderator action, kept 1 year. It records who did what to which item, never the content. A content snapshot is kept 30 days for Appeals, then deleted.</p>
    <div role="region" aria-label="Moderator action log, scroll horizontally" tabIndex={0} className="max-w-full overflow-x-auto rounded-[var(--r-sm)] border border-[var(--line-strong)]">
      <table className="w-full text-left text-sm"><caption className="p-3 text-left font-bold">Moderator actions · latest 200 entries</caption><thead><tr>{["When", "Action", "Item", "Moderator", "Reason or template", "Content snapshot"].map((s) => <th key={s} scope="col" className="p-3">{s}</th>)}</tr></thead>
        <tbody>{rows?.map((r) => <tr key={r.id} className="border-t border-[var(--line)]"><td className="p-3">{modDate(r.createdAt)}</td><td className="p-3">{r.action}</td><td className="p-3">{r.targetType} {r.targetKey}</td><td className="p-3">{r.action === "photo_discard" ? r.moderator : `@${r.moderator}`}</td><td className="p-3">{r.reason ?? "—"}</td><td className="p-3">{r.snapshotUntil ? `kept until ${modDate(r.snapshotUntil)}` : "none (purged)"}</td></tr>)}</tbody>
      </table></div>{rows?.length === 0 && <p>No actions logged yet.</p>}</section>;
}

export function AppealsPanel() {
  const data = useViewerQuery(api.moderatorConsole.appeals, {});
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const [decision, setDecision] = useState<{ id: Id<"appeals">; reverse: boolean; target: string } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const cancel = useRef<HTMLButtonElement>(null);
  const decide = useIncidentMutation(api.moderatorConsole.decideAppeal);
  const { toast, announce } = useAnnouncer();
  function close() { if (!busy) { setDecision(null); announce("Cancelled. Nothing changed."); } }
  return <section className="space-y-3"><h2 className="text-xl font-bold">Appeals</h2><p>One Appeal per decision. A different Moderator without a conflict reviews it. The answer is final. Suspension Appeals require a different maintainer.</p>
    {!!data?.conflicts && <p>{data.conflicts} Appeals not shown: you made the decision, are the author, or submitted a report. A different Moderator reviews the Appeal.</p>}
    {!!data?.csaExcluded && <p>Incident Appeals are hidden because you are a CSA.</p>}
    {data?.items.length === 0 && <p>No Appeals available to you.</p>}
    {data?.items.map((a) => <article key={a.id} className={modCard}><h3 className="text-lg font-bold">{a.status === "open" ? "Open" : a.status === "upheld" ? "Decision upheld" : "Decision reversed"} · sent {modAge(a.createdAt)} ago</h3>
      <p>{a.action} · {a.targetType} {a.targetKey} · {a.reason} · by @{a.moderator} · {modDate(a.decidedAt)}</p><p>{a.text ?? "No additional message"}</p>
      {(!a.maintainerOnly || summary?.viewer.isMaintainer) && <AppealDisclosure appealId={a.id} />}
      {a.status === "open" && (!a.maintainerOnly || summary?.viewer.isMaintainer ? <div className="flex flex-wrap gap-2">{[false, true].map((reverse) => <button key={String(reverse)} type="button" className={modButton} onClick={() => { setError(""); setDecision({ id: a.id, reverse, target: `${a.targetType} ${a.targetKey}` }); }}>{reverse ? "Reverse decision" : "Uphold decision"}</button>)}</div> : <p>A different maintainer reviews this suspension Appeal.</p>)}
    </article>)}
    <Dialog open={decision !== null} onClose={close} role="alertdialog" title={decision?.reverse ? "Reverse decision?" : "Uphold decision?"} initialFocusRef={cancel}>
      <div className="space-y-3"><p>{decision?.target}</p><ul className="list-disc pl-5"><li>{decision?.reverse ? "The decision is reversed. Removed content is restored if still available; a suspension restores account access." : "The existing decision stays in effect."}</li><li>The author receives an in-app notice. No push is sent.</li><li>One Appeal per decision. Your answer is final.</li></ul><p>Logged as {decision?.reverse ? "appeal_reversed" : "appeal_upheld"} · {decision?.target} · by @{summary?.viewer.student.handle} · {modDate(Date.now())}</p>
        {error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><button ref={cancel} className={modButton} aria-disabled={busy} onClick={close}>Cancel</button>
          <button className={modButton} aria-disabled={busy} onClick={async () => { if (!decision || busy) return; setBusy(true); try { await decide({ appealId: decision.id, reverse: decision.reverse }); setDecision(null); toast({ message: "Appeal reviewed. Logged. Author notified in-app." }); } catch (e) { setError(incidentError(e)); } finally { setBusy(false); } }}>Confirm</button></div></div>
    </Dialog>
  </section>;
}
function AppealDisclosure({ appealId }: { appealId: Id<"appeals"> }) {
  const [open, setOpen] = useState(false);
  const content = useViewerQuery(api.moderatorConsole.appealSnapshot, open ? { appealId } : "skip");
  let text = content;
  if (content) {
    try { const saved = JSON.parse(content) as { text?: unknown }; if (typeof saved.text === "string") text = saved.text; } catch { /* Legacy snapshots already contain plain text. */ }
  }
  return <div><button className={modButton} aria-expanded={open} onClick={() => setOpen(!open)}>Show the removed Incident or decision snapshot</button>{open && <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-[var(--line)] pl-3">{content === undefined ? "Loading snapshot…" : text || "Snapshot unavailable or purged."}</blockquote>}</div>;
}

export function FeedHealth() {
  const rows = useViewerQuery(api.moderation.getCampusFeedHealth, {});
  return <section className={modCard}><h2 className="text-xl font-bold">Feed health</h2><ul className="space-y-3">{rows?.map((r) => <li key={r.key}><h3 className="font-bold">{r.name}</h3><p>{r.result} · {r.freshness}</p><p>Last attempt: {r.lastAttemptAt ? modDate(r.lastAttemptAt) : "—"}. Last successful fetch: {r.lastSuccessAt ? modDate(r.lastSuccessAt) : "—"}. Accepted records: {r.acceptedCount ?? "—"}.{r.retryAfter && ` Retry after ${modDate(r.retryAfter)}`}</p></li>)}</ul></section>;
}

export function ModeratorRoster() {
  const rows = useViewerQuery(api.moderatorConsole.roster, {});
  const appoint = useIncidentMutation(api.moderatorConsole.appoint);
  const revoke = useIncidentMutation(api.moderatorConsole.revoke);
  const [handle, setHandle] = useState(""); const [statement, setStatement] = useState(""); const [csa, setCsa] = useState<"" | "csa" | "not_csa">("");
  const [confirm, setConfirm] = useState<"appoint" | Id<"students"> | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const cancel = useRef<HTMLButtonElement>(null);
  const { toast, announce } = useAnnouncer();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  function close() { if (!busy) { setConfirm(null); announce("Cancelled. Nothing changed."); } }
  return <section className={modCard}><h2 className="text-xl font-bold">Appointed Moderators</h2><p>Only active verified Students qualify. Record their own plain-text CSA statement; resolve ambiguous declarations before granting Incident access.</p>
    <label className="block">Student handle<input className={modField} value={handle} onChange={(e) => setHandle(e.target.value)} /></label>
    <label className="block">Student’s plain-text CSA statement<textarea className={modField} maxLength={1000} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
    <label className="block">Maintainer assessment of statement<select className={modField} value={csa} onChange={(e) => setCsa(e.target.value as typeof csa)}><option value="">Choose after reading statement</option><option value="not_csa">Student states they are not a CSA</option><option value="csa">Student states they are a CSA — no Incident access</option></select></label>
    <button className={modButton} aria-disabled={!handle || statement.trim().length < 20 || !csa} onClick={() => { if (handle && statement.trim().length >= 20 && csa) { setError(""); setConfirm("appoint"); } }}>Appoint Moderator</button>
    <ul className="space-y-3">{rows?.map((r) => <li key={r._id}>@{r.handle} · {r.isCsa ? "CSA: no Incident access" : "Not a CSA"} · Appointed {modDate(r.appointedAt)}<p>{r.csaStatement}</p><button className={modButton} onClick={() => { setError(""); setConfirm(r.studentId); }}>Revoke @{r.handle}</button></li>)}</ul>
    <Dialog open={confirm !== null} role="alertdialog" title={confirm === "appoint" ? "Appoint Moderator?" : "Revoke Moderator?"} initialFocusRef={cancel} onClose={close}>
      <div className="space-y-3"><p>{confirm === "appoint" ? `@${handle.replace(/^@/, "")} receives Moderator access. ${csa === "csa" ? "Incident access is blocked." : "Incident access is allowed."}` : `Moderator appointment for ${rows?.find((r) => r.studentId === confirm)?.handle} is revoked immediately. Maintainer access, if separately granted, remains.`}</p><p>No push is sent. Logged as {confirm === "appoint" ? "moderator_appoint" : "moderator_revoke"} · by @{summary?.viewer.student.handle} · {modDate(Date.now())}. No Appeal opens.</p>{error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2"><button ref={cancel} className={modButton} aria-disabled={busy} onClick={close}>Cancel</button><button className={modButton} aria-disabled={busy} onClick={async () => { if (!confirm || busy) return; setBusy(true); try { if (confirm === "appoint") await appoint({ handle, csaStatement: statement, csaStatus: csa as "csa" | "not_csa" }); else await revoke({ studentId: confirm }); setConfirm(null); toast({ message: "Moderator roster updated. Logged." }); } catch (e) { setError(incidentError(e)); } finally { setBusy(false); } }}>Confirm</button></div></div>
    </Dialog>
  </section>;
}

/** Keep the existing manual Club officer workflow available to maintainers. */
export function OfficerClaims() {
  const queue = useViewerQuery(api.moderation.getModerationQueue, {});
  const review = useIncidentMutation(api.moderation.reviewOfficerClaim);
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const [decision, setDecision] = useState<{ membershipId: Id<"clubMembers">; approve: boolean; label: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const cancel = useRef<HTMLButtonElement>(null);
  const { announce, toast } = useAnnouncer();
  function close() { if (!busy) { setDecision(null); announce("Cancelled. Nothing changed."); } }
  const claims = queue?.officerClaims.filter((c) => c.student._id !== summary?.viewer.student._id);
  return <section className={modCard}><h2 className="text-xl font-bold">Club officer claims</h2>
    {!claims?.length ? <p>No officer claims available to you.</p> : <ul className="space-y-3">{claims.map((c) => <li key={c.membershipId}><p>@{c.student.handle} · {c.club.name} · {c.club.campus}</p><div className="flex flex-wrap gap-2">{[true, false].map((approve) => <button className={modButton} key={String(approve)} onClick={() => { setError(""); setDecision({ membershipId: c.membershipId, approve, label: `@${c.student.handle} · ${c.club.name}` }); }}>{approve ? "Approve officer" : "Keep as member"}</button>)}</div></li>)}</ul>}
    <Dialog open={decision !== null} role="alertdialog" title="Review Club officer claim?" initialFocusRef={cancel} onClose={close}>
      <div className="space-y-3"><p>{decision?.label}</p><p>{decision?.approve ? "The Student becomes a Club officer." : "The Student remains a Club member."} The Student receives an in-app notice only. No push or Appeal opens.</p><p>Logged as {decision?.approve ? "officer_approve" : "officer_decline"} · by @{summary?.viewer.student.handle} · {modDate(Date.now())}</p>{error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><button ref={cancel} className={modButton} aria-disabled={busy} onClick={close}>Cancel</button><button className={modButton} aria-disabled={busy} onClick={async () => { if (!decision || busy) return; setBusy(true); try { await review({ membershipId: decision.membershipId, approve: decision.approve }); setDecision(null); toast({ message: "Officer claim reviewed. Logged." }); } catch (e) { setError(incidentError(e)); } finally { setBusy(false); } }}>Confirm</button></div></div>
    </Dialog>
  </section>;
}
