import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// Gate skipWaiting on a page-side message so a deploy doesn't swap the
// precache out from under an open tab mid-session. The page posts
// SKIP_WAITING at a safe moment (visibilitychange='hidden').
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
// clients.claim() only resolves once the worker is activating — calling it at
// top-level eval throws InvalidStateError and does nothing.
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

// Mnemonic images render only on a wrong hiragana answer, so they're kept out of
// the precache (they were ~⅔ of it) and cached on first view instead. Same-origin
// PNGs come back status 200, so no CacheableResponsePlugin is needed; the
// ExpirationPlugin bounds the cache. Offline cost: the first wrong answer while
// offline shows no image, then it's cached. offline.test.js asserts this route
// covers mnemonics/*.png since they're no longer in the precache manifest.
registerRoute(
  ({ url }) => /\/mnemonics\/[^/]+\.png$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "hiragana-mnemonics",
    plugins: [new ExpirationPlugin({ maxEntries: 60, purgeOnQuotaError: true })],
  })
);
