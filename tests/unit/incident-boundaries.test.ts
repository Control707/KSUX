// @vitest-environment node
import fs from "node:fs";
import { expect, it } from "vitest";
import { INCIDENT_PLACES } from "../../convex/lib/incidentPolicy";

it("keeps Incident tables outside Feed and both Scrappy tool registries", () => {
  for (const file of ["convex/feed.ts", "convex/scrappy/tools.ts"]) {
    expect(fs.readFileSync(file, "utf8")).not.toMatch(/(?:query|insert)\(["'](?:incidents|incidentUpdates)["']/);
  }
});
it("uses only shipped building IDs and coarsens housing to complex level", () => {
  const geo = JSON.parse(fs.readFileSync("public/data/campus-buildings.geojson", "utf8"));
  const ids = new Set(geo.features.map((f: { properties: { geoFeatureId: string } }) => f.properties.geoFeatureId));
  for (const place of INCIDENT_PLACES) expect(ids.has(place.id)).toBe(true);
  expect(INCIDENT_PLACES.filter((p) => p.category === "housing").every((p) => !/\d/.test(p.name))).toBe(true);
});
it("keeps Incident mutations out of Convex's reconnect queue and drafts out of persistent storage", () => {
  const source = fs.readFileSync("src/components/safety/incidentClient.ts", "utf8");
  expect(source).toContain("ConvexHttpClient");
  expect(source).not.toContain("useMutation(");
  for (const file of ["IncidentForm.tsx", "IncidentViews.tsx", "incidentClient.ts"]) {
    expect(fs.readFileSync("src/components/safety/" + file, "utf8")).not.toMatch(/localStorage|sessionStorage|indexedDB|cache\.put/);
  }
});
