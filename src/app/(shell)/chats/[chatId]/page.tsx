import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return (
    <ModulePlaceholder
      title={`Chat Thread · ${chatId}`}
      description="Real-time conversation preserved across Campus switches."
      preserveAcrossCampus
    />
  );
}
