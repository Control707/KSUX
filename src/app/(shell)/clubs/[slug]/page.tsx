import { ClubProfileView } from "@/components/communities/ClubsViews";

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClubProfileView slug={slug} />;
}
