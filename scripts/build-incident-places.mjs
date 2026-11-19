// Run after refreshing campus-buildings.geojson. Keep housing at complex level.
import fs from "node:fs";
const geo = JSON.parse(fs.readFileSync("public/data/campus-buildings.geojson", "utf8"));
const groups = new Map();
for (const feature of geo.features) {
  const p = feature.properties;
  const name = p.category === "housing" ? p.name.replace(/\s+(?:\d+|II)$/, "").replace(/ Activity Center$/, "") : p.name;
  const key = p.campus + ":" + name;
  const group = groups.get(key) ?? { p, name, xy: [] };
  group.xy.push(...feature.geometry.coordinates[0]);
  groups.set(key, group);
}
const rows = [...groups.values()].map(({ p, name, xy }) => {
  const xs = xy.map((point) => point[0]), ys = xy.map((point) => point[1]);
  return { id: p.geoFeatureId, name, campus: p.campus, aliases: p.aliases ?? [], category: p.category,
    longitude: (Math.min(...xs) + Math.max(...xs)) / 2, latitude: (Math.min(...ys) + Math.max(...ys)) / 2 };
});
fs.writeFileSync("convex/lib/incidentPlaces.json", JSON.stringify(rows, null, 2) + "\n");
