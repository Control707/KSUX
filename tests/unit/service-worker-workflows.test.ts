// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://ksux.example";
const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

type WorkerRequest = Pick<Request, "url" | "method" | "mode">;
type WorkerEvent = {
  request?: WorkerRequest;
  data?: unknown;
  respondWith?: (result: Promise<Response>) => void;
  waitUntil?: (result: Promise<unknown>) => void;
};

function workerHarness() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const urlKey = (key: string | WorkerRequest) =>
    typeof key === "string" ? new URL(key, origin).href : key.url;

  function openCache(name: string) {
    const entries = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, entries);
    return {
      addAll: async (urls: string[]) => {
        for (const url of urls) entries.set(urlKey(url), new Response(`Precached ${url}`));
      },
      match: async (key: WorkerRequest | string, options?: { ignoreSearch?: boolean }) => {
        const wanted = urlKey(key);
        if (!options?.ignoreSearch) return entries.get(wanted)?.clone();
        const strip = (href: string) => href.split("?")[0];
        for (const [stored, response] of entries) {
          if (strip(stored) === strip(wanted)) return response.clone();
        }
        return undefined;
      },
      put: async (key: WorkerRequest | string, response: Response) => {
        entries.set(urlKey(key), response);
      },
    };
  }

  const network = vi.fn<(request: WorkerRequest) => Promise<Response>>();
  const timeout = vi.fn<(expire: () => void, milliseconds: number) => number>();
  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn(async () => {});
  const cacheStorage = {
    open: async (name: string) => openCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  runInNewContext(source, {
    URL,
    Response,
    fetch: network,
    caches: cacheStorage,
    setTimeout: timeout,
    clearTimeout: () => {},
    self: {
      location: { origin },
      clients: { claim },
      skipWaiting,
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
        handlers.set(type, handler);
      },
    },
  });

  function dispatch(type: string, fields: WorkerEvent = {}) {
    const lifetime: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const handler = handlers.get(type);
    if (!handler) throw new Error(`Missing service worker listener for ${type}`);
    handler({
      ...fields,
      respondWith: (result) => { response = result; },
      waitUntil: (result) => { lifetime.push(result); },
    });
    return { response, lifetime };
  }

  function dispatchFetch(path: string, options: Partial<Omit<WorkerRequest, "url">> = {}) {
    return dispatch("fetch", {
      request: { url: urlKey(path), method: "GET", mode: "same-origin", ...options },
    });
  }

  return { network, timeout, claim, skipWaiting, cacheStorage, openCache, dispatch, dispatchFetch };
}

describe("Offline commuter service worker workflows", () => {
  it("preloads the shell, manifest, icons and campus files before first use", async () => {
    const worker = workerHarness();
    await Promise.all(worker.dispatch("install").lifetime);
    worker.network.mockRejectedValue(new Error("Offline"));

    const home = await worker.dispatchFetch("/", { mode: "navigate" }).response;
    expect(await home?.text()).toBe("Precached /");

    for (const path of [
      "/manifest.webmanifest",
      "/icons/icon-192.svg",
      "/icons/icon-512.svg",
      "/data/parking-lots.geojson",
      "/data/campus-buildings.geojson",
      "/data/shuttle-routes.geojson",
      "/data/meetup-spots.geojson",
    ]) {
      const asset = await worker.dispatchFetch(path).response;
      expect(await asset?.text()).toBe(`Precached ${path}`);
    }
  });

  it("serves fresh HTML online and the exact cached page after three seconds", async () => {
    const worker = workerHarness();
    await Promise.all(worker.dispatch("install").lifetime);
    worker.network.mockResolvedValueOnce(new Response("Parking page"));
    const navigate = () => worker.dispatchFetch("/parking", { mode: "navigate" });
    expect(await (await navigate().response)?.text()).toBe("Parking page");

    worker.network.mockImplementationOnce(() => new Promise(() => {}));
    const timerRegistered = new Promise<{ expire: () => void; milliseconds: number }>((resolve) => {
      worker.timeout.mockImplementationOnce((expire, milliseconds) => {
        resolve({ expire, milliseconds });
        return 1;
      });
    });
    const fallback = navigate().response;
    const { expire, milliseconds } = await timerRegistered;
    expect(milliseconds).toBe(3000);
    expire();
    expect(await (await fallback)?.text()).toBe("Parking page");
  });

  it("falls back to the shell for uncached navigations and returns 503 with an empty cache", async () => {
    const worker = workerHarness();
    worker.network.mockRejectedValue(new Error("Offline"));
    const navigate = () => worker.dispatchFetch("/parking", { mode: "navigate" });

    expect((await navigate().response)?.status).toBe(503);
    await Promise.all(worker.dispatch("install").lifetime);
    expect(await (await navigate().response)?.text()).toBe("Precached /");
  });

  it("loads a hashed bundle from the network once and subsequently uses the cache", async () => {
    const worker = workerHarness();
    worker.network.mockResolvedValueOnce(new Response("bundle"));
    const load = () => worker.dispatchFetch("/_next/static/chunks/app-abcdef.js");

    expect(await (await load().response)?.text()).toBe("bundle");
    expect(await (await load().response)?.text()).toBe("bundle");
    expect(worker.network).toHaveBeenCalledOnce();
  });

  it("serves a cached hashed bundle when only its query string differs", async () => {
    const worker = workerHarness();
    worker.network.mockResolvedValueOnce(new Response("bundle"));
    await worker.dispatchFetch("/_next/static/chunks/main-app.js?v=1").response;
    worker.network.mockRejectedValue(new Error("Offline"));

    const offline = await worker.dispatchFetch("/_next/static/chunks/main-app.js?v=2").response;
    expect(await offline?.text()).toBe("bundle");
    expect(worker.network).toHaveBeenCalledOnce();
  });

  it("leaves write requests, live APIs and external map tiles to the browser", () => {
    const worker = workerHarness();
    expect(worker.dispatchFetch("/parking", { method: "POST", mode: "navigate" }).response).toBeUndefined();
    expect(worker.dispatchFetch("/api/scrappy/stream").response).toBeUndefined();

    for (const url of [
      "https://demo.convex.cloud/api/query",
      "http://localhost:3210/api/mutation",
      "https://passio3.com/routes",
      "https://uploader.uploadthing.com/file",
      "https://tiles.openfreemap.org/tiles.json",
    ]) {
      expect(worker.dispatchFetch(url).response).toBeUndefined();
    }
    expect(worker.network).not.toHaveBeenCalled();
  });

  it("never caches Safety HTML or RSC responses, including descendants and query strings", async () => {
    const worker = workerHarness();
    await Promise.all(worker.dispatch("install").lifetime);
    for (const path of ["/safety", "/safety?demo=1", "/safety/incidents/123", "/safety/alerts/123?_rsc=abc"]) {
      for (const mode of ["navigate", "same-origin"] as const) {
        expect(worker.dispatchFetch(path, { mode }).response).toBeUndefined();
      }
    }
    expect(worker.network).not.toHaveBeenCalled();
  });

  it("only skips waiting after receiving an explicit update message", async () => {
    const worker = workerHarness();
    await Promise.all(worker.dispatch("install").lifetime);
    worker.dispatch("message", { data: { type: "OTHER_EVENT" } });
    expect(worker.skipWaiting).not.toHaveBeenCalled();

    worker.dispatch("message", { data: { type: "SKIP_WAITING" } });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it("keeps the worker alive until stale campus files have finished refreshing", async () => {
    const worker = workerHarness();
    await Promise.all(worker.dispatch("install").lifetime);
    const path = "/data/parking-lots.geojson";
    let completeRefresh!: (value: Response) => void;
    worker.network.mockReturnValueOnce(new Promise((resolve) => { completeRefresh = resolve; }));

    const stale = worker.dispatchFetch(path);
    expect(await (await stale.response)?.text()).toBe(`Precached ${path}`);
    completeRefresh(new Response("Fresh lot geometry"));
    expect(stale.lifetime.length).toBeGreaterThan(0);
    await Promise.all(stale.lifetime);

    worker.network.mockRejectedValueOnce(new Error("Offline again"));
    expect(await (await worker.dispatchFetch(path).response)?.text()).toBe("Fresh lot geometry");
  });

  it("removes stale KSUX caches during activation while preserving other origin caches", async () => {
    const worker = workerHarness();
    worker.openCache("ksux-v0-shell");
    worker.openCache("other-campus-app");
    await Promise.all(worker.dispatch("install").lifetime);
    await Promise.all(worker.dispatch("activate").lifetime);

    expect(worker.claim).toHaveBeenCalledOnce();
    const keys = await worker.cacheStorage.keys();
    expect(keys).not.toContain("ksux-v0-shell");
    expect(keys).toContain("other-campus-app");
  });
});
