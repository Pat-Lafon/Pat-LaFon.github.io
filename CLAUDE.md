# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

General Eleventy workflow lives in the `eleventy-static-site` skill; general Workbox + PWA technique lives in the `workbox-pwa` skill. Repo-specific:

## TODO files

`TODO.md`, `meditation/TODO.md`, and `hiragana/TODO.md` are the working punch-lists for this repo. (Tier 1 covers the format and deletion policy.)

## Project Overview

Personal website and blog for Patrick LaFontaine, built with **Eleventy (11ty) v3**. Deployed to GitHub Pages via GitHub Actions on push to `main`. Also includes standalone hiragana and meditation PWAs.

Node version: 24 (see `.nvmrc`).

## Build & Deployment specifics

- `npm run build-ghpages` — production build with the project-pages pathprefix applied.
- Push to `main` triggers `.github/workflows/gh-pages.yml` which runs `build-ghpages` and deploys `_site/` via `peaceiris/actions-gh-pages`.

## Hiragana PWA

`hiragana/` is an independent React app with a service worker for offline support. It is not part of the Eleventy build — files are served as-is. Dependencies (React, ReactDOM, htm) are vendored locally in `hiragana/vendor/`.

Tailwind CSS is pre-built (no in-browser JIT). `_config/build-tailwind.js` runs as an `eleventy.after` hook before the SW build, invoking the Tailwind CLI with `_config/tailwind/hiragana.css` as input and emitting `_site/hiragana/styles.css`. The input file's `@source` directives point at `hiragana/index.html` and `hiragana/app.js`.

## Meditation PWA

`meditation/` is a standalone box breathing + guided meditation app with a service worker for offline support. Guided sessions stream from external URLs (UCLA, DoD, VA) and are auto-cached for offline use.

## Service Workers (Workbox)

Repo-specific wiring (technique is in the `workbox-pwa` skill):

- SW sources: `_config/sw/<app>.js` (one per PWA — `hiragana`, `meditation`). Outside the app dirs so Eleventy's passthrough copy doesn't ship them to `_site/`.
- Build script: `_config/build-sw.js`, runs as an `eleventy.after` hook. Uses `esbuild` to bundle each SW source, substituting `self.__WB_MANIFEST` from `workbox-build`'s `getManifest()`. Output lands at `_site/<app>/sw.js`.
- Budgets enforced by `_config/build-sw.js`: **10 MB per-PWA precache, 500 KB per-file.** Build fails if exceeded.
- Hiragana persists a lean per-card shape (`{box, lastDay}` keyed by id; static fields rehydrated from code in `storage.js`) to keep localStorage small. Key name: `hiragana-srs` (stable, unversioned); stats under `hiragana-stats`.

## Vendored Dependencies

The hiragana app vendors React, ReactDOM, and htm locally in `hiragana/vendor/` instead of loading from CDN. Versions are tracked in `package.json` devDependencies so Dependabot can create PRs for updates.

**Update workflow:**
1. Dependabot creates a PR bumping the version in `package.json`
2. CI runs `npm test` which includes a vendor sync check — it fails because `package.json` and `versions.json` are out of sync
3. Run `node hiragana/vendor/update.js` to re-download the vendored files at the new version
4. Commit the updated vendor files to the PR
5. CI re-runs, all checks pass, merge

**Manual update:**
1. Change version in `package.json` devDependencies
2. Run `node hiragana/vendor/update.js`
3. Commit

**Scripts:**
- `node hiragana/vendor/update.js` — downloads vendored deps from esm.sh using versions in `package.json`
- `node hiragana/vendor/check-updates.js` — verifies vendored files match `package.json` versions (runs in CI via `npm test`)

## CI Tests (`npm test`)

These checks run before every deploy:

1. **Lint** (`eslint`) — across all source code.
2. **Unit tests** — `hiragana/srs.test.js` (Leitner box logic), `hiragana/numbers.test.js` (1–99 composition + alt generation), `hiragana/storage.test.js` (load/hydrate invariants).
3. **Vendor sync** (`hiragana/vendor/check-updates.js`) — verifies vendored files match the versions in `package.json`.
4. **Import scan** (`hiragana/vendor/import-scan.test.js`) — fails if any shipped JS module has an absolute-path import (a class of regression that resolves against the page origin and 404s in production).
5. **Build** (`npm run build`) — runs Eleventy + the Workbox SW generator. The SW build enforces the per-PWA precache budget (10 MB), per-file limit (500 KB), and auto-detects new shipped assets via `getManifest()`.
6. **Offline coverage** (`_config/sw/offline.test.js`) — asserts every runtime-fetched hiragana URL (audio, mnemonics, shell) is in the precache manifest, and that the meditation SW caches cross-origin audio correctly. Runs after the build.
