# Pat-LaFon.github.io — personal Eleventy site

General Eleventy workflow lives in the `eleventy-static-site` skill; general Workbox + PWA technique lives in the `workbox-pwa` skill. Repo-specific:

## TODO files

`TODO.md`, `meditation/TODO.md`, and `hiragana/TODO.md` are the working punch-lists for this repo. (Tier 1 covers the format and deletion policy.)

## Project Overview

Personal website and blog for Patrick LaFontaine, built with **Eleventy (11ty) v3**. Deployed to GitHub Pages via GitHub Actions on push to `main`. Also includes standalone hiragana and meditation PWAs.

Node version: 24 (see `.nvmrc`).

## Build & Deployment specifics

- `npm run build-ghpages` — production build with the project-pages pathprefix applied.
- Push to `main` triggers `.github/workflows/gh-pages.yml` which runs `build-ghpages` and deploys `_site/` via the first-party `actions/upload-pages-artifact` + `actions/deploy-pages` pair. A weekly Monday cron on the same workflow redeploys so the deadlines page's build-time data stays fresh.

## Deadlines page

`/deadlines/` (`content/deadlines.njk`) lists upcoming PL/FM submission deadlines from data fetched at build time by `_data/deadlines.js` (cached 1 day in `.cache/` via `@11ty/eleventy-fetch`; the deploy workflow caches that dir). Three sources, each optional — a per-source fetch/parse failure renders as a visible note on the page instead of failing the build:

- Curated YAML: [ccfddl/ccf-deadlines](https://github.com/ccfddl/ccf-deadlines) per-conference files (the `CCFDDL` const lists which) and yeah-tiger.github.io's `conferences.yml`, which fills conference editions ccfddl hasn't entered yet. Merged by conference+year, ccfddl first.
- Scraped WikiCFP category pages (`WIKICFP_CATEGORIES`). Journal/book-chapter CFPs (no event dates — mostly predatory) and typo-year deadlines are filtered out; entries the curated list covers are deduped away. `wikicfp.com` is in `.lycheeignore` (HTTP-only, rejects non-browser clients).

Deadline dates are rendered at build; "days left" counts are computed client-side so they stay live between weekly rebuilds. A sparse page in the summer trough is normal — sources fill in as fall CFPs post.

## Hiragana PWA

`hiragana/` is an independent React app with a service worker for offline support. It is not part of the Eleventy build — files are served as-is. Dependencies (React, ReactDOM, htm) are vendored locally in `hiragana/vendor/`.

Tailwind CSS is pre-built (no in-browser JIT). `_config/build-tailwind.js` runs as an `eleventy.after` hook before the SW build, invoking the Tailwind CLI with `_config/tailwind/hiragana.css` as input and emitting `_site/hiragana/styles.css`. Its `@source` directives list every file that carries class names — `hiragana/index.html`, `app.js`, and `views.js`. **Any new file with markup must be added there**, or classes only it uses get purged and the UI ships unstyled.

## Meditation PWA

`meditation/` is a standalone box breathing + guided meditation app with a service worker for offline support. Guided sessions stream from external URLs (UCLA, DoD, VA) and are auto-cached for offline use.

## Service Workers (Workbox)

Repo-specific wiring (technique is in the `workbox-pwa` skill):

- SW sources: `_config/sw/<app>.js` (one per PWA — `hiragana`, `meditation`). Outside the app dirs so Eleventy's passthrough copy doesn't ship them to `_site/`.
- Build script: `_config/build-sw.js`, runs as an `eleventy.after` hook. Uses `esbuild` to bundle each SW source, substituting `self.__WB_MANIFEST` from `workbox-build`'s `getManifest()`. Output lands at `_site/<app>/sw.js`.
- Budgets enforced by `_config/build-sw.js`: **10 MB per-PWA precache, 500 KB per-file.** Build fails if exceeded.
- Both SWs claim clients in an `activate` handler.
- Hiragana **mnemonic PNGs are runtime-cached, not precached** — they render only on a wrong answer, so `build-sw.js` excludes `mnemonics/**` (per-app `extraIgnores`) and the SW registers a `CacheFirst` route for them. `offline.test.js` asserts both: absent from the precache manifest, covered by the runtime route.
- Hiragana's localStorage keys `hiragana-srs` and `hiragana-stats` are stable and unversioned — renaming either without a migration loses user data. The persisted shape is documented in `hiragana/storage.js`.

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
2. **Unit tests** — `hiragana/srs.test.js` (Leitner box logic), `hiragana/numbers.test.js` (1–99 composition + alt generation), `hiragana/storage.test.js` (load/hydrate invariants), `hiragana/words.test.js` (word scan/composition + unlock gate + kana retirement; imports `deck.json` + `words.json` for the real kana deck, so a word referencing an untaught glyph fails here — sokuon `っ`/`ッ`, long-vowel `ー`, and the ん→m Hepburn alt are supported via derivation; also pins deck coverage, so a new deck kana with no covering word fails until a word is authored or the kana is added to the wordless-residue list), `hiragana/match.test.js` (answer grading — case/whitespace/alt/bypass/empty).
3. **Vendor sync** (`hiragana/vendor/check-updates.js`) — verifies vendored files match the versions in `package.json`.
4. **Import scan** (`hiragana/vendor/import-scan.test.js`) — fails if any shipped JS module has an absolute-path import (a class of regression that resolves against the page origin and 404s in production).
5. **Build** (`npm run build`) — runs Eleventy + the Workbox SW generator. The SW build enforces the per-PWA precache budget (10 MB), per-file limit (500 KB), and auto-detects new shipped assets via `getManifest()`.
6. **Offline coverage** (`_config/sw/offline.test.js`) — asserts every precached hiragana URL (audio, data files, shell) is in the manifest, that mnemonics are *out* of the precache but covered by a SW runtime route, and that the meditation SW caches cross-origin audio correctly. Runs after the build.

## Verifying UI changes (drive the app)

No automated layout/e2e test guards the PWAs — rendering changes are verified by driving the built app in a real browser, not asserted in CI. Do this for any change to `views.js`, markup, or CSS. It matters most for the prompt-glyph sizing in `views.js`: the glyph scales to fit by *measuring* its rendered width in a `useLayoutEffect`, so a multi-glyph front (words, compound numbers) that overflows off-screen produces a green `npm test` — only driving it catches that class.

The generic headless-Chrome-over-CDP recipe (`npm run build` → serve `_site/` with `python3 -m http.server` → `--headless=new --remote-debugging-port` → drive via Node `WebSocket`/`fetch`) lives in the `headless-cdp-ui-testing` skill. Repo-specific gotcha: the prompt glyph and the header title both carry `lang="ja"` — select the glyph as `.select-none[lang="ja"]`, or you measure the `かな` header instead.

To surface a **word** card without grinding the SRS by hand, seed storage before load, then reload:
`localStorage['hiragana-srs'] = JSON.stringify({ enabledRows: ['k','n'], cards: { /* every k/n kana id */ [id]: { box: 3, lastDay: <todayKey> } } })`. With the required kana at `box ≥ LEARNED_BOX` (3) and `lastDay` = today, every kana is filtered as done and the always-on word card (added fresh at box 1) is the only thing pending, so it shows immediately. `lastDay` is load-bearing even though covered kana retire from the rotation (`coveredKanaIds` in `words.js`): word cards merge into the map in an effect *after* the first pick, so on a freshly seeded load nothing is retired yet and a bare kana would be served first. Build the kana-id list from `SECTIONS` via a dynamic `import('./model.js')` inside the page.
