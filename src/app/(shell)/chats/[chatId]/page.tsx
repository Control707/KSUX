"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ChatThreadView } from "@/components/chats/ChatThreadView";
import { DealHandoffPanel } from "@/components/marketplace/DealHandoffPanel";

export default function ChatDetailPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = String(params?.chatId ?? "");
  return (
    <ChatThreadView
      chatId={chatId}
      dealHandoffSlot={(thread) => <DealHandoffPanel thread={thread} />}
    />
  );
}
