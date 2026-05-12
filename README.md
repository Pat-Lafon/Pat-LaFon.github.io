# pat-lafon.github.io

Source for [pat-lafon.github.io](https://pat-lafon.github.io/) — Patrick LaFontaine's personal site and blog, plus two standalone PWAs (hiragana flashcards and a box-breathing/meditation app).

## Stack

- **Eleventy v3** static site generator (Node 20, see `.nvmrc`)
- **GitHub Pages** deploy via `.github/workflows/gh-pages.yml` on push to `main`
- **Workbox** service workers for the two PWAs, built at the end of the Eleventy run

## Commands

```sh
npm run start        # dev server with live reload
npm run build        # production build → _site/
npm test             # lint + storage budget + vendor sync + import scan + build
```

## Layout

- `content/` — pages, blog posts, feed, sitemap
- `_includes/` — Nunjucks layouts and partials
- `_data/` — site metadata and Zod schema for front-matter validation
- `_config/` — Nunjucks filters and the Workbox SW build hook
- `public/` — static assets passthrough-copied to `_site/`
- `hiragana/` — standalone React PWA (vendored deps in `hiragana/vendor/`)
- `meditation/` — standalone box-breathing/guided-meditation PWA

See `CLAUDE.md` for architecture details, PWA service-worker build, and CI test breakdown.
