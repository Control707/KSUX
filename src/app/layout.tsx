import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ViewerClientProvider } from "@/lib/viewerClient";
import { AnnouncerProvider } from "@/components/a11y/Announcer";
import { DEMO_CALL_INTERCEPT_SCRIPT } from "@/components/safety/EmergencyPanel";

export const metadata: Metadata = {
  title: "KSUX — Kennesaw State Campus Companion",
  description:
    "Unified campus social network, Marketplace, Big Owl Bus, Parking, Study Rooms, Course Hubs, and Scrappy AI for Kennesaw & Marietta Campuses.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KSUX",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7EF" },
    { media: "(prefers-color-scheme: dark)", color: "#17140F" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Judge Demo Mode never dials, even before hydration or offline. */}
        <script dangerouslySetInnerHTML={{ __html: DEMO_CALL_INTERCEPT_SCRIPT }} />
      </head>
      <body>
        <AnnouncerProvider>
          <ViewerClientProvider>{children}</ViewerClientProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
