# Pat-LaFon.github.io — personal Eleventy site

Personal site and blog on **Eleventy v3**, plus standalone hiragana and meditation PWAs.

## Eleventy v3

- **Directory layout is the `dir` block in `eleventy.config.js`**, paths relative to `input` (hence the
  `../`). Anything addressable at runtime goes in `public/`; anything Eleventy reads but doesn't ship
  stays outside the input dir.
- **Drafts carry `draft: true`**; the `drafts` preprocessor drops them when
  `ELEVENTY_RUN_MODE === "build"`, so they stay visible under `--serve`.
- **`{% css %}` and `{% js %}` come from core `addBundle`**; the v2 bundle plugin isn't a dependency.
- **`_data/eleventyDataSchema.js` validates the data cascade with Zod**, throwing with the page's
  `inputPath`. It exports a thunk because Eleventy auto-invokes function exports in data files.
- **Tag archives come from `content/tag-pages.njk`** paginating `collections` at `size: 1`; never
  per-tag pages.
- **Navigation comes from `@11ty/eleventy-navigation` front matter**, never a hand-maintained array.
- **Site CSS is hand-written in `public/css/` with no build step.** Tailwind exists only for the PWAs.

## Build and deployment

- **`npm run build-ghpages` uses `--pathprefix=/`** because this is a user site; the wrong prefix 404s
  every internal link on a green build.
- **A Monday cron redeploys** to refresh the build-time data behind the deadlines, concerts, and feeds.
- **Lychee runs in its own workflow**, so a red link check never blocks a deploy. It doesn't parse JS,
  so `link-check.yml` greps audio URLs out of `meditation/app.js`; extend that grep for a URL added to
  other shipped JS. Unchecked hosts go in `.lycheeignore`. It skips `_site/feed/`, whose generated
  feeds link thousands of third-party posts.
- **`npm test` scans imports** — an absolute-path import in shipped JS 404s only in production.
- **A fetch or parse failure on the deadlines or concerts page renders as a note on the page**, not a
  failed build.

## Deadlines page

- **`_data/deadlines.js` fetches PL/FM deadlines and event dates from pl-conferences.com's
  `events.json`.** eleventy-fetch's day-long `.cache/` keeps local rebuilds off the upstream; CI
  re-fetches every run.
- **`VENUES` is the whole approved list of feed abbreviations** — a venue the feed adds can't reach
  the page until it has an entry, and an entry the feed has never heard of renders as a note.
- **Add an event the feed lacks (e.g. an attend-only industry conference) to `EXTRA_EVENTS`**, in the
  feed's shape.
- **"Days left" is computed client-side** so it doesn't go stale between weekly rebuilds.
- **A sparse page in the summer trough is normal.**

## Concerts page

- **`_data/concerts.js` fetches Ticketmaster shows for `ARTISTS` and `VENUES` by id**, never by keyword.
  A venue's shows list under their headliner; `MUTED` drops one by name, since an act's id differs per
  ticketing system.
- **The key comes from `TICKETMASTER_KEY` (a repo secret in CI) or `~/.config/ticketmaster-key`.**
- **Shows are kept only in `NEAR_REGIONS`**; changing focus is that one set plus the page description.
- **Every show comes from an external source**; an artist no source lists can't be followed.
- **`node _data/concerts.js` prints what the page would list.**

## Generated feeds

- **`_data/claudeTutorials.js` builds `/feed/claude-tutorials.xml`** by scraping academy.claude.com,
  which publishes no feed and no dates; readers mark unread by `guid`.
- **`_data/wordpressArchives.js` builds a full-archive `/feed/<slug>.xml` per entry in `SITES`**
  from each blog's WordPress REST API, for blogs whose own feed carries only the latest posts.
- **Any fetch or parse failure fails the build** — a reader drops items that vanish from a feed, so a
  short feed is worse than a stale one.

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
