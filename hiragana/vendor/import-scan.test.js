// Static check: no shipped JS module has an absolute-path import.
// Run with `node hiragana/vendor/import-scan.test.js`.
//
// Why this matters: imports like `from "/react@18.3.1/..."` resolve against
// the page's origin (e.g. https://pat-lafon.github.io/...), 404 in production,
// silently break the app. esm.sh's bundler occasionally leaves these in for
// peer dependencies; the vendor downloader rewrites them, but a regression
// would otherwise be invisible until a user reported a blank page.
//
// Scope: every JS file we ship to the browser (app code, service workers,
// vendored bundles), across both PWAs.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// Vendored bundles live in hiragana/vendor; update.js / check-updates.js are
// Node-only build helpers, not shipped, so they're excluded.
const VENDOR_DIR = join(REPO_ROOT, "hiragana", "vendor");
const VENDOR_NODE_ONLY = new Set(["update.js", "check-updates.js", "import-scan.test.js"]);
const vendorFiles = readdirSync(VENDOR_DIR)
  .filter((f) => f.endsWith(".js") && !VENDOR_NODE_ONLY.has(f))
  .map((f) => join(VENDOR_DIR, f));

const SHIPPED = [
  join(REPO_ROOT, "hiragana", "app.js"),
  join(REPO_ROOT, "_config", "sw", "hiragana.js"),
  join(REPO_ROOT, "meditation", "app.js"),
  join(REPO_ROOT, "_config", "sw", "meditation.js"),
  ...vendorFiles,
];

const PATTERNS = [
  { name: "static from", re: /from\s+["'](\/[^"'\n]+)["']/g },
  { name: "side-effect import", re: /import\s+["'](\/[^"'\n]+)["']/g },
  { name: "dynamic import", re: /import\(\s*["'](\/[^"'\n]+)["']/g },
];

const failures = [];
for (const file of SHIPPED) {
  const src = readFileSync(file, "utf-8");
  for (const { name, re } of PATTERNS) {
    for (const match of src.matchAll(re)) {
      failures.push({ file: relative(REPO_ROOT, file), kind: name, path: match[1] });
    }
  }
}

console.log(`Scanned ${SHIPPED.length} shipped JS file(s) for absolute-path imports.`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} absolute-path import(s) found:`);
  for (const f of failures) {
    console.error(`  ${f.file}  [${f.kind}]  "${f.path}"`);
  }
  console.error(`\nAbsolute paths resolve against the page origin (e.g. https://pat-lafon.github.io${failures[0].path})`);
  console.error(`and 404 in production. Use a bare specifier resolved via importmap, or a relative path.`);
  process.exit(1);
}

console.log("PASS: no absolute-path imports.");
