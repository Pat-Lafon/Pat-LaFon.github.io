// Static specifier audit for every JS file we ship to the browser.
//
// Three classes of regression this catches:
//
//   1. Absolute-path imports (e.g. `from "/react@19.2.5/..."`). These resolve
//      against the page origin and 404 in production. esm.sh's bundler
//      occasionally leaves them in for peer dependencies; the vendor
//      downloader rewrites them, but a miss would otherwise be invisible
//      until a user reported a blank page.
//
//   2. Bare specifiers (e.g. `from "scheduler"`) that aren't declared in the
//      app's importmap. The browser throws a TypeError at load. This bit us
//      when React 19 split `scheduler` into its own peer.
//
//   3. (Implicit) any new app that ships ESM without an importmap — every
//      bare specifier in such an app fails with a clear message.
//
// Service worker sources in _config/sw/*.js are esbuild-bundled, so their
// bare specifiers (workbox-*) are resolved at build time. Only the
// absolute-path check applies to them.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// Apps shipped as static files to the browser. `includeVendor` covers apps
// that vendor ESM deps under `<app>/vendor/`.
const APPS = [
  { name: "hiragana",   dir: "hiragana",   includeVendor: true  },
  { name: "meditation", dir: "meditation", includeVendor: false },
];

// SW sources are bundled by esbuild before shipping — bare specifiers there
// are resolved at build time, not by the browser.
const SW_SOURCES = [
  "_config/sw/hiragana.js",
  "_config/sw/meditation.js",
];

// Vendor dir helpers — these are Node-only and never shipped.
const VENDOR_NODE_ONLY = new Set([
  "update.js",
  "check-updates.js",
  "import-scan.test.js",
]);

// Match `from "X"`, side-effect `import "X"`, and `import("X")`. The leading
// `(?:^|[^.\w$])` prevents matching `foo.import("x")` and member accesses.
const SPEC_RE = [
  /(?:^|[^.\w$])from\s+["']([^"']+)["']/g,
  /(?:^|[^.\w$])import\s+["']([^"']+)["']/g,
  /(?:^|[^.\w$])import\(\s*["']([^"']+)["']\s*\)/g,
];

function extractSpecs(src) {
  const out = [];
  for (const re of SPEC_RE) {
    for (const m of src.matchAll(re)) {
      const idx = m.index + m[0].indexOf(m[1]);
      const line = src.slice(0, idx).split("\n").length;
      out.push({ spec: m[1], line });
    }
  }
  return out;
}

function classify(spec) {
  if (spec.startsWith("./") || spec.startsWith("../")) return "relative";
  if (spec.startsWith("/")) return "absolute";
  if (/^https?:\/\//.test(spec)) return "url";
  return "bare";
}

function readImportmap(htmlPath) {
  if (!existsSync(htmlPath)) return null;
  const html = readFileSync(htmlPath, "utf-8");
  const m = html.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  return JSON.parse(m[1]).imports ?? {};
}

function rel(p) {
  return relative(REPO_ROOT, p);
}

const failures = [];
let fileCount = 0;

for (const app of APPS) {
  const htmlPath = join(REPO_ROOT, app.dir, "index.html");
  const importmap = readImportmap(htmlPath);

  const files = [];
  const appJs = join(REPO_ROOT, app.dir, "app.js");
  if (existsSync(appJs)) files.push(appJs);
  if (app.includeVendor) {
    const vdir = join(REPO_ROOT, app.dir, "vendor");
    if (existsSync(vdir)) {
      for (const f of readdirSync(vdir)) {
        if (f.endsWith(".js") && !VENDOR_NODE_ONLY.has(f)) {
          files.push(join(vdir, f));
        }
      }
    }
  }

  for (const file of files) {
    fileCount++;
    const src = readFileSync(file, "utf-8");
    for (const { spec, line } of extractSpecs(src)) {
      const kind = classify(spec);
      if (kind === "absolute") {
        failures.push({
          file, line, spec,
          why: `absolute path resolves against page origin (e.g. https://pat-lafon.github.io${spec}) and 404s in production`,
        });
      } else if (kind === "bare") {
        if (importmap === null) {
          failures.push({
            file, line, spec,
            why: `bare specifier but ${rel(htmlPath)} declares no importmap`,
          });
        } else if (!(spec in importmap)) {
          const mapped = Object.keys(importmap).join(", ") || "<empty>";
          failures.push({
            file, line, spec,
            why: `bare specifier not in importmap at ${rel(htmlPath)} (currently maps: ${mapped})`,
          });
        }
      }
    }
  }
}

// SW sources: absolute-path check only.
for (const sw of SW_SOURCES) {
  const p = join(REPO_ROOT, sw);
  if (!existsSync(p)) continue;
  fileCount++;
  const src = readFileSync(p, "utf-8");
  for (const { spec, line } of extractSpecs(src)) {
    if (classify(spec) === "absolute") {
      failures.push({
        file: p, line, spec,
        why: `absolute path in SW source — would 404 after esbuild bundling`,
      });
    }
  }
}

console.log(`Scanned ${fileCount} file(s) across ${APPS.length} app(s) + ${SW_SOURCES.length} SW source(s).`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} unresolvable specifier(s):\n`);
  for (const f of failures) {
    console.error(`  ${rel(f.file)}:${f.line}`);
    console.error(`    "${f.spec}" — ${f.why}\n`);
  }
  console.error(`Fix: add the specifier to the importmap (vendoring the dep if needed),`);
  console.error(`or rewrite it to a relative/URL form. See hiragana/vendor/update.js for`);
  console.error(`the vendoring pattern.`);
  process.exit(1);
}

console.log("PASS: all imports resolve.");
