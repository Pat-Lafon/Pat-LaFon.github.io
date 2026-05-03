// Hiragana service worker source. Compiled by _config/build-sw.js into
// _site/hiragana/sw.js at build time; the precache manifest is auto-generated
// from the built directory.

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

self.skipWaiting();
self.clients.claim?.();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Tailwind CDN (only cross-origin asset). Cache aggressively — versioned URL.
registerRoute(
  ({ url }) => url.origin !== self.location.origin,
  new CacheFirst({ cacheName: "hiragana-cross-origin" })
);
