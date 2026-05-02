// Service worker for offline support.
// Network-first for all same-origin files, pre-cached for offline.

const CACHE = "hiragana-cache";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  // Vendored dependencies (~143KB total)
  "./vendor/react.js",
  "./vendor/react-dom.js",
  "./vendor/htm.js",
  // Mnemonic images (2.7MB total)
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
  // Per-syllable audio (~550KB total). 17 from Wikimedia Commons + 87 from macOS Kyoko TTS.
  "./audio/a.m4a",
  "./audio/ba.m4a",
  "./audio/be.m4a",
  "./audio/bi.m4a",
  "./audio/bo.m4a",
  "./audio/bu.m4a",
  "./audio/bya.m4a",
  "./audio/byo.m4a",
  "./audio/byu.m4a",
  "./audio/cha.m4a",
  "./audio/chi.m4a",
  "./audio/cho.m4a",
  "./audio/chu.m4a",
  "./audio/da.m4a",
  "./audio/de.m4a",
  "./audio/di.m4a",
  "./audio/do.m4a",
  "./audio/du.m4a",
  "./audio/e.m4a",
  "./audio/fu.m4a",
  "./audio/ga.m4a",
  "./audio/ge.m4a",
  "./audio/gi.m4a",
  "./audio/go.m4a",
  "./audio/gu.m4a",
  "./audio/gya.m4a",
  "./audio/gyo.m4a",
  "./audio/gyu.m4a",
  "./audio/ha.m4a",
  "./audio/he.m4a",
  "./audio/hi.m4a",
  "./audio/ho.m4a",
  "./audio/hya.m4a",
  "./audio/hyo.m4a",
  "./audio/hyu.m4a",
  "./audio/i.m4a",
  "./audio/ja.m4a",
  "./audio/ji.m4a",
  "./audio/jo.m4a",
  "./audio/ju.m4a",
  "./audio/ka.m4a",
  "./audio/ke.m4a",
  "./audio/ki.m4a",
  "./audio/ko.m4a",
  "./audio/ku.m4a",
  "./audio/kya.m4a",
  "./audio/kyo.m4a",
  "./audio/kyu.m4a",
  "./audio/ma.m4a",
  "./audio/me.m4a",
  "./audio/mi.m4a",
  "./audio/mo.m4a",
  "./audio/mu.m4a",
  "./audio/mya.m4a",
  "./audio/myo.m4a",
  "./audio/myu.m4a",
  "./audio/n.m4a",
  "./audio/na.m4a",
  "./audio/ne.m4a",
  "./audio/ni.m4a",
  "./audio/no.m4a",
  "./audio/nu.m4a",
  "./audio/nya.m4a",
  "./audio/nyo.m4a",
  "./audio/nyu.m4a",
  "./audio/o.m4a",
  "./audio/pa.m4a",
  "./audio/pe.m4a",
  "./audio/pi.m4a",
  "./audio/po.m4a",
  "./audio/pu.m4a",
  "./audio/pya.m4a",
  "./audio/pyo.m4a",
  "./audio/pyu.m4a",
  "./audio/ra.m4a",
  "./audio/re.m4a",
  "./audio/ri.m4a",
  "./audio/ro.m4a",
  "./audio/ru.m4a",
  "./audio/rya.m4a",
  "./audio/ryo.m4a",
  "./audio/ryu.m4a",
  "./audio/sa.m4a",
  "./audio/se.m4a",
  "./audio/sha.m4a",
  "./audio/shi.m4a",
  "./audio/sho.m4a",
  "./audio/shu.m4a",
  "./audio/so.m4a",
  "./audio/su.m4a",
  "./audio/ta.m4a",
  "./audio/te.m4a",
  "./audio/to.m4a",
  "./audio/tsu.m4a",
  "./audio/u.m4a",
  "./audio/wa.m4a",
  "./audio/wo.m4a",
  "./audio/ya.m4a",
  "./audio/yo.m4a",
  "./audio/yu.m4a",
  "./audio/za.m4a",
  "./audio/ze.m4a",
  "./audio/zo.m4a",
  "./audio/zu.m4a",
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
