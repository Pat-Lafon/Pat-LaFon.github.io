// Build the hiragana app's Tailwind CSS bundle. Invoked from eleventy.config.js
// before the SW build so the generated styles.css is picked up by the precache
// manifest.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const APPS = [
  {
    id: "hiragana",
    input: "_config/tailwind/hiragana.css",
    output: "_site/hiragana/styles.css",
  },
];

export async function buildTailwind() {
  for (const app of APPS) {
    const input = join(REPO_ROOT, app.input);
    const output = join(REPO_ROOT, app.output);
    const cli = join(REPO_ROOT, "node_modules/.bin/tailwindcss");

    await execFileAsync(cli, [
      "-i", input,
      "-o", output,
      "--minify",
    ], { cwd: REPO_ROOT });

    console.log(`[tailwind] ${app.id}: built ${app.output}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildTailwind().catch((err) => { console.error(err.message); process.exit(1); });
}
