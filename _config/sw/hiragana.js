// Hiragana service worker source. Compiled by _config/build-sw.js into
// _site/hiragana/sw.js at build time; the precache manifest is auto-generated
// from the built directory.

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

self.skipWaiting();
self.clients.claim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);
