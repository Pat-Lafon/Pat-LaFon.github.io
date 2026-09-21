# Pat-LaFon.github.io — personal Eleventy site

Personal site and blog on **Eleventy v3**, plus standalone hiragana and meditation PWAs in the same
repo.

## Eleventy v3

- **Directory layout is the `dir` block in `eleventy.config.js`**, paths relative to `input` (hence the
  `../`). Anything addressable at runtime (CSS, images, fonts, app bundles) goes in `public/`; anything
  Eleventy reads but doesn't ship stays outside the input dir.
- **Drafts carry `draft: true`** and are dropped by the `addPreprocessor("drafts", …)` when
  `ELEVENTY_RUN_MODE === "build"`; they stay visible under `--serve`.
- **Bundling is core** — `addBundle("css", …)` provides the `{% css %}` shortcode; the v2 bundle
  plugin isn't a dependency.
- **`_data/eleventyDataSchema.js` validates the data cascade with Zod**, throwing with the page's
  `inputPath`. It exports a thunk because Eleventy auto-invokes function exports in data files.
- **Tag archives come from `content/tag-pages.njk`** paginating `collections` at `size: 1`; never
  per-tag pages.
- **Navigation comes from `@11ty/eleventy-navigation` front matter**, never a hand-maintained array.
- **Site CSS is hand-written in `public/css/` with no build step.** Tailwind exists only for the PWAs.

## Build and deployment

- **`npm run build-ghpages` uses `--pathprefix=/`** because this is a user site; a project site needs
  the repo name, and the wrong prefix 404s every internal link on a green build.
- **A Monday cron redeploys** so the deadlines page's build-time data stays fresh.
- **Lychee runs in its own workflow**, so a red link check never blocks a deploy. It doesn't parse JS:
  `link-check.yml` greps audio URLs out of `meditation/app.js` for it, and a URL added to other shipped
  JS needs that grep extended. Hosts it can't check go in `.lycheeignore`.
- **`npm test` scans imports** — an absolute-path import in shipped JS 404s only in production.

## Deadlines page

- **`_data/deadlines.js` fetches PL/FM deadlines at build time.** eleventy-fetch's day-long `.cache/`
  keeps local rebuilds and `--serve` off the upstreams; CI re-fetches every run.
- **A per-source fetch or parse failure renders as a note on the page**, not a failed build.
- **"Days left" is computed client-side** so it doesn't go stale between weekly rebuilds.
- **A sparse page in the summer trough is normal.**

## The embedded PWAs

`hiragana/` and `meditation/` are served as-is, outside the Eleventy build.

- **Hiragana vendors React, ReactDOM, and htm in `hiragana/vendor/`**, versions tracked in
  `package.json` devDependencies for Dependabot; after a bump run `node hiragana/vendor/update.js`, or
  CI fails.
- **Tailwind is pre-built by `_config/build-tailwind.js`** as an `eleventy.after` hook. Add any new
  file with markup to its `@source` list, or its classes get purged.
- **Service worker sources live at `_config/sw/<app>.js`**; `_config/build-sw.js` holds the precache
  size limits. Hiragana's mnemonic PNGs are runtime-cached, not precached, and
  `_config/sw/offline.test.js` asserts both halves.
- **localStorage keys `hiragana-srs` and `hiragana-stats` are stable and unversioned**; the shape is
  in `hiragana/storage.js`.
- **Drive the built app in a browser for any change to `views.js`, markup, or CSS** — no layout test
  exists, and an overflowing multi-glyph prompt still passes `npm test`. `docs/driving-the-pwas.md`
  has the recipe.
