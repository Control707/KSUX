"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CampusPlace,
  placesFromGeoJson,
  searchPlaces,
} from "@/lib/campusPlaces";

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
  campusFilter: "Kennesaw" | "Marietta" | "All KSU";
  showParkingLots?: boolean;
  showShuttleRoutes?: boolean;
  showMeetupSpots?: boolean;
  /** Building search box (default on). */
  showPlaceSearch?: boolean;
  lotStatuses?: CampusMapLotMarker[];
  liveVehicles?: CampusMapVehicleMarker[];
  onSelectLotSlug?: (slug: string) => void;
  onSelectMeetupSlug?: (slug: string) => void;
}

const CAMPUS_CENTERS = {
  Kennesaw: { lng: -84.5822, lat: 34.0382, zoom: 14.8 },
  Marietta: { lng: -84.5198, lat: 33.9401, zoom: 15.1 },
  "All KSU": { lng: -84.551, lat: 33.989, zoom: 11.4 },
} as const;
const ONLINE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Zero-external-tile offline MapLibre GL JS base style (renders precached campus GeoJSON offline!)
export const EMBEDDED_ZERO_TILE_STYLE = {
  version: 8 as const,
  name: "KSUX Offline Campus Deck Style",
  sources: {},
  layers: [
    {
      id: "ksux-offline-bg",
      type: "background" as const,
      paint: {
        "background-color": "#E8EEF5",
      },
    },
  ],
};

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
}: CampusGeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const setMapOfflineRef = useRef<((offline: boolean) => void) | null>(null);
  const selectLotRef = useRef(onSelectLotSlug);
  const selectMeetupRef = useRef(onSelectMeetupSlug);
  const [isOffline, setIsOffline] = useState(false);
  const [usingOfflineStyle, setUsingOfflineStyle] = useState(false);
  const [styleRevision, setStyleRevision] = useState(0);
  const [geoStats, setGeoStats] = useState<{
    buildings: number;
    lots: number;
    routes: number;
    meetups: number;
  }>({ buildings: 0, lots: 0, routes: 0, meetups: 0 });
  const [webglFallback, setWebglFallback] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<CampusPlace | null>(null);

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
    selectLotRef.current = onSelectLotSlug;
    selectMeetupRef.current = onSelectMeetupSlug;
  }, [onSelectLotSlug, onSelectMeetupSlug]);

  // Load precached /public/data/*.geojson geometries (served from SW cache when offline!)
  const [geoCollections, setGeoCollections] = useState<{
    buildings: any | null;
    lots: any | null;
    shuttles: any | null;
    meetups: any | null;
  }>({ buildings: null, lots: null, shuttles: null, meetups: null });

  useEffect(() => {
    let cancelled = false;
    const loadGeo = async () => {
      try {
        const [bRes, lRes, sRes, mRes] = await Promise.all([
          fetch("/data/campus-buildings.geojson").then((r) =>
            r.ok ? r.json() : null
          ),
          showParkingLots
            ? fetch("/data/parking-lots.geojson").then((r) =>
                r.ok ? r.json() : null
              )
            : Promise.resolve(null),
          showShuttleRoutes
            ? fetch("/data/shuttle-routes.geojson").then((r) =>
                r.ok ? r.json() : null
              )
            : Promise.resolve(null),
          showMeetupSpots
            ? fetch("/data/meetup-spots.geojson").then((r) =>
                r.ok ? r.json() : null
              )
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setGeoCollections({
          buildings: bRes,
          lots: lRes,
          shuttles: sRes,
          meetups: mRes,
        });
        setGeoStats({
          buildings: bRes?.features?.length ?? 0,
          lots: lRes?.features?.length ?? 0,
          routes: sRes?.features?.length ?? 0,
          meetups: mRes?.features?.length ?? 0,
        });
      } catch {
        // Offline before cache warm — gracefully retain empty
      }
    };
    void loadGeo();
    return () => {
      cancelled = true;
    };
  }, [showParkingLots, showShuttleRoutes, showMeetupSpots]);

  const places = useMemo(
    () => placesFromGeoJson(geoCollections.buildings),
    [geoCollections.buildings]
  );
  const placeResults = useMemo(
    () =>
      searchPlaces(places, placeQuery, {
        preferredCampus: campusFilter === "All KSU" ? undefined : campusFilter,
        limit: 6,
      }),
    [places, placeQuery, campusFilter]
  );

  const selectPlace = (place: CampusPlace) => {
    setSelectedPlace(place);
    setPlaceQuery(place.name);
    try {
      mapRef.current?.fitBounds(
        [
          [place.bbox[0], place.bbox[1]],
          [place.bbox[2], place.bbox[3]],
        ],
        { padding: 80, maxZoom: 18, duration: 600 }
      );
    } catch {
      // map not ready; selection still shows in the result card
    }
  };

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    let disposed = false;

    const initMap = async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (disposed || !containerRef.current) return;

        const center = CAMPUS_CENTERS[campusFilter];
        let offlineStyle = !navigator.onLine;
        const getStyle = (offline: boolean) => offline
          ? structuredClone(EMBEDDED_ZERO_TILE_STYLE)
          : ONLINE_MAP_STYLE;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getStyle(offlineStyle),
          center: [center.lng, center.lat],
          zoom: center.zoom,
          attributionControl: false,
        });

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
        map.on("click", "ksu-lots-fill", (ev) => {
          const slug = ev.features?.[0]?.properties?.slug;
          if (slug) selectLotRef.current?.(String(slug));
        });
        map.on("click", "ksu-meetups-points", (ev) => {
          const slug = ev.features?.[0]?.properties?.slug;
          if (slug) selectMeetupRef.current?.(String(slug));
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
  }, []);

  // Fly camera when Campus filter switches
  useEffect(() => {
    if (!mapRef.current) return;
    const target = CAMPUS_CENTERS[campusFilter];
    try {
      mapRef.current.jumpTo({
        center: [target.lng, target.lat],
        zoom: target.zoom,
      });
    } catch {
      // ignore
    }
  }, [campusFilter]);

  // Sync static GeoJSON layers onto MapLibre once loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;

    try {
      if (geoCollections.buildings && !map.getSource("ksu-buildings")) {
        map.addSource("ksu-buildings", {
          type: "geojson",
          data: geoCollections.buildings,
        });
        map.addLayer({
          id: "ksu-buildings-fill",
          type: "fill",
          source: "ksu-buildings",
          paint: {
            "fill-color": "#CBD5E1",
            "fill-opacity": 0.65,
          },
        });
        map.addLayer({
          id: "ksu-buildings-selected",
          type: "line",
          source: "ksu-buildings",
          filter: ["==", ["get", "geoFeatureId"], ""],
          paint: { "line-color": "#B45309", "line-width": 3 },
        });
        // Labels need glyphs from the online style; the offline zero-tile
        // style has none, so skip them there (search still works).
        if (!usingOfflineStyle) {
          map.addLayer({
            id: "ksu-buildings-labels",
            type: "symbol",
            source: "ksu-buildings",
            minzoom: 15.5,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-max-width": 8,
              "text-optional": true,
            },
            paint: {
              "text-color": "#111317",
              "text-halo-color": "#FFFFFF",
              "text-halo-width": 1.5,
            },
          });
        }
      }

      if (geoCollections.lots) {
        const tierBySlug = new Map(
          lotStatuses.map((l) => [l.slug, l.effectiveTier])
        );
        const enrichedLots = {
          ...geoCollections.lots,
          features: geoCollections.lots.features.map((f: any) => ({
            ...f,
            properties: {
              ...f.properties,
              effectiveTier: tierBySlug.get(f.properties?.slug) ?? -1,
            },
          })),
        };

        if (map.getSource("ksu-lots")) {
          map.getSource("ksu-lots").setData(enrichedLots);
        } else {
          map.addSource("ksu-lots", {
            type: "geojson",
            data: enrichedLots,
          });
          map.addLayer({
            id: "ksu-lots-fill",
            type: "fill",
            source: "ksu-lots",
            paint: {
              "fill-color": [
                "match",
                ["get", "effectiveTier"],
                0,
                "#16A34A",
                1,
                "#D97706",
                2,
                "#DC2626",
                3,
                "#991B1B",
                "#2563EB",
              ],
              "fill-opacity": 0.55,
            },
          });
          map.addLayer({
            id: "ksu-lots-outline",
            type: "line",
            source: "ksu-lots",
            paint: {
              "line-color": "#111317",
              "line-width": 1.5,
            },
          });
        }
      }

      if (geoCollections.shuttles && !map.getSource("ksu-shuttles")) {
        map.addSource("ksu-shuttles", {
          type: "geojson",
          data: geoCollections.shuttles,
        });
        map.addLayer({
          id: "ksu-shuttle-lines",
          type: "line",
          source: "ksu-shuttles",
          filter: ["==", ["get", "featureKind"], "route"],
          paint: {
            "line-color": ["coalesce", ["get", "colorHex"], "#FDBB30"],
            "line-width": 3.5,
          },
        });
        map.addLayer({
          id: "ksu-shuttle-stops",
          type: "circle",
          source: "ksu-shuttles",
          filter: ["==", ["get", "featureKind"], "stop"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#111317",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FDBB30",
          },
        });
      }

      if (geoCollections.meetups && !map.getSource("ksu-meetups")) {
        map.addSource("ksu-meetups", {
          type: "geojson",
          data: geoCollections.meetups,
        });
        map.addLayer({
          id: "ksu-meetups-points",
          type: "circle",
          source: "ksu-meetups",
          paint: {
            "circle-radius": 7,
            "circle-color": "#FDBB30",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#111317",
          },
        });
      }
    } catch {
      // Ignore transient style reload races
    }
  }, [
    geoCollections,
    lotStatuses,
    styleRevision,
    usingOfflineStyle,
  ]);

  // Highlight the searched building's outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    try {
      if (map.getLayer("ksu-buildings-selected")) {
        map.setFilter("ksu-buildings-selected", [
          "==",
          ["get", "geoFeatureId"],
          selectedPlace?.id ?? "",
        ]);
      }
    } catch {
      // ignore transient style reload races
    }
  }, [selectedPlace, styleRevision, geoCollections]);

  return (
    <div
      data-testid="campus-geo-map"
      data-offline-style={usingOfflineStyle || isOffline ? "embedded-zero-tile" : "openfreemap"}
      data-loaded-buildings={geoStats.buildings}
      className="relative overflow-hidden rounded-2xl border border-[#E4E7EE] bg-[#E8EEF5]"
    >
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-[#111317]/90 px-2.5 py-1 text-[10.5px] font-extrabold text-[#FDBB30] shadow">
          🗺️ {campusFilter} Map · {geoStats.buildings} Buildings
          {showParkingLots ? ` · ${geoStats.lots} Lots` : ""}
        </span>
        {isOffline && (
          <span
            data-testid="map-offline-zero-tile-badge"
            className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#92400E] shadow"
          >
            Offline Zero-Tile GeoJSON Mode
          </span>
        )}
        {liveVehicles.length > 0 && (
          <span className="rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#15803D] shadow">
            🚌 {liveVehicles.length} Active Buses
          </span>
        )}
      </div>

      {showPlaceSearch && places.length > 0 && (
        <div className="absolute right-3 top-3 z-10 w-44 sm:w-56">
          <input
            type="search"
            role="combobox"
            aria-expanded={placeResults.length > 0}
            aria-controls="campus-place-results"
            aria-label="Search campus buildings"
            data-testid="campus-place-search"
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              if (selectedPlace) setSelectedPlace(null);
            }}
            placeholder="Find a building…"
            className="w-full rounded-xl border border-[#E4E7EE] bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#111317] shadow outline-none focus:border-[#FDBB30]"
          />
          {placeQuery.trim() !== "" && !selectedPlace && (
            <ul
              id="campus-place-results"
              role="listbox"
              data-testid="campus-place-results"
              className="mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#E4E7EE] bg-white shadow-lg"
            >
              {placeResults.length === 0 ? (
                <li className="px-3 py-2 text-[11px] font-semibold text-[#5E6675]">
                  No matching building
                </li>
              ) : (
                placeResults.map((place) => (
                  <li key={place.id} role="option" aria-selected="false">
                    <button
                      type="button"
                      onClick={() => selectPlace(place)}
                      className="block w-full px-3 py-1.5 text-left text-[11.5px] hover:bg-[#FFF6DC]"
                    >
                      <span className="font-bold text-[#111317]">
                        {place.name}
                      </span>
                      <span className="ml-1.5 text-[10.5px] text-[#5E6675]">
                        {place.campus}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {!webglFallback ? (
        <div ref={containerRef} className="h-64 w-full sm:h-76" />
      ) : (
        /* Headless / Non-WebGL Interactive GeoJSON Fallback */
        <div
          data-testid="campus-map-svg-fallback"
          className="flex h-64 w-full flex-col justify-end bg-[#E8EEF5] p-3 sm:h-76"
        >
          <div className="flex flex-wrap gap-1.5 overflow-y-auto pt-8">
            {lotStatuses.slice(0, 12).map((l) => (
              <button
                key={l.slug}
                type="button"
                onClick={() => onSelectLotSlug?.(l.slug)}
                className="rounded-lg border border-[#111317]/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#111317]"
              >
                {l.name} ({l.campus})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
