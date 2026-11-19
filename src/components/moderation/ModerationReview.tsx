"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { INCIDENT_CATEGORIES, INCIDENT_NOTES, INCIDENT_REASONS, INCIDENT_REMOVE_REASONS } from "@convex/lib/incidentPolicy";
import { useViewerQuery } from "@/lib/viewerClient";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useIncidentMutation, incidentError } from "@/components/safety/incidentClient";
import { modButton, modCard, modField, modDate, modAge, actionLabels, type ModerationAction as Action } from "./consoleUi";
import { IncidentPhoto } from "@/components/safety/IncidentPhoto";

type Item = FunctionReturnType<typeof api.moderatorConsole.queue>["items"][number];
export function ModerationReview({ item, maintainer, onDone }: { item: Item; maintainer: boolean; onDone: (action: Action) => void }) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const detail = useViewerQuery(api.moderatorConsole.review, { targetType: item.targetType, targetId: item.targetId, showPhoto });
  const links = useViewerQuery(api.moderatorConsole.noteLinks, item.targetType === "incident" ? {} : "skip");
  const act = useIncidentMutation(api.moderatorConsole.act);
  const [action, setAction] = useState<Action | null>(null);
  const [reasonId, setReason] = useState(""); const [words, setWords] = useState(""); const [templateId, setTemplate] = useState(""); const [linkId, setLinkId] = useState("");
  const [inaccurate, setInaccurate] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const requestId = useRef(""); const cancel = useRef<HTMLButtonElement>(null);
  const { announce } = useAnnouncer();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const missing = action === "remove" && !reasonId ? "Choose a reason the author will see." : action === "redact" && (!words.trim() || !detail?.text.includes(words)) ? "Enter exact words present in the original." : action === "note" && (!templateId || templateId !== "inaccurate" && !linkId) ? "Choose a template and its required link." : "";
  function open(value: Action) { setAction(value); setReason(""); setWords(""); setTemplate(""); setLinkId(""); setInaccurate(false); setError(""); requestId.current = crypto.randomUUID(); }
  function close() { if (busy) return; setAction(null); announce("Cancelled. Nothing changed."); }
  async function submit() {
    if (!action || missing || busy) return;
    setBusy(true); setError("");
    try {
      await act({ targetType: item.targetType, targetId: item.targetId, action, requestId: requestId.current,
        reasonId: reasonId || undefined, words: words || undefined, templateId: templateId || undefined, addInaccurateNote: inaccurate || undefined,
        alertId: templateId === "official_notice" ? linkId as Id<"alertItems"> : undefined,
        duplicateIncidentId: templateId === "duplicate" ? linkId as Id<"incidents"> : undefined });
      setAction(null); onDone(action);
    } catch (e) { setError(incidentError(e)); } finally { setBusy(false); }
  }
  const actions: Action[] = [...(detail?.photo && detail.photo.expiresAt > now ? ["photo_approve", "photo_approve_blur", "photo_reject"] as Action[] : []), ...(item.reasons.length ? [item.status === "under_review" ? "restore" : "dismiss"] as Action[] : []), ...(item.targetType === "incident" ? ["redact", "note"] as Action[] : []), "remove", "suspend"];
  const photoEffect = action === "photo_reject" ? "The photo is deleted. A dated Photo not approved note is added. Incident text and separate reports stay unchanged."
    : action === "photo_approve_blur" ? "Only whole-photo-blurred pixels can be shown with a visible Incident. Incident text and separate reports stay unchanged."
      : action === "photo_approve" ? "The photo can be shown with a visible Incident. Any author-requested blur stays applied. Incident text and separate reports stay unchanged." : null;
  return <div className="space-y-3">
    {detail === undefined ? <p role="status">Loading original…</p> : detail === null ? <p role="status">This item is no longer available to you. Return to the queue.</p> : <div className={modCard}>
      {detail.category && <p className="font-bold">{INCIDENT_CATEGORIES[detail.category].shape} {INCIDENT_CATEGORIES[detail.category].label} · {detail.campus}</p>}
      <dl className="space-y-2"><dt className="font-bold">Where</dt><dd>{detail.building ?? item.title} {detail.areaDetail} · {detail.campus ?? "KSU-wide"}</dd>
        {detail.observedAt !== undefined && <><dt className="font-bold">Claimed seen</dt><dd>{modDate(detail.observedAt)} · Posted {modDate(detail.publishedAt!)} · Original locked {modDate(detail.lockedAt!)}</dd></>}
        <dt className="font-bold">Author</dt><dd>@{detail.authorHandle} · Students see: {detail.authorLabel}</dd><dt className="font-bold">Status</dt><dd>{detail.status === "under_review" ? "Under review" : detail.status}</dd>
        <dt className="font-bold">Reports</dt><dd>{item.reporterCount} verified reporters. {item.reasons.map(([r, n]) => `${INCIDENT_REASONS[r as keyof typeof INCIDENT_REASONS] ?? r}: ${n}`).join(" · ")}</dd></dl>
      <h3 className="text-lg font-bold">Original</h3><blockquote className="whitespace-pre-wrap border-l-4 border-[var(--line)] pl-3">{detail.text}</blockquote>
      {!!detail.updates.length && <><h3 className="text-lg font-bold">Incident Updates</h3><ol className="space-y-2">{detail.updates.map((u) => <li key={u.id}><p>{u.kind === "author_update" ? "Author Update" : "Moderator note"} · {modDate(u.createdAt)}</p><p>{u.text} {u.href && <Link href={u.href}>View linked source</Link>}</p></li>)}</ol></>}
      {detail.photo && <div><p>Held photo · Students can’t see it. {detail.photo.expiresAt > now ? `Discarded in ${modAge(now, detail.photo.expiresAt)} if nobody reviews it.` : "The 48-hour hold has expired. Awaiting automatic discard."}</p><button className={modButton} aria-pressed={showPhoto} onClick={() => setShowPhoto(!showPhoto)}>{showPhoto ? "Hide photo" : "Show photo"}</button>
        {showPhoto && detail.photo.expiresAt > now && <IncidentPhoto incidentId={item.targetId} review blurred={detail.photo.blurred} />}</div>}
    </div>}
    <div aria-label="Review actions" className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-[var(--line-strong)] bg-[var(--surface)] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {actions.map((a) => <button type="button" key={a} className={modButton} data-testid={a === "restore" ? "moderation-restore-btn" : undefined} aria-disabled={!detail || a === "suspend" && !maintainer}
        onClick={() => { if (detail && (a !== "suspend" || maintainer)) open(a); }}>{actionLabels[a]}</button>)}
      {!maintainer && <p className="w-full text-sm">Suspending accounts is maintainer-only.</p>}
    </div>
    <Dialog open={action !== null} onClose={close} role="alertdialog" title={action ? `${actionLabels[action]}?` : "Confirm action"} initialFocusRef={cancel}>
      <div className="space-y-3">
        <p className="font-bold">{item.kind} · {item.title}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{photoEffect ?? (action === "remove" ? "Hidden immediately. Purged 30 days after removal." : action === "redact" ? "Every occurrence of the exact words becomes [removed by moderators]. An identifying-details note is added; the Incident becomes visible." : action === "note" ? "A dated fixed-template note is added. The item stays in the queue." : action === "suspend" ? "The author loses access to KSUX except moderation notices and Appeals. Their Incidents become Removed and their Clout is reversed." : action === "restore" ? "The item becomes visible again and its reports are closed. Identifies-me claimants are told." : "Reports are closed. Content stays unchanged. Reporters are not told the outcome.")}</li>
          <li>{action === "dismiss" ? "No author notice." : "The author receives an in-app notice only. No push is sent."}</li>
          <li>{["remove", "redact", "suspend"].includes(action ?? "") ? "The author may submit one Appeal until the 30-day snapshot purge." : "No new Appeal opens."}</li>
        </ul>
        {action === "remove" && <label className="block">Removal reason<select className={modField} value={reasonId} onChange={(e) => setReason(e.target.value)}><option value="">Choose reason</option>{Object.entries(INCIDENT_REMOVE_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        {action === "redact" && <><label className="block">Exact words<textarea className={modField} value={words} onChange={(e) => setWords(e.target.value)} /></label>
          <p className="font-bold">Original with selection</p><p>{words && detail?.text.includes(words) ? detail.text.split(words).map((part, i) => <React.Fragment key={i}>{i > 0 && <mark>{words}</mark>}{part}</React.Fragment>) : detail?.text}</p>
          <p className="font-bold">Result preview</p><p data-testid="redaction-preview">{words && detail?.text.includes(words) ? detail.text.split(words).join("[removed by moderators]") : detail?.text}</p></>}
        {action === "note" && <><label className="block">Note template<select className={modField} value={templateId} onChange={(e) => { setTemplate(e.target.value); setLinkId(""); }}><option value="">Choose template</option>{["inaccurate", "official_notice", "duplicate"].map((id) => <option key={id} value={id}>{INCIDENT_NOTES[id]}</option>)}</select></label>
          {templateId && templateId !== "inaccurate" && <label className="block">{templateId === "official_notice" ? "Listed Official Alert" : "Another visible Incident"}<select className={modField} value={linkId} onChange={(e) => setLinkId(e.target.value)}><option value="">Choose link</option>{(templateId === "official_notice" ? links?.alerts : links?.incidents.filter((i) => i.id !== item.targetId))?.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>}</>}
        {action === "restore" && item.targetType === "incident" && item.reasons.some(([r]) => r === "false_misleading") && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-11 w-11 shrink-0" checked={inaccurate} onChange={(e) => setInaccurate(e.target.checked)} />Add “Several Students reported this as inaccurate” note</label>}
        <p>Logged as {action} · {action === "suspend" ? "Student" : item.targetType} {action === "suspend" ? detail?.authorId : item.targetId} · by @{summary?.viewer.student.handle} · {modDate(Date.now())}</p>
        {missing && <p id="mod-missing">{missing}</p>}{error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2"><button ref={cancel} type="button" className={modButton} onClick={close} aria-disabled={busy}>Cancel</button><button type="button" className={modButton} aria-disabled={!!missing || busy} aria-describedby={missing ? "mod-missing" : undefined} onClick={() => void submit()}>{busy ? "Saving…" : "Confirm"}</button></div>
      </div>
    </Dialog>
  </div>;
}
