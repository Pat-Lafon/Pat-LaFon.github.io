// Canonical list of vendored ESM dependencies for the hiragana PWA.
// Single source of truth for both update.js (downloader) and check-updates.js
// (CI sync check) — keep them aligned or they drift and CI passes vacuously.

export const DEPS = [
  { pkg: "react",     file: "react.js",     url: (v) => `https://esm.sh/react@${v}?bundle` },
  { pkg: "react-dom", file: "react-dom.js", url: (v) => `https://esm.sh/react-dom@${v}/client?bundle` },
  { pkg: "scheduler", file: "scheduler.js", url: (v) => `https://esm.sh/scheduler@${v}?bundle` },
  { pkg: "htm",       file: "htm.js",       url: (v) => `https://esm.sh/htm@${v}?bundle` },
];
