# Driving the PWAs by hand

No automated layout or e2e test guards the PWAs — rendering changes are verified by driving the built
app in a real browser. Do this for any change to `views.js`, markup, or CSS. It matters most for the
prompt-glyph sizing in `views.js`: the glyph scales to fit by *measuring* its rendered width in a
`useLayoutEffect`, so a multi-glyph front (words, compound numbers) that overflows off-screen still
produces a green `npm test`.

The headless-Chrome-over-CDP recipe is the generic one — `npm run build`, serve `_site/` with
`python3 -m http.server`, launch with `--headless=new --remote-debugging-port`, drive it over a Node
`WebSocket`/`fetch`. Repo-specific: the prompt glyph and the header title both carry `lang="ja"`, so
select the glyph as `.select-none[lang="ja"]` or you measure the `かな` header instead.

## Surfacing a word card without grinding the SRS

Seed storage before load, then reload:

```js
localStorage['hiragana-srs'] = JSON.stringify({
  enabledRows: ['k', 'n'],
  cards: { /* every k/n kana id */ [id]: { box: 3, lastDay: <todayKey> } },
})
```

With the required kana at `box >= LEARNED_BOX` (3) and `lastDay` = today, every kana filters as done
and the always-on word card (added fresh at box 1) is the only thing pending, so it shows immediately.
`lastDay` is load-bearing even though covered kana retire from the rotation (`coveredKanaIds` in
`words.js`): word cards merge into the map in an effect *after* the first pick, so on a freshly seeded
load nothing is retired yet and a bare kana would be served first. Build the kana-id list from
`SECTIONS` via a dynamic `import('./model.js')` inside the page.
