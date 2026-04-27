// Service worker for offline support.
// Network-first for app files (always get latest), cache-first for CDN assets.

const CACHE = "hiragana-cache";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  // Mnemonic images (2.7MB total — pre-cached for offline)
  "./mnemonics/a.png",
  "./mnemonics/chi.png",
  "./mnemonics/e.png",
  "./mnemonics/fu.png",
  "./mnemonics/ha.png",
  "./mnemonics/he.png",
  "./mnemonics/hi.png",
  "./mnemonics/ho.png",
  "./mnemonics/i.png",
  "./mnemonics/ka.png",
  "./mnemonics/ke.png",
  "./mnemonics/ki.png",
  "./mnemonics/ko.png",
  "./mnemonics/ku.png",
  "./mnemonics/ma.png",
  "./mnemonics/me.png",
  "./mnemonics/mi.png",
  "./mnemonics/mo.png",
  "./mnemonics/mu.png",
  "./mnemonics/n.png",
  "./mnemonics/na.png",
  "./mnemonics/ne.png",
  "./mnemonics/ni.png",
  "./mnemonics/no.png",
  "./mnemonics/nu.png",
  "./mnemonics/o.png",
  "./mnemonics/ra.png",
  "./mnemonics/re.png",
  "./mnemonics/ri.png",
  "./mnemonics/ro.png",
  "./mnemonics/ru.png",
  "./mnemonics/sa.png",
  "./mnemonics/se.png",
  "./mnemonics/shi.png",
  "./mnemonics/so.png",
  "./mnemonics/su.png",
  "./mnemonics/ta.png",
  "./mnemonics/te.png",
  "./mnemonics/to.png",
  "./mnemonics/tsu.png",
  "./mnemonics/u.png",
  "./mnemonics/wa.png",
  "./mnemonics/wo.png",
  "./mnemonics/ya.png",
  "./mnemonics/yo.png",
  "./mnemonics/yu.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Add/update all current assets
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
  // Clean up any legacy versioned caches
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

// Network-first: try network, update cache, fall back to cache if offline
function networkFirst(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req));
}

// Cache-first: serve from cache, fetch and cache in background if miss
function cacheFirst(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      if (res && res.status === 200 && res.type !== "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    });
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    isSameOrigin(event.request.url)
      ? networkFirst(event.request)
      : cacheFirst(event.request)
  );
});
