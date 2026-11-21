const SHELL_CACHE = "billjot-shell-v2";
const STATIC_CACHE = "billjot-static-v1";
const POS_NAV_CACHE = "billjot-pos-nav-v1";
const ACTIVE_CACHES = new Set([SHELL_CACHE, STATIC_CACHE, POS_NAV_CACHE]);

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/logo.svg",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !ACTIVE_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isRscRequest(request, url) {
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") !== null ||
    request.headers.get("Next-Router-State-Tree") !== null ||
    url.searchParams.has("_rsc")
  );
}

function isDevHmrRequest(url) {
  return (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.includes("hot-update") ||
    url.pathname.startsWith("/__nextjs")
  );
}

function isLocalhost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

async function networkFirstStatic(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidateShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (isDevHmrRequest(url)) return;
  if (isRscRequest(request, url)) return;

  if (request.mode === "navigate") {
    const isPosRoute = /^\/r\/[^/]+\/pos\/?$/.test(url.pathname);
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (isPosRoute && response && response.ok && response.type === "basic") {
            const cache = await caches.open(POS_NAV_CACHE);
            await cache.put(url.pathname, response.clone());
          }
          return response;
        })
        .catch(async () => {
          if (isPosRoute) {
            const cachedPos = await caches.match(url.pathname);
            if (cachedPos) return cachedPos;
          }
          const offlineFallback = await caches.match("/offline");
          return offlineFallback || Response.error();
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/logo.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/favicon-16x16.png" ||
    url.pathname === "/favicon-32x32.png" ||
    url.pathname === "/apple-touch-icon.png"
  ) {
    event.respondWith(staleWhileRevalidateShell(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      isLocalhost(url.hostname)
        ? networkFirstStatic(request)
        : cacheFirstStatic(request),
    );
  }
});
