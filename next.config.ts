import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The development badge otherwise covers the mobile Now tab.
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/incident-photo": ["./public/fixtures/incident-photo*.svg"],
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
