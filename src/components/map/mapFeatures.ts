import type { FullnessStatus } from "@/components/a11y/controls";

// Minimal GeoJSON shapes (the project has no @types/geojson dependency).
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace GeoJSON {
  type Position = number[];
  type Point = { type: "Point"; coordinates: Position };
  type Geometry =
    | Point
    | { type: "MultiPoint" | "LineString"; coordinates: Position[] }
    | { type: "MultiLineString" | "Polygon"; coordinates: Position[][] }
    | { type: "MultiPolygon"; coordinates: Position[][][] }
    | { type: "GeometryCollection"; geometries: Geometry[] };
  type Feature = { type: "Feature"; id?: string | number; geometry: Geometry | null; properties: Record<string, unknown> | null };
  type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };
}
export type { GeoJSON };

export type MapCampus = "Kennesaw" | "Marietta" | "All KSU";
export type MapItemKind = "lot" | "route" | "stop" | "bus" | "meetup";

export type BBox = [number, number, number, number];

/** One map feature and its paired list row (same order, same count). */
export interface MapListItem {
  id: string;
  kind: MapItemKind;
  name: string;
  detail?: string;
  campus?: "Kennesaw" | "Marietta" | "Both";
  status?: FullnessStatus;
  /** Route identity text shown before colour (SPEC-v2 §4). */
  code?: string;
  colorHex?: string;
  bbox: BBox;
  center: [number, number];
  geometry: GeoJSON.Geometry;
  /** Original slug or id used by the screen's selection callback. */
  key: string;
}

const KIND_ORDER: Record<MapItemKind, number> = { lot: 0, route: 1, stop: 2, bus: 3, meetup: 4 };

export const KIND_LABEL: Record<MapItemKind, string> = {
  lot: "Parking Lot",
  route: "Shuttle Route",
  stop: "Shuttle stop",
  bus: "Bus",
  meetup: "Meetup Spot",
};

function walkCoordinates(geometry: GeoJSON.Geometry, visit: (lng: number, lat: number) => void) {
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      visit(value[0], value[1]);
      return;
    }
    for (const inner of value) walk(inner);
  };
  if (geometry.type === "GeometryCollection") {
    for (const g of geometry.geometries) walkCoordinates(g, visit);
  } else {
    walk((geometry as { coordinates: unknown }).coordinates);
  }
}

export function bboxOf(geometry: GeoJSON.Geometry): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  walkCoordinates(geometry, (lng, lat) => {
    w = Math.min(w, lng);
    s = Math.min(s, lat);
    e = Math.max(e, lng);
    n = Math.max(n, lat);
  });
  return [w, s, e, n];
}

export function unionBBox(boxes: BBox[]): BBox | null {
  const valid = boxes.filter((b) => b.every(Number.isFinite));
  if (valid.length === 0) return null;
  return [
    Math.min(...valid.map((b) => b[0])),
    Math.min(...valid.map((b) => b[1])),
    Math.max(...valid.map((b) => b[2])),
    Math.max(...valid.map((b) => b[3])),
  ];
}

const centerOf = (b: BBox): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

function inCampus(campus: string | undefined, filter: MapCampus) {
  if (filter === "All KSU") return true;
  return !campus || campus === filter || campus === "Both";
}

export interface BuildMapItemsInput {
  campus: MapCampus;
  lots?: GeoJSON.FeatureCollection | null;
  shuttles?: GeoJSON.FeatureCollection | null;
  meetups?: GeoJSON.FeatureCollection | null;
  lotStatuses?: { slug: string; status: FullnessStatus }[];
  vehicles?: { busId: string; busName: string; latitude: number; longitude: number; loadLabel?: string }[];
  showStops?: boolean;
}

/**
 * Builds the single ordered feature list that both the map layers and the
 * paired HTML list render from, so they always hold the same items in the
 * same order with no cap.
 */
export function buildMapItems(input: BuildMapItemsInput): MapListItem[] {
  const items: MapListItem[] = [];
  const statusBySlug = new Map((input.lotStatuses ?? []).map((l) => [l.slug, l.status]));

  for (const f of input.lots?.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, any>;
    if (!f.geometry || !inCampus(p.campus, input.campus)) continue;
    const bbox = bboxOf(f.geometry);
    items.push({
      id: `lot:${p.slug}`,
      key: String(p.slug),
      kind: "lot",
      name: String(p.name),
      code: p.lotCode ? String(p.lotCode) : undefined,
      detail: p.isDeck ? "Parking deck" : "Surface lot",
      campus: p.campus,
      status: statusBySlug.get(String(p.slug)) ?? "none",
      bbox,
      center: centerOf(bbox),
      geometry: f.geometry,
    });
  }

  for (const f of input.shuttles?.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, any>;
    if (!f.geometry) continue;
    if (p.featureKind === "route") {
      if (!inCampus(p.campusScope, input.campus)) continue;
      const bbox = bboxOf(f.geometry);
      items.push({
        id: `route:${p.passioRouteId ?? p.geoFeatureId}`,
        key: String(p.passioRouteId ?? p.geoFeatureId),
        kind: "route",
        name: String(p.name),
        code: p.shortName ? String(p.shortName) : undefined,
        colorHex: p.colorHex,
        campus: p.campusScope,
        detail: p.campusScope === "Both" ? "Intercampus" : p.campusScope,
        bbox,
        center: centerOf(bbox),
        geometry: f.geometry,
      });
    } else if (p.featureKind === "stop" && input.showStops !== false) {
      if (!inCampus(p.campus, input.campus)) continue;
      const bbox = bboxOf(f.geometry);
      items.push({
        id: `stop:${p.stopId}`,
        key: String(p.stopId),
        kind: "stop",
        name: String(p.name),
        campus: p.campus,
        bbox,
        center: centerOf(bbox),
        geometry: f.geometry,
      });
    }
  }

  for (const v of input.vehicles ?? []) {
    const geometry: GeoJSON.Point = { type: "Point", coordinates: [v.longitude, v.latitude] };
    items.push({
      id: `bus:${v.busId}`,
      key: v.busId,
      kind: "bus",
      name: v.busName,
      detail: v.loadLabel ? `Load ${v.loadLabel}` : undefined,
      bbox: [v.longitude, v.latitude, v.longitude, v.latitude],
      center: [v.longitude, v.latitude],
      geometry,
    });
  }

  for (const f of input.meetups?.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, any>;
    if (!f.geometry || !inCampus(p.campus, input.campus)) continue;
    const bbox = bboxOf(f.geometry);
    items.push({
      id: `meetup:${p.slug}`,
      key: String(p.slug),
      kind: "meetup",
      name: String(p.name),
      detail: p.safetyNotes ? String(p.safetyNotes) : undefined,
      campus: p.campus,
      bbox,
      center: centerOf(bbox),
      geometry: f.geometry,
    });
  }

  return items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function itemsToFeatureCollection(items: MapListItem[], selectedId: string | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: item.geometry,
      properties: {
        itemId: item.id,
        kind: item.kind,
        name: item.name,
        code: item.code ?? "",
        label: item.kind === "lot" && item.code ? item.code : item.code ?? item.name,
        status: item.status ?? "none",
        colorHex: item.colorHex ?? "#5C5245",
        selected: item.id === selectedId,
      },
    })),
  };
}
