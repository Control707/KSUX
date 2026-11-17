/**
 * Named campus places (buildings) derived from /data/campus-buildings.geojson,
 * plus forgiving search over names, building codes and student shorthand
 * ("SRAC", "rec center", "JMW"). Pure functions: no DOM, no fetch (except
 * `loadCampusPlaces`), so they are unit-testable and work offline from the
 * service-worker-cached GeoJSON.
 */

export type Campus = "Kennesaw" | "Marietta";

export interface CampusPlace {
  id: string;
  name: string;
  code?: string;
  campus: Campus;
  category: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

export function placesFromGeoJson(collection: any): CampusPlace[] {
  const features: any[] = Array.isArray(collection?.features)
    ? collection.features
    : [];
  const places: CampusPlace[] = [];
  for (const f of features) {
    const p = f?.properties ?? {};
    const ring: Array<[number, number]> | undefined =
      f?.geometry?.type === "Polygon" ? f.geometry.coordinates?.[0] : undefined;
    if (!p.name || !p.geoFeatureId || !Array.isArray(ring) || ring.length < 4) {
      continue;
    }
    if (p.campus !== "Kennesaw" && p.campus !== "Marietta") continue;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const [lng, lat] of ring) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    if (![w, s, e, n].every(Number.isFinite)) continue;
    places.push({
      id: String(p.geoFeatureId),
      name: String(p.name),
      code: typeof p.code === "string" ? p.code : undefined,
      campus: p.campus,
      category: String(p.category ?? "academic"),
      aliases: Array.isArray(p.aliases) ? p.aliases.map(String) : [],
      latitude: (s + n) / 2,
      longitude: (w + e) / 2,
      bbox: [w, s, e, n],
    });
  }
  return places;
}

export async function loadCampusPlaces(
  fetchImpl: typeof fetch = fetch
): Promise<CampusPlace[]> {
  const resp = await fetchImpl("/data/campus-buildings.geojson");
  if (!resp.ok) return [];
  return placesFromGeoJson(await resp.json());
}

export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalizeQuery(text).split(" ").filter(Boolean);
}

/**
 * Score one place for a query; 0 means no match. Every query token must be a
 * prefix of some word in the name, code or an alias. Exact and leading matches
 * rank first; the viewer's campus breaks ties.
 */
function scorePlace(
  place: CampusPlace,
  qTokens: string[],
  qNorm: string,
  preferredCampus?: Campus
): number {
  const nameNorm = normalizeQuery(place.name);
  const nameWords = words(place.name);
  const aliasNorms = place.aliases.map(normalizeQuery);
  const aliasWords = aliasNorms.flatMap((a) => a.split(" "));
  const codeNorm = place.code ? normalizeQuery(place.code) : "";
  const haystack = [...nameWords, ...aliasWords, ...(codeNorm ? [codeNorm] : [])];

  const allTokensMatch = qTokens.every((t) =>
    haystack.some((w) => w.startsWith(t))
  );
  if (!allTokensMatch) return 0;

  let score = 10;
  if (nameNorm === qNorm) score = 100;
  else if (aliasNorms.includes(qNorm)) score = 95;
  else if (codeNorm && codeNorm === qNorm) score = 90;
  else if (nameNorm.startsWith(qNorm)) score = 80;
  else if (aliasNorms.some((a) => a.startsWith(qNorm))) score = 70;
  else if (qTokens.every((t) => nameWords.some((w) => w.startsWith(t)))) score = 50;
  else score = 30;

  if (preferredCampus && place.campus === preferredCampus) score += 5;
  return score;
}

export function searchPlaces(
  places: CampusPlace[],
  query: string,
  options: { preferredCampus?: Campus; limit?: number } = {}
): CampusPlace[] {
  const qNorm = normalizeQuery(query);
  if (!qNorm) return [];
  const qTokens = qNorm.split(" ");
  const { preferredCampus, limit = 8 } = options;
  return places
    .map((place) => ({
      place,
      score: scorePlace(place, qTokens, qNorm, preferredCampus),
    }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.place.name.length - b.place.name.length ||
        a.place.name.localeCompare(b.place.name)
    )
    .slice(0, limit)
    .map((r) => r.place);
}

/** Great-circle-ish distance in metres (equirectangular; fine at campus scale). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const latMid = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dLat = (a.latitude - b.latitude) * 111_320;
  const dLng = (a.longitude - b.longitude) * 111_320 * Math.cos(latMid);
  return Math.hypot(dLat, dLng);
}

export interface MeetupSpotLike {
  _id?: unknown;
  name: string;
  campus: string;
  buildingCode?: string;
  safetyNotes?: string;
  latitude: number;
  longitude: number;
}

/**
 * Filter Meetup Spots by free text. Matches the spot's own name/notes, and also
 * building search: typing "student center" or "SRAC" surfaces spots within
 * `radiusMeters` of the matching building.
 */
export function filterMeetupSpots<T extends MeetupSpotLike>(
  spots: T[],
  query: string,
  places: CampusPlace[],
  radiusMeters = 120
): T[] {
  const qNorm = normalizeQuery(query);
  if (!qNorm) return spots;
  const qTokens = qNorm.split(" ");
  const matchedPlaces = searchPlaces(places, query, { limit: 3 });
  return spots.filter((spot) => {
    const text = normalizeQuery(
      `${spot.name} ${spot.buildingCode ?? ""} ${spot.safetyNotes ?? ""}`
    );
    if (qTokens.every((t) => text.includes(t))) return true;
    return matchedPlaces.some(
      (place) => distanceMeters(spot, place) <= radiusMeters
    );
  });
}
