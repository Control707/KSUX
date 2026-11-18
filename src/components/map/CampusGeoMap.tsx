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
  buildMapItems,
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
}

const CAMPUS_CENTERS = {
  Kennesaw: { lng: -84.5822, lat: 34.0382, zoom: 14.8 },
  Marietta: { lng: -84.5198, lat: 33.9401, zoom: 15.1 },
  "All KSU": { lng: -84.551, lat: 33.989, zoom: 11.4 },
} as const;
// Positron while host screens are still light-only legacy (Phase 1A adds the
// dark style alongside the dark theme on Parking and Transit).
const ONLINE_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

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

// Okabe–Ito-derived marks (light set), each ≥3:1 against the basemap.
const MARK = {
  open: "#0072B2",
  filling: "#B07A00",
  nearly: "#D55E00",
  full: "#A23B84",
  none: "#8A7E6B",
} as const;
const FOCUS_BLUE = "#0B57D0";
const INK = "#1F1A14";

const ITEM_LAYERS = [
  "ksux-items-lot-solid",
  "ksux-items-lot-pattern",
  "ksux-items-route",
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
  const selectFromMapRef = useRef<(itemId: string) => void>(() => {});
  const listRef = useRef<HTMLUListElement | null>(null);
  const fittedCampusRef = useRef<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  const { announce } = useAnnouncer();

  const [isOffline, setIsOffline] = useState(false);
  const [usingOfflineStyle, setUsingOfflineStyle] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);
  const [webglFallback, setWebglFallback] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<CampusPlace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const items = useMemo(
    () =>
      buildMapItems({
        campus: campusFilter,
        lots: geoCollections.lots,
        shuttles: geoCollections.shuttles,
        meetups: geoCollections.meetups,
        lotStatuses: lotStatusList,
        vehicles: mode === "live" ? liveVehicles : [],
      }),
    [campusFilter, geoCollections.lots, geoCollections.shuttles, geoCollections.meetups, lotStatusList, liveVehicles, mode]
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
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 40, maxZoom, duration: reducedMotionRef.current ? 0 : 400 }
      );
    } catch {
      // map not ready; the list still reflects the selection
    }
  }, [campusFilter]);

  const recenter = useCallback(() => {
    fitTo(unionBBox(itemsRef.current.map((i) => i.bbox)), 16.5);
  }, [fitTo]);

  const callScreen = useCallback(
    (item: MapListItem) => {
      if (item.kind === "lot") onSelectLotSlug?.(item.key);
      if (item.kind === "meetup") onSelectMeetupSlug?.(item.key);
    },
    [onSelectLotSlug, onSelectMeetupSlug]
  );

  // List → map: select, centre and highlight.
  const selectFromList = (item: MapListItem) => {
    setSelectedId(item.id);
    fitTo(item.bbox);
    callScreen(item);
    announce(`${item.name} shown on the map`);
  };

  // Map → list: open and announce the matching row.
  useEffect(() => {
    selectFromMapRef.current = (itemId: string) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;
      setSelectedId(item.id);
      callScreen(item);
      const status = item.status ? ` · ${FULLNESS[item.status].word}` : "";
      announce(`Selected ${KIND_LABEL[item.kind]} ${item.name}${status}`);
      requestAnimationFrame(() => {
        const row = listRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(item.id)}"]`);
        row?.scrollIntoView({ block: "nearest", behavior: reducedMotionRef.current ? "auto" : "smooth" });
      });
    };
  }, [announce, callScreen]);

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
        const getStyle = (offline: boolean) =>
          offline ? structuredClone(EMBEDDED_ZERO_TILE_STYLE) : ONLINE_MAP_STYLE;

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
          const hit = map.queryRenderedFeatures(ev.point, { layers })[0];
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
          paint: { "fill-color": "#D9CDB6", "fill-opacity": 0.8 },
        });
        map.addLayer({
          id: "ksu-buildings-selected",
          type: "line",
          source: "ksu-buildings",
          filter: ["==", ["get", "geoFeatureId"], ""],
          paint: { "line-color": FOCUS_BLUE, "line-width": 4 },
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
            paint: { "text-color": INK, "text-halo-color": "#FFFFFF", "text-halo-width": 1.5 },
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
      for (const [name, color, bg, stripe, gap] of [
        ["ksux-hatch-filling", MARK.filling, "#FCEFD2", 2, 5],
        ["ksux-hatch-nearly", MARK.nearly, "#FBE1D3", 3, 3],
      ] as const) {
        if (!map.hasImage(name)) {
          const image = hatchImage(color, bg, stripe, gap);
          if (image) map.addImage(name, image);
        }
      }
      const data = itemsToFeatureCollection(items, selectedId);
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
          "fill-color": ["match", ["get", "status"], "open", MARK.open, "full", MARK.full, "#F3ECDD"],
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
          "line-color": ["match", ["get", "status"], "open", MARK.open, "filling", MARK.filling, "nearly", MARK.nearly, MARK.full],
          "line-width": 2,
        },
      });
      map.addLayer({
        id: "ksux-items-lot-edge-none",
        type: "line",
        source: "ksux-items",
        filter: ["all", isKind("lot"), ["==", ["get", "status"], "none"]],
        paint: { "line-color": MARK.none, "line-width": 2, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "ksux-items-route-casing",
        type: "line",
        source: "ksux-items",
        filter: isKind("route"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FFFFFF", "line-width": 7 },
      });
      map.addLayer({
        id: "ksux-items-route",
        type: "line",
        source: "ksux-items",
        filter: isKind("route"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "colorHex"], "line-width": 4 },
      });
      map.addLayer({
        id: "ksux-items-stop",
        type: "circle",
        source: "ksux-items",
        filter: isKind("stop"),
        paint: { "circle-radius": 6, "circle-color": "#FFFFFF", "circle-stroke-width": 3, "circle-stroke-color": INK },
      });
      map.addLayer({
        id: "ksux-items-meetup",
        type: "circle",
        source: "ksux-items",
        filter: isKind("meetup"),
        paint: { "circle-radius": 7, "circle-color": "#FDBB30", "circle-stroke-width": 2, "circle-stroke-color": INK },
      });
      map.addLayer({
        id: "ksux-items-bus",
        type: "circle",
        source: "ksux-items",
        filter: isKind("bus"),
        paint: { "circle-radius": 8, "circle-color": INK, "circle-stroke-width": 3, "circle-stroke-color": "#FFFFFF" },
      });
      // Selection is a focus-blue outline, never a status colour.
      map.addLayer({
        id: "ksux-items-selected-line",
        type: "line",
        source: "ksux-items",
        filter: ["all", ["==", ["get", "selected"], true], ["!=", ["geometry-type"], "Point"]],
        paint: { "line-color": FOCUS_BLUE, "line-width": 4 },
      });
      map.addLayer({
        id: "ksux-items-selected-point",
        type: "circle",
        source: "ksux-items",
        filter: ["all", ["==", ["get", "selected"], true], ["==", ["geometry-type"], "Point"]],
        paint: { "circle-radius": 12, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 4, "circle-stroke-color": FOCUS_BLUE },
      });
      if (!usingOfflineStyle) {
        // Text labels carry the status word and route code, so nothing is colour-only.
        map.addLayer({
          id: "ksux-items-labels",
          type: "symbol",
          source: "ksux-items",
          filter: ["in", ["get", "kind"], ["literal", ["lot", "bus", "route"]]],
          minzoom: 13.6,
          layout: {
            "symbol-placement": "point",
            "text-field": [
              "case",
              ["==", ["get", "kind"], "lot"],
              ["concat", ["get", "label"], " · ", ["match", ["get", "status"], "open", "Open", "filling", "Filling", "nearly", "Nearly Full", "full", "Full", "No reports"]],
              ["get", "label"],
            ],
            "text-font": ["Noto Sans Bold"],
            "text-size": labelSize(),
            "text-offset": ["case", ["==", ["get", "kind"], "bus"], ["literal", [0, 1.4]], ["literal", [0, 0]]],
            "text-optional": true,
          },
          paint: { "text-color": INK, "text-halo-color": "#FFFFFF", "text-halo-width": 2 },
        });
      }
    } catch {
      // Ignore transient style reload races
    }
  }, [items, selectedId, styleRevision, usingOfflineStyle]);

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
  const offlineMode = usingOfflineStyle || isOffline;
  const buildingCount = geoCollections.buildings?.features?.length ?? 0;
  const controlClass =
    "inline-flex h-[var(--target)] w-[var(--target)] items-center justify-center rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow hover:bg-[var(--surface-2)] disabled:opacity-60";

  return (
    <section
      data-testid="campus-geo-map"
      data-offline-style={offlineMode ? "embedded-zero-tile" : "openfreemap"}
      data-loaded-buildings={buildingCount}
      data-map-feature-count={items.length}
      aria-label={mapTitle}
      className="theme-light space-y-[var(--sp-2)]"
    >
      <a href={`#${listId}`} data-testid="skip-map-link" className="sr-only font-bold text-[var(--ink)] underline focus:not-sr-only focus:inline-flex focus:min-h-[var(--target)] focus:items-center">
        Skip map, go to the list of {items.length} places
      </a>

      <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[#EFE8D8]">
        <div className="absolute left-[var(--sp-2)] top-[var(--sp-2)] z-10 flex flex-wrap items-center gap-[var(--sp-1)]">
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
              Static map · no live times
            </span>
          )}
        </div>

        {!webglFallback ? (
          <div ref={containerRef} data-testid="campus-map-canvas" className="h-[18rem] w-full sm:h-[22rem]" />
        ) : (
          <div
            data-testid="campus-map-svg-fallback"
            role="note"
            className="flex h-[18rem] w-full items-center justify-center bg-[#EFE8D8] p-[var(--sp-4)] text-center text-[length:var(--fs-body)] font-bold text-[var(--ink)] sm:h-[22rem]"
          >
            The map couldn’t load on this device. Every place is in the list below.
          </div>
        )}

        <div className="absolute bottom-[var(--sp-6)] right-[var(--sp-2)] z-10 flex flex-col gap-[var(--sp-1)]">
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
          className="absolute inset-x-0 bottom-0 z-10 bg-[var(--surface)]/95 px-[var(--sp-2)] py-[2px] text-right text-[length:var(--fs-xs)] text-[var(--ink)]"
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

      <div className="flex flex-wrap items-start gap-[var(--sp-2)]">
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
            {showsRoutes && <li>Routes are named by their code first, then colour.</li>}
            <li>A blue outline marks your selection.</li>
          </ul>
        </details>

        {showPlaceSearch && places.length > 0 && (
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
        )}
      </div>

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
          className="max-h-[20rem] overflow-y-auto p-[var(--sp-2)] outline-none"
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
                  className={`flex min-h-[var(--target)] w-full flex-wrap items-center gap-x-[var(--sp-2)] gap-y-[var(--sp-1)] rounded-[var(--r-sm)] px-[var(--sp-2)] py-[var(--sp-1)] text-left text-sm ${
                    selected ? "outline outline-[3px] outline-[var(--focus)]" : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {item.code && (
                    <span
                      className="rounded-[6px] border border-[var(--line-strong)] px-[var(--sp-1)] font-bold"
                      style={item.colorHex ? { borderLeft: `6px solid ${item.colorHex}` } : undefined}
                    >
                      {item.code}
                    </span>
                  )}
                  <span className="font-bold">{item.name}</span>
                  <span className="text-[var(--muted)]">
                    {KIND_LABEL[item.kind]}
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
    </section>
  );
}

function labelSize() {
  if (typeof window === "undefined") return 12;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(12 * (root / 16));
}
