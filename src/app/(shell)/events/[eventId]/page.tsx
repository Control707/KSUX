import { EventDetailView } from "@/components/communities/EventsViews";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <EventDetailView eventId={eventId} />;
}
