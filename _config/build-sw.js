// Compile each PWA's sw.src.js into _site/<app>/sw.js with an auto-generated
// precache manifest. Invoked from eleventy.config.js after every build.
//
// Pipeline per app:
//   1. workbox-build's getManifest() walks the built dir and returns
//      [{ url, revision }, ...] for everything we want precached.
//   2. esbuild bundles sw.src.js (inlining workbox runtime modules from
//      node_modules) and substitutes self.__WB_MANIFEST with the array.

import { getManifest } from "workbox-build";
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// SW sources live in _config/sw/ (not in the app dirs) so Eleventy's
// passthrough copy doesn't ship them to _site.
const APPS = [
  // Mnemonics are runtime-cached (see _config/sw/hiragana.js), not precached — they
  // render only on a wrong answer, so keeping ~⅔ of the payload out of install is
  // worth the "first offline miss shows no image" cost.
  { id: "hiragana",   src: "_config/sw/hiragana.js",   siteDir: "_site/hiragana",   extraIgnores: ["mnemonics/**"] },
  { id: "meditation", src: "_config/sw/meditation.js", siteDir: "_site/meditation" },
];

// Total precache size budget per PWA. Build fails if exceeded.
const MAX_PRECACHE_BYTES = 10 * 1024 * 1024;

export async function buildServiceWorkers() {
  const reports = [];

  for (const app of APPS) {
    const swSrc  = join(REPO_ROOT, app.src);
    const dir    = join(REPO_ROOT, app.siteDir);
    const swDest = join(dir, "sw.js");

    const { manifestEntries, size, warnings } = await getManifest({
      globDirectory: dir,
      globPatterns: ["**/*.{html,js,css,png,jpg,jpeg,svg,m4a,oga,ogg,webp,json,webmanifest}"],
      globIgnores: ["**/*.test.js", "**/sw.js", ...(app.extraIgnores ?? [])],
      maximumFileSizeToCacheInBytes: 500 * 1024,
    });

    if (size > MAX_PRECACHE_BYTES) {
      const mb = (size / 1024 / 1024).toFixed(2);
      throw new Error(`SW build: ${app.id} precache ${mb} MB exceeds ${MAX_PRECACHE_BYTES / 1024 / 1024} MB budget`);
    }

    await esbuild.build({
      entryPoints: [swSrc],
      bundle: true,
      outfile: swDest,
      format: "iife",
      target: "es2020",
      platform: "browser",
      define: {
        "self.__WB_MANIFEST": JSON.stringify(manifestEntries),
      },
      logLevel: "error",
    });

    const kb = (size / 1024).toFixed(0);
    console.log(`[sw] ${app.id}: ${manifestEntries.length} files precached, ${kb} KB${warnings.length ? ` (${warnings.length} warnings)` : ""}`);
    for (const w of warnings) console.log(`     warn: ${w}`);
    reports.push({ app: app.id, count: manifestEntries.length, size, warnings });
  }

  return reports;
}
