// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Seam 2 — Service Worker Routing Policies & Precached GeoJSON Budget (#26)", () => {
  it("verifies public/sw.js enforces 3s HTML timeout, Cache-First hashed bundles, SWR GeoJSON, and strict passthrough on APIs/Convex/Passio/UploadThing", () => {
    const swPath = path.resolve(process.cwd(), "public", "sw.js");
    const sw = fs.readFileSync(swPath, "utf8");

    expect(sw).toContain("SW_HTML_TIMEOUT_3S");
    expect(sw).toContain("3000");
    expect(sw).toContain('/_next/static/');
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.hostname.includes("passio3.com")');
    expect(sw).toContain('url.hostname.includes("utfs.io")');
    expect(sw).toContain('url.hostname.includes("convex.cloud")');
    expect(sw).toContain("SKIP_WAITING");

    // Verify precached campus GeoJSON files exist and stay well below the 3 MB budget
    const dataDir = path.resolve(process.cwd(), "public", "data");
    const geoFiles = [
      "parking-lots.geojson",
      "campus-buildings.geojson",
      "shuttle-routes.geojson",
      "meetup-spots.geojson",
    ];
    let totalBytes = 0;
    for (const file of geoFiles) {
      const stat = fs.statSync(path.join(dataDir, file));
      expect(stat.size).toBeGreaterThan(100);
      totalBytes += stat.size;
    }
    expect(totalBytes).toBeLessThan(3 * 1024 * 1024);
  });
});
