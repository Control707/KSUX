import fs from "node:fs";
import path from "node:path";

// Generates demonstration data and approximate offline map shapes locally.
// Verified public Banner records live separately in banner-verified.json.
const ROOT = process.cwd();
const GEO_DIR = path.join(ROOT, "public", "data");
const SEED_DIR = path.join(ROOT, "data", "ksu-seed");

fs.mkdirSync(GEO_DIR, { recursive: true });
fs.mkdirSync(SEED_DIR, { recursive: true });

function makeBoxPolygon(
  lat: number,
  lng: number,
  dLat = 0.00055,
  dLng = 0.0007
): number[][][] {
  return [
    [
      [Number((lng - dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
      [Number((lng + dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
      [Number((lng + dLng).toFixed(6)), Number((lat + dLat).toFixed(6))],
      [Number((lng - dLng).toFixed(6)), Number((lat + dLat).toFixed(6))],
      [Number((lng - dLng).toFixed(6)), Number((lat - dLat).toFixed(6))],
    ],
  ];
}


// =========================================================================
// 1. 72 Parking Lots (44 Kennesaw + 28 Marietta) + GeoJSON
// =========================================================================
interface SeedParkingLot {
  slug: string;
  campus: "Kennesaw" | "Marietta";
  name: string;
  lotCode: string;
  isDeck: boolean;
  levels: string[];
  permitTiers: string[];
  servedByShuttleRouteIds: string[];
  overflowTargetLotSlugs: string[];
  latitude: number;
  longitude: number;
  geoFeatureId: string;
}

const kennesawNamedLots: Array<{
  slug: string;
  name: string;
  lotCode: string;
  isDeck: boolean;
  levels: string[];
  permitTiers: string[];
  shuttleIds: string[];
  overflow: string[];
  lat: number;
  lng: number;
  peak: 0 | 1 | 2 | 3;
}> = [
  {
    slug: "central-parking-deck",
    name: "Central Parking Deck",
    lotCode: "CD",
    isDeck: true,
    levels: ["P1", "P2", "P3", "P4", "P5", "P6", "Roof"],
    permitTiers: ["Central", "Commuter"],
    shuttleIds: ["74761"],
    overflow: ["town-point-economy-lot", "shuttle-lot-3305"],
    lat: 34.0379,
    lng: -84.5811,
    peak: 3,
  },
  {
    slug: "east-parking-deck",
    name: "East Parking Deck",
    lotCode: "ED",
    isDeck: true,
    levels: ["P1", "P2", "P3", "P4", "P5", "Roof"],
    permitTiers: ["East", "Commuter"],
    shuttleIds: ["74761"],
    overflow: ["east-economy-lot", "town-point-economy-lot"],
    lat: 34.0365,
    lng: -84.5769,
    peak: 3,
  },
  {
    slug: "north-parking-deck",
    name: "North Parking Deck",
    lotCode: "ND",
    isDeck: true,
    levels: ["P1", "P2", "P3", "P4", "P5", "Roof"],
    permitTiers: ["North", "Central", "Commuter"],
    shuttleIds: ["74761", "74763"],
    overflow: ["town-point-economy-lot", "shuttle-lot-3305"],
    lat: 34.0414,
    lng: -84.5825,
    peak: 3,
  },
  {
    slug: "west-parking-deck",
    name: "West Parking Deck",
    lotCode: "WD",
    isDeck: true,
    levels: ["P1", "P2", "P3", "P4", "Roof"],
    permitTiers: ["West", "Commuter"],
    shuttleIds: ["2995", "74761"],
    overflow: ["west-economy-lot", "shuttle-lot-3305"],
    lat: 34.0384,
    lng: -84.5867,
    peak: 2,
  },
  {
    slug: "town-point-economy-lot",
    name: "Town Point Economy Lot",
    lotCode: "TPE",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "Central", "East", "West", "North", "Shuttle"],
    shuttleIds: ["74762", "74763"],
    overflow: ["shuttle-lot-3305"],
    lat: 34.0318,
    lng: -84.5742,
    peak: 1,
  },
  {
    slug: "east-economy-lot",
    name: "East Economy Lot",
    lotCode: "EE",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "East", "Central", "Shuttle"],
    shuttleIds: ["74762"],
    overflow: ["town-point-economy-lot"],
    lat: 34.0349,
    lng: -84.5738,
    peak: 1,
  },
  {
    slug: "west-economy-lot",
    name: "West Economy Lot",
    lotCode: "WE",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "West", "Central"],
    shuttleIds: ["2995"],
    overflow: ["shuttle-lot-3305"],
    lat: 34.0398,
    lng: -84.5892,
    peak: 1,
  },
  {
    slug: "gutenberg-economy-lot",
    name: "Gutenberg Economy Lot",
    lotCode: "GE",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "Shuttle", "Central"],
    shuttleIds: ["74762"],
    overflow: ["shuttle-lot-3305"],
    lat: 34.0309,
    lng: -84.5778,
    peak: 1,
  },
  {
    slug: "shuttle-lot-3305",
    name: "3305 Busbee Shuttle Lot",
    lotCode: "SL3305",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Shuttle", "Economy", "Central", "East", "West"],
    shuttleIds: ["71987"],
    overflow: [],
    lat: 34.0288,
    lng: -84.5719,
    peak: 0,
  },
  {
    slug: "ksu-center-lot",
    name: "KSU Center Lot",
    lotCode: "KC",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "Shuttle", "Faculty/Staff"],
    shuttleIds: ["71987"],
    overflow: ["shuttle-lot-3305"],
    lat: 34.0274,
    lng: -84.5695,
    peak: 1,
  },
  {
    slug: "austin-residence-lot",
    name: "Austin Residence Complex Lot",
    lotCode: "ARC-R",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Residential"],
    shuttleIds: ["2995"],
    overflow: ["west-economy-lot"],
    lat: 34.0355,
    lng: -84.5875,
    peak: 2,
  },
  {
    slug: "campus-loop-residential-lot",
    name: "Campus Loop Residential Lot",
    lotCode: "CLR",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Residential"],
    shuttleIds: ["74761"],
    overflow: ["west-economy-lot"],
    lat: 34.0419,
    lng: -84.5858,
    peak: 2,
  },
  {
    slug: "student-center-visitor-lot",
    name: "Carmichael Student Center Visitor Lot",
    lotCode: "SCV",
    isDeck: false,
    levels: ["Visitor Pay"],
    permitTiers: ["Visitor"],
    shuttleIds: ["74761"],
    overflow: ["central-parking-deck"],
    lat: 34.0391,
    lng: -84.5818,
    peak: 2,
  },
  {
    slug: "chastain-pointe-lot",
    name: "Chastain Pointe Lot",
    lotCode: "CPL",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Economy", "Central", "Shuttle"],
    shuttleIds: ["2998"],
    overflow: ["shuttle-lot-3305"],
    lat: 34.0315,
    lng: -84.5861,
    peak: 1,
  },
];

const parkingLots: SeedParkingLot[] = [];
for (const lot of kennesawNamedLots) {
  parkingLots.push({
    slug: lot.slug,
    campus: "Kennesaw",
    name: lot.name,
    lotCode: lot.lotCode,
    isDeck: lot.isDeck,
    levels: lot.levels,
    permitTiers: lot.permitTiers,
    servedByShuttleRouteIds: lot.shuttleIds,
    overflowTargetLotSlugs: lot.overflow,
    latitude: lot.lat,
    longitude: lot.lng,
    geoFeatureId: `lot-${lot.slug}`,
  });
}

// Remaining 30 Kennesaw surface lots (44 total on Kennesaw)
for (let i = 1; i <= 30; i++) {
  const code = `K${String(i).padStart(2, "0")}`;
  const slug = `kennesaw-lot-${code.toLowerCase()}`;
  const tierGroup =
    i <= 10
      ? ["Central", "Faculty/Staff"]
      : i <= 20
        ? ["East", "Economy"]
        : ["Residential", "West"];
  const lat = Number((34.033 + (i % 6) * 0.0017).toFixed(6));
  const lng = Number((-84.588 + Math.floor(i / 6) * 0.0024).toFixed(6));
  parkingLots.push({
    slug,
    campus: "Kennesaw",
    name: `Kennesaw Lot ${code}`,
    lotCode: code,
    isDeck: false,
    levels: ["Surface"],
    permitTiers: tierGroup,
    servedByShuttleRouteIds: ["74761"],
    overflowTargetLotSlugs: ["town-point-economy-lot", "shuttle-lot-3305"],
    latitude: lat,
    longitude: lng,
    geoFeatureId: `lot-${slug}`,
  });
}

const mariettaNamedLots: Array<{
  slug: string;
  name: string;
  lotCode: string;
  isDeck: boolean;
  levels: string[];
  permitTiers: string[];
  shuttleIds: string[];
  overflow: string[];
  lat: number;
  lng: number;
  peak: 0 | 1 | 2 | 3;
}> = [
  {
    slug: "marietta-west-deck",
    name: "Marietta West Deck",
    lotCode: "MWD",
    isDeck: true,
    levels: ["P1", "P2", "P3", "P4", "Roof"],
    permitTiers: ["Marietta West", "Central", "Commuter"],
    shuttleIds: ["74764", "74760"],
    overflow: ["marietta-shuttle-lot", "marietta-lot-e"],
    lat: 33.9408,
    lng: -84.5222,
    peak: 3,
  },
  {
    slug: "marietta-shuttle-lot",
    name: "Marietta Shuttle Lot",
    lotCode: "MSL",
    isDeck: false,
    levels: ["Surface"],
    permitTiers: ["Shuttle", "Economy", "Marietta West", "Central"],
    shuttleIds: ["74764", "71987"],
    overflow: [],
    lat: 33.9372,
    lng: -84.5168,
    peak: 0,
  },
];

for (const lot of mariettaNamedLots) {
  parkingLots.push({
    slug: lot.slug,
    campus: "Marietta",
    name: lot.name,
    lotCode: lot.lotCode,
    isDeck: lot.isDeck,
    levels: lot.levels,
    permitTiers: lot.permitTiers,
    servedByShuttleRouteIds: lot.shuttleIds,
    overflowTargetLotSlugs: lot.overflow,
    latitude: lot.lat,
    longitude: lot.lng,
    geoFeatureId: `lot-${lot.slug}`,
  });
}

const mariettaCodes = [
  "A",
  "B",
  "B1",
  "B2",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "L",
  "P21",
  "V2",
  "Z",
  "ER1",
  "ER2",
  "WR1",
  "WR2",
  "SH1",
  "SH2",
  "M10",
  "M11",
  "M12",
  "M14",
  "M15",
]; // 2 + 26 = 28 Marietta lots -> 44 + 28 = 72 total!

mariettaCodes.forEach((code, idx) => {
  const slug = `marietta-lot-${code.toLowerCase()}`;
  const isRes = code.startsWith("ER") || code.startsWith("WR") || code.startsWith("SH");
  const lat = Number((33.9378 + (idx % 6) * 0.0011).toFixed(6));
  const lng = Number((-84.523 + Math.floor(idx / 6) * 0.0016).toFixed(6));
  parkingLots.push({
    slug,
    campus: "Marietta",
    name: isRes ? `Marietta Residence Lot ${code}` : `Marietta Lot ${code}`,
    lotCode: code,
    isDeck: false,
    levels: ["Surface"],
    permitTiers: isRes
      ? ["Residential"]
      : idx < 10
        ? ["Marietta West", "Commuter", "Central"]
        : ["Economy", "Shuttle", "Faculty/Staff"],
    servedByShuttleRouteIds: ["74764"],
    overflowTargetLotSlugs: ["marietta-shuttle-lot"],
    latitude: lat,
    longitude: lng,
    geoFeatureId: `lot-${slug}`,
  });
});

// =========================================================================
// 2. Real, named campus building footprints (OpenStreetMap snapshot)
//    Refresh with `pnpm run seed:osm`. Data © OpenStreetMap contributors (ODbL).
// =========================================================================
const osmBuildings = (
  JSON.parse(
    fs.readFileSync(path.join(SEED_DIR, "osm-buildings.json"), "utf8")
  ) as {
    buildings: Array<{
      id: number;
      name: string;
      code?: string;
      campus: "Kennesaw" | "Marietta";
      category: string;
      aliases: string[];
      ring: Array<[number, number]>;
    }>;
  }
).buildings;

const buildingFeatureId = (id: number) => `bldg-osm-${id}`;
const buildingByName = (name: string) => {
  const b = osmBuildings.find((x) => x.name === name);
  if (!b) throw new Error(`Building "${name}" missing from OSM snapshot`);
  return b;
};
const centroid = (ring: Array<[number, number]>) => {
  const pts = ring.slice(0, -1);
  return {
    latitude: Number((pts.reduce((s, p) => s + p[1], 0) / pts.length).toFixed(5)),
    longitude: Number((pts.reduce((s, p) => s + p[0], 0) / pts.length).toFixed(5)),
  };
};

const buildingFeatures: any[] = osmBuildings.map((b) => ({
  type: "Feature",
  properties: {
    geoFeatureId: buildingFeatureId(b.id),
    name: b.name,
    ...(b.code ? { code: b.code } : {}),
    campus: b.campus,
    category: b.category,
    ...(b.aliases.length ? { aliases: b.aliases } : {}),
  },
  geometry: { type: "Polygon", coordinates: [b.ring] },
}));

// =========================================================================
// 3. 57 Study Rooms (47 LibCal + 10 Walk-In)
// =========================================================================
const studyRooms: any[] = [];
// 15 Sturgis Library (Kennesaw, lid=10524, gid=19509)
for (let i = 0; i < 15; i++) {
  const eid = 74084 + i;
  const roomNums = [
    "114",
    "126",
    "127",
    "128",
    "129",
    "130",
    "131",
    "201A",
    "201B",
    "302A",
    "302B",
    "304",
    "305",
    "401A",
    "401B",
  ];
  const rm = roomNums[i]!;
  studyRooms.push({
    slug: `sturgis-${rm.toLowerCase()}`,
    campus: "Kennesaw",
    buildingName: "Horace W. Sturgis Library",
    roomNumber: `Room ${rm}`,
    roomKind: "libcal",
    libcalLid: 10524,
    libcalGid: 19509,
    libcalEid: eid,
    capacity: i === 0 ? 10 : i < 7 ? 6 : 4,
    amenities: ["Whiteboard", "HDMI Display", "Power Outlets"],
    bookingUrl: `https://kennesaw.libcal.com/space/${eid}`,
    todayHoursLabel: "7:30 AM – 11:00 PM",
    geoFeatureId: buildingFeatureId(buildingByName("Horace W. Sturgis Library").id),
  });
}
// 30 Johnson Library (Marietta, lid=10526, gid=19510)
for (let i = 0; i < 30; i++) {
  const eid = 125186 + i;
  const floor = i < 10 ? 1 : i < 20 ? 2 : 3;
  const suffix = i % 2 === 0 ? "A" : "B";
  const rm = `${floor}3${Math.floor((i % 10) / 2)}${suffix}`;
  studyRooms.push({
    slug: `johnson-${rm.toLowerCase()}-${i}`,
    campus: "Marietta",
    buildingName: "Lawrence V. Johnson Library",
    roomNumber: `Room ${rm}`,
    roomKind: "libcal",
    libcalLid: 10526,
    libcalGid: 19510,
    libcalEid: eid,
    capacity: i % 3 === 0 ? 8 : 4,
    amenities: ["Whiteboard", "Collaborative Monitor", "USB-C Power"],
    bookingUrl: `https://kennesaw.libcal.com/space/${eid}`,
    todayHoursLabel: "8:00 AM – 10:00 PM",
    geoFeatureId: buildingFeatureId(buildingByName("Lawrence V. Johnson Library").id),
  });
}
// 2 Marietta KSU AI Lab (lid=24727) -> 15 + 30 + 2 = 47 LibCal rooms!
for (let i = 0; i < 2; i++) {
  const eid = 190001 + i;
  studyRooms.push({
    slug: `marietta-ai-lab-${i + 1}`,
    campus: "Marietta",
    buildingName: "KSU AI Lab (Atrium Building)",
    roomNumber: `AI Pod ${i + 1}`,
    roomKind: "libcal",
    libcalLid: 24727,
    libcalGid: 39100,
    libcalEid: eid,
    capacity: 8,
    amenities: ["GPU Workstation Display", "Glass Whiteboard", "Power"],
    bookingUrl: `https://kennesaw.libcal.com/space/${eid}`,
    todayHoursLabel: "9:00 AM – 8:00 PM",
    geoFeatureId: buildingFeatureId(buildingByName("Atrium Building").id),
  });
}
// 10 Curated Walk-In Spaces (6 Kennesaw + 4 Marietta) -> 47 + 10 = 57 Study Rooms!
const walkInSeeds = [
  {
    slug: "alc-2nd-floor-atrium",
    campus: "Kennesaw",
    buildingName: "Academic Learning Center (ALC)",
    roomNumber: "2nd Floor Open Atrium",
    capacity: 40,
  },
  {
    slug: "alc-4th-floor-pods",
    campus: "Kennesaw",
    buildingName: "Academic Learning Center (ALC)",
    roomNumber: "4th Floor Study Booths",
    capacity: 24,
  },
  {
    slug: "carmichael-study-lounge",
    campus: "Kennesaw",
    buildingName: "Carmichael Student Center",
    roomNumber: "2nd Floor Owl Lounge",
    capacity: 30,
  },
  {
    slug: "burruss-2nd-floor-nook",
    campus: "Kennesaw",
    buildingName: "A.L. Burruss Building",
    roomNumber: "2nd Floor Quiet Nook",
    capacity: 18,
  },
  {
    slug: "sturgis-3rd-floor-quiet",
    campus: "Kennesaw",
    buildingName: "Horace W. Sturgis Library",
    roomNumber: "3rd Floor Silent Reading Zone",
    capacity: 36,
  },
  {
    slug: "clendenin-cs-commons",
    campus: "Kennesaw",
    buildingName: "Clendenin Computer Science Building",
    roomNumber: "1st Floor CS Tutoring Commons",
    capacity: 20,
  },
  {
    slug: "atrium-j-collab-commons",
    campus: "Marietta",
    buildingName: "Atrium Building (J)",
    roomNumber: "Ground Collaborative Commons",
    capacity: 32,
  },
  {
    slug: "wilson-student-lounge",
    campus: "Marietta",
    buildingName: "Joe Mack Wilson Student Center",
    roomNumber: "Main Commuter Study Lounge",
    capacity: 28,
  },
  {
    slug: "johnson-2nd-floor-quiet",
    campus: "Marietta",
    buildingName: "Lawrence V. Johnson Library",
    roomNumber: "2nd Floor Quiet Carrels",
    capacity: 30,
  },
  {
    slug: "engineering-q-open-tables",
    campus: "Marietta",
    buildingName: "Engineering Technology Center (Q)",
    roomNumber: "Lobby Drafting & Study Tables",
    capacity: 22,
  },
] as const;

for (const w of walkInSeeds) {
  studyRooms.push({
    slug: w.slug,
    campus: w.campus,
    buildingName: w.buildingName,
    roomNumber: w.roomNumber,
    roomKind: "walk_in",
    capacity: w.capacity,
    amenities: ["Open Walk-In", "Wi-Fi", "Power Strips"],
    todayHoursLabel: "7:00 AM – 11:00 PM",
  });
}

// =========================================================================
// 4. 11 Big Owl Bus Shuttle Routes + 35 Canonical Stops + GeoJSON
// =========================================================================
// Real network snapshot from Passio GO (run `pnpm run seed:passio` to refresh).
// Stop IDs are Passio's own, so GTFS-RT arrival predictions match our stops.
const passioNetwork = JSON.parse(
  fs.readFileSync(path.join(SEED_DIR, "passio-network.json"), "utf8")
) as {
  stops: Record<string, { name: string; latitude: number; longitude: number }>;
  routes: Array<{
    passioRouteId: string;
    stopIds: string[];
    shape: Array<[number, number]>;
  }>;
};

// Marietta is ~12 km south of Kennesaw; latitude cleanly separates them.
const MARIETTA_MAX_LAT = 33.98;
const canonicalStops: Array<{
  stopId: string;
  name: string;
  campus: "Kennesaw" | "Marietta";
  latitude: number;
  longitude: number;
}> = Object.entries(passioNetwork.stops).map(([stopId, st]) => ({
  stopId,
  name: st.name,
  // Off-campus stops (shopping, apartments) belong to the campus they serve.
  campus: st.latitude < MARIETTA_MAX_LAT ? "Marietta" : "Kennesaw",
  latitude: st.latitude,
  longitude: st.longitude,
}));
const stopById = new Map(canonicalStops.map((st) => [st.stopId, st]));

const routeDefs = [
  {
    passioRouteId: "74760",
    shortName: "KM",
    name: "KM Kennesaw / Marietta",
    campusScope: "Both" as const,
    colorHex: "#FDBB30",
    // From the published Passio GTFS timetable (calendar: Mon–Sat; 06:37–23:10).
    hours: "Mon–Sat 6:37 AM – 11:10 PM",
  },
  {
    passioRouteId: "74761",
    shortName: "KL",
    name: "Kennesaw Loop",
    campusScope: "Kennesaw" as const,
    colorHex: "#6BAED6",
    hours: "Mon–Fri 7:00 AM – 10:00 PM",
  },
  {
    passioRouteId: "74764",
    shortName: "ML",
    name: "Marietta Loop",
    campusScope: "Marietta" as const,
    colorHex: "#17BECF",
    hours: "Mon–Fri 7:00 AM – 10:00 PM",
  },
  {
    passioRouteId: "74763",
    shortName: "BS",
    name: "Big Shanty Loop",
    campusScope: "Kennesaw" as const,
    colorHex: "#393B79",
    hours: "Mon–Fri 7:00 AM – 8:00 PM",
  },
  {
    passioRouteId: "2995",
    shortName: "WC",
    name: "West Campus",
    campusScope: "Kennesaw" as const,
    colorHex: "#8C564B",
    hours: "Mon–Fri 7:00 AM – 9:00 PM",
  },
  {
    passioRouteId: "2998",
    shortName: "CP",
    name: "Chastain Pointe / Arts",
    campusScope: "Kennesaw" as const,
    colorHex: "#BCBD22",
    hours: "Mon–Fri 7:30 AM – 7:00 PM",
  },
  {
    passioRouteId: "50227",
    shortName: "SS",
    name: "Skip Spann / Frey Road",
    campusScope: "Kennesaw" as const,
    colorHex: "#374151",
    hours: "Mon–Fri 7:30 AM – 6:30 PM",
  },
  {
    passioRouteId: "74762",
    shortName: "EC",
    name: "Economy Route",
    campusScope: "Kennesaw" as const,
    colorHex: "#D97706",
    hours: "Mon–Fri 7:00 AM – 9:30 PM",
  },
  {
    passioRouteId: "71987",
    shortName: "SH",
    name: "Shuttle Parking Route",
    campusScope: "Both" as const,
    colorHex: "#843C39",
    hours: "Mon–Fri 7:00 AM – 9:30 PM",
  },
  {
    passioRouteId: "75303",
    shortName: "KS",
    name: "Kennesaw Shopping",
    campusScope: "Kennesaw" as const,
    colorHex: "#2CA02C",
    hours: "Fri–Sun 11:00 AM – 7:00 PM",
  },
  {
    passioRouteId: "64025",
    shortName: "MS",
    name: "Marietta Shopping",
    campusScope: "Marietta" as const,
    colorHex: "#CE6DBD",
    hours: "Fri–Sun 11:00 AM – 7:00 PM",
  },
];

function passioRouteStops(passioRouteId: string) {
  const route = passioNetwork.routes.find(
    (r) => r.passioRouteId === passioRouteId
  );
  if (!route) throw new Error(`Route ${passioRouteId} missing from Passio snapshot`);
  return route.stopIds.map((id) => {
    const st = stopById.get(id);
    if (!st) throw new Error(`Stop ${id} missing from Passio snapshot`);
    return st;
  });
}

const shuttleRoutes = routeDefs.map((r) => ({
  passioRouteId: r.passioRouteId,
  shortName: r.shortName,
  name: r.name,
  // Derived from the real stops so scope can never drift from the network.
  campusScope: ((campuses) =>
    campuses.size > 1
      ? ("Both" as const)
      : ([...campuses][0] ?? r.campusScope))(
    new Set(passioRouteStops(r.passioRouteId).map((st) => st.campus))
  ),
  colorHex: r.colorHex,
  geoFeatureId: `route-${r.passioRouteId}`,
  stops: passioRouteStops(r.passioRouteId).map((st, seq) => {
    return {
      stopId: st.stopId,
      name: st.name,
      campus: st.campus,
      latitude: st.latitude,
      longitude: st.longitude,
      sequence: seq + 1,
    };
  }),
  operatingHoursSummary: r.hours,
}));

const initialShuttleSnapshot = {
  vehicles: shuttleRoutes.slice(0, 8).map((r, idx) => ({
    busId: `bob-${401 + idx}`,
    busName: `Big Owl #${401 + idx}`,
    passioRouteId: r.passioRouteId,
    latitude: r.stops[0]!.latitude,
    longitude: r.stops[0]!.longitude,
    heading: (idx * 45) % 360,
    paxLoad: 12 + idx * 3,
    totalCap: 42,
  })),
  stopEtas: shuttleRoutes.map((r, idx) => ({
    stopId: r.stops[0]!.stopId,
    passioRouteId: r.passioRouteId,
    etaMinutes: 3 + (idx % 7),
    loadLabel: idx % 3 === 0 ? "Seats Open" : idx % 3 === 1 ? "Moderate Load" : "Standing Room",
  })),
  shuttleNotices: [
    {
      noticeId: "bob-i75-advisory",
      title: "KM Intercampus Express Advisory",
      body: "KM Kennesaw / Marietta buses are using Cobb Pkwy (US-41) alternate routing during afternoon I-75 peak traffic.",
      passioRouteIds: ["74760"],
    },
  ],
};

// =========================================================================
// 5. 17 Nutrislice Dining Venues
// =========================================================================
const diningDefs: Array<{
  slug: string;
  id: number;
  campus: "Kennesaw" | "Marietta";
  kind: "dining_hall" | "retail";
  name: string;
  bldg: string;
  wkOpen: number;
  wkClose: number;
  weOpen: number | null;
  weClose: number | null;
  stations: Array<{
    name: string;
    items: Array<{
      name: string;
      calories: number;
      dietaryTags: string[];
      allergens: string[];
    }>;
  }>;
}> = [
  {
    slug: "the-commons",
    id: 6196,
    campus: "Kennesaw",
    kind: "dining_hall",
    name: "The Commons",
    bldg: "The Commons Dining Hall",
    wkOpen: 420,
    wkClose: 1320,
    weOpen: 540,
    weClose: 1260,
    stations: [
      {
        name: "Apron Strings",
        items: [
          {
            name: "Herb-Roasted Chicken w/ Red Pepper Sauce",
            calories: 410,
            dietaryTags: ["halal_friendly", "gluten_free"],
            allergens: ["milk"],
          },
          {
            name: "Garlic Mashed Potatoes",
            calories: 220,
            dietaryTags: ["vegetarian", "gluten_free"],
            allergens: ["milk"],
          },
        ],
      },
      {
        name: "Campus Green (Plant-Forward)",
        items: [
          {
            name: "Crispy Chickpea & Quinoa Harvest Bowl",
            calories: 380,
            dietaryTags: ["vegan", "vegetarian", "gluten_free"],
            allergens: [],
          },
        ],
      },
      {
        name: "Globe Trotters",
        items: [
          {
            name: "Halal Turmeric Chicken Shawarma Rice",
            calories: 520,
            dietaryTags: ["halal_friendly"],
            allergens: ["wheat"],
          },
        ],
      },
    ],
  },
  {
    slug: "stingers",
    id: 6192,
    campus: "Marietta",
    kind: "dining_hall",
    name: "Stingers",
    bldg: "Stingers Dining Hall",
    wkOpen: 420,
    wkClose: 1260,
    weOpen: 600,
    weClose: 1200,
    stations: [
      {
        name: "Down Home",
        items: [
          {
            name: "Creamy Mushroom Roasted Chicken",
            calories: 430,
            dietaryTags: ["halal_friendly"],
            allergens: ["milk"],
          },
        ],
      },
      {
        name: "Farm Basket",
        items: [
          {
            name: "Mediterranean Falafel & Roasted Veggie Plate",
            calories: 390,
            dietaryTags: ["vegan", "vegetarian", "halal_friendly"],
            allergens: ["sesame"],
          },
        ],
      },
      {
        name: "Slice of Pi",
        items: [
          {
            name: "Margherita Stone-Fired Pizza",
            calories: 310,
            dietaryTags: ["vegetarian"],
            allergens: ["wheat", "milk"],
          },
        ],
      },
    ],
  },
  {
    slug: "j-building",
    id: 6201,
    campus: "Marietta",
    kind: "retail",
    name: "Stacks (Atrium J)",
    bldg: "Atrium Building (J)",
    wkOpen: 450,
    wkClose: 1080,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Deli & Espresso",
        items: [
          {
            name: "Mediterranean Hummus Veggie Wrap",
            calories: 440,
            dietaryTags: ["vegan", "vegetarian"],
            allergens: ["wheat", "sesame"],
          },
        ],
      },
    ],
  },
  {
    slug: "chick-fil-a",
    id: 6202,
    campus: "Kennesaw",
    kind: "retail",
    name: "Chick-fil-A",
    bldg: "Carmichael Student Center",
    wkOpen: 450,
    wkClose: 1260,
    weOpen: 660,
    weClose: 1080,
    stations: [
      {
        name: "Entrees",
        items: [
          {
            name: "Spicy Chicken Sandwich",
            calories: 450,
            dietaryTags: [],
            allergens: ["wheat", "milk", "egg"],
          },
          {
            name: "Kale Crunch Side",
            calories: 170,
            dietaryTags: ["vegan", "vegetarian", "gluten_free"],
            allergens: ["tree_nuts"],
          },
        ],
      },
    ],
  },
  {
    slug: "panda-express",
    id: 6203,
    campus: "Kennesaw",
    kind: "retail",
    name: "Panda Express",
    bldg: "Carmichael Student Center",
    wkOpen: 630,
    wkClose: 1200,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Wok",
        items: [
          {
            name: "Super Greens & Eggplant Tofu Bowl",
            calories: 430,
            dietaryTags: ["vegetarian"],
            allergens: ["soy", "wheat"],
          },
        ],
      },
    ],
  },
  {
    slug: "moes",
    id: 6204,
    campus: "Kennesaw",
    kind: "retail",
    name: "Moe's Southwest Grill",
    bldg: "Carmichael Student Center",
    wkOpen: 630,
    wkClose: 1200,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Burritos & Bowls",
        items: [
          {
            name: "Organic Tofu & Black Bean Homewrecker Bowl",
            calories: 560,
            dietaryTags: ["vegan", "vegetarian", "gluten_free"],
            allergens: ["soy"],
          },
        ],
      },
    ],
  },
  {
    slug: "mcalisters-deli",
    id: 6205,
    campus: "Kennesaw",
    kind: "retail",
    name: "McAlister's Deli",
    bldg: "Academic Learning Center",
    wkOpen: 480,
    wkClose: 1140,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Spuds & Sandwiches",
        items: [
          {
            name: "Veggie Spud & Sweet Tea",
            calories: 590,
            dietaryTags: ["vegetarian", "gluten_free"],
            allergens: ["milk"],
          },
        ],
      },
    ],
  },
  {
    slug: "dunkin",
    id: 6206,
    campus: "Marietta",
    kind: "retail",
    name: "Dunkin'",
    bldg: "Joe Mack Wilson Student Center",
    wkOpen: 420,
    wkClose: 1080,
    weOpen: 540,
    weClose: 900,
    stations: [
      {
        name: "Coffee & Bakery",
        items: [
          {
            name: "Cold Brew w/ Oatmilk & Avocado Toast",
            calories: 310,
            dietaryTags: ["vegan", "vegetarian"],
            allergens: ["wheat"],
          },
        ],
      },
    ],
  },
  {
    slug: "hissho",
    id: 6207,
    campus: "Marietta",
    kind: "retail",
    name: "Hissho Sushi",
    bldg: "Joe Mack Wilson Student Center",
    wkOpen: 630,
    wkClose: 1140,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Sushi Bar",
        items: [
          {
            name: "Avocado Cucumber Roll",
            calories: 290,
            dietaryTags: ["vegan", "vegetarian"],
            allergens: ["sesame", "soy"],
          },
        ],
      },
    ],
  },
  {
    slug: "cinnabon",
    id: 6208,
    campus: "Kennesaw",
    kind: "retail",
    name: "Cinnabon",
    bldg: "Carmichael Student Center",
    wkOpen: 480,
    wkClose: 1080,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Bakery",
        items: [
          {
            name: "Classic Cinnamon Roll",
            calories: 880,
            dietaryTags: ["vegetarian"],
            allergens: ["wheat", "milk", "egg"],
          },
        ],
      },
    ],
  },
  {
    slug: "high-point-cafe",
    id: 6209,
    campus: "Kennesaw",
    kind: "retail",
    name: "High Point Cafe",
    bldg: "Austin Residence Complex",
    wkOpen: 480,
    wkClose: 1320,
    weOpen: 660,
    weClose: 1260,
    stations: [
      {
        name: "Late Night Grill",
        items: [
          {
            name: "Black Bean Burger & Seasoned Fries",
            calories: 620,
            dietaryTags: ["vegetarian"],
            allergens: ["wheat", "soy"],
          },
        ],
      },
    ],
  },
  {
    slug: "high-roller-sushi",
    id: 6210,
    campus: "Kennesaw",
    kind: "retail",
    name: "High Roller Sushi",
    bldg: "Carmichael Student Center",
    wkOpen: 630,
    wkClose: 1140,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Poke & Rolls",
        items: [
          {
            name: "Spicy Salmon Poke Bowl",
            calories: 540,
            dietaryTags: ["gluten_free"],
            allergens: ["fish", "soy"],
          },
        ],
      },
    ],
  },
  {
    slug: "jamba",
    id: 6211,
    campus: "Kennesaw",
    kind: "retail",
    name: "Jamba",
    bldg: "Student Recreation & Activities Center",
    wkOpen: 480,
    wkClose: 1200,
    weOpen: 660,
    weClose: 1080,
    stations: [
      {
        name: "Plant-Based Smoothies",
        items: [
          {
            name: "Apples 'n Greens Smoothie",
            calories: 250,
            dietaryTags: ["vegan", "vegetarian", "gluten_free"],
            allergens: [],
          },
        ],
      },
    ],
  },
  {
    slug: "on-the-fly",
    id: 6212,
    campus: "Marietta",
    kind: "retail",
    name: "On The Fly Market",
    bldg: "Joe Mack Wilson Student Center",
    wkOpen: 480,
    wkClose: 1260,
    weOpen: 660,
    weClose: 1140,
    stations: [
      {
        name: "Grab & Go",
        items: [
          {
            name: "Halal Roasted Chicken Caesar Salad",
            calories: 390,
            dietaryTags: ["halal_friendly"],
            allergens: ["milk", "egg"],
          },
        ],
      },
    ],
  },
  {
    slug: "starbucks-social-sciences-building",
    id: 6213,
    campus: "Kennesaw",
    kind: "retail",
    name: "Starbucks (Social Sciences)",
    bldg: "Social Sciences Building",
    wkOpen: 450,
    wkClose: 1140,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Espresso & Refreshers",
        items: [
          {
            name: "Iced Brown Sugar Oatmilk Shaken Espresso",
            calories: 120,
            dietaryTags: ["vegan", "vegetarian"],
            allergens: [],
          },
        ],
      },
    ],
  },
  {
    slug: "starbucks-student-center",
    id: 6214,
    campus: "Kennesaw",
    kind: "retail",
    name: "Starbucks (Student Center)",
    bldg: "Carmichael Student Center",
    wkOpen: 450,
    wkClose: 1200,
    weOpen: 600,
    weClose: 1080,
    stations: [
      {
        name: "Espresso & Bakery",
        items: [
          {
            name: "Spinach, Feta & Egg White Wrap",
            calories: 290,
            dietaryTags: ["vegetarian"],
            allergens: ["wheat", "milk", "egg"],
          },
        ],
      },
    ],
  },
  {
    slug: "the-local-spot",
    id: 6215,
    campus: "Kennesaw",
    kind: "retail",
    name: "The Local Spot",
    bldg: "Prillaman Health Sciences Hall",
    wkOpen: 480,
    wkClose: 1020,
    weOpen: null,
    weClose: null,
    stations: [
      {
        name: "Rotating Local Kitchen",
        items: [
          {
            name: "Tandoori Chickpea & Basmati Bowl",
            calories: 480,
            dietaryTags: ["vegan", "vegetarian", "halal_friendly", "gluten_free"],
            allergens: [],
          },
        ],
      },
    ],
  },
];

const diningVenues = diningDefs.map((d) => ({
  nutrisliceSlug: d.slug,
  nutrisliceId: d.id,
  campus: d.campus,
  venueKind: d.kind,
  name: d.name,
  buildingName: d.bldg,
  doorRatesJson:
    d.kind === "dining_hall"
      ? JSON.stringify({ breakfast: "$9.75", lunch: "$12.75", dinner: "$14.00" })
      : undefined,
  hoursScheduleJson: JSON.stringify({
    weekdayOpenMin: d.wkOpen,
    weekdayCloseMin: d.wkClose,
    weekendOpenMin: d.weOpen,
    weekendCloseMin: d.weClose,
  }),
  todayMenuJson: JSON.stringify({ stations: d.stations }),
  tomorrowMenuJson: JSON.stringify({ stations: d.stations }),
}));

// =========================================================================
// 6. 544 Active Clubs (Registered KSU Clubs + Campus Departments)
// =========================================================================
const featuredClubs: Array<{
  slug: string;
  name: string;
  shortName: string;
  campus: "Kennesaw" | "Marietta";
  clubKind: "registered_ksu" | "campus_department";
  email: string;
  summary: string;
}> = [
  {
    slug: "acm-ksu",
    name: "Association for Computing Machinery at KSU",
    shortName: "ACM",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "acm@students.kennesaw.edu",
    summary: "Workshops, ICPC algorithms prep, and OwlHacks community across CCSE.",
  },
  {
    slug: "owl-investment-group",
    name: "Owl Investment Group",
    shortName: "OIG",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "alex.rivera@students.kennesaw.edu",
    summary: "Coles College student-managed equity research, pitch nights, and market prep.",
  },
  {
    slug: "ksu-autonomous-robotics",
    name: "KSU Autonomous Robotics Organization",
    shortName: "KSUARO",
    campus: "Marietta",
    clubKind: "registered_ksu",
    email: "robotics@students.kennesaw.edu",
    summary: "Autonomous rovers, ROS2 navigation, and competition robotics on Marietta Campus.",
  },
  {
    slug: "motorsports-formula-sae",
    name: "KSU Motorsports (Formula SAE)",
    shortName: "KSUFS",
    campus: "Marietta",
    clubKind: "registered_ksu",
    email: "fsae@students.kennesaw.edu",
    summary: "Designs, fabricates, and races open-wheel Formula SAE vehicles on Marietta.",
  },
  {
    slug: "society-of-women-engineers",
    name: "Society of Women Engineers at KSU",
    shortName: "SWE",
    campus: "Marietta",
    clubKind: "registered_ksu",
    email: "swe@students.kennesaw.edu",
    summary: "Mentorship, industry panels, and outreach for women in engineering and computing.",
  },
  {
    slug: "cyber-defense-team",
    name: "KSU Offensive & Defensive Cyber Team",
    shortName: "KSUCDT",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "cyber@students.kennesaw.edu",
    summary: "CCDC defense competitions, CTF nights, and Blue/Red team labs.",
  },
  {
    slug: "game-design-club",
    name: "Game Design & Development Club",
    shortName: "GDDC",
    campus: "Marietta",
    clubKind: "registered_ksu",
    email: "gddc@students.kennesaw.edu",
    summary: "48-hour game jams, Unreal/Godot/Unity workshops, and playtesting nights.",
  },
  {
    slug: "black-musicians-coalition",
    name: "Black Musicians Coalition",
    shortName: "BMC",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "bmc@students.kennesaw.edu",
    summary: "Live showcases, jam sessions, and musical collaboration at Bailey School of Music.",
  },
  {
    slug: "biomedical-research-society",
    name: "Biomedical Research Society",
    shortName: "BRS",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "brs@students.kennesaw.edu",
    summary: "Undergraduate wet-lab mentorship, journal clubs, and symposium prep.",
  },
  {
    slug: "aviation-at-ksu",
    name: "Aviation at Kennesaw State University",
    shortName: "AVKSU",
    campus: "Marietta",
    clubKind: "registered_ksu",
    email: "aviation@students.kennesaw.edu",
    summary: "Flight simulation, Cobb County Airport fly-ins, and aerospace guest speakers.",
  },
  {
    slug: "pre-law-club",
    name: "Pre-Law Society at KSU",
    shortName: "PLS",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "prelaw@students.kennesaw.edu",
    summary: "LSAT study circles, mock trial scrimmages, and Atlanta law school tours.",
  },
  {
    slug: "philosophy-student-association",
    name: "Philosophy Student Association",
    shortName: "PSA",
    campus: "Kennesaw",
    clubKind: "registered_ksu",
    email: "psa@students.kennesaw.edu",
    summary: "Weekly Socratic seminars, ethics bowls, and visiting faculty discussions.",
  },
  {
    slug: "student-activities-board",
    name: "KSU Student Activities Board (KAB)",
    shortName: "KAB",
    campus: "Kennesaw",
    clubKind: "campus_department",
    email: "kab@kennesaw.edu",
    summary: "Homecoming concerts, Scrappy Hour, outdoor movies, and dual-campus traditions.",
  },
  {
    slug: "career-planning-development",
    name: "Department of Career Planning & Development",
    shortName: "CPD",
    campus: "Kennesaw",
    clubKind: "campus_department",
    email: "careers@kennesaw.edu",
    summary: "STEM & Business Career Fairs, resume reviews, and Handshake interview prep.",
  },
];

const clubs: any[] = [];
featuredClubs.forEach((fc, idx) => {
  clubs.push({
    externalEngageId: `engage-${10000 + idx}`,
    slug: fc.slug,
    clubKind: fc.clubKind,
    campus: fc.campus,
    name: fc.name,
    shortName: fc.shortName,
    summary: fc.summary,
    description: `${fc.summary} Active organization synced from KSU Anthology Engage.`,
    searchText: `${fc.name} ${fc.shortName} ${fc.summary} ${fc.campus}`,
    contactEmailCanonical: fc.email,
    prodMemberCount: 35 + (idx * 7) % 90,
  });
});

const clubDomains = [
  "Artificial Intelligence",
  "Aerospace Propulsion",
  "Civil Infrastructure",
  "Mechatronics",
  "Data Analytics",
  "Quantitative Finance",
  "Supply Chain",
  "Entrepreneurship",
  "Nursing Student",
  "Public Health",
  "Neuroscience",
  "Environmental Action",
  "Architecture Studio",
  "Industrial Design",
  "Digital Animation",
  "Esports",
  "Tabletop Strategy",
  "Outdoor Adventure",
  "Running & Track",
  "Climbing",
  "Badminton",
  "Volleyball",
  "Soccer",
  "Chess",
  "Debate & Forensics",
];
const clubSuffixes = [
  "Society",
  "Association",
  "Club",
  "Collective",
  "Council",
  "Chapter",
  "Guild",
  "Coalition",
  "Fellowship",
  "Forum",
  "Initiative",
  "Alliance",
  "League",
  "Network",
  "Symposium",
  "Workshop",
  "Academy",
  "Lab",
  "Brigade",
  "Union",
  "Circle",
  "Institute",
];

let clubCounter = 0;
while (clubs.length < 544) {
  const dom = clubDomains[clubCounter % clubDomains.length]!;
  const suf =
    clubSuffixes[Math.floor(clubCounter / clubDomains.length) % clubSuffixes.length]!;
  const idxNum = clubCounter + 1;
  const isMarietta = clubCounter % 3 === 1;
  const campus: "Kennesaw" | "Marietta" = isMarietta ? "Marietta" : "Kennesaw";
  const isDept = clubCounter % 14 === 0;
  const name = `KSU ${dom} ${suf}${clubCounter >= 500 ? ` ${idxNum - 499}` : ""}`;
  const slug = `ksu-${dom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suf.toLowerCase()}-${idxNum}`;
  clubs.push({
    externalEngageId: `engage-${20000 + idxNum}`,
    slug,
    clubKind: isDept ? "campus_department" : "registered_ksu",
    campus,
    name,
    shortName: `${dom.slice(0, 3).toUpperCase()}${idxNum}`,
    summary: `Official ${campus} Campus ${isDept ? "department" : "student organization"} focused on ${dom.toLowerCase()}.`,
    description: `${name} brings Kennesaw State Students together on the ${campus} Campus for weekly meetings, peer mentorship, and campus events.`,
    searchText: `${name} ${dom} ${suf} ${campus}`,
    contactEmailCanonical: `org${idxNum}@${isDept ? "kennesaw.edu" : "students.kennesaw.edu"}`,
    prodMemberCount: 12 + (idxNum % 65),
  });
  clubCounter++;
}

// =========================================================================
// 7. 30 Upcoming Deduplicated Events (Localist + Engage)
// =========================================================================
const eventTemplates = [
  {
    title: "Scrappy Hour: Hot Cocoa & Campus Trivia",
    source: "engage",
    campus: "Kennesaw",
    isVirtual: false,
    locationName: "Carmichael Student Center Atrium",
    offsetHrs: 2,
    durHrs: 2,
    clubSlug: "student-activities-board",
  },
  {
    title: "Marietta Robotics & Formula SAE Shop Open House",
    source: "engage",
    campus: "Marietta",
    isVirtual: false,
    locationName: "Engineering Technology Center (Q) Bay 104",
    offsetHrs: 3,
    durHrs: 2,
    clubSlug: "ksu-autonomous-robotics",
  },
  {
    title: "CCSE Technical Interview & Resume Clinic (Virtual)",
    source: "localist",
    campus: "Kennesaw",
    isVirtual: true,
    locationName: "Microsoft Teams · KSU Career Services",
    offsetHrs: 4,
    durHrs: 1.5,
    clubSlug: "career-planning-development",
  },
  {
    title: "ACM Algorithms & Pizza Night: Dynamic Programming",
    source: "engage",
    campus: "Kennesaw",
    isVirtual: false,
    locationName: "Clendenin CS Building Room 1009",
    offsetHrs: 6,
    durHrs: 2,
    clubSlug: "acm-ksu",
  },
  {
    title: "MUST Ministries Mobile Campus Pantry",
    source: "engage",
    campus: "Kennesaw",
    isVirtual: false,
    locationName: "Campus Green Plaza",
    offsetHrs: 22,
    durHrs: 3,
  },
  {
    title: "Marietta Game Jam Kickoff & Team Formation",
    source: "engage",
    campus: "Marietta",
    isVirtual: false,
    locationName: "Atrium Building (J) Room 109",
    offsetHrs: 26,
    durHrs: 3,
    clubSlug: "game-design-club",
  },
];

const events: any[] = [];
for (let i = 0; i < 30; i++) {
  const tpl = eventTemplates[i % eventTemplates.length]!;
  const dayJump = Math.floor(i / eventTemplates.length) * 24;
  const isVirtual = i % 5 === 2 || tpl.isVirtual;
  const campus: "Kennesaw" | "Marietta" =
    i % 2 === 1 ? "Marietta" : (tpl.campus as "Kennesaw" | "Marietta");
  const title =
    i < eventTemplates.length
      ? tpl.title
      : `${tpl.title} — Session ${Math.floor(i / eventTemplates.length) + 1}`;
  events.push({
    externalKey: `${tpl.source}:seed-${1000 + i}`,
    source: tpl.source,
    campus,
    campusScope: isVirtual ? "Both" : campus,
    isVirtual,
    clubSlug: tpl.clubSlug,
    title,
    description: `Official KSU ${isVirtual ? "dual-campus virtual" : `${campus} Campus`} gathering synced from ${tpl.source === "localist" ? "calendar.kennesaw.edu" : "Anthology Engage"}.`,
    searchText: `${title} ${tpl.locationName} ${campus}`,
    locationName: tpl.locationName,
    externalUrl:
      tpl.source === "localist"
        ? "https://calendar.kennesaw.edu"
        : "https://kennesaw.campuslabs.com/engage/events",
    startOffsetHours: tpl.offsetHrs + dayJump,
    durationHours: tpl.durHrs,
    prodGoingCount: 8 + (i % 25),
    prodInterestedCount: 14 + (i % 30),
  });
}

// =========================================================================
// 8. 14 Curated Public Meetup Spots (7 Kennesaw + 7 Marietta) + GeoJSON
// =========================================================================
const MEETUP_BUILDING_ANCHORS: Record<string, string> = {
  "carmichael-student-center-atrium": "Carmichael Student Center",
  "sturgis-library-entrance": "Horace W. Sturgis Library",
  "talon-one-public-safety": "Public Safety Building",
  "social-sciences-lobby": "Social Sciences Building",
  "burruss-building-atrium": "Burruss Building",
  "arc-recreation-lobby": "Siegel Student Recreation & Activities Center",
  "wilson-student-center": "Joe Mack Wilson Student Center",
  "johnson-library-plaza": "Lawrence V. Johnson Library",
  "atrium-building-lobby": "Atrium Building",
  "engineering-lab-plaza": "Engineering Technology Center",
  "norton-hall-courtyard": "Norton Residence Hall",
  "design-ii-lobby": "Design 2 Building",
};

const meetupSpots = [
  {
    slug: "carmichael-student-center-atrium",
    campus: "Kennesaw" as const,
    name: "Carmichael Student Center Atrium",
    buildingCode: "SC",
    safetyNotes: "High-foot-traffic indoor hub beside Info Desk & security cameras.",
    latitude: 34.0391,
    longitude: -84.5822,
    sortOrder: 1,
  },
  {
    slug: "campus-green-plaza",
    campus: "Kennesaw" as const,
    name: "Campus Green Flagpole Plaza",
    buildingCode: "CG",
    safetyNotes: "Open central walkway with emergency blue-light call tower.",
    latitude: 34.0385,
    longitude: -84.5828,
    sortOrder: 2,
  },
  {
    slug: "sturgis-library-entrance",
    campus: "Kennesaw" as const,
    name: "Sturgis Library Main Entrance",
    buildingCode: "LB",
    safetyNotes: "Well-lit staffed entrance facing the Campus Green.",
    latitude: 34.0384,
    longitude: -84.5829,
    sortOrder: 3,
  },
  {
    slug: "talon-one-public-safety",
    campus: "Kennesaw" as const,
    name: "Talon One & KSU Public Safety Lobby",
    buildingCode: "PS",
    safetyNotes: "Highest-security swap zone monitored directly by KSU Police.",
    latitude: 34.0395,
    longitude: -84.5815,
    sortOrder: 4,
  },
  {
    slug: "social-sciences-lobby",
    campus: "Kennesaw" as const,
    name: "Social Sciences Building Main Lobby",
    buildingCode: "SO",
    safetyNotes: "Busy ground-floor atrium adjacent to Starbucks.",
    latitude: 34.0372,
    longitude: -84.5838,
    sortOrder: 5,
  },
  {
    slug: "burruss-building-atrium",
    campus: "Kennesaw" as const,
    name: "Burruss Building Ground Atrium",
    buildingCode: "BB",
    safetyNotes: "Coles College main lobby with abundant seating and wall outlets.",
    latitude: 34.038,
    longitude: -84.5844,
    sortOrder: 6,
  },
  {
    slug: "arc-recreation-lobby",
    campus: "Kennesaw" as const,
    name: "Student Recreation & Activities Center Lobby",
    buildingCode: "SRAC",
    safetyNotes: "Staffed check-in desk with convenient curbside drop-off.",
    latitude: 34.0364,
    longitude: -84.5828,
    sortOrder: 7,
  },
  {
    slug: "wilson-student-center",
    campus: "Marietta" as const,
    name: "Joe Mack Wilson Student Center Lobby",
    buildingCode: "A",
    safetyNotes: "Main Marietta student hub next to Dunkin' & Info Desk.",
    latitude: 33.9406,
    longitude: -84.5189,
    sortOrder: 1,
  },
  {
    slug: "johnson-library-plaza",
    campus: "Marietta" as const,
    name: "Lawrence V. Johnson Library Plaza",
    buildingCode: "C",
    safetyNotes: "Central Marietta brick plaza next to the iconic Globe sculpture.",
    latitude: 33.9401,
    longitude: -84.5195,
    sortOrder: 2,
  },
  {
    slug: "atrium-building-lobby",
    campus: "Marietta" as const,
    name: "Atrium Building (J) Main Lobby",
    buildingCode: "J",
    safetyNotes: "Bright indoor computing atrium with power outlets to test electronics.",
    latitude: 33.9394,
    longitude: -84.5204,
    sortOrder: 3,
  },
  {
    slug: "engineering-lab-plaza",
    campus: "Marietta" as const,
    name: "Engineering Technology Center Courtyard",
    buildingCode: "Q",
    safetyNotes: "Open daytime engineering quad with blue-light emergency phone.",
    latitude: 33.9412,
    longitude: -84.5209,
    sortOrder: 4,
  },
  {
    slug: "norton-hall-courtyard",
    campus: "Marietta" as const,
    name: "Norton Hall Well-Lit Courtyard",
    buildingCode: "R",
    safetyNotes: "Well-lit paved walkway near Marietta residence life.",
    latitude: 33.9416,
    longitude: -84.5197,
    sortOrder: 5,
  },
  {
    slug: "marietta-public-safety",
    campus: "Marietta" as const,
    name: "Marietta Campus Public Safety Precinct",
    buildingCode: "MPS",
    safetyNotes: "24/7 KSU Police Marietta precinct safe-exchange zone.",
    latitude: 33.9398,
    longitude: -84.5215,
    sortOrder: 6,
  },
  {
    slug: "design-ii-lobby",
    campus: "Marietta" as const,
    name: "Design II Atrium Entrance",
    buildingCode: "I2",
    safetyNotes: "Architecture & Design studio lobby with wide tables.",
    latitude: 33.9385,
    longitude: -84.5201,
    sortOrder: 7,
  },
].map((m) => {
  // Snap each spot to the real building it is named after, so the pin sits on
  // the footprint instead of floating in the quad. Outdoor spots with no
  // matching building (Campus Green plaza, Marietta precinct) keep their point.
  const anchor = MEETUP_BUILDING_ANCHORS[m.slug];
  return {
    ...m,
    ...(anchor ? centroid(buildingByName(anchor).ring) : {}),
    geoFeatureId: `meetup-${m.slug}`,
  };
});

// =========================================================================
// 9. Dual-Term Fall 2026 (202608) & Spring 2027 (202701) Courses & Syllabi
// =========================================================================
const featuredCourses: Array<{
  subjectCode: string;
  courseNumber: string;
  title: string;
  campuses: Array<"Kennesaw" | "Marietta">;
  sections202608: Array<{
    crn: string;
    sec: string;
    campus: "Kennesaw" | "Marietta";
    mode: "in_person" | "hybrid" | "online";
    prof: string;
    days: string[];
    startMin: number;
    endMin: number;
    timeLabel: string;
    bldg: string;
    room: string;
  }>;
}> = [
  {
    subjectCode: "CS",
    courseNumber: "3305",
    title: "Data Structures",
    campuses: ["Kennesaw", "Marietta"],
    sections202608: [
      {
        crn: "83190",
        sec: "01",
        campus: "Kennesaw",
        mode: "in_person",
        prof: "Dr. Elena Vance",
        days: ["M", "W"],
        startMin: 660,
        endMin: 735,
        timeLabel: "MW 11:00 AM – 12:15 PM",
        bldg: "Clendenin CS Building",
        room: "1009",
      },
      {
        crn: "83191",
        sec: "02",
        campus: "Marietta",
        mode: "in_person",
        prof: "Dr. Marcus Sterling",
        days: ["T", "R"],
        startMin: 840,
        endMin: 915,
        timeLabel: "TR 2:00 PM – 3:15 PM",
        bldg: "Atrium Building (J)",
        room: "202",
      },
    ],
  },
  {
    subjectCode: "SWE",
    courseNumber: "3313",
    title: "Introduction to Software Engineering",
    campuses: ["Kennesaw", "Marietta"],
    sections202608: [
      {
        crn: "84210",
        sec: "01",
        campus: "Kennesaw",
        mode: "in_person",
        prof: "Prof. Hannah Cho",
        days: ["T", "R"],
        startMin: 750,
        endMin: 825,
        timeLabel: "TR 12:30 PM – 1:45 PM",
        bldg: "Academic Learning Center",
        room: "3102",
      },
      {
        crn: "84211",
        sec: "02",
        campus: "Marietta",
        mode: "hybrid",
        prof: "Dr. Hannah Cho",
        days: ["M", "W"],
        startMin: 930,
        endMin: 1005,
        timeLabel: "MW 3:30 PM – 4:45 PM",
        bldg: "Atrium Building (J)",
        room: "151",
      },
    ],
  },
  {
    subjectCode: "ME",
    courseNumber: "3101",
    title: "Materials Science and Engineering",
    campuses: ["Marietta"],
    sections202608: [
      {
        crn: "85105",
        sec: "01",
        campus: "Marietta",
        mode: "in_person",
        prof: "Dr. Robert Holloway",
        days: ["M", "W", "F"],
        startMin: 600,
        endMin: 650,
        timeLabel: "MWF 10:00 AM – 10:50 AM",
        bldg: "Engineering Technology Center (Q)",
        room: "112",
      },
      {
        crn: "85106",
        sec: "02",
        campus: "Marietta",
        mode: "in_person",
        prof: "Dr. Robert Holloway",
        days: ["T", "R"],
        startMin: 660,
        endMin: 735,
        timeLabel: "TR 11:00 AM – 12:15 PM",
        bldg: "Engineering Technology Center (Q)",
        room: "214",
      },
    ],
  },
];

const extraCourseCatalog: Array<[string, string, string, "Kennesaw" | "Marietta"]> = [
  ["CSE", "1321", "Programming and Problem Solving I", "Kennesaw"],
  ["CSE", "1322", "Programming and Problem Solving II", "Marietta"],
  ["CS", "3503", "Computer Organization and Architecture", "Kennesaw"],
  ["CS", "4306", "Algorithm Analysis", "Marietta"],
  ["CS", "4308", "Concepts of Programming Languages", "Kennesaw"],
  ["CS", "4850", "Computer Science Senior Project", "Kennesaw"],
  ["IT", "3123", "Hardware and Software Concepts", "Marietta"],
  ["CGDD", "4003", "Digital Media and Interaction", "Marietta"],
  ["CPE", "3000", "Embedded Systems Design", "Marietta"],
  ["EE", "2301", "Circuit Analysis I", "Marietta"],
  ["ME", "2211", "Thermodynamics I", "Marietta"],
  ["ISYE", "3125", "Statistical Quality Control", "Marietta"],
  ["ARCH", "1001", "Architecture Studio I", "Marietta"],
  ["MATH", "1190", "Calculus I", "Kennesaw"],
  ["MATH", "2202", "Calculus II", "Marietta"],
  ["MATH", "2345", "Introduction to Discrete Mathematics", "Kennesaw"],
  ["STAT", "1401", "Elementary Statistics", "Kennesaw"],
  ["PHYS", "2211", "Principles of Physics I", "Marietta"],
  ["PHYS", "2212", "Principles of Physics II", "Marietta"],
  ["CHEM", "1211", "General Chemistry I", "Kennesaw"],
  ["BIOL", "1107", "Biological Principles I", "Kennesaw"],
  ["ENGL", "1101", "Composition I", "Kennesaw"],
  ["ENGL", "1102", "Composition II", "Kennesaw"],
  ["HIST", "2112", "United States History Since 1877", "Kennesaw"],
  ["POLS", "1101", "American Government", "Kennesaw"],
  ["PSYC", "1101", "Introduction to General Psychology", "Kennesaw"],
  ["ECON", "2106", "Principles of Microeconomics", "Kennesaw"],
  ["ACCT", "2101", "Principles of Accounting I", "Kennesaw"],
  ["FINA", "3100", "Principles of Finance", "Kennesaw"],
  ["MKTG", "3100", "Principles of Marketing", "Kennesaw"],
  ["MGT", "3100", "Management and Behavioral Sciences", "Kennesaw"],
  ["BUSA", "2150", "Discovering My Major and Career", "Kennesaw"],
  ["NURS", "3209", "Holistic Nursing", "Kennesaw"],
];

const courseHubs: any[] = [];
const courseSections: any[] = [];

featuredCourses.forEach((fc, idx) => {
  const subjectCourse = `${fc.subjectCode} ${fc.courseNumber}`;
  const compact = `${fc.subjectCode}${fc.courseNumber}`;
  courseHubs.push({
    subjectCourse,
    subjectCode: fc.subjectCode,
    courseNumber: fc.courseNumber,
    title: fc.title,
    searchText: `${subjectCourse} ${compact} ${fc.title}`,
    campuses: fc.campuses,
    activeTerms: ["202608", "202701"],
    prodEnrollmentCount: 48 - idx * 6,
  });

  fc.sections202608.forEach((sec, sIdx) => {
    courseSections.push({
      subjectCourse,
      termCode: "202608",
      crn: sec.crn,
      sectionNumber: sec.sec,
      campus: sec.campus,
      deliveryMode: sec.mode,
      instructorName: sec.prof,
      meetings: [
        {
          days: sec.days,
          startMinutes: sec.startMin,
          endMinutes: sec.endMin,
          timeLabel: sec.timeLabel,
          buildingName: sec.bldg,
          roomNumber: sec.room,
        },
      ],
    });
    // Mirror section for Spring 2027 (202701)
    courseSections.push({
      subjectCourse,
      termCode: "202701",
      crn: String(11000 + idx * 10 + sIdx),
      sectionNumber: sec.sec,
      campus: sec.campus,
      deliveryMode: sec.mode,
      instructorName: sec.prof,
      meetings: [
        {
          days: sec.days,
          startMinutes: sec.startMin,
          endMinutes: sec.endMin,
          timeLabel: sec.timeLabel,
          buildingName: sec.bldg,
          roomNumber: sec.room,
        },
      ],
    });
  });
});

let crnCursorFall = 86000;
let crnCursorSpring = 12000;
let hubIdx = 0;
while (courseHubs.length < 120) {
  const base = extraCourseCatalog[hubIdx % extraCourseCatalog.length]!;
  const suffixBoost = Math.floor(hubIdx / extraCourseCatalog.length);
  const courseNumber =
    suffixBoost === 0
      ? base[1]
      : String(Number(base[1]) + suffixBoost * 10);
  const subjectCode = base[0];
  const subjectCourse = `${subjectCode} ${courseNumber}`;
  const title =
    suffixBoost === 0 ? base[2] : `${base[2]} — Advanced Topics ${suffixBoost}`;
  const primaryCampus = base[3];
  const altCampus: "Kennesaw" | "Marietta" =
    primaryCampus === "Kennesaw" ? "Marietta" : "Kennesaw";

  courseHubs.push({
    subjectCourse,
    subjectCode,
    courseNumber,
    title,
    searchText: `${subjectCourse} ${subjectCode}${courseNumber} ${title}`,
    campuses: [primaryCampus, altCampus],
    activeTerms: ["202608", "202701"],
    prodEnrollmentCount: 15 + (hubIdx % 35),
  });

  for (const [secNo, camp, mode] of [
    ["01", primaryCampus, "in_person"],
    ["02", altCampus, hubIdx % 4 === 0 ? "online" : "in_person"],
  ] as const) {
    courseSections.push({
      subjectCourse,
      termCode: "202608",
      crn: String(crnCursorFall++),
      sectionNumber: secNo,
      campus: camp,
      deliveryMode: mode,
      instructorName: `Dr. KSU Faculty ${10 + (hubIdx % 40)}`,
      meetings:
        mode === "online"
          ? []
          : [
              {
                days: secNo === "01" ? ["M", "W"] : ["T", "R"],
                startMinutes: 570 + (hubIdx % 5) * 90,
                endMinutes: 645 + (hubIdx % 5) * 90,
                timeLabel:
                  secNo === "01"
                    ? "MW 9:30 AM – 10:45 AM"
                    : "TR 2:00 PM – 3:15 PM",
                buildingName:
                  camp === "Kennesaw"
                    ? "Social Sciences Building"
                    : "Atrium Building (J)",
                roomNumber: `${100 + (hubIdx % 25)}`,
              },
            ],
    });
    courseSections.push({
      subjectCourse,
      termCode: "202701",
      crn: String(crnCursorSpring++),
      sectionNumber: secNo,
      campus: camp,
      deliveryMode: mode,
      instructorName: `Dr. KSU Faculty ${10 + (hubIdx % 40)}`,
      meetings:
        mode === "online"
          ? []
          : [
              {
                days: secNo === "01" ? ["M", "W"] : ["T", "R"],
                startMinutes: 570 + (hubIdx % 5) * 90,
                endMinutes: 645 + (hubIdx % 5) * 90,
                timeLabel:
                  secNo === "01"
                    ? "MW 9:30 AM – 10:45 AM"
                    : "TR 2:00 PM – 3:15 PM",
                buildingName:
                  camp === "Kennesaw"
                    ? "Academic Learning Center"
                    : "Engineering Technology Center (Q)",
                roomNumber: `${200 + (hubIdx % 25)}`,
              },
            ],
    });
  }

  hubIdx++;
}

const sampleSyllabi = [
  {
    subjectCourse: "CS 3305",
    termCode: "202608",
    crn: "83190",
    matchedSectionLabel: "Section 01 (CRN 83190 · Dr. Elena Vance)",
    sourceUrl: "https://kennesaw.simplesyllabus.com/en-US/doc/cs3305-202608-83190",
    summary: {
      instructor: "Dr. Elena Vance",
      officeHours: "Mon/Wed 1:30 PM – 3:00 PM · Clendenin 3024 or Teams",
      gradingWeights: [
        { label: "Programming Labs (6)", weight: "30%" },
        { label: "Quizzes & Participation", weight: "15%" },
        { label: "Midterm Exams (2)", weight: "30%" },
        { label: "Comprehensive Final Exam", weight: "25%" },
      ],
      textbooks: [
        "Introduction to Algorithms (CLRS, 4th Edition) — Recommended",
        "OpenDSA Interactive Modules (Free via D2L)",
      ],
      policies:
        "24-hour late lab grace window (-10%); all code submissions must be individual work per KSU SCAI Academic Integrity Policy.",
    },
  },
  {
    subjectCourse: "SWE 3313",
    termCode: "202608",
    crn: "84210",
    matchedSectionLabel: "Section 01 (CRN 84210 · Prof. Hannah Cho)",
    sourceUrl: "https://kennesaw.simplesyllabus.com/en-US/doc/swe3313-202608-84210",
    summary: {
      instructor: "Prof. Hannah Cho",
      officeHours: "Tue/Thu 2:00 PM – 3:30 PM · Atrium J 353",
      gradingWeights: [
        { label: "Team Semester Agile Project (4 Sprints)", weight: "45%" },
        { label: "Requirements & Architecture Reviews", weight: "20%" },
        { label: "Midterm Exam", weight: "15%" },
        { label: "Final Exam & Demo", weight: "20%" },
      ],
      textbooks: ["Software Engineering (Ian Sommerville, 10th Ed)"],
      policies:
        "Peer sprint evaluations weight individual team grades; mandatory live demo during finals week.",
    },
  },
  {
    subjectCourse: "ME 3101",
    termCode: "202608",
    crn: "85105",
    matchedSectionLabel: "Section 01 (CRN 85105 · Dr. Robert Holloway)",
    sourceUrl: "https://kennesaw.simplesyllabus.com/en-US/doc/me3101-202608-85105",
    summary: {
      instructor: "Dr. Robert Holloway",
      officeHours: "Mon/Wed 11:15 AM – 12:30 PM · Engineering Lab Q 220",
      gradingWeights: [
        { label: "Homework & Tensile Lab Reports", weight: "25%" },
        { label: "In-Class Exams (3)", weight: "45%" },
        { label: "Final Exam", weight: "30%" },
      ],
      textbooks: [
        "Materials Science and Engineering: An Introduction (Callister, 10th Ed)",
      ],
      policies:
        "Closed-toe shoes and safety glasses required in Q-building materials lab sessions.",
    },
  },
];

// =========================================================================
// Write All GeoJSON & Seed JSON Files
// =========================================================================
const parkingGeoJson = {
  type: "FeatureCollection",
  features: parkingLots.map((lot) => ({
    type: "Feature",
    properties: {
      geoFeatureId: lot.geoFeatureId,
      slug: lot.slug,
      name: lot.name,
      lotCode: lot.lotCode,
      campus: lot.campus,
      isDeck: lot.isDeck,
      permitTiers: lot.permitTiers,
    },
    geometry: {
      type: "Polygon",
      coordinates: makeBoxPolygon(lot.latitude, lot.longitude),
    },
  })),
};

const campusBuildingsGeoJson = {
  type: "FeatureCollection",
  license: "© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
  features: buildingFeatures,
};

const shuttleGeoJson = {
  type: "FeatureCollection",
  features: [
    ...shuttleRoutes.map((r) => ({
      type: "Feature",
      properties: {
        featureKind: "route",
        geoFeatureId: r.geoFeatureId,
        passioRouteId: r.passioRouteId,
        shortName: r.shortName,
        name: r.name,
        campusScope: r.campusScope,
        colorHex: r.colorHex,
      },
      geometry: {
        type: "LineString",
        // Road-following polyline from Passio, not a straight stop-to-stop line.
        coordinates: passioNetwork.routes.find(
          (n) => n.passioRouteId === r.passioRouteId
        )!.shape,
      },
    })),
    ...canonicalStops.map((s) => ({
      type: "Feature",
      properties: {
        featureKind: "stop",
        stopId: s.stopId,
        name: s.name,
        campus: s.campus,
      },
      geometry: {
        type: "Point",
        coordinates: [s.longitude, s.latitude],
      },
    })),
  ],
};

const meetupSpotsGeoJson = {
  type: "FeatureCollection",
  features: meetupSpots.map((m) => ({
    type: "Feature",
    properties: {
      geoFeatureId: m.geoFeatureId,
      slug: m.slug,
      name: m.name,
      campus: m.campus,
      buildingCode: m.buildingCode,
      safetyNotes: m.safetyNotes,
    },
    geometry: {
      type: "Point",
      coordinates: [m.longitude, m.latitude],
    },
  })),
};

fs.writeFileSync(
  path.join(GEO_DIR, "parking-lots.geojson"),
  JSON.stringify(parkingGeoJson)
);
fs.writeFileSync(
  path.join(GEO_DIR, "campus-buildings.geojson"),
  JSON.stringify(campusBuildingsGeoJson)
);
fs.writeFileSync(
  path.join(GEO_DIR, "shuttle-routes.geojson"),
  JSON.stringify(shuttleGeoJson)
);
fs.writeFileSync(
  path.join(GEO_DIR, "meetup-spots.geojson"),
  JSON.stringify(meetupSpotsGeoJson)
);

fs.writeFileSync(
  path.join(SEED_DIR, "parking-lots.json"),
  JSON.stringify(parkingLots, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "study-rooms.json"),
  JSON.stringify(studyRooms, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "shuttle-routes.json"),
  JSON.stringify({ routes: shuttleRoutes, initialSnapshot: initialShuttleSnapshot }, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "dining-venues.json"),
  JSON.stringify(diningVenues, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "clubs.json"),
  JSON.stringify(clubs, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "events.json"),
  JSON.stringify(events, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "meetup-spots.json"),
  JSON.stringify(meetupSpots, null, 2)
);
fs.writeFileSync(
  path.join(SEED_DIR, "courses.json"),
  JSON.stringify({ courseHubs, courseSections, sampleSyllabi }, null, 2)
);

console.log(
  JSON.stringify(
    {
      parkingLots: parkingLots.length,
      campusBuildings: buildingFeatures.length,
      studyRoomsTotal: studyRooms.length,
      studyRoomsLibCal: studyRooms.filter((r) => r.roomKind === "libcal").length,
      studyRoomsWalkIn: studyRooms.filter((r) => r.roomKind === "walk_in").length,
      shuttleRoutes: shuttleRoutes.length,
      uniqueStops: canonicalStops.length,
      diningVenues: diningVenues.length,
      clubs: clubs.length,
      events: events.length,
      meetupSpots: meetupSpots.length,
      courseHubs: courseHubs.length,
      courseSections: courseSections.length,
    },
    null,
    2
  )
);
