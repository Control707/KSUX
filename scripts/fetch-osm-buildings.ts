import fs from "node:fs";
import path from "node:path";

/**
 * Snapshots real, named KSU building footprints from OpenStreetMap into
 * data/ksu-seed/osm-buildings.json. `scripts/harvest-ksu-seed.ts` turns that
 * snapshot into public/data/campus-buildings.geojson, so harvesting stays
 * offline and deterministic. Refresh with:
 *
 *   pnpm run seed:osm && pnpm run seed:harvest
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 (https://osm.org/copyright).
 */
const OUT = path.join(process.cwd(), "data", "ksu-seed", "osm-buildings.json");
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Tight campus-core boxes (south, west, north, east); excludes the surrounding
// retail strips, hotels and apartments that OSM also tags as buildings.
const BOXES = [
  { campus: "Kennesaw", bbox: [34.0295, -84.588, 34.045, -84.579] },
  { campus: "Marietta", bbox: [33.93, -84.528, 33.943, -84.516] },
] as const;

const CAMPUS_BUILDING_TYPES = new Set([
  "university",
  "dormitory",
  "apartments",
  "residential",
  "parking",
  "detached",
  "public",
  "civic",
]);
// Buildings OSM tags generically ("yes") that are KSU facilities.
const INCLUDE_BY_NAME = new Set(["University Village Suites"]);
const EXCLUDE_NAME = /needs offical name|leasing office/i;

// OSM spellings corrected for display.
const NAME_FIXES: Record<string, string> = {
  "Clendinin Building": "Clendenin Building",
  "Auxillary Services & Programs": "Auxiliary Services & Programs",
};

// Student shorthand so "SRAC", "rec center" or "JMW" find the right building.
const ALIASES: Record<string, string[]> = {
  "Horace W. Sturgis Library": ["Sturgis", "Kennesaw library"],
  "Carmichael Student Center": ["Carmichael", "Student Center"],
  "Siegel Student Recreation & Activities Center": ["SRAC", "ARC", "Rec Center", "Recreation Center", "Gym"],
  "The Commons": ["Commons", "Dining Hall"],
  "Clendenin Building": ["Clendenin", "Computer Science", "CS"],
  "Burruss Building": ["Burruss"],
  "Joe Mack Wilson Student Center": ["JMW", "Student Center", "Marietta Student Center"],
  "Lawrence V. Johnson Library": ["Johnson Library", "Marietta library"],
  "Atrium Building": ["Atrium", "J Building", "Computing"],
  "Stingers": ["Stingers Dining", "Dining Hall"],
  "Engineering Technology Center": ["ETC"],
  "Norton Residence Hall": ["Norton"],
  "Recreation and Wellness Center": ["Marietta Rec", "Gym"],
  "Public Safety Building": ["Campus Police", "KSU Police"],
  "Wellstar Student Health Services Clinic": ["Health Clinic", "Student Health"],
  "Convocation Center": ["Convocation", "Basketball"],
  "Prillaman Health Sciences": ["Prillaman", "Nursing"],
  "Bailey Performance Center": ["Bailey"],
  "Zuckerman Museum of Art": ["Zuckerman"],
};

type Ring = Array<[number, number]>;
export interface OsmBuilding {
  id: number;
  name: string;
  code?: string;
  campus: "Kennesaw" | "Marietta";
  osmType: string;
  category: "academic" | "housing" | "parking" | "athletics" | "dining" | "services";
  aliases: string[];
  ring: Ring;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function categoryFor(name: string, type: string): OsmBuilding["category"] {
  if (type === "parking") return "parking";
  if (/^(The Commons|Stingers)$/.test(name)) return "dining";
  if (/recreation|gymnasium|athletic|hitting|convocation|wellness/i.test(name)) return "athletics";
  if (["dormitory", "apartments", "residential"].includes(type)) return "housing";
  if (type === "university") return "academic";
  return "services";
}

async function overpass(query: string): Promise<any> {
  let lastError: unknown;
  for (const host of OVERPASS) {
    try {
      const resp = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "OwlSide-seed/1.0 (github.com/Control707/KSUX)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(90_000),
      });
      if (!resp.ok) throw new Error(`${host} returned HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function main() {
  const buildings: OsmBuilding[] = [];
  for (const { campus, bbox } of BOXES) {
    const data = await overpass(
      `[out:json][timeout:60];way["building"]["name"](${bbox.join(",")});out geom tags;`
    );
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const rawName = String(tags.name ?? "").trim();
      const type = String(tags.building ?? "");
      if (!rawName || EXCLUDE_NAME.test(rawName)) continue;
      if (!CAMPUS_BUILDING_TYPES.has(type) && !INCLUDE_BY_NAME.has(rawName)) continue;
      // "A - Joe Mack Wilson Student Center" -> code "A", name without prefix.
      const prefixed = /^([A-Z]\d*)\s+-\s+(.+)$/.exec(rawName);
      const base = prefixed ? prefixed[2]!.trim() : rawName;
      const name = NAME_FIXES[base] ?? base;
      const ring: Ring = [];
      for (const p of el.geometry ?? []) {
        const pt: [number, number] = [round6(p.lon), round6(p.lat)];
        const prev = ring[ring.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) ring.push(pt);
      }
      if (ring.length < 4) continue;
      buildings.push({
        id: Number(el.id),
        name,
        ...(prefixed ? { code: prefixed[1]! } : {}),
        campus,
        osmType: type,
        category: categoryFor(name, type),
        aliases: ALIASES[name] ?? [],
        ring,
      });
    }
  }

  buildings.sort((a, b) => a.campus.localeCompare(b.campus) || a.name.localeCompare(b.name) || a.id - b.id);
  const perCampus = (c: string) => buildings.filter((b) => b.campus === c).length;
  if (perCampus("Kennesaw") < 40 || perCampus("Marietta") < 25) {
    throw new Error(
      `Implausible OSM result: ${perCampus("Kennesaw")} Kennesaw / ${perCampus("Marietta")} Marietta buildings`
    );
  }
  if (new Set(buildings.map((b) => b.id)).size !== buildings.length) {
    throw new Error("Duplicate OSM building ids");
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        license: "© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
        fetchedAt: new Date().toISOString(),
        buildings,
      },
      null,
      1
    ) + "\n"
  );
  console.log(
    `Wrote ${path.relative(process.cwd(), OUT)}: ${perCampus("Kennesaw")} Kennesaw + ${perCampus("Marietta")} Marietta buildings`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
