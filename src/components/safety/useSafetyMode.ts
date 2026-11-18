"use client";

import { useViewerClient } from "@/lib/viewerClient";
import type { EmergencyPanelMode } from "./EmergencyPanel";
import { useDemoTab } from "./useDemoTab";

/** Demo when the viewer or this tab is in Judge Demo Mode; never waits on sign-in. */
export function useSafetyMode(): EmergencyPanelMode {
  const { auth } = useViewerClient();
  const demoTab = useDemoTab();
  const demo = demoTab || auth.status === "demo" || (auth.status === "offline" && auth.scope.mode === "demo");
  return demo ? "demo" : "live";
}
