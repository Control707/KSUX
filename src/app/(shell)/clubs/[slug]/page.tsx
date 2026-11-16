import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <ModulePlaceholder
      title={`Club · ${slug}`}
      description="Organization profile, Officer Claiming, Events, and Club Group Chat."
    />
  );
}
