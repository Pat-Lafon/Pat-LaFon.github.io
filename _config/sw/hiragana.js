import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

// Gate skipWaiting on a page-side message so a deploy doesn't swap the
// precache out from under an open tab mid-session. The page posts
// SKIP_WAITING at a safe moment (visibilitychange='hidden').
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.clients.claim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);
