// Forward-drift check: every same-origin asset referenced from index.html or
// manifest.json must appear in the corresponding sw.js APP_ASSETS array.
//
// Why this matters: a missing APP_ASSETS entry doesn't break online use, but
// silently breaks the PWA install — the file isn't pre-cached, so going
// offline produces a half-broken app with no visible signal until you try.
//
// Scope: scans both hiragana/ and meditation/. Limited to refs declared in
// HTML attributes (script/link/img/source src+href) and manifest icons —
// dynamically-constructed paths in JS (e.g. `./audio/${romaji}.m4a`) aren't
// detected here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const APPS = ["hiragana", "meditation"];

const ATTR_RE = /<(?:script|link|img|source)\b[^>]*?\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;

function extractHtmlRefs(html) {
  return [...html.matchAll(ATTR_RE)].map((m) => m[1]);
}

function extractManifestIcons(manifestPath) {
  try {
    const data = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return (data.icons || []).map((i) => i.src);
  } catch { return []; }
}

function extractAppAssets(swSrc) {
  const block = swSrc.match(/APP_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!block) return new Set();
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => normalize(m[1])));
}

function normalize(p) {
  // Strip leading ./, query/hash, trailing slash. "./" itself maps to "" (the index doc).
  let n = p.replace(/[?#].*$/, "").replace(/^\.\//, "");
  if (n === "/") n = "";
  return n;
}

function isExternal(ref) {
  return /^[a-z]+:/i.test(ref) || ref.startsWith("//") || ref.startsWith("#");
}

const failures = [];
let totalRefs = 0;

for (const app of APPS) {
  const dir = join(REPO_ROOT, app);
  const html = readFileSync(join(dir, "index.html"), "utf-8");
  const sw = readFileSync(join(dir, "sw.js"), "utf-8");

  const htmlRefs = extractHtmlRefs(html);
  const iconRefs = extractManifestIcons(join(dir, "manifest.json"));
  const refs = [...htmlRefs, ...iconRefs].filter((r) => !isExternal(r));

  const cached = extractAppAssets(sw);

  for (const ref of refs) {
    totalRefs++;
    const n = normalize(ref);
    if (n === "" || n === "index.html") continue; // both map to "./" in APP_ASSETS
    if (!cached.has(n)) failures.push({ app, ref, normalized: n });
  }
}

console.log(`Scanned ${APPS.length} app(s), ${totalRefs} same-origin refs.`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} asset(s) referenced but not in APP_ASSETS:`);
  for (const f of failures) console.error(`  ${f.app}: "${f.ref}"  (expected entry like "./${f.normalized}")`);
  console.error(`\nAdd these paths to the corresponding sw.js APP_ASSETS array so the PWA installs them for offline use.`);
  process.exit(1);
}

console.log("PASS: every HTML/manifest ref is cached.");
