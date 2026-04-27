#!/usr/bin/env node
// Downloads vendored dependencies using versions from package.json.
// To update: change versions in package.json (or let Dependabot do it),
// then run `node hiragana/vendor/update.js` and commit.

import { writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));

// Map npm package names to vendor filenames and esm.sh URL patterns
const DEPS = [
  { pkg: "react",     file: "react.js",     url: (v) => `https://esm.sh/react@${v}?bundle` },
  { pkg: "react-dom", file: "react-dom.js",  url: (v) => `https://esm.sh/react-dom@${v}/client?bundle` },
  { pkg: "htm",       file: "htm.js",        url: (v) => `https://esm.sh/htm@${v}?bundle` },
];

const ESM_SH = "https://esm.sh";

// Follow esm.sh redirects: the initial response is a stub that re-exports
// from a versioned path. We need to fetch that actual bundle.
async function fetchBundle(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = await resp.text();
  const match = text.match(/from\s+"(\/[^"]+\.mjs)"/);
  if (match) {
    const actualResp = await fetch(ESM_SH + match[1]);
    if (!actualResp.ok) throw new Error(`HTTP ${actualResp.status} for ${ESM_SH + match[1]}`);
    return actualResp.text();
  }
  return text;
}

// --- Download each dep ---
let failed = false;
const manifest = {};

for (const dep of DEPS) {
  const version = pkg.devDependencies[dep.pkg];
  if (!version) { console.error(`FAIL: ${dep.pkg} not found in package.json devDependencies`); process.exit(1); }

  const url = dep.url(version);
  process.stdout.write(`Downloading ${dep.file} (${dep.pkg}@${version})... `);
  try {
    const code = await fetchBundle(url);
    const outPath = join(__dirname, dep.file);
    writeFileSync(outPath, `// Vendored from ${url}\n// Version: ${version}\n${code}`);
    const kb = (Buffer.byteLength(code) / 1024).toFixed(1);
    console.log(`${kb} KB`);
    manifest[dep.file] = version;
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    failed = true;
  }
}

writeFileSync(join(__dirname, "versions.json"), JSON.stringify(manifest, null, 2) + "\n");

if (failed) {
  console.error("\nSome downloads failed. Check URLs and try again.");
  process.exit(1);
} else {
  console.log("\nAll dependencies vendored. Don't forget to commit the files.");
}
