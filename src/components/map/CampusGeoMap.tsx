"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Minus, Plus } from "lucide-react";
import { CampusPlace, placesFromGeoJson, searchPlaces } from "@/lib/campusPlaces";
import { useAnnouncer } from "@/components/a11y/Announcer";
import {
  FULLNESS,
  StatusChip,
  fullnessFromTier,
  usePrefersReducedMotion,
  type FullnessStatus,
} from "@/components/a11y/controls";
import {
  KIND_LABEL,
  PATTERN_LABEL,
  badgeTextColor,
  buildMapItems,
  routeStyle,
  itemsToFeatureCollection,
  unionBBox,
  type BBox,
  type MapCampus,
  type MapListItem,
} from "./mapFeatures";

export interface CampusMapLotMarker {
  slug: string;
  name: string;
  campus: "Kennesaw" | "Marietta";
  latitude: number;
  longitude: number;
  effectiveTier: 0 | 1 | 2 | 3 | null;
  hasSpotOpening?: boolean;
}

export interface CampusMapVehicleMarker {
  busId: string;
  busName: string;
  latitude: number;
  longitude: number;
  colorHex?: string;
  loadLabel?: string;
  /** Route code shown under the marker (Transit). */
  routeCode?: string;
  /** Direction of travel in degrees; omit when the data has none. */
  heading?: number;
  /** No update for 36 s or the feed is down: dashed, faded ring, no wedge. */
  stale?: boolean;
}

/** Parts of the shared map that a screen can place in its own panel or sheet. */
export interface CampusGeoMapPanelParts {
  /** The always-on synced HTML list (every feature, same order, no cap). */
  list: React.ReactNode;
  /** The "Key" legend disclosure. */
  legend: React.ReactNode;
  /** The building search box, when enabled. */
  search: React.ReactNode;
}

export interface CampusGeoMapProps {
  campusFilter: MapCampus;
  showParkingLots?: boolean;
  showShuttleRoutes?: boolean;
  showMeetupSpots?: boolean;
  /** Building search box (default on). */
  showPlaceSearch?: boolean;
  lotStatuses?: CampusMapLotMarker[];
  liveVehicles?: CampusMapVehicleMarker[];
  onSelectLotSlug?: (slug: string) => void;
  onSelectMeetupSlug?: (slug: string) => void;
  /** `static` (offline commuter view) shows routes, stops and hours only. */
  mode?: "live" | "static";
  /** Specific accessible title for the canvas and list. */
  title?: string;
  /** `source` says whether the tap came from the map canvas or the synced list. */
  onSelectStopId?: (stopId: string, source: "map" | "list") => void;
  onSelectRouteId?: (passioRouteId: string, source: "map" | "list") => void;
  onSelectBusId?: (busId: string, source: "map" | "list") => void;
  /**
   * Controlled selection: an item id such as `stop:361`, `route:74760`,
   * `bus:bob-401` or `lot:<slug>`. When it changes the map centres on it
   * ("Show on map"). Omit to let the map own its selection.
   */
  selectedItemId?: string | null;
  /** Only draw these route codes (stops follow). Undefined shows every route. */
  routeCodeFilter?: string[] | null;
  /** Only draw these stop ids (pair with routeCodeFilter). */
  stopIdFilter?: string[] | null;
  /** Fill the parent's height instead of the default 18/22rem canvas. */
  fill?: boolean;
  /** Classes for the outer section (e.g. a map + side-panel grid with `fill`). */
  className?: string;
  /**
   * Render the synced list, legend and search somewhere else (a bottom sheet
   * or side panel). The returned node is rendered inside the map section,
   * after the canvas, so the Skip map link still lands on the list.
   */
  renderPanel?: (parts: CampusGeoMapPanelParts) => React.ReactNode;
  /** Extra padding (px) for camera fits, e.g. the height of a bottom sheet. */
  fitPadding?: { top?: number; bottom?: number; left?: number; right?: number };
}

const CAMPUS_CENTERS = {
  Kennesaw: { lng: -84.5822, lat: 34.0382, zoom: 14.8 },
  Marietta: { lng: -84.5198, lat: 33.9401, zoom: 15.1 },
  "All KSU": { lng: -84.551, lat: 33.989, zoom: 11.4 },
} as const;
// OpenFreeMap positron or dark, following the theme (SPEC-v2 §4).
const mapStyleUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches && document.documentElement.dataset.theme !== "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return dark;
}

/** Resolved CSS token values: MapLibre paint can't read CSS variables. */
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v("--ink", "#1F1A14"),
    surface: v("--surface", "#FFFFFF"),
    muted: v("--line-strong", "#8A7E6B"),
    focus: v("--focus", "#0B57D0"),
    land: v("--map-land", "#EFE8D8"),
    bldg: v("--map-bldg", "#D9CDB6"),
    accent: v("--accent", "#FDBB30"),
    open: v("--open-mark", "#0072B2"),
    filling: v("--filling-mark", "#B07A00"),
    nearly: v("--nearly-mark", "#D55E00"),
    full: v("--full-mark", "#A23B84"),
    fillingBg: v("--filling-bg", "#FCEFD2"),
    nearlyBg: v("--nearly-bg", "#FBE1D3"),
    openBg: v("--open-bg", "#E2F0F9"),
    noneBg: v("--surface-2", "#F3ECDD"),
  };
}
type MapTokens = ReturnType<typeof readTokens>;

// Zero-external-tile offline style (renders precached campus GeoJSON offline).
export const EMBEDDED_ZERO_TILE_STYLE = {
  version: 8 as const,
  name: "KSUX Offline Campus Deck Style",
  sources: {},
  layers: [
    {
      id: "ksux-offline-bg",
      type: "background" as const,
      paint: { "background-color": "#EFE8D8" },
    },
  ],
};

function offlineStyle_(land: string) {
  const style = structuredClone(EMBEDDED_ZERO_TILE_STYLE);
  style.layers[0]!.paint["background-color"] = land;
  return style;
}

const BUS_ICON_SIZE = 48;

/** Ringed bus glyph (live: solid ring; stale: dashed, faded ring). */
function busImage(stale: boolean, t: MapTokens) {
  const canvas = document.createElement("canvas");
  canvas.width = BUS_ICON_SIZE;
  canvas.height = BUS_ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const c = BUS_ICON_SIZE / 2;
  ctx.globalAlpha = stale ? 0.6 : 1;
  ctx.beginPath();
  ctx.arc(c, c, 15, 0, Math.PI * 2);
  ctx.fillStyle = t.surface;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = t.ink;
  if (stale) ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Bus body
  ctx.fillStyle = t.ink;
  ctx.fillRect(c - 7, c - 8, 14, 13);
  ctx.fillStyle = t.surface;
  ctx.fillRect(c - 5, c - 6, 10, 5);
  ctx.fillStyle = t.ink;
  ctx.beginPath();
  ctx.arc(c - 4, c + 7, 2, 0, Math.PI * 2);
  ctx.arc(c + 4, c + 7, 2, 0, Math.PI * 2);
  ctx.fill();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.data.buffer) };
}

/** Heading wedge drawn above the ring, rotated by the bus heading. */
function headingImage(t: MapTokens) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.moveTo(size / 2, 2);
  ctx.lineTo(size / 2 + 10, 16);
  ctx.lineTo(size / 2 - 10, 16);
  ctx.closePath();
  ctx.fillStyle = t.ink;
  ctx.strokeStyle = t.surface;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  const data = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(data.data.buffer) };
}

const ITEM_LAYERS = [
  "ksux-items-lot-solid",
  "ksux-items-lot-pattern",
  "ksux-items-route-solid",
  "ksux-items-route-dashed",
  "ksux-items-route-dotted",
  "ksux-items-stop",
  "ksux-items-bus",
  "ksux-items-meetup",
];

function hatchImage(color: string, background: string, stripe: number, gap: number) {
  const size = stripe + gap;
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = stripe;
  for (let i = -canvas.width; i < canvas.width * 2; i += size) {
    ctx.beginPath();
    ctx.moveTo(i, canvas.height);
    ctx.lineTo(i + canvas.height, 0);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.data.buffer) };
}

export function CampusGeoMap({
  campusFilter,
  showParkingLots = true,
  showShuttleRoutes = false,
  showMeetupSpots = false,
  showPlaceSearch = true,
  lotStatuses = [],
  liveVehicles = [],
  onSelectLotSlug,
  onSelectMeetupSlug,
  mode = "live",
  title,
  onSelectStopId,
  onSelectRouteId,
  onSelectBusId,
  selectedItemId,
  routeCodeFilter,
  stopIdFilter,
  fill = false,
  className,
  renderPanel,
  fitPadding,
}: CampusGeoMapProps) {
  const uid = useId().replace(/:/g, "");
  const listId = `campus-map-list-${uid}`;
  const listHeadingId = `campus-map-list-heading-${uid}`;
  const mapTitle =
    title ??
    `${campusFilter} campus map: ${[
      showParkingLots && "Parking Lots",
      showShuttleRoutes && "Shuttle Routes and stops",
      showMeetupSpots && "Meetup Spots",
    ]
      .filter(Boolean)
      .join(", ") || "buildings"}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const setMapOfflineRef = useRef<((offline: boolean) => void) | null>(null);
  const setMapDarkRef = useRef<((dark: boolean) => void) | null>(null);
  const selectFromMapRef = useRef<(itemId: string) => void>(() => {});
  const listRef = useRef<HTMLUListElement | null>(null);
  const fittedCampusRef = useRef<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  const { announce } = useAnnouncer();
  const prefersDark = usePrefersDark();
  const darkRef = useRef(prefersDark);
  const fitPaddingRef = useRef(fitPadding);
  useEffect(() => {
    fitPaddingRef.current = fitPadding;
  }, [fitPadding]);

  const [isOffline, setIsOffline] = useState(false);
  const [usingOfflineStyle, setUsingOfflineStyle] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);
  const [webglFallback, setWebglFallback] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<CampusPlace | null>(null);
  const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null);
  const controlled = selectedItemId !== undefined;
  const selectedId = controlled ? selectedItemId : ownSelectedId;
  const setSelectedId = setOwnSelectedId;
  const [geoCollections, setGeoCollections] = useState<{
    buildings: any | null;
    lots: any | null;
    shuttles: any | null;
    meetups: any | null;
  }>({ buildings: null, lots: null, shuttles: null, meetups: null });

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!navigator.onLine);
    const onOff = () => setIsOffline(true);
    const onOn = () => setIsOffline(false);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, []);

  useEffect(() => {
    setMapOfflineRef.current?.(isOffline);
  }, [isOffline]);

  useEffect(() => {
    darkRef.current = prefersDark;
    setMapDarkRef.current?.(prefersDark);
  }, [prefersDark]);

  // Precached /public/data/*.geojson (served from the SW cache when offline).
  useEffect(() => {
    let cancelled = false;
    const get = (path: string, enabled: boolean) =>
      enabled ? fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null);
    void Promise.all([
      get("/data/campus-buildings.geojson", true),
      get("/data/parking-lots.geojson", showParkingLots),
      get("/data/shuttle-routes.geojson", showShuttleRoutes),
      get("/data/meetup-spots.geojson", showMeetupSpots),
    ]).then(([buildings, lots, shuttles, meetups]) => {
      if (!cancelled) setGeoCollections({ buildings, lots, shuttles, meetups });
    });
    return () => {
      cancelled = true;
    };
  }, [showParkingLots, showShuttleRoutes, showMeetupSpots]);

  const lotStatusList = useMemo(
    () => lotStatuses.map((l) => ({ slug: l.slug, status: fullnessFromTier(l.effectiveTier) as FullnessStatus })),
    [lotStatuses]
  );

  // Optional route filter ("Show only <code>"): drops other routes and stops not on the kept routes.
  const shuttles = useMemo(() => {
    const data = geoCollections.shuttles;
    if (!data || (!routeCodeFilter && !stopIdFilter)) return data;
    const keep = new Set(routeCodeFilter ?? data.features.map((f: any) => f.properties?.shortName));
    const stopKeep = stopIdFilter ? new Set(stopIdFilter) : null;
    const keptRoutes = data.features.filter(
      (f: any) => f.properties?.featureKind === "route" && keep.has(f.properties?.shortName)
    );
    const keptStopIds = new Set<string>();
    for (const f of keptRoutes) for (const id of (f.properties?.stopIds as string[] | undefined) ?? []) keptStopIds.add(String(id));
    const hasStopIds = keptRoutes.some((f: any) => Array.isArray(f.properties?.stopIds));
    return {
      ...data,
      features: data.features.filter((f: any) => {
        const kind = f.properties?.featureKind;
        if (kind === "route") return keep.has(f.properties?.shortName);
        if (kind === "stop") {
          if (stopKeep) return stopKeep.has(String(f.properties?.stopId));
          return !hasStopIds || keptStopIds.has(String(f.properties?.stopId));
        }
        return true;
      }),
    };
  }, [geoCollections.shuttles, routeCodeFilter, stopIdFilter]);

  const vehicles = useMemo(() => {
    if (mode !== "live") return [];
    if (!routeCodeFilter) return liveVehicles;
    const keep = new Set(routeCodeFilter);
    return liveVehicles.filter((v) => !v.routeCode || keep.has(v.routeCode));
  }, [liveVehicles, mode, routeCodeFilter]);

  const items = useMemo(
    () =>
      buildMapItems({
        campus: campusFilter,
        lots: geoCollections.lots,
        shuttles,
        meetups: geoCollections.meetups,
        lotStatuses: lotStatusList,
        vehicles,
      }),
    [campusFilter, geoCollections.lots, shuttles, geoCollections.meetups, lotStatusList, vehicles]
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const places = useMemo(() => placesFromGeoJson(geoCollections.buildings), [geoCollections.buildings]);
  const placeResults = useMemo(
    () =>
      searchPlaces(places, placeQuery, {
        preferredCampus: campusFilter === "All KSU" ? undefined : campusFilter,
        limit: 6,
      }),
    [places, placeQuery, campusFilter]
  );

  const fitTo = useCallback((bbox: BBox | null, maxZoom = 17) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (!bbox) {
        const c = CAMPUS_CENTERS[campusFilter];
        map.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom });
        return;
      }
      const point = bbox[0] === bbox[2] && bbox[1] === bbox[3];
      if (point) {
        const options = { center: [bbox[0], bbox[1]], zoom: Math.max(map.getZoom(), 16) };
        if (reducedMotionRef.current) map.jumpTo(options);
        else map.easeTo({ ...options, duration: 400 });
        return;
      }
      const pad = fitPaddingRef.current ?? {};
      const canvas = map.getContainer?.() as HTMLElement | undefined;
      const h = canvas?.clientHeight ?? 400;
      const w = canvas?.clientWidth ?? 400;
      // Never pad more than the canvas can hold.
      const clamp = (n: number, total: number) => Math.max(16, Math.min(n, total * 0.45));
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding: {
            top: clamp(40 + (pad.top ?? 0), h),
            bottom: clamp(40 + (pad.bottom ?? 0), h),
            left: clamp(40 + (pad.left ?? 0), w),
            right: clamp(40 + (pad.right ?? 0), w),
          },
          maxZoom,
          duration: reducedMotionRef.current ? 0 : 400,
        }
      );
    } catch {
      // map not ready; the list still reflects the selection
    }
  }, [campusFilter]);

  const recenter = useCallback(() => {
    fitTo(unionBBox(itemsRef.current.map((i) => i.bbox)), 16.5);
  }, [fitTo]);

  const callScreen = useCallback(
    (item: MapListItem, source: "map" | "list") => {
      if (item.kind === "lot") onSelectLotSlug?.(item.key);
      if (item.kind === "meetup") onSelectMeetupSlug?.(item.key);
      if (item.kind === "stop") onSelectStopId?.(item.key, source);
      if (item.kind === "route") onSelectRouteId?.(item.key, source);
      if (item.kind === "bus") onSelectBusId?.(item.key, source);
    },
    [onSelectLotSlug, onSelectMeetupSlug, onSelectStopId, onSelectRouteId, onSelectBusId]
  );

  // Controlled "Show on map": centre on the item the screen selected.
  const lastControlledRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!controlled || selectedItemId === lastControlledRef.current) return;
    const item = selectedItemId ? items.find((i) => i.id === selectedItemId) : undefined;
    if (selectedItemId && !item) return; // data still loading
    lastControlledRef.current = selectedItemId;
    if (item) fitTo(item.bbox);
  }, [controlled, selectedItemId, items, fitTo, styleRevision]);

  // List → map: select, centre and highlight.
  const selectFromList = (item: MapListItem) => {
    setSelectedId(item.id);
    fitTo(item.bbox);
    callScreen(item, "list");
    announce(`${item.name} shown on the map`);
  };

  // Map → list: open and announce the matching row.
  useEffect(() => {
    selectFromMapRef.current = (itemId: string) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;
      setSelectedId(item.id);
      callScreen(item, "map");
      const status = item.status ? ` · ${FULLNESS[item.status].word}` : "";
      // Screens that open their own card (a stop card) announce richer text themselves.
      const screenAnnounces = (item.kind === "stop" && onSelectStopId) || (item.kind === "route" && onSelectRouteId)
        || (item.kind === "bus" && onSelectBusId);
      if (!screenAnnounces) announce(`Selected ${KIND_LABEL[item.kind]} ${item.name}${status}`);
      requestAnimationFrame(() => {
        const row = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(item.id)}"]`);
        row?.scrollIntoView({ block: "nearest", behavior: reducedMotionRef.current ? "auto" : "smooth" });
      });
    };
  }, [announce, callScreen, onSelectStopId, onSelectRouteId, onSelectBusId]);

  const selectPlace = (place: CampusPlace) => {
    setSelectedPlace(place);
    setPlaceQuery(place.name);
    fitTo(place.bbox as BBox, 18);
    announce(`${place.name} shown on the map`);
  };

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    let disposed = false;

    const initMap = async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (disposed || !containerRef.current) return;

        const center = CAMPUS_CENTERS[campusFilter];
        let offlineStyle = !navigator.onLine;
        let styledDark = darkRef.current;
        const getStyle = (offline: boolean) =>
          offline ? offlineStyle_(readTokens().land) : mapStyleUrl(styledDark);

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getStyle(offlineStyle),
          center: [center.lng, center.lat],
          zoom: center.zoom,
          attributionControl: false,
          // No rotation or tilt (SPEC-v2 §4).
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
          locale: { "Map.Title": mapTitle },
        });
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();

        setUsingOfflineStyle(offlineStyle);
        const setMapOffline = (offline: boolean) => {
          if (disposed || offline === offlineStyle) return;
          offlineStyle = offline;
          setUsingOfflineStyle(offline);
          map.setStyle(getStyle(offline), { diff: false });
        };
        setMapOfflineRef.current = setMapOffline;
        setMapDarkRef.current = (dark: boolean) => {
          if (disposed || dark === styledDark) return;
          styledDark = dark;
          map.setStyle(getStyle(offlineStyle), { diff: false });
        };
        map.on("error", () => setMapOffline(true));
        map.on("style.load", () => {
          if (!disposed) setStyleRevision((revision) => revision + 1);
        });
        map.once("load", () => {
          if (!disposed) setMapReady(true);
        });
        map.on("click", (ev: any) => {
          const layers = ITEM_LAYERS.filter((id) => map.getLayer(id));
          if (layers.length === 0) return;
          const box: [[number, number], [number, number]] = [
            [ev.point.x - 8, ev.point.y - 8],
            [ev.point.x + 8, ev.point.y + 8],
          ];
          const hits = map.queryRenderedFeatures(box, { layers });
          const rank = (k: string) => ({ bus: 0, stop: 1, meetup: 1, lot: 2, route: 3 } as Record<string, number>)[k] ?? 4;
          const hit = [...hits].sort((a: any, b: any) => rank(a.properties?.kind) - rank(b.properties?.kind))[0];
          const itemId = hit?.properties?.itemId;
          if (itemId) selectFromMapRef.current(String(itemId));
        });

        mapRef.current = map;
      } catch {
        if (!disposed) setWebglFallback(true);
      }
    };

    void initMap();
    return () => {
      disposed = true;
      setMapOfflineRef.current = null;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore cleanup
        }
        mapRef.current = null;
      }
    };
    // The map is created once; campus changes are applied below.
  }, []);

  // Fit the camera to the visible features when the Campus changes or data arrives.
  useEffect(() => {
    if (!mapRef.current || styleRevision === 0) return;
    if (fittedCampusRef.current === campusFilter) return;
    if (items.length === 0 && (showParkingLots || showShuttleRoutes || showMeetupSpots)) {
      fitTo(null);
      return;
    }
    fittedCampusRef.current = campusFilter;
    recenter();
  }, [campusFilter, items, styleRevision, fitTo, recenter, showParkingLots, showShuttleRoutes, showMeetupSpots]);

  // Static buildings layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0 || !geoCollections.buildings) return;
    try {
      if (!map.getSource("ksu-buildings")) {
        map.addSource("ksu-buildings", { type: "geojson", data: geoCollections.buildings });
        map.addLayer({
          id: "ksu-buildings-fill",
          type: "fill",
          source: "ksu-buildings",
          paint: { "fill-color": readTokens().bldg, "fill-opacity": 0.8 },
        });
        map.addLayer({
          id: "ksu-buildings-selected",
          type: "line",
          source: "ksu-buildings",
          filter: ["==", ["get", "geoFeatureId"], ""],
          paint: { "line-color": readTokens().focus, "line-width": 4 },
        });
        if (!usingOfflineStyle) {
          map.addLayer({
            id: "ksu-buildings-labels",
            type: "symbol",
            source: "ksu-buildings",
            minzoom: 15.5,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": labelSize(),
              "text-max-width": 8,
              "text-optional": true,
            },
            paint: { "text-color": readTokens().ink, "text-halo-color": readTokens().surface, "text-halo-width": 1.5 },
          });
        }
      }
    } catch {
      // Ignore transient style reload races
    }
  }, [geoCollections.buildings, styleRevision, usingOfflineStyle]);

  // Feature layers, all rendered from the same ordered list as the HTML list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    try {
      const t = readTokens();
      for (const [name, color, bg, stripe, gap] of [
        ["ksux-hatch-filling", t.filling, t.fillingBg, 2, 5],
        ["ksux-hatch-nearly", t.nearly, t.nearlyBg, 3, 3],
      ] as const) {
        if (!map.hasImage(name)) {
          const image = hatchImage(color, bg, stripe, gap);
          if (image) map.addImage(name, image);
        }
      }
      for (const [name, make] of [
        ["ksux-bus-live", () => busImage(false, t)],
        ["ksux-bus-stale", () => busImage(true, t)],
        ["ksux-bus-heading", () => headingImage(t)],
      ] as const) {
        if (!map.hasImage(name)) {
          const image = make();
          if (image) map.addImage(name, image, { pixelRatio: 2 });
        }
      }
      const data = itemsToFeatureCollection(items, selectedId ?? null, { dark: prefersDark, surface: t.surface, muted: t.muted });
      const source = map.getSource("ksux-items");
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource("ksux-items", { type: "geojson", data });
      const isKind = (kind: string) => ["==", ["get", "kind"], kind];
      map.addLayer({
        id: "ksux-items-lot-solid",
        type: "fill",
        source: "ksux-items",
        filter: ["all", isKind("lot"), ["in", ["get", "status"], ["literal", ["open", "full", "none"]]]],
        paint: {
          "fill-color": ["match", ["get", "status"], "open", t.open, "full", t.full, t.noneBg],
          "fill-opacity": ["match", ["get", "status"], "open", 0.35, "full", 0.75, 0.55],
        },
      });
      map.addLayer({
        id: "ksux-items-lot-pattern",
        type: "fill",
        source: "ksux-items",
        filter: ["all", isKind("lot"), ["in", ["get", "status"], ["literal", ["filling", "nearly"]]]],
        paint: {
          "fill-pattern": ["match", ["get", "status"], "nearly", "ksux-hatch-nearly", "ksux-hatch-filling"],
          "fill-opacity": 0.9,
        },
      });
      // Solid edge = live crowd data; dashed edge = no recent reports.
      map.addLayer({
        id: "ksux-items-lot-edge-live",
        type: "line",
        source: "ksux-items",
        filter: ["all", isKind("lot"), ["!=", ["get", "status"], "none"]],
        paint: {
          "line-color": ["match", ["get", "status"], "open", t.open, "filling", t.filling, "nearly", t.nearly, t.full],
          "line-width": 2,
        },
      });
      map.addLayer({
        id: "ksux-items-lot-edge-none",
        type: "line",
        source: "ksux-items",
        filter: ["all", isKind("lot"), ["==", ["get", "status"], "none"]],
        paint: { "line-color": t.muted, "line-width": 2, "line-dasharray": [2, 2] },
      });
      // Every route line has a casing so it holds 3:1 against both base maps.
      map.addLayer({
        id: "ksux-items-route-casing",
        type: "line",
        source: "ksux-items",
        filter: isKind("route"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["case", ["get", "casingInk"], t.ink, t.surface],
          "line-width": ["*", ["get", "widthScale"], 8],
          "line-opacity": 0.95,
        },
      });
      for (const [pattern, dash] of [
        ["solid", null],
        ["dashed", [2.2, 1.4]],
        ["dotted", [0.6, 1.1]],
      ] as const) {
        map.addLayer({
          id: `ksux-items-route-${pattern}`,
          type: "line",
          source: "ksux-items",
          filter: ["all", isKind("route"), ["==", ["get", "pattern"], pattern]],
          layout: { "line-cap": pattern === "dotted" ? "round" : "butt", "line-join": "round" },
          paint: {
            "line-color": ["get", "colorHex"],
            "line-width": ["*", ["get", "widthScale"], pattern === "dotted" ? 5 : 4.5],
            ...(dash ? { "line-dasharray": dash } : {}),
          },
        });
      }
      map.addLayer({
        id: "ksux-items-stop",
        type: "circle",
        source: "ksux-items",
        filter: isKind("stop"),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 7],
          "circle-color": t.surface,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": t.ink,
        },
      });
      map.addLayer({
        id: "ksux-items-meetup",
        type: "circle",
        source: "ksux-items",
        filter: isKind("meetup"),
        paint: { "circle-radius": 7, "circle-color": t.accent, "circle-stroke-width": 2, "circle-stroke-color": t.ink },
      });
      // Buses: heading wedge (live with a heading only), ringed glyph, code label.
      map.addLayer({
        id: "ksux-items-bus-heading",
        type: "symbol",
        source: "ksux-items",
        filter: ["all", isKind("bus"), ["==", ["get", "hasHeading"], true]],
        layout: {
          "icon-image": "ksux-bus-heading",
          "icon-rotate": ["get", "heading"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      map.addLayer({
        id: "ksux-items-bus",
        type: "symbol",
        source: "ksux-items",
        filter: isKind("bus"),
        layout: {
          "icon-image": ["case", ["get", "stale"], "ksux-bus-stale", "ksux-bus-live"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          ...(usingOfflineStyle
            ? {}
            : {
                "text-field": ["get", "code"],
                "text-font": ["Noto Sans Bold"],
                "text-size": labelSize(),
                "text-offset": [0, 1.5],
                "text-anchor": "top",
                "text-allow-overlap": true,
              }),
        },
        paint: usingOfflineStyle
          ? {}
          : { "text-color": t.ink, "text-halo-color": t.surface, "text-halo-width": 2.5 },
      });
      // Selection is a focus-blue outline, never a status colour.
      map.addLayer({
        id: "ksux-items-selected-line",
        type: "line",
        source: "ksux-items",
        filter: ["all", ["==", ["get", "selected"], true], ["!=", ["geometry-type"], "Point"]],
        paint: { "line-color": t.focus, "line-width": 4 },
      });
      map.addLayer({
        id: "ksux-items-selected-point",
        type: "circle",
        source: "ksux-items",
        filter: ["all", ["==", ["get", "selected"], true], ["==", ["geometry-type"], "Point"]],
        paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 4, "circle-stroke-color": t.focus },
      });
      if (!usingOfflineStyle) {
        // Route codes along each line at zoom ≥13.6 (code text before colour).
        map.addLayer({
          id: "ksux-items-route-labels",
          type: "symbol",
          source: "ksux-items",
          filter: isKind("route"),
          minzoom: 13.6,
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 220,
            "text-field": ["get", "code"],
            "text-font": ["Noto Sans Bold"],
            "text-size": labelSize(),
            "text-keep-upright": true,
          },
          paint: { "text-color": t.ink, "text-halo-color": t.surface, "text-halo-width": 2.5 },
        });
        // Text labels carry the status word, so nothing is colour-only.
        map.addLayer({
          id: "ksux-items-labels",
          type: "symbol",
          source: "ksux-items",
          filter: isKind("lot"),
          minzoom: 13.6,
          layout: {
            "symbol-placement": "point",
            "text-field": ["concat", ["get", "label"], " · ", ["match", ["get", "status"], "open", "Open", "filling", "Filling", "nearly", "Nearly Full", "full", "Full", "No reports"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": labelSize(),
            "text-optional": true,
          },
          paint: { "text-color": t.ink, "text-halo-color": t.surface, "text-halo-width": 2 },
        });
      }
    } catch {
      // Ignore transient style reload races
    }
  }, [items, selectedId, styleRevision, usingOfflineStyle, prefersDark]);

  // Highlight the searched building's outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    try {
      if (map.getLayer("ksu-buildings-selected")) {
        map.setFilter("ksu-buildings-selected", ["==", ["get", "geoFeatureId"], selectedPlace?.id ?? ""]);
      }
    } catch {
      // ignore transient style reload races
    }
  }, [selectedPlace, styleRevision, geoCollections]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom() + delta;
    if (reducedMotionRef.current) map.jumpTo({ zoom });
    else map.easeTo({ zoom, duration: 200 });
    announce(`Zoom level ${Math.round(zoom)}`);
  };

  const showsRoutes = items.some((i) => i.kind === "route" || i.kind === "stop");
  const routeItems = items.filter((i) => i.kind === "route");
  const offlineMode = usingOfflineStyle || isOffline;
  const buildingCount = geoCollections.buildings?.features?.length ?? 0;
  const controlClass =
    "inline-flex h-[var(--target)] w-[var(--target)] items-center justify-center rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow hover:bg-[var(--surface-2)] disabled:opacity-60";
  const canvasHeight = fill ? "h-full min-h-[16rem]" : "h-[18rem] sm:h-[22rem]";

  const legend = (
    <details className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
      <summary className="flex min-h-[var(--target)] cursor-pointer items-center px-[var(--sp-3)] text-sm font-bold">
        Key
      </summary>
      <ul className="space-y-[var(--sp-1)] px-[var(--sp-3)] pb-[var(--sp-3)] text-sm">
        {showParkingLots &&
          (["open", "filling", "nearly", "full", "none"] as const).map((status) => (
            <li key={status}>
              <StatusChip status={status} />
            </li>
          ))}
        {showParkingLots && <li>Solid edge: live Student reports. Dashed edge: no recent reports.</li>}
        {showsRoutes && <li>Routes are named by their code first, then line pattern, then colour.</li>}
        {routeItems.map((route) => (
          <li key={route.id} className="flex flex-wrap items-center gap-[var(--sp-2)]">
            <RouteBadge code={route.code ?? "?"} colorHex={route.colorHex} />
            <span>
              {route.name} · {PATTERN_LABEL[routeStyle(route.code, prefersDark).pattern]}
            </span>
          </li>
        ))}
        {mode === "live" && showShuttleRoutes && (
          <li>A bus with a solid ring and a pointer is live. A dashed, faded ring means its position is not updating.</li>
        )}
        <li>A blue outline marks your selection.</li>
      </ul>
    </details>
  );

  const search =
    showPlaceSearch && places.length > 0 ? (
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={`campus-place-search-${uid}`} className="sr-only">
          Find a campus building
        </label>
        <input
          id={`campus-place-search-${uid}`}
          type="search"
          data-testid="campus-place-search"
          value={placeQuery}
          onChange={(e) => {
            setPlaceQuery(e.target.value);
            if (selectedPlace) setSelectedPlace(null);
          }}
          placeholder="Find a building…"
          autoComplete="off"
          className="min-h-[var(--target)] w-full rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-[length:var(--fs-body)] text-[var(--ink)]"
        />
        {placeQuery.trim() !== "" && !selectedPlace && (
          <ul data-testid="campus-place-results" aria-label="Matching buildings" className="mt-[var(--sp-1)] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)]">
            {placeResults.length === 0 ? (
              <li role="status" className="px-[var(--sp-3)] py-[var(--sp-2)] text-sm text-[var(--muted)]">
                No matching building
              </li>
            ) : (
              placeResults.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => selectPlace(place)}
                    className="min-h-[var(--target)] w-full px-[var(--sp-3)] text-left text-sm hover:bg-[var(--surface-2)]"
                  >
                    <span className="font-bold">{place.name}</span>
                    <span className="ml-[var(--sp-2)] text-[var(--muted)]">{place.campus}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    ) : null;

  const list = (
    <div className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
      <h3 id={listHeadingId} className="px-[var(--sp-3)] pt-[var(--sp-2)] text-sm font-bold">
        {items.length} places on this map
      </h3>
      <ul
        id={listId}
        ref={listRef}
        tabIndex={-1}
        data-testid="campus-map-list"
        aria-labelledby={listHeadingId}
        className={`${renderPanel ? "" : "max-h-[20rem] overflow-y-auto"} p-[var(--sp-2)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[var(--focus)]`}
      >
        {items.length === 0 && (
          <li className="px-[var(--sp-2)] py-[var(--sp-2)] text-sm text-[var(--muted)]">
            {(geoCollections.lots || geoCollections.shuttles || geoCollections.meetups) ? "Nothing on this map for this Campus." : "Loading places…"}
          </li>
        )}
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id} data-item-id={item.id} data-testid="campus-map-list-item">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => selectFromList(item)}
                className={`flex min-h-[var(--target)] w-full min-w-0 flex-wrap items-center gap-x-[var(--sp-2)] gap-y-[var(--sp-1)] rounded-[var(--r-sm)] px-[var(--sp-2)] py-[var(--sp-1)] text-left text-sm [overflow-wrap:anywhere] ${
                  selected ? "outline outline-[3px] outline-[var(--focus)]" : "hover:bg-[var(--surface-2)]"
                }`}
              >
                {item.code && (item.kind === "route" || item.kind === "bus") ? (
                  <RouteBadge code={item.code} colorHex={item.colorHex} />
                ) : item.code ? (
                  <span className="rounded-[var(--r-sm)] border border-[var(--line-strong)] px-[var(--sp-1)] font-bold">{item.code}</span>
                ) : null}
                <span className="font-bold">{item.name}</span>
                <span className="text-[var(--muted)]">
                  {KIND_LABEL[item.kind]}
                  {item.kind === "route" ? ` · ${PATTERN_LABEL[routeStyle(item.code, prefersDark).pattern]}` : ""}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
                {item.status && <StatusChip status={item.status} />}
                <span className="sr-only">{selected ? ", shown on map" : ", show on map"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section
      data-testid="campus-geo-map"
      data-offline-style={offlineMode ? "embedded-zero-tile" : "openfreemap"}
      data-loaded-buildings={buildingCount}
      data-map-feature-count={items.length}
      data-map-mode={mode}
      aria-label={mapTitle}
      className={className ?? (fill ? "relative h-full" : "space-y-[var(--sp-2)]")}
    >
      <a href={`#${listId}`} data-testid="skip-map-link" className={`sr-only font-bold text-[var(--ink)] underline focus:not-sr-only focus:inline-flex focus:min-h-[var(--target)] focus:items-center focus:bg-[var(--surface)] focus:px-[var(--sp-2)] ${fill ? "!absolute left-[var(--sp-2)] top-[var(--sp-2)] z-30" : ""}`}>
        Skip map, go to the list of {items.length} places
      </a>

      <div className={`relative overflow-hidden bg-[var(--map-land)] ${fill ? "h-full" : "rounded-[var(--r-lg)] border border-[var(--line)]"}`}>
        <div className="absolute left-[var(--sp-2)] top-[var(--sp-2)] z-10 flex max-w-[calc(100%-4rem)] flex-wrap items-center gap-[var(--sp-1)]">
          <span className="rounded-full bg-[var(--surface)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm font-bold text-[var(--ink)] shadow">
            {campusFilter} · {buildingCount} buildings
          </span>
          {isOffline && (
            <span
              data-testid="map-offline-zero-tile-badge"
              className="rounded-full bg-[var(--warn-bg)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm font-bold text-[var(--warn-fg)] shadow"
            >
              Offline · saved campus map
            </span>
          )}
          {mode === "static" && (
            <span className="rounded-full bg-[var(--surface)] px-[var(--sp-2)] py-[var(--sp-1)] text-sm font-bold text-[var(--ink)] shadow">
              Static map · routes, stops and hours only
            </span>
          )}
        </div>

        {!webglFallback ? (
          <div ref={containerRef} data-testid="campus-map-canvas" className={`${canvasHeight} w-full`} />
        ) : (
          <div
            data-testid="campus-map-svg-fallback"
            role="note"
            className={`flex ${canvasHeight} w-full items-center justify-center bg-[var(--map-land)] p-[var(--sp-4)] text-center text-[length:var(--fs-body)] font-bold text-[var(--ink)]`}
          >
            The map couldn’t load on this device. Every place is in the list.
          </div>
        )}

        <div
          className="absolute right-[var(--sp-2)] z-10 flex flex-col gap-[var(--sp-1)]"
          style={{ bottom: `calc(var(--sp-6) + ${Math.max(0, fitPadding?.bottom ?? 0)}px)` }}
        >
          <button type="button" aria-label="Zoom in" data-testid="map-zoom-in" disabled={!mapReady} onClick={() => zoomBy(1)} className={controlClass}>
            <Plus aria-hidden="true" className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Zoom out" data-testid="map-zoom-out" disabled={!mapReady} onClick={() => zoomBy(-1)} className={controlClass}>
            <Minus aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Recenter map"
            data-testid="map-recenter"
            disabled={!mapReady}
            onClick={() => {
              recenter();
              announce("Map recentered");
            }}
            className={controlClass}
          >
            <Crosshair aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <p
          data-testid="map-attribution"
          className="absolute inset-x-0 top-auto z-10 bg-[var(--surface)] px-[var(--sp-2)] py-[2px] text-right text-[length:var(--fs-xs)] text-[var(--ink)] opacity-95"
          style={{ bottom: `${Math.max(0, fitPadding?.bottom ?? 0)}px` }}
        >
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
            OpenStreetMap contributors
          </a>
          {!offlineMode && (
            <>
              {" · "}
              <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">
                OpenFreeMap
              </a>
            </>
          )}
          {showsRoutes && " · Routes & stops: Passio GO / Big Owl Bus"}
        </p>
      </div>

      {renderPanel ? (
        renderPanel({ list, legend, search })
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-[var(--sp-2)]">
            {legend}
            {search}
          </div>
          {list}
        </>
      )}
    </section>
  );
}

/**
 * Route code badge: the code text first, a pattern strip, then colour. The text
 * is ink or white, whichever reaches ≥4.5:1 on the route colour.
 */
export function RouteBadge({ code, colorHex, size = "md" }: { code: string; colorHex?: string; size?: "sm" | "md" }) {
  const dark = usePrefersDark();
  const style = routeStyle(code, dark, colorHex);
  const text = badgeTextColor(style.color);
  const strip = {
    solid: "linear-gradient(90deg, currentColor 0 100%)",
    dashed: "repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 10px)",
    dotted: "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px)",
  }[style.pattern];
  return (
    <span
      data-testid="route-badge"
      data-route-code={code}
      data-pattern={style.pattern}
      aria-hidden="true"
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-[var(--r-sm)] font-bold leading-none ring-2 ring-[var(--ink)] ${
        size === "sm" ? "min-w-[2.25rem] px-[var(--sp-1)] py-[var(--sp-1)] text-sm" : "min-w-[2.75rem] px-[var(--sp-2)] py-[var(--sp-1)] text-sm"
      }`}
      style={{ backgroundColor: style.color, color: text }}
    >
      <span>{code}</span>
      <span className="mt-[2px] block h-[3px] w-full" style={{ backgroundImage: strip }} />
    </span>
  );
}

function labelSize() {
  if (typeof window === "undefined") return 12;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(12 * (root / 16));
}
