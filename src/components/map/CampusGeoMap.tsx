"use client";

import React, { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

export interface CampusMapLotMarker {
  slug: string;
  name: string;
  campus: "Kennesaw" | "Marietta";
  latitude: number;
  longitude: number;
  effectiveTier: 0 | 1 | 2 | 3;
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
  lotStatuses = [],
  liveVehicles = [],
  onSelectLotSlug,
  onSelectMeetupSlug,
}: CampusGeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [geoStats, setGeoStats] = useState<{
    buildings: number;
    lots: number;
    routes: number;
    meetups: number;
  }>({ buildings: 0, lots: 0, routes: 0, meetups: 0 });
  const [webglFallback, setWebglFallback] = useState(false);

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

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    let disposed = false;

    const initMap = async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (disposed || !containerRef.current) return;

        const center = CAMPUS_CENTERS[campusFilter];
        const useOfflineStyle = !navigator.onLine;
        const styleToUse = useOfflineStyle
          ? (EMBEDDED_ZERO_TILE_STYLE as any)
          : "https://tiles.openfreemap.org/styles/liberty";

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: styleToUse,
          center: [center.lng, center.lat],
          zoom: center.zoom,
          attributionControl: false,
        });

        map.on("error", () => {
          // Automatic fallback to zero-tile embedded campus style on vector tile network error
          try {
            if (!map.getLayer("ksux-offline-bg")) {
              map.setStyle(EMBEDDED_ZERO_TILE_STYLE as any);
            }
          } catch {
            // ignore
          }
        });

        map.on("load", () => {
          if (!disposed) setMapReady(true);
        });

        mapRef.current = map;
      } catch {
        if (!disposed) setWebglFallback(true);
      }
    };

    void initMap();
    return () => {
      disposed = true;
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
    if (!map || !mapReady) return;

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
              effectiveTier: tierBySlug.get(f.properties?.slug) ?? 1,
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
          map.on("click", "ksu-lots-fill", (ev: any) => {
            const slug = ev.features?.[0]?.properties?.slug;
            if (slug && onSelectLotSlug) onSelectLotSlug(String(slug));
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
        map.on("click", "ksu-meetups-points", (ev: any) => {
          const slug = ev.features?.[0]?.properties?.slug;
          if (slug && onSelectMeetupSlug) onSelectMeetupSlug(String(slug));
        });
      }
    } catch {
      // Ignore transient style reload races
    }
  }, [
    geoCollections,
    lotStatuses,
    mapReady,
    onSelectLotSlug,
    onSelectMeetupSlug,
  ]);

  return (
    <div
      data-testid="campus-geo-map"
      data-offline-style={isOffline ? "embedded-zero-tile" : "openfreemap"}
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
