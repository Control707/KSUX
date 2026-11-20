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
export type MapItemKind = "lot" | "route" | "stop" | "bus" | "meetup" | "incident";

export type BBox = [number, number, number, number];

export type RoutePattern = "solid" | "dashed" | "dotted";

/**
 * Route identity (SPEC-v2 §4, Transit verdict): the code text comes first,
 * then the line pattern, then an Okabe–Ito-derived colour with separate light
 * and dark values. No two routes serving the same Campus share both colour and
 * pattern. KM keeps KSU gold at 1.35× width. These are map data values (MapLibre
 * paint needs resolved colours), not UI tokens.
 */
export const ROUTE_STYLE: Record<string, { light: string; dark: string; pattern: RoutePattern; width?: number }> = {
  KM: { light: "#FDBB30", dark: "#FDBB30", pattern: "solid", width: 1.35 },
  KL: { light: "#0072B2", dark: "#4EA3E0", pattern: "solid" },
  ML: { light: "#0072B2", dark: "#4EA3E0", pattern: "solid" },
  BS: { light: "#009E73", dark: "#2FC495", pattern: "solid" },
  WC: { light: "#B84F00", dark: "#FF7A33", pattern: "solid" },
  CP: { light: "#CC79A7", dark: "#E39BC4", pattern: "solid" },
  SS: { light: "#0072B2", dark: "#4EA3E0", pattern: "dashed" },
  EC: { light: "#E69F00", dark: "#E69F00", pattern: "dashed" },
  SH: { light: "#B84F00", dark: "#FF7A33", pattern: "dashed" },
  KS: { light: "#009E73", dark: "#2FC495", pattern: "dotted" },
  MS: { light: "#CC79A7", dark: "#E39BC4", pattern: "dotted" },
};

/** Badge text candidates: the light-theme ink and white. */
export const BADGE_INK = "#1F1A14";
export const BADGE_WHITE = "#FFFFFF";

export const PATTERN_LABEL: Record<RoutePattern, string> = {
  solid: "solid line",
  dashed: "dashed line",
  dotted: "dotted line",
};

export function routeStyle(code: string | undefined, dark: boolean, fallback?: string) {
  const style = code ? ROUTE_STYLE[code] : undefined;
  return {
    color: style ? (dark ? style.dark : style.light) : fallback ?? "#5C5245",
    pattern: style?.pattern ?? ("solid" as RoutePattern),
    width: style?.width ?? 1,
  };
}

function channel(value: number) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #RRGGBB or rgb()/rgba() colour. */
export function relativeLuminance(color: string): number {
  let rgb: number[];
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    rgb = (color.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  }
  return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
}

export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Ink or white, whichever has more contrast on the route colour (≥4.5:1 for every route above). */
export function badgeTextColor(background: string): string {
  return contrastRatio(background, BADGE_INK) >= contrastRatio(background, BADGE_WHITE) ? BADGE_INK : BADGE_WHITE;
}

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
  /** Bus heading in degrees; absent when the feed gives none. */
  heading?: number;
  /** Bus position is stale (no update for 36 s or the feed is down). */
  stale?: boolean;
  bbox: BBox;
  center: [number, number];
  geometry: GeoJSON.Geometry;
  /** Original slug or id used by the screen's selection callback. */
  key: string;
}

const KIND_ORDER: Record<MapItemKind, number> = { lot: 0, route: 1, stop: 2, bus: 3, meetup: 4, incident: 5 };

export const KIND_LABEL: Record<MapItemKind, string> = {
  lot: "Parking Lot",
  route: "Shuttle Route",
  stop: "Shuttle stop",
  bus: "Bus",
  meetup: "Meetup Spot",
  incident: "Incident · not verified",
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
  let bounds: BBox | null = null;
  for (const box of boxes) {
    if (!box.every(Number.isFinite)) continue;
    if (!bounds) {
      bounds = [...box];
      continue;
    }
    bounds[0] = Math.min(bounds[0], box[0]);
    bounds[1] = Math.min(bounds[1], box[1]);
    bounds[2] = Math.max(bounds[2], box[2]);
    bounds[3] = Math.max(bounds[3], box[3]);
  }
  return bounds;
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
  vehicles?: {
    busId: string;
    busName: string;
    latitude: number;
    longitude: number;
    loadLabel?: string;
    routeCode?: string;
    heading?: number;
    stale?: boolean;
  }[];
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
    const detail = [v.stale ? "Position not updating" : undefined, v.loadLabel ? `Load ${v.loadLabel}` : undefined]
      .filter(Boolean)
      .join(" · ");
    items.push({
      id: `bus:${v.busId}`,
      key: v.busId,
      kind: "bus",
      name: v.routeCode ? `${v.routeCode} bus · ${v.busName}` : v.busName,
      code: v.routeCode,
      heading: v.stale ? undefined : v.heading,
      stale: v.stale,
      detail: detail || undefined,
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

export function itemsToFeatureCollection(
  items: MapListItem[],
  selectedId: string | null,
  opts: { dark?: boolean; surface?: string; muted?: string } = {},
): GeoJSON.FeatureCollection {
  const dark = opts.dark ?? false;
  const surface = opts.surface ?? BADGE_WHITE;
  return {
    type: "FeatureCollection",
    features: items.map((item) => {
      const style = item.kind === "route" || item.kind === "bus"
        ? routeStyle(item.code, dark, item.colorHex ?? opts.muted)
        : { color: item.colorHex ?? opts.muted ?? "#5C5245", pattern: "solid" as RoutePattern, width: 1 };
      return {
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
          colorHex: style.color,
          pattern: style.pattern,
          widthScale: style.width,
          // A surface casing, or an ink casing when the line is too close to the surface (gold on white).
          casingInk: contrastRatio(style.color, surface) < 3,
          heading: item.heading ?? 0,
          hasHeading: item.heading !== undefined && !item.stale,
          stale: Boolean(item.stale),
          selected: item.id === selectedId,
        },
      };
    }),
  };
}
