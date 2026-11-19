import { AgendaStudySession } from "@/components/agenda/AgendaStudySession";

export default async function StudySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <AgendaStudySession sessionId={sessionId} />;
}
