import { ChatThreadView } from "@/components/chats/ChatThreadView";

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return <ChatThreadView chatId={chatId} />;
}
