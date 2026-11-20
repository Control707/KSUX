"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConvex } from "convex/react";
import { api } from "@convex/_generated/api";
import { useViewerClient, useViewerQuery } from "@/lib/viewerClient";
import { PrivateScheduleEditor } from "@/components/courses/PrivateScheduleEditor";
import { CampusBadge } from "@/components/a11y/controls";
import { errorMessage, StateChip, ui } from "@/components/communities/campusLifeUi";
import { agendaLabels, agendaTime } from "@/lib/agenda";
import { easternDate } from "../../../convex/lib/easternDate";

export function AgendaView() {
  const [now, setNow] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const agenda = useViewerQuery(api.agenda.listMyAgenda, { refreshDate: now === null ? undefined : easternDate(now) });
  const terms = useViewerQuery(api.courses.listBannerTerms, {});
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const convex = useConvex();
  const { authArgs } = useViewerClient();
  const requestedTerm = searchParams.get("term");
  const scheduleTerm = (terms?.terms.some((option) => option.code === requestedTerm) ? requestedTerm : null) || terms?.activeTerm;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  async function download() {
    if (!authArgs) return;
    setExporting(true);
    setError("");
    try {
      const calendar = await convex.query(api.agenda.exportMyEvents, authArgs);
      const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "owlside-events.ics";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (problem) { setError(errorMessage(problem, "Could not export Events.")); }
    finally { setExporting(false); }
  }
  return <div className={ui.page} data-testid="private-agenda">
    <h1 className={ui.h1}>Private agenda</h1>
    <p>Only you can see this agenda. Classes, imported deadlines, RSVPed Events and joined Study Sessions across both Campuses, for the next 14 days. All times are Eastern.</p>
    <div className={ui.row}>
      <Link href="/profile/notifications#agenda" className={ui.secondary}>Reminder settings</Link>
      <button type="button" className={ui.secondary} disabled={exporting || !agenda} onClick={() => void download()}>Export Events (.ics)</button>
      <a href="https://owlexpress.kennesaw.edu/" className={ui.link}>Owl Express · official records</a>
      <a href="https://d2l.kennesaw.edu/" className={ui.link}>D2L · coursework</a>
    </div>
    <p className={ui.muted}>Export includes only your RSVPed Events in this 14-day view, including cancellations. It is a download snapshot; export again after changes. Your classes, deadlines and Study Sessions stay out of the file.</p>
    <p className={ui.muted}>Weekly classes use calendar-term boundaries (Spring Jan–Apr, Summer May–Jul, Fall Aug–Dec). Holidays and registrar cancellations are not inferred; check Owl Express and D2L.</p>
    {error && <p role="alert">{error}</p>}
    {!agenda ? <p role="status">Loading your agenda…</p> : <>
      {agenda.limited && <p role="status">This view reached a source limit. It reads the latest 20 private terms, 100 enrollments, 200 RSVPs and 200 Study Session memberships.</p>}
      <section aria-labelledby="upcoming-heading" className="space-y-[var(--sp-3)]">
        <h2 id="upcoming-heading" className={ui.h2}>Upcoming</h2>
        <ul className="space-y-[var(--sp-3)]" data-testid="agenda-items">
          {agenda.items.filter((item) => now === null || (item.endsAt ?? item.startsAt) >= now).map((item) => <li key={item.key} className={`${ui.card} space-y-[var(--sp-2)]`}>
            <div className={ui.row}>
              <span className="text-sm font-bold">{agendaLabels[item.kind]}</span>
              {item.campus && <CampusBadge campus={item.campus} />}
              {item.cancelled && <StateChip tone="warn" glyph="×">Cancelled</StateChip>}
            </div>
            <h3 className={ui.h3}><Link href={item.href} className={ui.link}>{item.title}</Link></h3>
            <p><time dateTime={new Date(item.startsAt).toISOString()}>{agendaTime(item.startsAt)}</time>
              {item.endsAt !== undefined && <> – <time dateTime={new Date(item.endsAt).toISOString()}>{agendaTime(item.endsAt)}</time></>}</p>
            {item.location && <p>{item.location}</p>}
            <p className={ui.muted}>Source: {item.source}</p>
          </li>)}
        </ul>
        {!agenda.items.some((item) => now === null || (item.endsAt ?? item.startsAt) >= now) && <p>No upcoming items. Add a private class below, import an .ics file, RSVP to an Event or join a Study Session.</p>}
      </section>
    </>}
    <section id="private-schedule" aria-labelledby="manage-schedule-heading" className="space-y-[var(--sp-3)] scroll-mt-[var(--chrome-top)]">
      <h2 id="manage-schedule-heading" className={ui.h2}>Manage private schedule</h2>
      {terms && scheduleTerm && <>
        <label className={ui.label}>Schedule term<select className={ui.input} value={scheduleTerm} onChange={(event) => router.replace(`/agenda?term=${event.target.value}#private-schedule`)}>
          {terms.terms.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select></label>
        <PrivateScheduleEditor key={scheduleTerm} termCode={scheduleTerm} />
      </>}
    </section>
  </div>;
}
