// Cache API budget test — run with `node hiragana/cache-budget.test.js`
// Sums all files listed in sw.js APP_ASSETS and asserts total is under budget.
// Catches regressions like adding large unoptimized images.

import { readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const swSource = readFileSync(join(__dirname, "sw.js"), "utf-8");

// Budget: 10MB — generous for a PWA, but catches accidental bloat
const MAX_CACHE_BYTES = 10 * 1024 * 1024;

// Extract APP_ASSETS paths from sw.js
const assetsMatch = swSource.match(/APP_ASSETS\s*=\s*\[([\s\S]*?)\];/);
if (!assetsMatch) { console.error("FAIL: Could not find APP_ASSETS in sw.js"); process.exit(1); }

const paths = [...assetsMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);

if (paths.length === 0) { console.error("FAIL: APP_ASSETS is empty"); process.exit(1); }

// Sum file sizes
let totalBytes = 0;
let missing = 0;
const entries = [];

for (const rel of paths) {
  // Skip directory entries like "./"
  if (rel === "./") continue;
  const abs = join(__dirname, rel.replace("./", ""));
  try {
    const size = statSync(abs).size;
    totalBytes += size;
    entries.push({ path: rel, size });
  } catch {
    console.warn(`  MISSING: ${rel}`);
    missing++;
  }
}

// Sort by size descending for the report
entries.sort((a, b) => b.size - a.size);

// Report
console.log(`Files in APP_ASSETS: ${paths.length}`);
console.log(`\nLargest files:`);
for (const e of entries.slice(0, 5)) {
  console.log(`  ${(e.size / 1024).toFixed(1).padStart(8)} KB  ${e.path}`);
}
if (entries.length > 5) console.log(`  ... and ${entries.length - 5} more`);
console.log(`\nTotal cache size:    ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
console.log(`Budget:              ${(MAX_CACHE_BYTES / (1024 * 1024)).toFixed(0)} MB`);
console.log(`Headroom:            ${((1 - totalBytes / MAX_CACHE_BYTES) * 100).toFixed(0)}%`);
if (missing > 0) console.warn(`Missing files:       ${missing}`);

if (missing > 0) {
  console.error(`\nFAIL: ${missing} file(s) listed in APP_ASSETS do not exist on disk.`);
  process.exit(1);
} else if (totalBytes > MAX_CACHE_BYTES) {
  console.error(`\nFAIL: Cache size (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) exceeds budget (${(MAX_CACHE_BYTES / (1024 * 1024)).toFixed(0)} MB)`);
  process.exit(1);
} else {
  console.log(`\nPASS: Well within budget.`);
}
