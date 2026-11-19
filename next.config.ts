import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/incident-photo": ["./public/fixtures/incident-photo*.svg"],
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
