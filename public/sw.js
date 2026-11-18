const SW_VERSION = "ksux-v2";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const GEOJSON_CACHE = `${SW_VERSION}-geojson`;

const PRECACHE_GEOJSON_AND_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/data/parking-lots.geojson",
  "/data/campus-buildings.geojson",
  "/data/shuttle-routes.geojson",
  "/data/meetup-spots.geojson",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/"])),
      caches
        .open(GEOJSON_CACHE)
        .then((cache) => cache.addAll(PRECACHE_GEOJSON_AND_SHELL.slice(1))),
    ]).catch(() => {
      // Tolerate partial precache during initial dev builds
    })
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE, GEOJSON_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => /^ksux-v\d+-(shell|static|geojson)$/.test(k) && !keep.has(k))
            .map((staleKey) => caches.delete(staleKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStrictPassthroughRequest(request, url) {
  if (request.method !== "GET") return true;
  if (url.pathname.startsWith("/api/")) return true;
  // Safety is network-only, for document navigations and App Router/RSC fetches alike.
  if (url.pathname === "/safety" || url.pathname.startsWith("/safety/")) return true;
  if (
    url.hostname.includes("convex.cloud") ||
    url.hostname.includes("convex.site") ||
    url.port === "3210" ||
    url.port === "3211"
  ) {
    return true;
  }
  if (
    url.hostname.includes("passio3.com") ||
    url.hostname.includes("passiogo.com") ||
    url.hostname.includes("utfs.io") ||
    url.hostname.includes("ufs.sh") ||
    url.hostname.includes("uploadthing.com")
  ) {
    return true;
  }
  return false;
}

async function networkFirstHtmlWith3sTimeout(request) {
  const cache = await caches.open(SHELL_CACHE);
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("SW_HTML_TIMEOUT_3S")), 3000);
  });

  try {
    const fresh = await Promise.race([fetch(request), timeoutPromise]);
    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cachedExact = await cache.match(request);
    if (cachedExact) return cachedExact;
    const cachedRoot = await cache.match("/");
    if (cachedRoot) return cachedRoot;
    return new Response("Offline — open KSUX home screen to view saved schedule.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirstHashedBundle(request) {
  const cache = await caches.open(STATIC_CACHE);
  // File names under /_next/static are content-hashed, so the query string
  // (dev-server ?v= cache-busting, deployment ?dpl= routing) never changes the
  // bytes. Ignoring it lets the cached shell find bundles primed earlier.
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    await cache.put(request, fresh.clone()).catch(() => {});
  }
  return fresh;
}

function staleWhileRevalidateAsset(event) {
  const request = event.request;
  const cache = caches.open(GEOJSON_CACHE);
  const refresh = fetch(request)
    .then(async (fresh) => {
      if (fresh.ok) {
        await cache.then((store) => store.put(request, fresh.clone())).catch(() => {});
      }
      return fresh;
    })
    .catch(() => null);

  event.waitUntil(refresh);
  event.respondWith((async () => {
    const cached = await cache.then((store) => store.match(request)).catch(() => null);
    return cached ?? await refresh ?? new Response("{}", {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  })());
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Strict passthrough on APIs, UploadThing, Passio GO live feeds, and Convex HTTP/WS
  if (isStrictPassthroughRequest(event.request, url)) {
    return;
  }

  // Network-First (3s timeout) on HTML navigations
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstHtmlWith3sTimeout(event.request));
    return;
  }

  // Cache-First on content-hashed Next.js static bundles
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstHashedBundle(event.request));
    return;
  }

  // Stale-While-Revalidate on static campus GeoJSON geometries & PWA icons (<3 MB)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/data/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest")
  ) {
    staleWhileRevalidateAsset(event);
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title || "KSUX Campus", {
        body: payload.body || "New campus update",
        icon: "/icons/icon-192.svg",
        tag: payload.tag || "ksux-push",
        data: { href: payload.href || "/chats" },
      })
    );
  } catch {
    // Ignore malformed push payload
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetHref = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetHref);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetHref);
    })
  );
});
