import React from "react";
import { ModeratorConsoleView } from "@/components/moderation/ModeratorConsoleView";

export default function ModerationPage() {
  return <React.Suspense fallback={<div className="p-4"><h1 className="text-2xl font-bold">Moderator console</h1><p role="status">Loading console…</p></div>}><ModeratorConsoleView /></React.Suspense>;
}
