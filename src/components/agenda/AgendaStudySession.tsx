"use client";

import Link from "next/link";
import { api } from "@convex/_generated/api";
import { useViewerQuery } from "@/lib/viewerClient";
import { ui } from "@/components/communities/campusLifeUi";
import { agendaTime } from "@/lib/agenda";

export function AgendaStudySession({ sessionId }: { sessionId: string }) {
  const data = useViewerQuery(api.agenda.getMyStudySession, { sessionId });
  // min-w-0 + overflow-wrap so the h1 reflows at 320 px and 200% text (WCAG 1.4.10).
  return <div className={`${ui.page} min-w-0 [overflow-wrap:anywhere]`}>
    <h1 className={ui.h1}>Study Session</h1>
    {data === undefined ? <p role="status">Loading Study Session…</p> : !data ? <p>This Study Session is unavailable or you are no longer attending.</p> : <section className={`${ui.card} space-y-[var(--sp-3)]`} aria-labelledby="session-title">
      <h2 id="session-title" className={ui.h2}>{data.session.title}</h2>
      <p>{data.session.campus} · {data.location}</p>
      <p>{agendaTime(data.session.startTime)} – {agendaTime(data.session.endTime)}</p>
      <p>{data.session.status === "cancelled" ? "Cancelled" : data.session.endTime <= Date.now() || data.session.status === "ended" ? "Ended" : "Scheduled"}</p>
      {data.session.topicNote && <p>{data.session.topicNote}</p>}
      {data.session.groupChatId && <Link className={ui.link} href={`/chats/${data.session.groupChatId}`}>Session Chat</Link>}
    </section>}
    <Link className={ui.link} href="/agenda">Back to private agenda</Link>
    <Link className={ui.link} href="/study">Study Rooms and Sessions</Link>
  </div>;
}
