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

Tailwind CSS is pre-built (no in-browser JIT). `_config/build-tailwind.js` runs as an `eleventy.after` hook before the SW build, invoking the Tailwind CLI with `_config/tailwind/hiragana.css` as input and emitting `_site/hiragana/styles.css`. Its `@source` directives list every file that carries class names — `hiragana/index.html`, `app.js`, and `views.js`. **Any new file with markup must be added there**, or classes only it uses get purged and the UI ships unstyled.

### Module layout

`app.js` is just the `App` state machine + render. The rest is split out: `model.js` (card catalog — deck/numbers/word cards, `SECTIONS`, `ROWS_BY_ID`, persistence glue), `views.js` (all presentational components), `audio.js` (`useAudio` hook — recorded audio + TTS fallback), `html.js` (shared `htm` bind), `match.js` (`checkAnswer`), plus the pure `srs.js`/`numbers.js`/`words.js`/`romaji.js`/`storage.js`.

### Deck & word data

The kana deck (`hiragana/deck.json`) and word list (`hiragana/words.json`) are data files, imported by `model.js` via `with { type: "json" }` and by the Node tests directly — so there's one source of truth and no regex-scraping of source. `model.js` maps each deck entry `[kana, romaji, alts?]` through `ENTRY_BY_KIND[section.kind]` (`hiragana`/`katakana`/`foreign`) to attach the derived `audioKey`/`hasMnemonic`. Numbers stay generated in code (`numbers.js`, no static table). Both JSON files must be in the SW precache (they are — the glob covers `json`, and `offline.test.js` asserts it), or a cold-offline launch 404s.

Words (`words.js`) derive romaji/alts/`requiredChars` from the deck by scanning the kana into cards (alts via `combineRomaji` in `romaji.js`, shared with numbers); a word is just `{ kana, gloss }`, optionally with a `{ romaji, alts }` override for spellings derivation can't reach. Sokuon (っ/ッ) and long-vowel (ー) are handled inline — they aren't cards and aren't `requiredChars`. Moraic ん before a b/p/m sound also grows a Hepburn `m` alt (しんぶん accepts `shimbun`) with `n` staying canonical. A hiragana word gates on hiragana rows, a katakana word on katakana rows.

Answer grading is `checkAnswer` in `match.js` (pure, unit-tested): normalize (lowercase + strip whitespace), reject prompt-echo as a bypass, match against `answer` or any `alt` (alts lowercased at match time).

## Meditation PWA

`meditation/` is a standalone box breathing + guided meditation app with a service worker for offline support. Guided sessions stream from external URLs (UCLA, DoD, VA) and are auto-cached for offline use.

## Service Workers (Workbox)

Repo-specific wiring (technique is in the `workbox-pwa` skill):

- SW sources: `_config/sw/<app>.js` (one per PWA — `hiragana`, `meditation`). Outside the app dirs so Eleventy's passthrough copy doesn't ship them to `_site/`.
- Build script: `_config/build-sw.js`, runs as an `eleventy.after` hook. Uses `esbuild` to bundle each SW source, substituting `self.__WB_MANIFEST` from `workbox-build`'s `getManifest()`. Output lands at `_site/<app>/sw.js`.
- Budgets enforced by `_config/build-sw.js`: **10 MB per-PWA precache, 500 KB per-file.** Build fails if exceeded.
- Both SWs claim clients in an `activate` handler (top-level `self.clients.claim()` throws `InvalidStateError` — it only resolves once activating).
- Hiragana **mnemonic PNGs are runtime-cached, not precached** — they render only on a wrong answer, so `build-sw.js` excludes `mnemonics/**` (per-app `extraIgnores`) and the SW registers a `CacheFirst` route for them. `offline.test.js` asserts both: absent from the precache manifest, covered by the runtime route.
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
2. **Unit tests** — `hiragana/srs.test.js` (Leitner box logic), `hiragana/numbers.test.js` (1–99 composition + alt generation), `hiragana/storage.test.js` (load/hydrate invariants), `hiragana/words.test.js` (word scan/composition + unlock gate; imports `deck.json` + `words.json` for the real kana deck, so a word referencing an untaught glyph fails here — sokuon `っ`/`ッ`, long-vowel `ー`, and the ん→m Hepburn alt are supported via derivation), `hiragana/match.test.js` (answer grading — case/whitespace/alt/bypass/empty).
3. **Vendor sync** (`hiragana/vendor/check-updates.js`) — verifies vendored files match the versions in `package.json`.
4. **Import scan** (`hiragana/vendor/import-scan.test.js`) — fails if any shipped JS module has an absolute-path import (a class of regression that resolves against the page origin and 404s in production).
5. **Build** (`npm run build`) — runs Eleventy + the Workbox SW generator. The SW build enforces the per-PWA precache budget (10 MB), per-file limit (500 KB), and auto-detects new shipped assets via `getManifest()`.
6. **Offline coverage** (`_config/sw/offline.test.js`) — asserts every precached hiragana URL (audio, data files, shell) is in the manifest, that mnemonics are *out* of the precache but covered by a SW runtime route, and that the meditation SW caches cross-origin audio correctly. Runs after the build.

## Verifying UI changes (drive the app)

No automated layout/e2e test guards the PWAs — by decision, rendering changes are verified by driving the built app in a real browser, not asserted in CI. Do this for any change to `views.js`, markup, or CSS. It matters most for the prompt-glyph sizing in `views.js`: the glyph scales to fit by *measuring* its rendered width in a `useLayoutEffect`, so a multi-glyph front (words, compound numbers) that overflows off-screen produces a green `npm test` — only driving it catches that class.

Recipe, no new deps: `npm run build`, serve `_site/` (`python3 -m http.server`), launch the system Chrome headless (`--headless=new --remote-debugging-port=<port>`), and drive it over CDP from a Node script (Node's built-in `WebSocket`/`fetch` suffice). Gotchas that cost time:

- `Runtime.evaluate`'s value nests at `msg.result.result.value` — one level deeper than `Target`/`Page` results.
- After `Page.navigate`, wait ~1s (or poll for the glyph) before measuring; the ES modules load async and the first navigate after attach is the slowest.
- The prompt glyph and the header title both carry `lang="ja"` — select the glyph as `.select-none[lang="ja"]`, or you measure the `かな` header instead.

To surface a **word** card without grinding the SRS by hand, seed storage before load, then reload:
`localStorage['hiragana-srs'] = JSON.stringify({ enabledRows: ['k','n'], cards: { /* every k/n kana id */ [id]: { box: 3, lastDay: <todayKey> } } })`. With the required kana at `box ≥ LEARNED_BOX` (3) and `lastDay` = today, every kana is filtered as done and the always-on word card (added fresh at box 1) is the only thing pending, so it shows immediately. Build the kana-id list from `SECTIONS` via a dynamic `import('./model.js')` inside the page.
