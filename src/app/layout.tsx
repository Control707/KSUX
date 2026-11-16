import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ViewerClientProvider } from "@/lib/viewerClient";

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
  themeColor: "#111317",
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
      <body>
        <ViewerClientProvider>{children}</ViewerClientProvider>
      </body>
    </html>
  );
}
