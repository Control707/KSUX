"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Bus, Radio } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import {
  CampusGeoMap,
  CampusMapVehicleMarker,
} from "@/components/map/CampusGeoMap";

export function TransitView() {
  const overview = useViewerQuery(api.transitDining.listShuttleOverview, {});
  const submitStopPulse = useViewerMutation(
    api.transitDining.submitShuttleStopPulse
  );

  const [browserVehicles, setBrowserVehicles] = useState<
    CampusMapVehicleMarker[] | null
  >(null);
  const [pulseMsg, setPulseMsg] = useState<string | null>(null);

  // Browser-direct Passio GO CORS:* GPS polling every 12s (zero Convex write storms!)
  useEffect(() => {
    let cancelled = false;

    const pollPassioDirect = async () => {
      if (typeof window === "undefined" || !navigator.onLine) return;
      try {
        const resp = await fetch(
          "https://passio3.com/kennesaw/passioTransit/gtfs/realtime/vehiclePositions.json",
          {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!resp.ok) return;
        const json = await resp.json();
        const entities: any[] = Array.isArray(json?.entity) ? json.entity : [];
        if (cancelled || entities.length === 0) return;

        const parsed: CampusMapVehicleMarker[] = [];
        entities.forEach((e, i) => {
          const pos = e?.vehicle?.position;
          if (!pos || typeof pos.latitude !== "number") return;
          parsed.push({
            busId: String(e?.vehicle?.vehicle?.id ?? `live-${i}`),
            busName: String(e?.vehicle?.vehicle?.label ?? `BOB #${i + 1}`),
            latitude: Number(pos.latitude),
            longitude: Number(pos.longitude),
            loadLabel: "Live GPS",
          });
        });

        if (parsed.length > 0) {
          setBrowserVehicles(parsed);
        }
      } catch {
        // Silently fall back to server-synced shuttleSnapshots
      }
    };

    void pollPassioDirect();
    const interval = setInterval(() => void pollPassioDirect(), 12_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const activeVehicles =
    browserVehicles ??
    (overview?.vehicles ?? []).map((v) => ({
      busId: v.busId,
      busName: v.busName,
      latitude: v.latitude,
      longitude: v.longitude,
      loadLabel: `${v.paxLoad}/${v.totalCap}`,
    }));

  return (
    <div data-testid="transit-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              Big Owl Bus Shuttle Routes &amp; Live GPS
            </h1>
            <p className="text-xs text-[#5E6675]">
              11 Shuttle Routes + 35 stops · Browser-direct Passio GO GPS (12s)
              + 15m rider stop pulses · KM Intercampus route always preserved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overview?.staleness.isStale && overview.staleness.label && (
              <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#92400E]">
                {overview.staleness.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-extrabold text-[#15803D]">
              <Radio className="h-3 w-3" />
              <span>{browserVehicles ? "Direct Passio GPS" : "Synced GPS"}</span>
            </span>
          </div>
        </div>

        {pulseMsg && (
          <p className="mt-2.5 rounded-xl bg-[#DCFCE7] px-3 py-2 text-xs font-bold text-[#15803D]">
            {pulseMsg}
          </p>
        )}
      </div>

      {/* Service Alerts */}
      {(overview?.serviceAlerts ?? []).map((al) => (
        <div
          key={al.alertId}
          className="rounded-2xl border border-[#FDBB30] bg-[#FFF6DC] p-3.5 text-xs text-[#111317]"
        >
          <div className="flex items-center gap-1.5 font-extrabold">
            <AlertTriangle className="h-4 w-4 text-[#B45309]" />
            <span>{al.title}</span>
          </div>
          <p className="mt-1 text-[#374151]">{al.body}</p>
        </div>
      ))}

      {/* Live MapLibre Shuttle Polyline + Bus Map */}
      <CampusGeoMap
        campusFilter={(overview?.campusFilter as any) ?? "Kennesaw"}
        showParkingLots={false}
        showShuttleRoutes
        liveVehicles={activeVehicles}
      />

      {/* Route Cards & 15m Rider Stop Pulses */}
      <div className="space-y-3">
        {(overview?.routes ?? []).map((route) => (
          <div
            key={String(route._id)}
            className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black text-white"
                  style={{ backgroundColor: route.colorHex }}
                >
                  {route.shortName}
                </span>
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-[#111317]">
                    <Bus className="h-4 w-4" />
                    <span>{route.name}</span>
                  </div>
                  <div className="text-[11px] text-[#5E6675]">
                    {route.operatingHoursSummary} · {route.loadLabel}
                  </div>
                </div>
              </div>
              <span className="rounded-xl bg-[#111317] px-3 py-1 text-xs font-black text-[#FDBB30]">
                Next bus: {route.nextEtaMinutes} min
              </span>
            </div>

            {/* Stops & 15m Rider Pulses */}
            <div className="mt-3 space-y-2 border-t border-[#E4E7EE] pt-2.5">
              {route.stops.slice(0, 4).map((stop) => (
                <div
                  key={stop.stopId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F9FAFC] px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#111317]">
                      {stop.name}
                    </span>
                    {stop.activePulse && (
                      <span className="ml-2 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10.5px] font-extrabold text-[#92400E]">
                        {stop.activePulse.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ["stop_clear", "Stop clear"],
                        ["long_line", "Long line"],
                        ["bus_passed_full", "Passed full"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={async () => {
                          await submitStopPulse({
                            stopId: stop.stopId,
                            pulseKind: kind,
                          });
                          setPulseMsg(
                            `Posted 15m '${label}' rider pulse at ${stop.name}.`
                          );
                        }}
                        className="rounded-lg border border-[#E4E7EE] bg-white px-2 py-1 text-[10.5px] font-bold text-[#111317] hover:border-[#D99B00]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
