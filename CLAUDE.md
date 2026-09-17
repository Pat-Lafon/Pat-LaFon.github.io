# Pat-LaFon.github.io — personal Eleventy site

Personal site and blog built with **Eleventy v3**, plus standalone hiragana and meditation PWAs that
ride along in the same repo.

## Eleventy v3 conventions

Directory layout comes from the `dir` keys of the `export const config` block at the bottom of
`eleventy.config.js` — not the `setInputDirectory` / `setOutputDirectory` methods, which v3 also
offers. Paths in `dir` resolve relative to `input`, hence the `../`. The dividing line for where a new
file goes: anything addressable at runtime (CSS, images, fonts, app bundles) belongs in `public/`;
anything Eleventy reads but doesn't ship stays outside the input dir.

Three places where the v3 way differs from the v2 way a model is likely to reach for:

- **Drafts** carry `draft: true` front matter and are dropped by the
  `addPreprocessor("drafts", "*", …)` in `eleventy.config.js`, which returns `false` when
  `process.env.ELEVENTY_RUN_MODE === "build"`. They stay visible under `--serve`. Not the older
  conditional-`permalink: false` trick in a directory data file.
- **Bundling needs no plugin** — `eleventyConfig.addBundle("css", { toFileDirectory: "dist" })` is
  core in v3 and adds the paired `{% css %}` shortcode. `@11ty/eleventy-plugin-bundle` was the v2
  package and isn't a dependency here.
- **`_data/eleventyDataSchema.js` validates the data cascade with Zod**, throwing with
  `data.page.inputPath` in the message. Eleventy auto-invokes function exports in data files, so it
  exports a thunk returning the validator (`export default () => validate`).

**Tag archives** come from one pagination template, `content/tag-pages.njk`, which sets
`eleventyExcludeFromCollections` and paginates `collections` at `size: 1` with
`filter: ["all", "posts"]` to skip the built-ins. Never per-tag pages.

**Navigation** comes from `@11ty/eleventy-navigation` reading page front matter — never a
hand-maintained nav array in a data file.

Styling is hand-written CSS in `public/css/` with custom properties for `prefers-color-scheme` and no
build step. The Tailwind pipeline exists only for the embedded PWAs; the site proper stays no-build.

## Build and deployment

`npm run build-ghpages` builds with `--pathprefix=/`. This is a *user* site, so the prefix is bare; a
project site (`<user>.github.io/<repo>/`) needs the repo name instead, and getting it wrong 404s every
internal link on an otherwise green build. A weekly Monday cron redeploys so the deadlines page's
build-time data stays fresh.

Lychee link-checks every push to `main`. It doesn't parse JS, so the meditation audio URLs hardcoded in
`meditation/app.js` are grepped into a plaintext file in CI for it to scan; a host that can't be
checked goes in `.lycheeignore`.

`npm test` includes an import scan — an absolute-path import in shipped JS resolves against the page
origin and 404s only in production.

## Deadlines page

`/deadlines/` lists PL/FM submission deadlines fetched at build time by `_data/deadlines.js` (cached a
day in `.cache/` via `@11ty/eleventy-fetch`). Every source is optional — a per-source fetch or parse
failure renders as a visible note on the page rather than failing the build. Dates render at build
time while "days left" is computed client-side, so it stays live between weekly rebuilds. A sparse
page in the summer trough is normal, not a broken fetch.

## The embedded PWAs

`hiragana/` and `meditation/` are independent apps served as-is — **not part of the Eleventy build**.
Hiragana vendors React, ReactDOM, and htm in `hiragana/vendor/` rather than loading from a CDN, with
versions tracked in `package.json` devDependencies so Dependabot can bump them; `node
hiragana/vendor/update.js` re-downloads at the new version, and CI fails until it has been run.

Tailwind is pre-built rather than in-browser JIT: `_config/build-tailwind.js` runs as an
`eleventy.after` hook, and its `@source` directives list every file carrying class names. **Any new
file with markup must be added there**, or classes only it uses get purged and the UI ships unstyled.

Service worker sources live at `_config/sw/<app>.js`. `_config/build-sw.js` holds the precache size
limits — read them before adding bulk. Hiragana's mnemonic PNGs are runtime-cached rather than
precached — they render only on a wrong answer — and `_config/sw/offline.test.js` asserts both halves
of that.

Hiragana's localStorage keys `hiragana-srs` and `hiragana-stats` are stable and unversioned. The
persisted shape is in `hiragana/storage.js`.

## Verifying UI changes

No automated layout or e2e test guards the PWAs, and the prompt glyph's fit-to-width measurement means
an overflowing multi-glyph front still produces a green `npm test`. Drive the built app in a browser
for any change to `views.js`, markup, or CSS — `docs/driving-the-pwas.md` has the recipe and the
storage-seeding trick for reaching a word card.
