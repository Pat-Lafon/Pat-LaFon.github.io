import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// Gate skipWaiting on a page-side message so a deploy doesn't swap the
// precache out mid-session. The page posts SKIP_WAITING only when audio is
// paused AND no breathing session is running.
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.clients.claim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Guided session audio: cache-first with LRU eviction so storage stays bounded.
// CacheableResponsePlugin must allow status 0 — <audio src> fetches cross-origin
// MP3s as no-CORS, so the response comes back opaque. Without [0, 200] the
// default policy drops opaque responses and offline silently breaks.
// maxEntries kept comfortably above the current SESSIONS.length (16) so all
// sessions can coexist in cache; offline.test.js asserts this.
registerRoute(
  ({ url }) => /\.mp3$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "meditation-audio",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, purgeOnQuotaError: true }),
    ],
  })
);
