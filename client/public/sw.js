// Minimal, conservative service worker for the Lunch Wheel PWA.
// - Never touches /api (tRPC + SSE) or non-GET requests.
// - App shell ("/app") is network-first with a short timeout: new deploys still
//   appear immediately on a healthy network, but a cold/slow origin can no longer
//   stall the document (and therefore all the JS) for seconds. Offline falls back
//   to the cached shell.
// - Hashed static assets are cache-first (safe: new builds get new URLs).

const CACHE = "lunch-wheel-v3";
const SHELL = "/app";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([SHELL, "/icon.svg", "/manifest.webmanifest"])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return; // tRPC + SSE: always live

  // Navigations → network-first, but only for a moment. The document is what
  // gates everything else (it carries the <script> tags), and this app's origin
  // is a serverless function in front of a database that can be cold — waiting
  // on it made every reload start with a multi-second stall before a single byte
  // of JS was requested. So: race the network against a short timer, and if the
  // network hasn't answered by then, serve the cached shell immediately and let
  // the fetch keep running to refresh the cache for next time. Offline still
  // falls back to the cache, as before. Assets are hashed, so a slightly stale
  // shell still boots a consistent build.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(SHELL);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);

        if (!cached) return (await network) || caches.match(request);

        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
        const fresh = await Promise.race([network, timeout]);
        return fresh || cached;
      })(),
    );
    return;
  }

  // Static assets → cache-first with background refresh.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
