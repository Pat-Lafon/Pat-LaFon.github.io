// Meditation service worker source. Compiled by _config/build-sw.js into
// _site/meditation/sw.js at build time; the precache manifest is auto-generated
// from the built directory.

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

self.skipWaiting();
self.clients.claim?.();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Guided session audio: cache-first with LRU eviction so storage stays bounded.
registerRoute(
  ({ url }) => /\.mp3$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "meditation-audio",
    plugins: [new ExpirationPlugin({ maxEntries: 5, purgeOnQuotaError: true })],
  })
);
