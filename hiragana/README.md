# Hiragana Practice — PWA

A spaced repetition flashcard app for learning hiragana. No build step, no dependencies to install — just static files you drop into a folder.

## What's in here

```
hiragana/
├── index.html              ← main page
├── app.js                  ← React app (uses ES module imports from CDN)
├── manifest.json           ← PWA manifest (for "Add to Home Screen")
├── sw.js                   ← service worker (offline support)
├── icon-192.png            ← app icon (small)
├── icon-512.png            ← app icon (large)
└── icon-maskable-512.png   ← app icon (Android adaptive)
```

Everything is static. No `npm install`, no build, no Node.js required.

## Deploying to your existing GitHub Pages site

1. Drop this entire `hiragana/` folder into your existing GitHub Pages repo, alongside whatever else you have there.
2. Commit and push.
3. After GitHub Pages rebuilds (usually under a minute), visit `https://yourusername.github.io/your-site/hiragana/`.

That's it. The app uses **relative paths** for everything, so it works in any subfolder without any config changes.

## Installing it as an app on your phone

Once the page is live:

**iPhone (Safari):**
1. Open the page in Safari (must be Safari, not Chrome)
2. Tap the Share button (square with arrow pointing up)
3. Scroll down and tap "Add to Home Screen"
4. Confirm

**Android (Chrome):**
1. Open the page in Chrome
2. Tap the three-dot menu
3. Tap "Install app" or "Add to Home Screen"

After installing, the app launches fullscreen with no browser UI — looks and feels like a real app. Your progress is saved per-device using the browser's localStorage and persists indefinitely.

## How it works

- **No build step:** uses native ES modules + `htm` (a JSX alternative) loaded from a CDN, so the JavaScript runs directly in the browser.
- **Storage:** uses `localStorage` — same browser/device = same progress. Different device = separate progress (no cloud sync).
- **Offline:** the service worker caches everything on first visit, so it works without internet after that.
- **Audio:** uses the browser's built-in speech synthesis. Most phones have a Japanese voice installed by default.

## Editing it

To add more characters, change the SRS algorithm, or tweak the design, just edit `app.js`. Refresh the page in your browser to see changes — no rebuild needed.

The cached service worker can sometimes serve stale code while you're editing. To force fresh code: open browser DevTools → Application → Service Workers → "Unregister", then reload.

## Updating

When you push changes to your repo, the new version is live as soon as GitHub Pages rebuilds. Existing users will get the update on their next visit (the service worker fetches new files in the background and serves them on the visit after that).

If you make breaking changes, bump the cache name in `sw.js` (e.g. `hiragana-v1` → `hiragana-v2`) to force everyone to clear their cache.
