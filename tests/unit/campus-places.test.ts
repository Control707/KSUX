import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterMeetupSpots,
  normalizeQuery,
  placesFromGeoJson,
  searchPlaces,
} from "../../src/lib/campusPlaces";
import studyRooms from "../../data/ksu-seed/study-rooms.json";
import meetupSeed from "../../data/ksu-seed/meetup-spots.json";

const read = (f: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", f), "utf8"));
const geo = read("campus-buildings.geojson");
const places = placesFromGeoJson(geo);
const find = (q: string, campus?: "Kennesaw" | "Marietta") =>
  searchPlaces(places, q, { preferredCampus: campus }).map((p) => p.name);

// Real campus extents with margin.
const KENNESAW = { minLat: 34.02, maxLat: 34.05, minLng: -84.595, maxLng: -84.57 };
const MARIETTA = { minLat: 33.925, maxLat: 33.95, minLng: -84.535, maxLng: -84.51 };

// Ray-casting point-in-polygon.
function pointInRing(pt: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

describe("Named campus places layer (#32)", () => {
  it("replaces the numbered filler blocks with real, uniquely identified named buildings", () => {
    expect(places.length).toBeGreaterThan(100);
    const names: string[] = geo.features.map((f: any) => f.properties.name);
    expect(names.filter((n: string) => /Academic Hall KB\d|Engineering Hall MB\d/.test(n))).toEqual([]);
    expect(new Set(geo.features.map((f: any) => f.properties.geoFeatureId)).size).toBe(
      geo.features.length
    );
    for (const required of [
      "Wilson Annex - Onyx Theater",
      "Willingham Hall",
      "Bailey Performance Center",
      "Zuckerman Museum of Art",
      "Wellstar Student Health Services Clinic",
      "Central Parking Deck",
      "Gymnasium",
    ]) {
      expect(names, required).toContain(required);
    }
  });

  it("places every building inside its campus and gives each a real footprint", () => {
    for (const p of places) {
      const box = p.campus === "Marietta" ? MARIETTA : KENNESAW;
      expect(p.latitude, p.name).toBeGreaterThan(box.minLat);
      expect(p.latitude, p.name).toBeLessThan(box.maxLat);
      expect(p.longitude, p.name).toBeGreaterThan(box.minLng);
      expect(p.longitude, p.name).toBeLessThan(box.maxLng);
    }
    for (const f of geo.features) {
      expect(f.geometry.coordinates[0].length, f.properties.name).toBeGreaterThanOrEqual(5);
    }
  });

  it("credits OpenStreetMap (ODbL) in the shipped data", () => {
    expect(geo.license).toMatch(/OpenStreetMap contributors, ODbL/);
  });

  it("keeps study-room building references pointing at real features", () => {
    const ids = new Set(places.map((p) => p.id));
    const byId = new Map(places.map((p) => [p.id, p]));
    const refs = (studyRooms as any[]).filter((r) => r.geoFeatureId);
    expect(refs.length).toBeGreaterThan(40);
    for (const r of refs) expect(ids.has(r.geoFeatureId), r.slug).toBe(true);
    // Each library's rooms resolve to the right building.
    expect(byId.get(refs.find((r) => r.slug.startsWith("sturgis"))!.geoFeatureId)!.name).toBe(
      "Horace W. Sturgis Library"
    );
    expect(byId.get(refs.find((r) => r.slug.startsWith("johnson"))!.geoFeatureId)!.name).toBe(
      "Lawrence V. Johnson Library"
    );
  });

  it("anchors vetted Meetup Spots on their real buildings (within a footprint, not floating)", () => {
    const spots = meetupSeed as any[];
    const anchored: Record<string, string> = {
      "carmichael-student-center-atrium": "Carmichael Student Center",
      "sturgis-library-entrance": "Horace W. Sturgis Library",
      "johnson-library-plaza": "Lawrence V. Johnson Library",
      "wilson-student-center": "Joe Mack Wilson Student Center",
      "burruss-building-atrium": "Burruss Building",
    };
    for (const [slug, building] of Object.entries(anchored)) {
      const spot = spots.find((s) => s.slug === slug)!;
      const feature = geo.features.find((f: any) => f.properties.name === building);
      expect(
        pointInRing([spot.longitude, spot.latitude], feature.geometry.coordinates[0]),
        `${slug} should sit inside ${building}`
      ).toBe(true);
    }
  });
});

describe("Building search (#32)", () => {
  it("matches names, prefixes and building codes", () => {
    expect(find("sturgis")[0]).toBe("Horace W. Sturgis Library");
    expect(find("willing")[0]).toBe("Willingham Hall");
    expect(find("zuck")[0]).toBe("Zuckerman Museum of Art");
    expect(find("Stingers")).toContain("Stingers");
    expect(find("q")).toContain("Engineering Technology Center");
  });

  it("understands student shorthand and punctuation", () => {
    expect(find("SRAC")[0]).toBe("Siegel Student Recreation & Activities Center");
    expect(find("rec center", "Kennesaw")[0]).toBe("Siegel Student Recreation & Activities Center");
    expect(find("JMW")[0]).toBe("Joe Mack Wilson Student Center");
    expect(find("campus police")[0]).toBe("Public Safety Building");
    expect(find("health clinic")[0]).toBe("Wellstar Student Health Services Clinic");
    expect(find("  Student   Recreation & ")[0]).toBe("Siegel Student Recreation & Activities Center");
    expect(normalizeQuery("Owl’s  Nest!")).toBe("owls nest");
  });

  it("requires every token to match and returns nothing for empty or unknown queries", () => {
    expect(find("")).toEqual([]);
    expect(find("   ")).toEqual([]);
    expect(find("zzzz nonexistent")).toEqual([]);
    expect(find("library sturgis")).toEqual(["Horace W. Sturgis Library"]);
  });

  it("prefers the viewer's campus for ambiguous queries and caps results", () => {
    const k = searchPlaces(places, "student center", { preferredCampus: "Kennesaw" });
    const m = searchPlaces(places, "student center", { preferredCampus: "Marietta" });
    expect(k[0]!.campus).toBe("Kennesaw");
    expect(m[0]!.campus).toBe("Marietta");
    expect(searchPlaces(places, "a", { limit: 3 })).toHaveLength(3);
  });

  it("tolerates malformed GeoJSON without throwing", () => {
    expect(placesFromGeoJson(null)).toEqual([]);
    expect(placesFromGeoJson({ features: [{}, { properties: { name: "x" } }] })).toEqual([]);
  });
});

describe("Meetup Spot building search (#32)", () => {
  const spots = (meetupSeed as any[]).map((s, i) => ({ ...s, _id: `spot-${i}` }));

  it("returns everything for an empty query and filters by spot text", () => {
    expect(filterMeetupSpots(spots, "", places)).toHaveLength(spots.length);
    expect(filterMeetupSpots(spots, "library", places).map((s) => s.slug)).toEqual(
      expect.arrayContaining(["sturgis-library-entrance", "johnson-library-plaza"])
    );
  });

  it("finds spots near a searched building even when the spot name differs", () => {
    // "SRAC" is not in the spot's name, but the spot sits on that building.
    const hits = filterMeetupSpots(spots, "SRAC", places).map((s) => s.slug);
    expect(hits).toContain("arc-recreation-lobby");
    // "campus police" resolves to the Public Safety Building next to the Talon One lobby.
    expect(filterMeetupSpots(spots, "campus police", places).map((s) => s.slug)).toContain(
      "talon-one-public-safety"
    );
    expect(filterMeetupSpots(spots, "zzzz", places)).toEqual([]);
  });
});
