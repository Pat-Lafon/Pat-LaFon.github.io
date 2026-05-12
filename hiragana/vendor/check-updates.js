#!/usr/bin/env node
// Checks if vendored files match the versions in package.json,
// and if package.json versions match what's actually vendored.
// Exits with code 1 if out of sync.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DEPS } from "./deps.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));

let versions;
try {
  versions = JSON.parse(readFileSync(join(__dirname, "versions.json"), "utf-8"));
} catch {
  console.error("FAIL: versions.json not found. Run `node hiragana/vendor/update.js` first.");
  process.exit(1);
}

let outOfSync = 0;

for (const { file, pkg: npmPkg } of DEPS) {
  const pkgVersion = pkg.devDependencies[npmPkg];
  const vendoredVersion = versions[file];

  if (!pkgVersion) {
    console.error(`FAIL: ${npmPkg} not in package.json devDependencies`);
    outOfSync++;
    continue;
  }

  if (pkgVersion !== vendoredVersion) {
    console.log(`OUT OF SYNC: ${npmPkg} — package.json has ${pkgVersion}, vendored is ${vendoredVersion}`);
    outOfSync++;
  } else {
    console.log(`${npmPkg}@${pkgVersion} — in sync`);
  }
}

if (outOfSync > 0) {
  console.log(`\n${outOfSync} package(s) out of sync. Run \`node hiragana/vendor/update.js\` to re-vendor.`);
  process.exit(1);
} else {
  console.log(`\nAll vendored packages match package.json.`);
}
