import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

self.skipWaiting();
self.clients.claim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);
