import { describe, expect, it } from "vitest";
import seed from "../../data/ksu-seed/shuttle-routes.json";
import network from "../../data/ksu-seed/passio-network.json";
import fs from "node:fs";
import path from "node:path";

// Real campus extents (with a margin for off-campus stops such as shopping).
const KENNESAW = { minLat: 34.0, maxLat: 34.06, minLng: -84.62, maxLng: -84.54 };
const MARIETTA = { minLat: 33.88, maxLat: 33.96, minLng: -84.54, maxLng: -84.46 };
const inBox = (b: typeof KENNESAW, lat: number, lng: number) =>
  lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;

const geo = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public/data/shuttle-routes.geojson"), "utf8")
);
const routes = (seed as any).routes as Array<any>;
const features = (geo as any).features as Array<any>;

describe("Shuttle seed uses the real Passio network (#31)", () => {
  it("places every stop inside its campus area, not on a synthetic grid", () => {
    const stops = routes.flatMap((r) => r.stops);
    expect(stops.length).toBeGreaterThan(30);
    for (const s of stops) {
      const box = s.campus === "Marietta" ? MARIETTA : KENNESAW;
      expect(inBox(box, s.latitude, s.longitude), `${s.name} (${s.stopId})`).toBe(true);
    }
    // The old synthetic seed repeated longitude -84.587 / -84.523 down a column.
    const lngs = new Set(stops.map((s) => s.longitude));
    expect(lngs.size).toBeGreaterThan(20);
  });

  it("uses Passio's own stop IDs so GTFS-RT arrivals line up", () => {
    const ids = new Set(routes.flatMap((r) => r.stops.map((s: any) => s.stopId)));
    for (const live of ["361", "362", "3884"]) expect(ids.has(live)).toBe(true);
    for (const id of ids) expect(id).toMatch(/^\d+$/);
    for (const r of routes) {
      const seqs = r.stops.map((s: any) => s.sequence);
      expect(seqs).toEqual(seqs.map((_: number, i: number) => i + 1));
      expect(new Set(r.stops.map((s: any) => s.stopId)).size).toBe(r.stops.length);
    }
  });

  it("keeps campusScope consistent with stops and preserves the KM intercampus route", () => {
    for (const r of routes) {
      const campuses = new Set(r.stops.map((s: any) => s.campus));
      expect(r.campusScope).toBe(campuses.size > 1 ? "Both" : [...campuses][0]);
    }
    const km = routes.find((r) => r.passioRouteId === "74760");
    expect(km.campusScope).toBe("Both");
  });

  it("draws road-following route polylines that pass near their stops", () => {
    const lines = features.filter((f) => f.properties.featureKind === "route");
    expect(lines).toHaveLength(routes.length);
    for (const r of routes) {
      const line = lines.find((f) => f.properties.passioRouteId === r.passioRouteId);
      const coords: Array<[number, number]> = line.geometry.coordinates;
      expect(coords.length).toBeGreaterThan(100);
      for (const s of r.stops) {
        const nearest = Math.min(
          ...coords.map(([lng, lat]) => Math.hypot(lat - s.latitude, (lng - s.longitude) * 0.83))
        );
        // ~150 m in degrees: every stop sits on its route's line.
        expect(nearest, `${r.name}: ${s.name}`).toBeLessThan(0.0015);
      }
    }
  });

  it("exposes stop points whose IDs match the seed and snapshot", () => {
    const stopFeatures = features.filter((f) => f.properties.featureKind === "stop");
    const seedIds = new Set(routes.flatMap((r) => r.stops.map((s: any) => s.stopId)));
    expect(new Set(stopFeatures.map((f) => f.properties.stopId))).toEqual(seedIds);
    expect(Object.keys((network as any).stops).length).toBe(seedIds.size);
    for (const e of (seed as any).initialSnapshot.stopEtas) expect(seedIds.has(e.stopId)).toBe(true);
  });
});
