import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return (
    <ModulePlaceholder
      title={`Event · ${eventId}`}
      description="Campus Event details and Going / Interested RSVPs."
    />
  );
}
