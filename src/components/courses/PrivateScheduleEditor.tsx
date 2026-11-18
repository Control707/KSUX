"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { formatPrivateClassMeeting, scheduleTimeInput, scheduleWeekdays } from "@/lib/privateSchedule";

type Preview = FunctionReturnType<typeof api.courses.previewScheduleFromIcs>;
type PrivateClass = FunctionReturnType<typeof api.courses.listMyPrivateClasses>[number];

const buttonStyle = "min-h-11 rounded-lg border border-[#D99B00] bg-[#FFF6DC] px-3 py-2 text-xs font-bold disabled:opacity-50";
const inputStyle = "min-h-11 rounded-lg border border-[#E4E7EE] p-2 text-sm";

function message(error: unknown) {
  if (error instanceof Error) {
    const data = "data" in error ? error.data : undefined;
    if (typeof data === "string") return data;
    return error.message;
  }
  return "Could not save the schedule.";
}

export function PrivateScheduleEditor({ termCode }: { termCode: string }) {
  const { authArgs } = useViewerClient();
  const convex = useConvex();
  const classes = useViewerQuery(api.courses.listMyPrivateClasses, { termCode });
  const importSchedule = useViewerMutation(api.courses.importScheduleFromIcs);
  const saveClass = useViewerMutation(api.courses.savePrivateClass);
  const removeClass = useViewerMutation(api.courses.removePrivateClass);
  const [preview, setPreview] = useState<{ rawIcs: string; result: Preview } | null>(null);
  const [selections, setSelections] = useState<Record<number, Id<"courseSections"> | null>>({});
  const [editing, setEditing] = useState<PrivateClass | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function update(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (problem) {
      setError(message(problem));
    } finally {
      setBusy(false);
    }
  }

  async function previewFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !authArgs) return;
    setPreview(null);
    setSelections({});
    await update(async () => {
      if (file.size > 512_000) throw new Error("Choose an .ics file smaller than 512 KB.");
      const rawIcs = await file.text();
      const result = await convex.query(api.courses.previewScheduleFromIcs, { ...authArgs, rawIcs, termCode });
      setPreview({ rawIcs, result });
    });
  }

  async function confirmImport() {
    if (!preview) return;
    const { rawIcs } = preview;
    await update(async () => {
      const result = await importSchedule({
        rawIcs, termCode,
        selections: preview.result.blocks.map(({ index, exactSectionId }) => ({
          index,
          sectionId: index in selections ? selections[index]! : exactSectionId ?? null,
        })),
      });
      setPreview(null);
      setNotice(`Saved ${result.importedPrivateClassCount} new private classes and ${result.importedDeadlinesCount} new deadlines. Matched ${result.matchedCourses.length} Course Hubs.`);
    });
  }

  async function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get("start"));
    const end = String(form.get("end"));
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    await update(async () => {
      await saveClass({
        termCode,
        key: editing && editing !== "new" ? editing.key : undefined,
        title: String(form.get("title")),
        location: String(form.get("location")),
        days: form.getAll("days").map(String),
        startMinutes: minutes(start),
        endMinutes: end ? minutes(end) : undefined,
      });
      setEditing(null);
      setNotice("Private class saved.");
    });
  }

  const edited = editing === "new" ? undefined : editing ?? undefined;
  return (
    <section aria-label="Private schedule" className="mt-3 space-y-3 border-t border-[#E4E7EE] pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold">
          Import .ics Schedule
          <input type="file" accept=".ics,text/calendar" onChange={previewFile} disabled={busy} className="ml-2 text-xs" />
        </label>
        <button type="button" className={buttonStyle} disabled={busy} onClick={() => setEditing("new")}>Add private class</button>
      </div>

      {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
      {notice && <p role="status" className="text-sm text-[#15803D]">{notice}</p>}
      {preview && (
        <div className="space-y-2 rounded-xl border border-[#D99B00] bg-[#FFFDF7] p-3">
          <h2 className="text-sm font-bold">Review schedule import</h2>
          {preview.result.blocks.length === 0 && <p className="text-sm">No weekly class blocks found.</p>}
          {preview.result.blocks.map((block) => (
            <div key={block.index} className="space-y-1 border-t border-[#E4E7EE] pt-2 text-sm">
              <strong>{block.title}</strong>
              <div>{block.status === "exact" ? "Exact match" : block.status === "ambiguous" ? "Ambiguous match" : "Unmatched"} · {block.reason}</div>
              {block.entry && <div>{formatPrivateClassMeeting(block.entry)}</div>}
              {block.options.length > 0 && (
                <label className="block">
                  <span className="mr-2">Section for {block.title}</span>
                  <select
                    className={inputStyle}
                    value={(block.index in selections ? selections[block.index] : block.exactSectionId) ?? ""}
                    disabled={busy}
                    onChange={(event) => {
                      const section = block.options.find(({ _id }) => _id === event.target.value);
                      setSelections((previous) => ({ ...previous, [block.index]: section?._id ?? null }));
                    }}
                  >
                    <option value="">{block.entry ? "Save as a private class" : "Skip class"}</option>
                    {block.options.map((section) => (
                      <option key={section._id} value={section._id}>
                        Section {section.sectionNumber} · CRN {section.crn} · {section.campus}{section.time ? " · " + section.time : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
          <p className="text-sm">{preview.result.deadlineCount} private deadlines found</p>
          <div className="flex gap-2">
            <button type="button" className={buttonStyle} disabled={busy} onClick={() => void confirmImport()}>Save schedule</button>
            <button type="button" className={buttonStyle} disabled={busy} onClick={() => setPreview(null)}>Cancel import</button>
          </div>
        </div>
      )}

      {editing && (
        <form key={edited?.key ?? "new"} onSubmit={submitClass} className="space-y-2 rounded-xl border border-[#E4E7EE] p-3 text-sm">
          <h2 className="font-bold">{edited ? "Edit private class" : "New private class"}</h2>
          <div className="flex flex-wrap gap-2">
            <label>Class name <input className={inputStyle} name="title" defaultValue={edited?.title} maxLength={140} required /></label>
            <label>Location <input className={inputStyle} name="location" defaultValue={edited?.location} maxLength={160} /></label>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend>Meeting days</legend>
            {scheduleWeekdays.map(([code, label]) => (
              <label key={code}><input className="mr-1" type="checkbox" name="days" value={code} defaultChecked={edited?.days.includes(code)} />{label}</label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <label>Starts (ET) <input className={inputStyle} type="time" name="start" defaultValue={edited && scheduleTimeInput(edited.startMinutes)} required /></label>
            <label>Ends (ET) <input className={inputStyle} type="time" name="end" defaultValue={edited?.endMinutes === undefined ? undefined : scheduleTimeInput(edited.endMinutes)} /></label>
          </div>
          <div className="flex gap-2">
            <button className={buttonStyle} disabled={busy} type="submit">Save private class</button>
            <button className={buttonStyle} disabled={busy} type="button" onClick={() => setEditing(null)}>Cancel edit</button>
          </div>
        </form>
      )}

      {!!classes?.length && (
        <ul className="space-y-2 text-sm">
          {classes.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E4E7EE] p-2">
              <div><strong>{entry.title}</strong><div>{formatPrivateClassMeeting(entry)}</div></div>
              <div className="flex gap-2">
                <button className={buttonStyle} type="button" disabled={busy} onClick={() => setEditing(entry)} aria-label={"Edit " + entry.title}>Edit</button>
                <button className={buttonStyle} type="button" disabled={busy} aria-label={"Remove " + entry.title} onClick={() => void update(async () => {
                  await removeClass({ termCode, key: entry.key });
                  if (edited?.key === entry.key) setEditing(null);
                  setNotice("Private class removed.");
                })}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
