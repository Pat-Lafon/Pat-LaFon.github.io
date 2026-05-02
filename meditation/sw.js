// Service worker for offline support.
// Network-first for the app, cache-first for downloaded audio.

const APP_CACHE = "meditation-cache";
const AUDIO_CACHE = "meditation-audio";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      await cache.addAll(APP_ASSETS);
      // Remove stale entries no longer in the list
      const valid = new Set(APP_ASSETS.map((a) => new URL(a, self.location).href));
      const keys = await cache.keys();
      await Promise.all(keys.filter((k) => !valid.has(k.url)).map((k) => cache.delete(k)));
    }).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up any caches that aren't ours
  const KEEP = [APP_CACHE, AUDIO_CACHE];
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = event.request.url;

  // Audio files: cache-first (served from user-downloaded cache)
  if (url.endsWith(".mp3")) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request);
        })
      ).catch(() => fetch(event.request))
    );
    return;
  }

  // App files: network-first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
