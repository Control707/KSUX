"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { INCIDENT_CATEGORIES, INCIDENT_PLACES, incidentTextError, type IncidentCategory } from "@convex/lib/incidentPolicy";
import { EmergencyPanel, type EmergencyPanelMode } from "./EmergencyPanel";
import { incidentError, useIncidentMutation } from "./incidentClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { useViewerQuery } from "@/lib/viewerClient";
import { compressImageToExifStrippedWebP } from "@/lib/imageCompression";
import { DEMO_INCIDENT_PHOTO, DEMO_INCIDENT_PHOTO_BLURRED } from "@convex/lib/incidentPhotos";

export const incidentButton = "min-h-[var(--target)] min-w-[var(--target)] max-w-full rounded-[var(--r-md)] border border-[var(--line-strong)] px-[var(--sp-3)] py-[var(--sp-2)] font-bold [overflow-wrap:anywhere] hover:bg-[var(--surface-2)] disabled:opacity-60";
export const incidentField = "block min-h-[var(--target)] w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--sp-2)] text-[var(--ink)]";
const questions = ["What happened?", "Where?", "When did you see it?", "What did you see?", "Add a photo?", "Your name", "Preview"];

export function IncidentForm({ mode, online, onStep, onPosted, onBusy, onBackPanel }: {
  mode: EmergencyPanelMode; online: boolean; onStep: (dirty: boolean) => void; onPosted: () => void; onBusy: (value: boolean) => void; onBackPanel: () => void;
}) {
  const create = useIncidentMutation(api.incidents.create);
  const deleteOwn = useIncidentMutation(api.incidents.deleteOwn);
  const discardDemoPhoto = useIncidentMutation(api.incidents.discardDemoPhoto);
  const photoAvailability = useViewerQuery(api.incidents.photoAvailability, {});
  const { announce } = useAnnouncer();
  const summary = useViewerQuery(api.shell.shellSummary, {});
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<IncidentCategory | "">("");
  const [divert, setDivert] = useState("");
  // Location is an explicit choice, never inferred from the Student or GPS.
  const [campus, setCampus] = useState<"Kennesaw" | "Marietta" | "">("");
  const [buildingId, setBuildingId] = useState("");
  const [search, setSearch] = useState("");
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [locationStatus, setLocationStatus] = useState("");
  const [areaDetail, setAreaDetail] = useState("");
  const [time, setTime] = useState("");
  const [chosenObservedAt, setChosenObservedAt] = useState<number | null>(null);
  const [earlier, setEarlier] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | "demo" | null>(null);
  const [blurPhoto, setBlurPhoto] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const uploadedPhoto = useRef<Id<"mediaAssets"> | undefined>(undefined);
  const [nameLevel, setNameLevel] = useState<"hidden" | "show_handle" | "">("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState<Id<"incidents"> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const place = INCIDENT_PLACES.find((p) => p.id === buildingId);
  const places = INCIDENT_PLACES.filter((p) => p.campus === campus &&
    [p.name, ...p.aliases].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => nearbyIds.length ? nearbyIds.indexOf(a.id) - nearbyIds.indexOf(b.id) : a.name.localeCompare(b.name));
  useEffect(() => {
    onStep(!posted);
    heading.current?.focus();
    announce(posted ? "Posted to the KSUX community. This did not contact police or KSU." : `Step ${step + 1} of 7. ${questions[step]}`);
  }, [step, posted, divert, announce, onStep]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { onBusy(pending); return () => onBusy(false); }, [pending, onBusy]);
  function observedAt() {
    if (time === "earlier") return Date.parse(earlier);
    return chosenObservedAt ?? NaN;
  }
  function validate() {
    if (step === 0 && !category) return "Choose a category.";
    if (step === 1 && (!campus || !buildingId)) return "Choose a Campus and listed building or area.";
    if (step === 1 && areaDetail.trim()) return incidentTextError(areaDetail, 60);
    if (step === 2 && (!time || !Number.isFinite(observedAt()) || observedAt() > Date.now() || observedAt() < Date.now() - 24 * 3600_000)) return "Choose an observed time within the last day.";
    if (step === 3) return incidentTextError(text);
    if (step === 5 && !nameLevel) return "Choose how your name appears.";
    return null;
  }
  async function next() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError("");
    if (step < 6) { setStep(step + 1); return; }
    if (!online || !navigator.onLine || pending) return;
    setPending(true);
    try {
      if (photo && photo !== "demo" && !uploadedPhoto.current) {
        const compressed = await compressImageToExifStrippedWebP(photo);
        if (!navigator.onLine) throw new Error("Not posted — reconnect to submit");
        const body = new FormData();
        body.set("file", compressed.file); body.set("purpose", "incident"); body.set("blur", String(blurPhoto));
        const response = await fetch("/api/uploadthing", { method: "POST", credentials: "same-origin", cache: "no-store", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Photo upload failed.");
        uploadedPhoto.current = data.mediaAssetId;
      }
      const result = await create({ category: category as IncidentCategory, campus: campus as "Kennesaw" | "Marietta", buildingId,
        areaDetail: areaDetail || undefined, observedAt: observedAt(), text, nameLevel: nameLevel as "hidden" | "show_handle",
        photoAssetId: uploadedPhoto.current, demoPhoto: photo === "demo" || undefined, blurPhoto: photo === "demo" ? blurPhoto : undefined });
      setPosted(result.incidentId);
      setText(""); setAreaDetail("");
      onPosted();
    } catch (e) { setError(incidentError(e)); } finally { setPending(false); }
  }
  if (posted) return <div className="space-y-[var(--sp-3)]" data-testid="incident-posted">
    <h1 ref={heading} tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold">Posted to the KSUX community</h1>
    <p>This did not contact police or KSU.</p>
    {photo && <p role="status">{discarded ? "Photo discarded. Your Incident text is unchanged." : "Your photo is held for review. Other Students can’t see it unless a Moderator approves it. It will be discarded after 48 hours if nobody reviews it. No review time is promised."}</p>}
    {mode === "demo" && photo && !discarded && <button className={incidentButton} disabled={pending || !online} onClick={async () => {
      setPending(true); try { await discardDemoPhoto({ incidentId: posted }); setDiscarded(true); } catch (e) { setError(incidentError(e)); } finally { setPending(false); }
    }}>Demo: simulate 48-hour discard</button>}
    {discarded && <Link className={incidentButton} href="/profile/moderation">Read private photo notice</Link>}
    <Link href={`/safety/${posted}`} className={incidentButton}>See it on Incidents</Link>
    <EmergencyPanel mode={mode} headingLevel={2} compact />
    {error && <p role="alert">{error}</p>}
    <button type="button" className={incidentButton} disabled={!online || pending} onClick={async () => {
      setPending(true);
      try { await deleteOwn({ incidentId: posted }); setError("Deleted by author."); } catch (e) { setError(incidentError(e)); } finally { setPending(false); }
    }}>Delete this post</button>
  </div>;
  if (divert) return <div className="space-y-[var(--sp-3)]">
    <h1 tabIndex={-1} ref={heading} className="font-display text-[length:var(--fs-xl)] font-bold">KSUX doesn’t post these publicly</h1>
    <p>{divert === "suspicious" ? "Suspicion about a person can identify and target them. Contact KSU Police about a concern." : divert === "medical" ? "For a medical emergency, call 911 or KSU Police." : "For sexual misconduct, dating violence or stalking, use KSU’s specialist resources or contact police."}</p>
    {divert === "sexual" && <div className="flex flex-wrap gap-[var(--sp-2)]">
      <a className={incidentButton} href="https://www.kennesaw.edu/sexual-misconduct/">KSU Title IX office</a>
      <a className={incidentButton} href="https://www.kennesaw.edu/counseling/">KSU Counseling and Psychological Services</a>
    </div>}
    <EmergencyPanel mode={mode} headingLevel={2} compact />
    <button className={incidentButton} onClick={() => { setDivert(""); heading.current?.focus(); }}>Choose something else</button>
  </div>;
  return <div className="space-y-[var(--sp-3)]" data-testid="incident-form">
    <button type="button" className={incidentButton} disabled={pending} onClick={() => { setError(""); if (step === 0) onBackPanel(); else setStep(step - 1); }}>Back</button>
    <p role="status">Step {step + 1} of 7</p>
    <progress className="w-full" max={7} value={step + 1} aria-label="Incident report progress" />
    <h1 ref={heading} tabIndex={-1} className="font-display text-[length:var(--fs-xl)] font-bold outline-none">{questions[step]}</h1>
    {!online && <p role="status" className="font-bold">Not posted — reconnect to submit. This draft stays only in this tab until you close it.</p>}
    {step === 0 && <div className="grid gap-[var(--sp-2)]">
      {Object.entries(INCIDENT_CATEGORIES).map(([key, item]) => <button key={key} type="button" className={incidentButton}
        aria-pressed={category === key} onClick={() => setCategory(key as IncidentCategory)}>
        <span className="text-[var(--info-fg)]" aria-hidden="true">{item.shape}</span> {item.label}<span className="block text-[length:var(--fs-sm)] font-normal">{item.hint}</span>
      </button>)}
      <p>Some concerns need a different route:</p>
      {[ ["medical", "Medical emergency"], ["sexual", "Sexual misconduct, dating violence or stalking"], ["suspicious", "A person seems suspicious"] ].map(([key, label]) =>
        <button key={key} className={incidentButton} onClick={() => { setDivert(key!); setTimeout(() => heading.current?.focus(), 0); }}>{label}</button>)}
    </div>}
    {step === 1 && <div className="space-y-[var(--sp-3)]">
      <label className="block">Campus<select aria-label="Campus" className={incidentField} value={campus} onChange={(e) => { setCampus(e.target.value as typeof campus); setBuildingId(""); }}>
        <option value="">Choose Campus</option><option>Kennesaw</option><option>Marietta</option>
      </select></label>
      <label className="block">Search buildings or areas<input className={incidentField} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <label className="block">Building or area<select aria-label="Building or area" className={incidentField} value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
        <option value="">Choose building or area</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <p>Housing is shown at complex level. No room or unit numbers. Your location isn’t inferred or saved.</p>
      <button type="button" className={incidentButton} disabled={!campus} onClick={() => {
        if (!navigator.geolocation) { setLocationStatus("Location isn’t available. Choose a building manually."); return; }
        navigator.geolocation.getCurrentPosition(({ coords }) => {
          // Sort once on-device, retaining only the ordered building IDs.
          const distance = (p: typeof INCIDENT_PLACES[number]) => Math.hypot((p.longitude - coords.longitude) * Math.cos(coords.latitude * Math.PI / 180), p.latitude - coords.latitude);
          setNearbyIds(INCIDENT_PLACES.slice().sort((a, b) => distance(a) - distance(b)).map((p) => p.id));
          setLocationStatus("Places sorted near you once. Your location wasn’t saved or posted. Choose a building yourself.");
        }, () => setLocationStatus("Location wasn’t shared. Choose a building manually."), { maximumAge: 0, timeout: 10_000 });
      }}>Suggest places near me</button>
      <p role="status">{locationStatus}</p>
      <label className="block">Where exactly? (optional)<input className={incidentField} maxLength={60} value={areaDetail} onChange={(e) => setAreaDetail(e.target.value)} /></label>
    </div>}
    {step === 2 && <div className="space-y-[var(--sp-3)]">
      <label>Claimed observed time<select aria-label="Claimed observed time" className={incidentField} value={time} onChange={(e) => {
        setTime(e.target.value); setChosenObservedAt(e.target.value && e.target.value !== "earlier" ? Date.now() - Number(e.target.value) * 60_000 : null);
      }}>
        <option value="">Choose time</option><option value="0">Just now</option><option value="15">~15 min ago</option><option value="60">~1 hour ago</option><option value="earlier">Earlier today</option>
      </select></label>
      {time === "earlier" && <label className="block">About what time? (your device’s local time)<input className={incidentField} type="datetime-local" value={earlier} onChange={(e) => setEarlier(e.target.value)} /></label>}
      <p>This is when you say you saw it. The posted time is recorded separately.</p>
    </div>}
    {step === 3 && <label className="block">Description<textarea aria-label="Description" className={incidentField} rows={5} maxLength={280} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="incident-description-hint" />
      <span id="incident-description-hint">{text.length}/280. Describe what you observed, without names, identifying details or claims about safety.</span></label>}
    {step === 4 && <div className="space-y-[var(--sp-3)]">
      <p>Optional. A moderator reviews photos before other Students can see them. Location data is removed from the file.</p>
      <p>Don’t include faces, plates or anything that identifies a person. Photos are discarded after 48 hours if nobody reviews them. No review time is promised.</p>
      {mode === "demo" ? <><p>Demo · static fixture only. No real photos are uploaded.</p><button type="button" className={incidentButton} aria-pressed={photo === "demo"} onClick={() => setPhoto(photo ? null : "demo")}>Use Demo fixture photo</button></>
        : photoAvailability?.enabled ? <label className="block">Choose Incident photo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic" className={incidentField} disabled={!online} onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); uploadedPhoto.current = undefined; }} /></label>
          : <p>Photo uploads are currently unavailable. You can continue without a photo.</p>}
      {photo && <><p>{photo === "demo" ? "Static fixture selected" : photo.name}</p>
        <label className="flex min-h-11 items-center gap-3"><input className="h-11 w-11 shrink-0" type="checkbox" checked={blurPhoto} onChange={(e) => { setBlurPhoto(e.target.checked); uploadedPhoto.current = undefined; }} />Blur the whole photo</label>
        {photo === "demo" && <img src={blurPhoto ? DEMO_INCIDENT_PHOTO_BLURRED : DEMO_INCIDENT_PHOTO} alt="Selected Demo Incident fixture" className="max-h-52 max-w-full" />}
        <button type="button" className={incidentButton} onClick={() => { setPhoto(null); uploadedPhoto.current = undefined; }}>Remove photo</button></>}
      <button type="button" className={incidentButton} onClick={() => { setPhoto(null); uploadedPhoto.current = undefined; setStep(5); }}>Skip photo</button>
    </div>}
    {step === 5 && <div className="space-y-[var(--sp-3)]">
      <div className="flex flex-wrap gap-[var(--sp-2)]">{([ ["show_handle", "Show my handle"], ["hidden", "Student · name hidden"] ] as const).map(([value, label]) =>
        <button key={value} className={incidentButton} aria-pressed={nameLevel === value} onClick={() => setNameLevel(value)}>{label}</button>)}</div>
      <p>Moderators can see who posted. KSUX may have to share account details if the law requires. This isn’t anonymous to police. For anonymous tips, use KSU LiveSafe outside KSUX.</p>
    </div>}
    {step === 6 && <article className="space-y-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--line)] p-[var(--sp-3)]">
      <p>{category && INCIDENT_CATEGORIES[category].shape} {category && INCIDENT_CATEGORIES[category].label} · {campus}</p>
      <h2 className="text-[length:var(--fs-lg)] font-bold">{place?.name}</h2><p>{areaDetail}</p><p>{text}</p>
      {photo && <p>Photo held for review · not shown to other Students until approved.{blurPhoto ? " Whole-photo blur requested." : ""}</p>}
      <p>Seen {Number.isFinite(observedAt()) ? new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(observedAt()) + " Eastern (claimed)" : "Choose an observed time"}</p>
      <p>Community report · not verified · {nameLevel === "hidden" ? "Student · name hidden" : "@" + (summary?.viewer.student.handle ?? "your handle")}</p>
      {mode === "demo" && <p>Demo · not real</p>}
      <p>Posting does not contact police or KSU. Volunteer Moderators may not see it for hours. You can edit the original for 5 minutes, then add dated Incident Updates. Incidents leave the map after 24 hours because of their age, not a resolution.</p>
    </article>}
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="font-bold outline-none">{error}</p>}
    <div className="sticky bottom-0 flex flex-wrap justify-end gap-[var(--sp-2)] border-t border-[var(--line)] bg-[var(--surface)] py-[var(--sp-3)]">
      <button type="button" className={incidentButton} disabled={pending || (!online && step === 6)} onClick={() => void next()}>{pending ? "Posting…" : step === 6 ? "Post to the community" : "Next"}</button>
    </div>
  </div>;
}
