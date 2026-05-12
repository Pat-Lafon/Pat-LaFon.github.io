// Offline-mode correctness test for the two PWAs.
//
// Catches two classes of regression that the build can't catch on its own:
//
//   1. Precache misses — a URL the app fetches at runtime is not in the
//      precache manifest baked into _site/<app>/sw.js, so a cold-offline
//      load 404s. Detected by extracting the manifest from the built SW
//      and comparing it to the URL set the app actually references.
//
//   2. Wrong SW strategy config for cross-origin audio — the only way the
//      meditation app caches its guided sessions is via the SW route. The
//      <audio src> fetch is no-CORS, so the response is opaque (status 0).
//      Workbox's default cacheable policy rejects status 0; without an
//      explicit CacheableResponsePlugin allowing 0, the cache write is
//      silently skipped and offline mode doesn't work. Detected by
//      stub-executing the SW source against fake workbox classes and
//      inspecting the captured route registration.
//
// Run with `node _config/sw/offline.test.js`. Requires `npm run build`
// to have produced _site/<app>/sw.js.
//
// Known gaps (intentionally not enforced here):
//   - iOS Safari issues `Range: bytes=0-1` probes against <audio src>.
//     A CacheFirst response without workbox-range-requests'
//     RangedResponsePlugin won't serve those ranges from cache, so
//     offline can still break on iOS even when this test passes.
//     TODO: enforce RangedResponsePlugin once workbox-range-requests
//     is installed.
//   - External URL liveness (audio hosts going dead) — separate concern.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

function rel(p) { return relative(REPO_ROOT, p); }

const failures = [];
function fail(msg) { failures.push(msg); }

// ---------------------------------------------------------------------------
// Manifest extraction
// ---------------------------------------------------------------------------

// esbuild substitutes self.__WB_MANIFEST with a JS array literal — unquoted
// keys, so JSON.parse won't work. The variable name and the preceding
// `// <define:self.__WB_MANIFEST>` marker comment are esbuild-stable.
function extractManifest(swPath) {
  const src = readFileSync(swPath, "utf-8");
  const m = src.match(/\/\/\s*<define:self\.__WB_MANIFEST>\s*\n\s*var\s+define_self_WB_MANIFEST_default\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error(`could not extract __WB_MANIFEST from ${rel(swPath)} — esbuild output shape changed?`);
  return new Function(`"use strict"; return (${m[1]});`)();
}

// ---------------------------------------------------------------------------
// Hiragana: expected URL set
// ---------------------------------------------------------------------------

function hiraganaExpectedUrls() {
  const app = readFileSync(join(REPO_ROOT, "hiragana/app.js"), "utf-8");
  const html = readFileSync(join(REPO_ROOT, "hiragana/index.html"), "utf-8");

  // Audio: ["kana","romaji"] pairs in ROWS → audio/{romaji}.m4a
  // (Same parser pattern as hiragana/storage-budget.test.js.)
  const pairs = [...app.matchAll(/\["[^"]+","([^"]+)"\]/g)].map(m => m[1]);

  // Mnemonics: "kana": "value" entries in MNEMONICS map → mnemonics/{value}.png
  const mnemBlock = app.match(/const\s+MNEMONICS\s*=\s*\{([\s\S]*?)\};/);
  if (!mnemBlock) throw new Error("could not find MNEMONICS in hiragana/app.js");
  const mnem = [...mnemBlock[1].matchAll(/"[^"]+"\s*:\s*"([^"]+)"/g)].map(m => m[1]);

  const urls = new Set();
  for (const r of pairs) urls.add(`audio/${r}.m4a`);
  for (const v of mnem) urls.add(`mnemonics/${v}.png`);

  // index.html: same-origin script src, importmap entries, manifest, icons.
  // Skip cross-origin scripts (Tailwind CDN) — those are handled by a
  // runtime route, not precache.
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    if (!/^(https?|data):/.test(m[1])) urls.add(stripLeadingDotSlash(m[1]));
  }
  const importmap = html.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
  if (importmap) {
    const map = JSON.parse(importmap[1]).imports ?? {};
    for (const target of Object.values(map)) {
      if (typeof target === "string" && !/^https?:\/\//.test(target)) {
        urls.add(stripLeadingDotSlash(target));
      }
    }
  }
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    if (/rel=["'](manifest|icon|apple-touch-icon|stylesheet)["']/i.test(tag) && !/^(https?|data):/.test(m[1])) {
      urls.add(stripLeadingDotSlash(m[1]));
    }
  }
  return urls;
}

function meditationExpectedShellUrls() {
  const html = readFileSync(join(REPO_ROOT, "meditation/index.html"), "utf-8");
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    if (!/^(https?|data):/.test(m[1])) urls.add(stripLeadingDotSlash(m[1]));
  }
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
    const tag = m[0];
    if (/rel=["'](manifest|icon|apple-touch-icon|stylesheet)["']/i.test(tag) && !/^(https?|data):/.test(m[1])) {
      urls.add(stripLeadingDotSlash(m[1]));
    }
  }
  return urls;
}

function stripLeadingDotSlash(p) {
  return p.replace(/^\.\//, "");
}

// ---------------------------------------------------------------------------
// Meditation SW: stub-execute and inspect captured routes
// ---------------------------------------------------------------------------

function inspectMeditationSw() {
  const src = readFileSync(join(REPO_ROOT, "_config/sw/meditation.js"), "utf-8");
  // The stripper below assumes single-line imports. Fail loudly on a multi-line one.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) && !/;$/.test(lines[i].trim())) {
      throw new Error(`multi-line import at _config/sw/meditation.js:${i+1} — extend the stripper`);
    }
  }
  const stripped = src.replace(/^import\s[^;]*;\s*$/gm, "");

  const routes = [];
  const precachedManifests = [];

  // Stubs for workbox identifiers used in the source. Each constructor
  // records its config so the test can inspect what got registered.
  class StubExpirationPlugin {
    constructor(config) { this.kind = "ExpirationPlugin"; this.config = config; }
  }
  class StubCacheableResponsePlugin {
    constructor(config) { this.kind = "CacheableResponsePlugin"; this.config = config; }
  }
  class StubCacheFirst {
    constructor(config) {
      this.strategy = "CacheFirst";
      this.cacheName = config.cacheName;
      this.plugins = config.plugins || [];
    }
  }
  function stubRegisterRoute(matcher, strategy) { routes.push({ matcher, strategy }); }
  function stubPrecacheAndRoute(manifest) { precachedManifests.push(manifest); }
  function stubCleanupOutdatedCaches() {}

  const stubSelf = {
    skipWaiting: () => {},
    clients: { claim: () => {} },
    __WB_MANIFEST: [],
  };

  const stubNames = [
    "self",
    "precacheAndRoute", "cleanupOutdatedCaches", "registerRoute",
    "CacheFirst", "ExpirationPlugin", "CacheableResponsePlugin",
  ];
  const stubValues = [
    stubSelf,
    stubPrecacheAndRoute, stubCleanupOutdatedCaches, stubRegisterRoute,
    StubCacheFirst, StubExpirationPlugin, StubCacheableResponsePlugin,
  ];

  const fn = new Function(...stubNames, stripped);
  fn(...stubValues);

  return { routes, precachedManifests };
}

function extractAudioCacheName() {
  const app = readFileSync(join(REPO_ROOT, "meditation/app.js"), "utf-8");
  const m = app.match(/const\s+AUDIO_CACHE\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error("could not find AUDIO_CACHE constant in meditation/app.js");
  return m[1];
}

function extractSessionUrls() {
  const app = readFileSync(join(REPO_ROOT, "meditation/app.js"), "utf-8");
  const block = app.match(/const\s+SESSIONS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error("could not find SESSIONS array in meditation/app.js");
  return [...block[1].matchAll(/url:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
}

// ---------------------------------------------------------------------------
// Part A — Hiragana precache coverage
// ---------------------------------------------------------------------------

const hManifestEntries = extractManifest(join(REPO_ROOT, "_site/hiragana/sw.js"));
const hManifestUrls = new Set(hManifestEntries.map(e => stripLeadingDotSlash(e.url)));
const hExpected = hiraganaExpectedUrls();

if (hExpected.size < 100) {
  fail(`hiragana expected-URL extraction returned only ${hExpected.size} entries — parser likely regressed (expected >100). Check ROWS/MNEMONICS shape in hiragana/app.js.`);
}

const hMissing = [...hExpected].filter(u => !hManifestUrls.has(u));
if (hMissing.length) {
  fail(
    `hiragana: ${hMissing.length} URL(s) the app fetches are NOT in the precache manifest:\n` +
    hMissing.slice(0, 20).map(u => `      ${u}`).join("\n") +
    (hMissing.length > 20 ? `\n      … and ${hMissing.length - 20} more` : "") +
    `\n    Fix: ensure the file exists in _site/hiragana/ and matches a glob in _config/build-sw.js.`
  );
}

// ---------------------------------------------------------------------------
// Part B — Meditation SW strategy
// ---------------------------------------------------------------------------

const { routes: mRoutes } = inspectMeditationSw();
const sessionUrls = extractSessionUrls();
const cacheNameInApp = extractAudioCacheName();

if (sessionUrls.length === 0) {
  fail(`meditation: SESSIONS array parser found zero session URLs — parser regressed.`);
}

// For each session URL, find the route(s) whose matcher accepts it. Workbox
// matchers are called as matcher({ url, request, event, sameOrigin }) — we
// only need to populate url, since the source's matchers test url.pathname.
function findMatchingRoutes(url) {
  const u = new URL(url);
  return mRoutes.filter(r => {
    try {
      return r.matcher({ url: u, request: { url }, event: null, sameOrigin: false });
    } catch {
      return false;
    }
  });
}

const audioRoutes = new Set();
for (const sUrl of sessionUrls) {
  const matched = findMatchingRoutes(sUrl);
  if (matched.length === 0) {
    fail(`meditation: no SW route matches session URL ${sUrl}. Cross-origin audio will not be cached → offline broken for this session.`);
    continue;
  }
  for (const r of matched) audioRoutes.add(r);
}

for (const route of audioRoutes) {
  const plugins = route.strategy.plugins || [];
  const cacheable = plugins.find(p => p.kind === "CacheableResponsePlugin");
  const expiration = plugins.find(p => p.kind === "ExpirationPlugin");

  if (!cacheable) {
    fail(
      `meditation SW route (cacheName="${route.strategy.cacheName}") matches cross-origin audio URLs but has NO CacheableResponsePlugin.\n` +
      `    Cross-origin <audio src> fetches come back as opaque (status 0). Workbox's default\n` +
      `    cacheable policy rejects status 0, so the audio NEVER lands in cache and offline\n` +
      `    mode for guided sessions silently doesn't work.\n` +
      `    Fix in _config/sw/meditation.js:\n` +
      `      import { CacheableResponsePlugin } from "workbox-cacheable-response";\n` +
      `      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), ...]\n` +
      `    (Adding workbox-cacheable-response to package.json devDependencies first.)`
    );
  } else {
    const statuses = cacheable.config?.statuses ?? [];
    if (!statuses.includes(0) || !statuses.includes(200)) {
      fail(
        `meditation SW route has CacheableResponsePlugin but statuses=${JSON.stringify(statuses)} — must include both 0 (opaque) and 200.`
      );
    }
  }

  if (!expiration) {
    fail(`meditation SW route (cacheName="${route.strategy.cacheName}") has no ExpirationPlugin — cache could grow unbounded.`);
  } else {
    const maxEntries = expiration.config?.maxEntries;
    if (typeof maxEntries !== "number") {
      fail(`meditation SW ExpirationPlugin missing maxEntries`);
    } else if (maxEntries < sessionUrls.length) {
      fail(
        `meditation SW ExpirationPlugin maxEntries=${maxEntries} < SESSIONS.length=${sessionUrls.length}.\n` +
        `    Some sessions will be evicted before all ${sessionUrls.length} can be cached. Bump in _config/sw/meditation.js.`
      );
    }
  }

  if (route.strategy.cacheName !== cacheNameInApp) {
    fail(
      `meditation: SW cacheName="${route.strategy.cacheName}" doesn't match meditation/app.js AUDIO_CACHE="${cacheNameInApp}".\n` +
      `    Page-side cache reads/writes won't find SW-cached entries. The two strings must match.`
    );
  }
}

// ---------------------------------------------------------------------------
// Part C — Meditation precache shell coverage
// ---------------------------------------------------------------------------

const mManifestEntries = extractManifest(join(REPO_ROOT, "_site/meditation/sw.js"));
const mManifestUrls = new Set(mManifestEntries.map(e => stripLeadingDotSlash(e.url)));
const mExpected = meditationExpectedShellUrls();

if (mExpected.size < 3) {
  fail(`meditation expected-URL extraction returned only ${mExpected.size} entries — parser regressed (expected >=3: index.html, app.js, manifest).`);
}

const mMissing = [...mExpected].filter(u => !mManifestUrls.has(u));
if (mMissing.length) {
  fail(
    `meditation: ${mMissing.length} shell URL(s) not in the precache manifest:\n` +
    mMissing.map(u => `      ${u}`).join("\n") +
    `\n    Fix: ensure the file exists in _site/meditation/ and matches a glob in _config/build-sw.js.`
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`[offline] hiragana: ${hExpected.size} URLs expected, ${hManifestUrls.size} in manifest.`);
console.log(`[offline] meditation: ${mExpected.size} shell URLs expected, ${mManifestUrls.size} in manifest, ${sessionUrls.length} session URLs, ${audioRoutes.size} audio route(s).`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} offline-mode issue(s):\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log("PASS: offline-mode checks satisfied.");
