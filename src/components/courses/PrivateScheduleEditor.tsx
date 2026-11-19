"use client";

import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerClient, useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { formatPrivateClassMeeting, scheduleTimeInput, scheduleWeekdays } from "@/lib/privateSchedule";
import { Dialog } from "@/components/a11y/Dialog";
import { ui } from "@/components/communities/campusLifeUi";

type Preview = FunctionReturnType<typeof api.courses.previewScheduleFromIcs>;
type PrivateClass = FunctionReturnType<typeof api.courses.listMyPrivateClasses>[number];

function message(error: unknown) {
  if (error instanceof Error) {
    const data = "data" in error ? error.data : undefined;
    if (typeof data === "string") return data;
    return error.message;
  }
  return "Could not save the schedule.";
}

const MATCH = {
  exact: { tone: "ok", glyph: "✓", word: "Exact match" },
  ambiguous: { tone: "warn", glyph: "?", word: "Ambiguous match" },
  unmatched: { tone: "neutral", glyph: "○", word: "Unmatched" },
} as const;

const MATCH_FG = { ok: "var(--ok-fg)", warn: "var(--warn-fg)", neutral: "var(--ink)" } as const;

export function PrivateScheduleEditor({ termCode }: { termCode: string }) {
  const id = useId();
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
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");

  async function update(operation: () => Promise<void>, onError: (text: string) => void = setError) {
    setBusy(true);
    setError("");
    setDialogError("");
    setNotice("");
    try {
      await operation();
    } catch (problem) {
      onError(message(problem));
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
        rawIcs,
        termCode,
        selections: preview.result.blocks.map(({ index, exactSectionId }) => ({
          index,
          sectionId: index in selections ? selections[index]! : exactSectionId ?? null,
        })),
      });
      setPreview(null);
      setNotice(
        `Saved ${result.importedPrivateClassCount} new private classes and ${result.importedDeadlinesCount} new deadlines. Matched ${result.matchedCourses.length} Course Hubs.`
      );
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
    }, setDialogError);
  }

  const edited = editing === "new" ? undefined : editing ?? undefined;
  return (
    <section aria-label="Private schedule" className="space-y-[var(--sp-3)] border-t border-[var(--line)] pt-[var(--sp-3)]">
      <h2 className={ui.h2}>Your private schedule</h2>
      <p className={ui.muted}>Only you can see these classes. They show on your Now screen.</p>
      <div className="lt-grid-1 grid grid-cols-1 items-end gap-[var(--sp-3)] sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <label htmlFor={`${id}-ics`} className={ui.label}>Import .ics Schedule</label>
          <input
            id={`${id}-ics`}
            type="file"
            accept=".ics,text/calendar"
            onChange={previewFile}
            disabled={busy}
            className="mt-[var(--sp-1)] block min-h-[var(--target)] w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--sp-2)] text-sm text-[var(--ink)] file:mr-[var(--sp-2)] file:min-h-[2rem] file:rounded-[var(--r-sm)] file:border-0 file:bg-[var(--surface-2)] file:px-[var(--sp-3)] file:font-bold file:text-[var(--ink)]"
          />
        </div>
        <button type="button" className={ui.secondary} disabled={busy} onClick={() => setEditing("new")}>
          Add private class
        </button>
      </div>

      {error && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{error}</p>}
      <div role="status" className="text-sm font-bold text-[var(--ok-fg)]">{notice}</div>

      {preview && (
        <div className={`${ui.subCard} space-y-[var(--sp-2)]`}>
          <h3 className={ui.h3}>Review schedule import</h3>
          {preview.result.blocks.length === 0 && <p className="text-sm">No weekly class blocks found.</p>}
          <ul className="space-y-[var(--sp-2)]">
            {preview.result.blocks.map((block) => {
              const m = MATCH[block.status as keyof typeof MATCH] ?? MATCH.unmatched;
              return (
                <li key={block.index} className="space-y-[var(--sp-1)] border-t border-[var(--line)] pt-[var(--sp-2)] text-sm">
                  <strong className="block">{block.title}</strong>
                  <p className="font-bold" style={{ color: MATCH_FG[m.tone] }}>
                    <span aria-hidden="true">{m.glyph} </span>
                    {m.word} · {block.reason}
                  </p>
                  {block.entry && <div>{formatPrivateClassMeeting(block.entry)}</div>}
                  {block.options.length > 0 && (
                    <div>
                      <label htmlFor={`${id}-sel-${block.index}`} className={ui.label}>Section for {block.title}</label>
                      <select
                        id={`${id}-sel-${block.index}`}
                        className={ui.input}
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
                            Section {section.sectionNumber} · CRN {section.crn} · {section.campus}
                            {section.time ? " · " + section.time : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm">{preview.result.deadlineCount} private deadlines found</p>
          <div className={ui.row}>
            <button type="button" className={ui.strong} disabled={busy} onClick={() => void confirmImport()}>
              Save schedule
            </button>
            <button type="button" className={ui.secondary} disabled={busy} onClick={() => setPreview(null)}>
              Cancel import
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={edited ? "Edit private class" : "New private class"}
        description="Times are Eastern Time."
        testId="private-class-dialog"
      >
        <form key={edited?.key ?? "new"} onSubmit={submitClass} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={`${id}-title`} className={ui.label}>Class name</label>
            <input id={`${id}-title`} className={ui.input} name="title" defaultValue={edited?.title} maxLength={140} required />
          </div>
          <div>
            <label htmlFor={`${id}-location`} className={ui.label}>Location</label>
            <input id={`${id}-location`} className={ui.input} name="location" defaultValue={edited?.location} maxLength={160} />
          </div>
          <fieldset className="min-w-0">
            <legend className="text-sm font-bold">Meeting days</legend>
            <div className="flex flex-wrap gap-x-[var(--sp-3)]">
              {scheduleWeekdays.map(([code, label]) => (
                <label key={code} className={ui.checkRow}>
                  <input
                    className={ui.checkbox}
                    type="checkbox"
                    name="days"
                    value={code}
                    defaultChecked={edited?.days.includes(code)}
                    data-target-exempt=""
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-start`} className={ui.label}>Starts (ET)</label>
              <input id={`${id}-start`} className={ui.input} type="time" name="start" defaultValue={edited && scheduleTimeInput(edited.startMinutes)} required />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-end`} className={ui.label}>Ends (ET)</label>
              <input
                id={`${id}-end`}
                className={ui.input}
                type="time"
                name="end"
                defaultValue={edited?.endMinutes === undefined ? undefined : scheduleTimeInput(edited.endMinutes)}
              />
            </div>
          </div>
          {dialogError && <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">{dialogError}</p>}
          <div className={`${ui.row} justify-end`}>
            <button className={ui.secondary} disabled={busy} type="button" onClick={() => setEditing(null)}>
              Cancel edit
            </button>
            <button className={ui.strong} disabled={busy} type="submit">
              Save private class
            </button>
          </div>
        </form>
      </Dialog>

      {!!classes?.length && (
        <ul className="space-y-[var(--sp-2)] text-sm">
          {classes.map((entry) => (
            <li key={entry.key} className={`${ui.subCard} flex flex-wrap items-center justify-between gap-[var(--sp-2)]`}>
              <div className="min-w-0">
                <strong>{entry.title}</strong>
                <div>{formatPrivateClassMeeting(entry)}</div>
              </div>
              <div className={ui.row}>
                <button className={ui.secondary} type="button" disabled={busy} onClick={() => setEditing(entry)} aria-label={"Edit " + entry.title}>
                  Edit
                </button>
                <button
                  className={ui.danger}
                  type="button"
                  disabled={busy}
                  aria-label={"Remove " + entry.title}
                  onClick={() =>
                    void update(async () => {
                      await removeClass({ termCode, key: entry.key });
                      if (edited?.key === entry.key) setEditing(null);
                      setNotice("Private class removed.");
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
