import fs from "node:fs";
import path from "node:path";

/**
 * Snapshots Kennesaw State's Big Owl Bus network (stops, stop order, route
 * polylines) from Passio GO into data/ksu-seed/passio-network.json.
 *
 * `scripts/harvest-ksu-seed.ts` reads that snapshot, so harvesting stays
 * offline and deterministic. Re-run this script when Passio's network changes:
 *
 *   pnpm run seed:passio && pnpm run seed:harvest
 */
const KSU_SYSTEM_ID = "66"; // matches agency_id in passio3.com/kennesaw GTFS
const ENDPOINT =
  "https://passiogo.com/mapGetData.php?getStops=2&deviceId=1&withOutdated=1" +
  "&wBounds=1&showBusInOos=0&lat=34&lng=-84&wTransloc=1";
const OUT = path.join(
  process.cwd(),
  "data",
  "ksu-seed",
  "passio-network.json"
);

type PassioStop = {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
};

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

async function main() {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `json=${JSON.stringify({ s0: KSU_SYSTEM_ID, sA: 1 })}`,
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Passio returned HTTP ${resp.status}`);
  const data: any = await resp.json();

  const stops: Record<string, Omit<PassioStop, "stopId">> = {};
  for (const s of Object.values<any>(data.stops ?? {})) {
    const latitude = Number(s.latitude);
    const longitude = Number(s.longitude);
    if (!s.stopId || !s.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    stops[String(s.stopId)] = {
      name: String(s.name).trim(),
      latitude: round5(latitude),
      longitude: round5(longitude),
    };
  }

  const routes = Object.entries<any>(data.routes ?? {}).map(([id, def]) => {
    // def = [name, color, ?, [position, stopId, ?], ...]
    const ordered = def
      .slice(3)
      .sort((a: any[], b: any[]) => Number(a[0]) - Number(b[0]))
      .map((entry: any[]) => String(entry[1]));
    // Loops repeat their first stop at the end; keep each stop once, in order.
    const stopIds = ordered.filter(
      (id: string, i: number) => id !== ordered[i - 1]
    );
    if (stopIds.length > 1 && stopIds[0] === stopIds[stopIds.length - 1]) {
      stopIds.pop();
    }
    const raw: Array<{ lat: string; lng: string }> =
      data.routePoints?.[id]?.flat() ?? [];
    const shape: Array<[number, number]> = [];
    for (const p of raw) {
      const pt: [number, number] = [round5(Number(p.lng)), round5(Number(p.lat))];
      const prev = shape[shape.length - 1];
      if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
      if (prev && prev[0] === pt[0] && prev[1] === pt[1]) continue;
      shape.push(pt);
    }
    return { passioRouteId: id, name: String(def[0]), stopIds, shape };
  });

  for (const route of routes) {
    const missing = route.stopIds.filter((id: string) => !stops[id]);
    if (missing.length || route.stopIds.length < 2 || route.shape.length < 2) {
      throw new Error(
        `Route ${route.passioRouteId} incomplete (missing stops: ${missing.join(",") || "none"}, ` +
          `${route.stopIds.length} stops, ${route.shape.length} shape points)`
      );
    }
  }
  if (routes.length < 8 || Object.keys(stops).length < 25) {
    throw new Error(
      `Implausible Passio network: ${routes.length} routes, ${Object.keys(stops).length} stops`
    );
  }

  routes.sort((a, b) => a.passioRouteId.localeCompare(b.passioRouteId));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: "passiogo.com mapGetData (KSU system 66)",
        fetchedAt: new Date().toISOString(),
        stops,
        routes,
      },
      null,
      1
    ) + "\n"
  );
  console.log(
    `Wrote ${path.relative(process.cwd(), OUT)}: ${routes.length} routes, ${Object.keys(stops).length} stops`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
